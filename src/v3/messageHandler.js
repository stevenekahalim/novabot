/**
 * V4 Message Handler
 * Core message processing: save, router decision, generate responses, parse action tags
 * Philosophy: Save everything, router decides PASS/IGNORE, Nova decides SILENT/REMIND/REPLY
 */

const logger = require('../utils/logger');
const ContextLoader = require('./contextLoader');
const ResponseGenerator = require('./responseGenerator');
const MentionDetector = require('./mentionDetector');
const ReminderParser = require('./reminderParser');
const ReminderManager = require('./reminderManager');
const Router = require('./router');
const pdfParse = require('pdf-parse');

class MessageHandler {
  constructor(supabaseClient) {
    this.supabase = supabaseClient.getClient();
    this.contextLoader = new ContextLoader(supabaseClient);
    this.responseGenerator = new ResponseGenerator();
    this.mentionDetector = new MentionDetector();
    this.reminderParser = new ReminderParser();
    this.reminderManager = new ReminderManager(supabaseClient);
    this.router = new Router(supabaseClient); // V4: Router for PASS/IGNORE decisions

    // Whitelist of approved chat IDs where Nova can respond
    this.APPROVED_CHATS = [
      '120363420201458845@g.us',  // Apex Sports Lab group
      '62811393989@c.us'           // Steven Eka Halim (owner) private chat
    ];
  }

  /**
   * Handle incoming WhatsApp message
   * @param {Object} message - WhatsApp web.js Message object
   * @param {Object} chatContext - Chat information (name, type, etc.)
   * @returns {Object} { shouldReply: boolean, response: string|null, reaction: string|null }
   */
  async handleMessage(message, chatContext = {}) {
    try {
      const messageText = message.body;
      const chatId = message.from;
      const chatName = chatContext.name || message.from;
      const senderName = message._data.notifyName || message.from;

      logger.info(`[V4] Handling message from ${chatName}: "${messageText.substring(0, 50)}..."`);

      // 1. Save message to database
      const savedMessage = await this._saveMessage(message, chatContext);

      if (!savedMessage) {
        logger.error('[V4] Failed to save message, aborting');
        return { shouldReply: false, response: null, reaction: null };
      }

      // 2. Check if chat is approved (whitelist filter)
      if (!this.APPROVED_CHATS.includes(chatId)) {
        logger.info(`[V4] Chat not in whitelist (${chatName}), ignoring`);
        return { shouldReply: false, response: null, reaction: null };
      }

      // 3. Check if Nova is mentioned
      const isMentioned = this.mentionDetector.shouldRespond(message);

      // 4. V4 ROUTER DECISION (PASS or IGNORE)
      // If mentioned, automatically pass. Otherwise, ask router.
      let routerDecision;
      if (isMentioned) {
        routerDecision = { action: 'pass', confidence: 1.0, reason: 'Nova explicitly mentioned', method: 'heuristic' };
        logger.info('[V4 Router] PASS (mentioned)');
      } else {
        routerDecision = await this.router.decide(messageText, { isMentioned, senderName, chatId });
        logger.info(`[V4 Router] ${routerDecision.action.toUpperCase()} (${routerDecision.method}): ${routerDecision.reason}`);
      }

      // If router says IGNORE, stop here
      if (routerDecision.action === 'ignore') {
        return { shouldReply: false, response: null, reaction: null };
      }

      // 5. Router said PASS - Check for OLD REMINDER SYSTEM (backward compatibility)
      // Only parse reminders if Nova is explicitly mentioned
      if (isMentioned) {
        const reminderData = await this.reminderParser.parseReminder(
          messageText,
          senderName,
          chatId
        );

        if (reminderData) {
          logger.info('[V4] ⏰ Old-style reminder detected (via mention), saving to database');
          const createdReminder = await this.reminderManager.createReminder(reminderData);

          if (createdReminder) {
            // Respond with confirmation
            const confirmationMsg = this._formatReminderConfirmation(createdReminder);
            return {
              shouldReply: true,
              response: confirmationMsg,
              reaction: null
            };
          }
        }
      }

      logger.info('[V4] Router passed, generating Nova response...');

      // 6. Load full conversation context (ALWAYS from group chat - all historical + today)
      const GROUP_CHAT_ID = '120363420201458845@g.us'; // Apex Sports Lab group
      const context = await this.contextLoader.loadFullContext(GROUP_CHAT_ID, {
        messageDaysBack: null,     // null = ALL messages (no date filter)
        messageLimit: null,        // null = no message count limit
        includeTodaysRaw: true     // Include today's raw messages
      });

      // 7. Generate response (Nova with V4 action tags)
      const rawResponse = await this.responseGenerator.generate(
        messageText,
        context,
        {
          name: senderName,
          sender_name: senderName
        }
      );

      logger.info(`[V4] Nova generated: "${rawResponse.substring(0, 100)}..."`);

      // 8. V4 PARSE ACTION TAG from Nova's response
      const actionTag = this._parseActionTag(rawResponse);
      logger.info(`[V4 Action] Tag: ${actionTag.action}, Mentioned: ${isMentioned}`);

      // 9. V4 EXECUTE based on action tag
      switch (actionTag.action) {
        case 'SILENT':
          // Nova says stay quiet - log only
          logger.info('[V4 Action] SILENT - No reply, no reaction');
          return { shouldReply: false, response: null, reaction: null };

        case 'REMIND':
          // Nova detected implicit reminder
          if (actionTag.reminderData) {
            logger.info('[V4 Action] REMIND - Saving reminder');
            const createdReminder = await this.reminderManager.createReminder(actionTag.reminderData);

            if (createdReminder) {
              // If Nova was mentioned, send text confirmation
              // If NOT mentioned (implicit), react with emoji
              if (isMentioned) {
                const confirmationMsg = this._formatReminderConfirmation(createdReminder);
                return { shouldReply: true, response: confirmationMsg, reaction: null };
              } else {
                // Silent reminder - react with ⏰ emoji
                logger.info('[V4 Action] REMIND (silent) - Reacting with ⏰');
                return { shouldReply: false, response: null, reaction: '⏰' };
              }
            }
          }
          // Fallback: if reminder parsing failed, stay silent
          return { shouldReply: false, response: null, reaction: null };

        case 'REPLY':
          // Nova says send message
          logger.info('[V4 Action] REPLY - Sending message');
          return {
            shouldReply: true,
            response: actionTag.replyText,
            reaction: null
          };

        default:
          // Unknown action - log warning and stay silent
          logger.warn(`[V4 Action] Unknown action "${actionTag.action}" - defaulting to SILENT`);
          return { shouldReply: false, response: null, reaction: null };
      }

    } catch (error) {
      logger.error('[V3] Error in messageHandler:', error);
      return {
        shouldReply: false,
        response: null
      };
    }
  }

