/**
 * V3 Message Handler
 * Core message processing: save, detect mentions, generate responses
 * Philosophy: Save everything, respond only when @tagged or in DM
 */

const logger = require('../utils/logger');
const ContextLoader = require('./contextLoader');
const ResponseGenerator = require('./responseGenerator');
const MentionDetector = require('./mentionDetector');

class MessageHandler {
  constructor(supabaseClient) {
    this.supabase = supabaseClient.getClient();
    this.contextLoader = new ContextLoader(supabaseClient);
    this.responseGenerator = new ResponseGenerator();
    this.mentionDetector = new MentionDetector();
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

      // 2. Check if Nova should respond
      const shouldRespond = this.mentionDetector.shouldRespond(message);

      if (!shouldRespond) {
        logger.info('[V3] Not mentioned, staying silent');
        return { shouldReply: false, response: null };
      }

      logger.info('[V3] Mentioned or DM, generating response...');

      // 3. Load full conversation context (ALWAYS from group chat - all 3,785 messages)
      const GROUP_CHAT_ID = '120363420201458845@g.us'; // Apex Sports Lab group
      const context = await this.contextLoader.loadFullContext(GROUP_CHAT_ID, {
        messageDaysBack: null,     // null = ALL messages (no date filter)
        messageLimit: null,        // null = no message count limit
        hourlyNotesHoursBack: 24
      });

      // 4. Generate response
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
      const messageText = message.body;
      const timestamp = new Date(message.timestamp * 1000); // WhatsApp timestamp is in seconds

      // Detect if Nova was mentioned
      const mentionedNova = this.mentionDetector.detectMention(messageText);

      // Check if this is a reply
      const isReply = message.hasQuotedMsg || false;
      const repliedToMsgId = isReply ? message._data.quotedMsg?.id || null : null;

      // Check for media
      const hasMedia = message.hasMedia || false;
      const mediaType = hasMedia ? message.type : null;

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
}

module.exports = MessageHandler;
