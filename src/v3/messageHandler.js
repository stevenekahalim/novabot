/**
 * V3 Message Handler
 * Core message processing: save, detect mentions, generate responses
 * Philosophy: Save everything, respond only when @tagged or in DM
 */

const logger = require('../utils/logger');
const ContextLoader = require('./contextLoader');
const ResponseGenerator = require('./responseGenerator');
const MentionDetector = require('./mentionDetector');
const ReminderParser = require('./reminderParser');
const ReminderManager = require('./reminderManager');
const pdfParse = require('pdf-parse');

class MessageHandler {
  constructor(supabaseClient) {
    this.supabase = supabaseClient.getClient();
    this.contextLoader = new ContextLoader(supabaseClient);
    this.responseGenerator = new ResponseGenerator();
    this.mentionDetector = new MentionDetector();
    this.reminderParser = new ReminderParser();
    this.reminderManager = new ReminderManager(supabaseClient);

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
   * @returns {Object} { shouldReply: boolean, response: string|null }
   */
  async handleMessage(message, chatContext = {}) {
    try {
      const messageText = message.body;
      const chatId = message.from;
      const chatName = chatContext.name || message.from;

      logger.info(`[V3] Handling message from ${chatName}: "${messageText.substring(0, 50)}..."`);

      // 1. Save message to database
      const savedMessage = await this._saveMessage(message, chatContext);

      if (!savedMessage) {
        logger.error('[V3] Failed to save message, aborting');
        return { shouldReply: false, response: null };
      }

      // 2. Check if chat is approved (whitelist filter)
      if (!this.APPROVED_CHATS.includes(chatId)) {
        logger.info(`[V3] Chat not in whitelist (${chatName}), ignoring`);
        return { shouldReply: false, response: null };
      }

      // 3. Check for reminder requests (parse with AI if mentioned)
      const isMentioned = this.mentionDetector.shouldRespond(message);
      if (isMentioned) {
        const reminderData = await this.reminderParser.parseReminder(
          messageText,
          message._data.notifyName || message.from,
          chatId
        );

        if (reminderData) {
          logger.info('[V3] ⏰ Reminder detected, saving to database');
          const createdReminder = await this.reminderManager.createReminder(reminderData);

          if (createdReminder) {
            // Respond with confirmation
            const confirmationMsg = this._formatReminderConfirmation(createdReminder);
            return {
              shouldReply: true,
              response: confirmationMsg
            };
          }
        }
      }

      // 4. Check if Nova should respond (regular conversation)
      const shouldRespond = isMentioned;

      if (!shouldRespond) {
        logger.info('[V3] Not mentioned, staying silent');
        return { shouldReply: false, response: null };
      }

      logger.info('[V3] Mentioned or DM, generating response...');

      // 4. Load full conversation context (ALWAYS from group chat - all historical + today)
      const GROUP_CHAT_ID = '120363420201458845@g.us'; // Apex Sports Lab group
      const context = await this.contextLoader.loadFullContext(GROUP_CHAT_ID, {
        messageDaysBack: null,     // null = ALL messages (no date filter)
        messageLimit: null,        // null = no message count limit
        includeTodaysRaw: true     // Include today's raw messages
      });

      // 5. Generate response
      const response = await this.responseGenerator.generate(
        messageText,
        context,
        {
          name: message._data.notifyName || message.from,
          sender_name: message._data.notifyName || message.from
        }
      );

      logger.info(`[V3] Generated response: "${response.substring(0, 100)}..."`);

      return {
        shouldReply: true,
        response: response
      };

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
}

module.exports = MessageHandler;
