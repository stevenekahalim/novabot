/**
 * V3 Context Loader
 * Loads conversational context from messages_v3, hourly_notes, and daily_digests_v3
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
   * @returns {Object} Full context with messages, hourly notes, and daily digests
   */
  async loadFullContext(chatId, options = {}) {
    const {
      messageDaysBack = 7,      // Look back 7 days for messages
      messageLimit = 100,        // Max 100 recent messages
      digestDaysBack = 30,       // 30 days of daily digests
      hourlyNotesHoursBack = 24  // Last 24 hours of hourly notes
    } = options;

    logger.info(`Loading V3 context for chat: ${chatId}`);

    try {
      // Load all three context sources in parallel for speed
      const [messages, hourlyNotes, dailyDigests] = await Promise.all([
        this._loadRecentMessages(chatId, messageDaysBack, messageLimit),
        this._loadHourlyNotes(chatId, hourlyNotesHoursBack),
        this._loadDailyDigests(chatId, digestDaysBack)
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
        },
        dailyDigests: {
          data: dailyDigests,
          count: dailyDigests.length,
          daysBack: digestDaysBack
        }
      };

      logger.info(`Context loaded: ${messages.length} messages, ${hourlyNotes.length} hourly notes, ${dailyDigests.length} daily digests`);

      return context;

    } catch (error) {
      logger.error('Error loading V3 context:', error);
      throw error;
    }
  }

  /**
   * Load recent raw messages
   * @private
   */
  async _loadRecentMessages(chatId, daysBack, limit) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    try {
      const { data, error } = await this.supabase
        .from('messages_v3')
        .select('id, message_text, sender_name, sender_number, timestamp, mentioned_nova, is_reply, has_media')
        .eq('chat_id', chatId)
        .gte('timestamp', cutoffDate.toISOString())
        .order('timestamp', { ascending: true })
        .limit(limit);

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error(`Error loading recent messages for ${chatId}:`, error);
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
   * Load daily digests
   * @private
   */
  async _loadDailyDigests(chatId, daysBack) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    try {
      const { data, error } = await this.supabase
        .from('daily_digests_v3')
        .select('id, digest_date, summary_text, projects_discussed, key_decisions, blockers_identified, financial_mentions, message_count, participants')
        .eq('chat_id', chatId)
        .gte('digest_date', cutoffDateStr)
        .order('digest_date', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error(`Error loading daily digests for ${chatId}:`, error);
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
      const [messageCount, hourlyCount, digestCount] = await Promise.all([
        this._countMessages(chatId),
        this._countHourlyNotes(chatId),
        this._countDailyDigests(chatId)
      ]);

      return {
        chatId,
        totalMessages: messageCount,
        totalHourlyNotes: hourlyCount,
        totalDailyDigests: digestCount,
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

  async _countDailyDigests(chatId) {
    const { count, error } = await this.supabase
      .from('daily_digests_v3')
      .select('id', { count: 'exact', head: true })
      .eq('chat_id', chatId);

    return error ? 0 : count || 0;
  }
}

module.exports = ContextLoader;