  /**
   * Save message to messages_v3 table
   * @private
   */
  async _saveMessage(message, chatContext) {
    try {
      const chatId = message.from;
      const chatName = chatContext.name || message.from;
      const senderName = message._data.notifyName || message.author || message.from;
      const senderNumber = message.author || message.from;
      let messageText = message.body;
      const timestamp = new Date(message.timestamp * 1000); // WhatsApp timestamp is in seconds

      // Detect if Nova was mentioned
      const mentionedNova = this.mentionDetector.detectMention(messageText);

      // Check if this is a reply
      const isReply = message.hasQuotedMsg || false;
      const repliedToMsgId = isReply ? message._data.quotedMsg?.id || null : null;

      // Check for media
      const hasMedia = message.hasMedia || false;
      const mediaType = hasMedia ? message.type : null;

      // Extract PDF content if this is a document
      if (hasMedia && mediaType === 'document') {
        const pdfText = await this._extractPDFContent(message);
        if (pdfText) {
          // Append PDF content to message text (preserve caption if exists)
          const caption = messageText || '';
          messageText = caption
            ? `${caption}\n\n[PDF CONTENT]\n${pdfText}`
            : `[PDF CONTENT]\n${pdfText}`;
          logger.info(`[V3] Extracted ${pdfText.length} characters from PDF`);
        }
      }

      const messageData = {
        message_text: messageText,
        sender_name: senderName,
        sender_number: senderNumber,
        chat_id: chatId,
        chat_name: chatName,
        timestamp: timestamp.toISOString(),
        mentioned_nova: mentionedNova,
        is_reply: isReply,
        replied_to_msg_id: repliedToMsgId,
        has_media: hasMedia,
        media_type: mediaType
      };

      const { data, error } = await this.supabase
        .from('messages_v3')
        .insert(messageData)
        .select()
        .single();

      if (error) {
        logger.error('[V3] Error saving message:', error);
        return null;
      }

      logger.info(`[V3] Message saved: ${data.id}`);
      return data;

    } catch (error) {
      logger.error('[V3] Error in _saveMessage:', error);
      return null;
    }
  }

