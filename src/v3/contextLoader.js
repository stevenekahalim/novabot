/**
 * V3 Context Loader
 * Loads conversational context from messages_v3 and hourly_notes
 * Philosophy: Pure context retrieval - no extraction, just raw data for AI to interpret
 */

const logger = require('../utils/logger');

class ContextLoader {
  constructor(supabaseClient) {
    this.supabase = supabaseClient.getClient();
  }

  /**
   * Load full conversation context for AI to process
   * @param {string} chatId - WhatsApp chat ID
   * @param {Object} options - Optional parameters
   * @returns {Object} Full context with messages and hourly notes
   */
  async loadFullContext(chatId, options = {}) {
    const {
      messageDaysBack = null,    // null = ALL messages (no time limit)
      messageLimit = null,        // null = no limit on message count
      hourlyNotesHoursBack = 24  // Last 24 hours of hourly notes
    } = options;

    logger.info(`Loading V3 context for chat: ${chatId}`);

    try {
      // Load both context sources in parallel for speed
      const [messages, hourlyNotes] = await Promise.all([
        this._loadRecentMessages(chatId, messageDaysBack, messageLimit),
        this._loadHourlyNotes(chatId, hourlyNotesHoursBack)
      ]);

      const context = {
        chatId,
        loadedAt: new Date().toISOString(),
        messages: {
          data: messages,
          count: messages.length,
          daysBack: messageDaysBack
        },
        hourlyNotes: {
          data: hourlyNotes,
          count: hourlyNotes.length,
          hoursBack: hourlyNotesHoursBack
        }
      };

      logger.info(`Context loaded: ${messages.length} messages, ${hourlyNotes.length} hourly notes`);

      return context;

    } catch (error) {
      logger.error('Error loading V3 context:', error);
      throw error;
    }
  }

  /**
   * Load knowledge base recap (replaces loading raw messages)
   * @private
   */
  async _loadRecentMessages(chatId, daysBack, limit) {
    try {
      // Load from knowledge_base instead of raw messages
      logger.info('Loading from knowledge_base (structured recap)...');

      const { data, error } = await this.supabase
        .from('knowledge_base')
        .select('id, date, topic, content, tags')
        .order('id', { ascending: true });

      if (error) throw error;

      // Convert knowledge base format to message-like format for compatibility
      const formattedData = data.map(row => ({
        id: row.id,
        message_text: `[${row.date}] ${row.topic}: ${row.content}`,
        tags: row.tags || '',
        sender_name: 'Knowledge Base',
        timestamp: row.date,
        mentioned_nova: false,
        is_reply: false,
        has_media: false
      }));

      logger.info(`Loaded ${formattedData.length} knowledge base entries (covering 3,785 original messages)`);
      return formattedData;
    } catch (error) {
      logger.error(`Error loading knowledge base:`, error);
      return [];
    }
  }

  /**
   * Load hourly notes (meeting summaries)
   * @private
   */
  async _loadHourlyNotes(chatId, hoursBack) {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hoursBack);

    try {
      const { data, error } = await this.supabase
        .from('hourly_notes')
        .select('id, hour_timestamp, summary_text, key_decisions, action_items, message_count, participants')
        .eq('chat_id', chatId)
        .gte('hour_timestamp', cutoffTime.toISOString())
        .order('hour_timestamp', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error(`Error loading hourly notes for ${chatId}:`, error);
      return [];
    }
  }


  /**
   * Load context for a specific time range (useful for generating hourly/daily summaries)
   * @param {string} chatId - WhatsApp chat ID
   * @param {Date} startTime - Start of time range
   * @param {Date} endTime - End of time range
   * @returns {Array} Messages in the time range
   */
  async loadMessagesInTimeRange(chatId, startTime, endTime) {
    try {
      const { data, error } = await this.supabase
        .from('messages_v3')
        .select('*')
        .eq('chat_id', chatId)
        .gte('timestamp', startTime.toISOString())
        .lte('timestamp', endTime.toISOString())
        .order('timestamp', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error(`Error loading messages in time range for ${chatId}:`, error);
      return [];
    }
  }

  /**
   * Get chat statistics (useful for monitoring and debugging)
   * @param {string} chatId - WhatsApp chat ID
   * @returns {Object} Statistics about the chat
   */
  async getChatStats(chatId) {
    try {
      const [messageCount, hourlyCount] = await Promise.all([
        this._countMessages(chatId),
        this._countHourlyNotes(chatId)
      ]);

      return {
        chatId,
        totalMessages: messageCount,
        totalHourlyNotes: hourlyCount,
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Error getting chat stats for ${chatId}:`, error);
      return null;
    }
  }

  async _countMessages(chatId) {
    const { count, error } = await this.supabase
      .from('messages_v3')
      .select('id', { count: 'exact', head: true })
      .eq('chat_id', chatId);

    return error ? 0 : count || 0;
  }

  async _countHourlyNotes(chatId) {
    const { count, error } = await this.supabase
      .from('hourly_notes')
      .select('id', { count: 'exact', head: true })
      .eq('chat_id', chatId);

    return error ? 0 : count || 0;
  }
}

module.exports = ContextLoader;