  /**
   * Get recent message count (for monitoring)
   * @param {string} chatId - WhatsApp chat ID
   * @param {number} hours - Hours to look back
   * @returns {number} Message count
   */
  async getRecentMessageCount(chatId, hours = 1) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hours);

      const { count, error } = await this.supabase
        .from('messages_v3')
        .select('id', { count: 'exact', head: true })
        .eq('chat_id', chatId)
        .gte('timestamp', cutoffTime.toISOString());

      if (error) throw error;

      return count || 0;
    } catch (error) {
      logger.error('[V3] Error getting recent message count:', error);
      return 0;
    }
  }

  /**
   * Get active participants in a time range
   * @param {string} chatId - WhatsApp chat ID
   * @param {number} hours - Hours to look back
   * @returns {Array<string>} List of participant names
   */
  async getActiveParticipants(chatId, hours = 1) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hours);

      const { data, error } = await this.supabase
        .from('messages_v3')
        .select('sender_name')
        .eq('chat_id', chatId)
        .gte('timestamp', cutoffTime.toISOString());

      if (error) throw error;

      // Get unique participants
      const participants = [...new Set(data.map(m => m.sender_name))];
      return participants;

    } catch (error) {
      logger.error('[V3] Error getting active participants:', error);
      return [];
    }
  }

  /**
   * Extract text content from PDF attachment
   * @private
   * @param {Object} message - WhatsApp message with PDF attachment
   * @returns {string|null} Extracted text or null if extraction failed
   */
  async _extractPDFContent(message) {
    try {
      // Download media from WhatsApp
      logger.info('[V3] Downloading PDF attachment...');
      const media = await message.downloadMedia();

      if (!media || !media.data) {
        logger.warn('[V3] No media data available');
        return null;
      }

      // Check if this is actually a PDF
      const mimeType = media.mimetype || '';
      if (!mimeType.includes('pdf')) {
        logger.info(`[V3] Not a PDF (mimetype: ${mimeType}), skipping extraction`);
        return null;
      }

      // Convert base64 to buffer
      const pdfBuffer = Buffer.from(media.data, 'base64');

      // Check file size (skip if > 10MB to avoid memory issues)
      const fileSizeInMB = pdfBuffer.length / (1024 * 1024);
      if (fileSizeInMB > 10) {
        logger.warn(`[V3] PDF too large (${fileSizeInMB.toFixed(2)}MB), skipping extraction`);
        return `[PDF file: ${media.filename || 'document.pdf'} - ${fileSizeInMB.toFixed(2)}MB - Too large to extract]`;
      }

      // Extract text using pdf-parse
      logger.info('[V3] Parsing PDF content...');
      const pdfData = await pdfParse(pdfBuffer);

      const extractedText = pdfData.text.trim();
      const pageCount = pdfData.numpages;

      if (!extractedText || extractedText.length < 10) {
        logger.warn('[V3] PDF appears to be empty or scanned image (no text found)');
        return `[PDF file: ${media.filename || 'document.pdf'} - ${pageCount} pages - No extractable text (may be scanned image)]`;
      }

      // Limit text length to avoid database issues (max 50K characters)
      const maxLength = 50000;
      const finalText = extractedText.length > maxLength
        ? extractedText.substring(0, maxLength) + '\n\n[... PDF truncated at 50K characters ...]'
        : extractedText;

      logger.info(`[V3] Successfully extracted ${finalText.length} characters from ${pageCount}-page PDF`);
      return `[PDF: ${media.filename || 'document.pdf'} - ${pageCount} pages]\n\n${finalText}`;

    } catch (error) {
      logger.error('[V3] Error extracting PDF content:', error.message);
      return `[PDF extraction failed: ${error.message}]`;
    }
  }

  /**
   * Format reminder confirmation message
   * @private
   * @param {Object} reminder - Created reminder object
   * @returns {string} Confirmation message
   */
  _formatReminderConfirmation(reminder) {
    const date = new Date(reminder.reminder_date + 'T' + reminder.reminder_time + '+07:00');
    const formattedDate = date.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Jakarta'
    });
    const formattedTime = date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta'
    });

    return `✅ *Reminder Set!*\n\n` +
           `📌 For: ${reminder.assigned_to}\n` +
           `📅 When: ${formattedDate}\n` +
           `⏰ Time: ${formattedTime} WIB\n` +
           `💬 Message: ${reminder.message}\n\n` +
           `_I'll remind them at the scheduled time_`;
  }

  /**
   * V4: Parse action tag from Nova's response
   * @private
   * @param {string} responseText - Raw response from Nova
   * @returns {Object} { action: 'SILENT'|'REMIND'|'REPLY', reminderData: {...}|null, replyText: string|null }
   */
  _parseActionTag(responseText) {
    const text = responseText.trim();

    // Match [SILENT]
    if (text.startsWith('[SILENT]')) {
      return { action: 'SILENT', reminderData: null, replyText: null };
    }

    // Match [REMIND] {...}
    const remindMatch = text.match(/^\[REMIND\]\s*(\{[\s\S]*?\})/);
    if (remindMatch) {
      try {
        const reminderJson = remindMatch[1];
        const reminderData = JSON.parse(reminderJson);

        // Validate required fields
        if (reminderData.assigned_to && reminderData.reminder_date &&
            reminderData.reminder_time && reminderData.message) {
          return { action: 'REMIND', reminderData, replyText: null };
        } else {
          logger.error('[V4 Parser] Invalid REMIND JSON - missing required fields:', reminderData);
          return { action: 'SILENT', reminderData: null, replyText: null };
        }
      } catch (error) {
        logger.error('[V4 Parser] Failed to parse REMIND JSON:', error.message);
        return { action: 'SILENT', reminderData: null, replyText: null };
      }
    }

    // Match [REPLY] message
    const replyMatch = text.match(/^\[REPLY\]\s*([\s\S]*)/);
    if (replyMatch) {
      const replyText = replyMatch[1].trim();
      return { action: 'REPLY', reminderData: null, replyText };
    }

    // No tag found - default to REPLY with full text (backward compatibility)
    logger.warn('[V4 Parser] No action tag found in response - defaulting to REPLY');
    return { action: 'REPLY', reminderData: null, replyText: text };
  }
}

module.exports = MessageHandler;
