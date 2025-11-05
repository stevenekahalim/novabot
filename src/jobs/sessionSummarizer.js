const logger = require('../utils/logger');

/**
 * SessionSummarizer - Background job to summarize idle conversation sessions
 *
 * Runs every 5 minutes to find sessions that have been idle for 10+ minutes
 * and generates AI summaries for them.
 */
class SessionSummarizer {
  constructor(conversationMemory, openaiClient) {
    this.memory = conversationMemory;
    this.openai = openaiClient;
    this.intervalMinutes = 5;
    this.isRunning = false;
    this.intervalId = null;
  }

  /**
   * Start the background summarizer
   */
  start() {
    if (this.isRunning) {
      logger.warn('Session summarizer is already running');
      return;
    }

    this.isRunning = true;
    logger.info(`📊 Starting session summarizer (runs every ${this.intervalMinutes} minutes)`);

    // Run immediately on start
    this.runSummarization();

    // Then run every N minutes
    this.intervalId = setInterval(async () => {
      await this.runSummarization();
    }, this.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the background summarizer
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Session summarizer is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('📊 Session summarizer stopped');
  }

  /**
   * Run one cycle of summarization
   */
  async runSummarization() {
    try {
      logger.debug('🔄 Running session summarization cycle...');

      // Find sessions ready to be summarized
      const chatIds = await this.memory.findSessionsToSummarize();

      if (!chatIds || chatIds.length === 0) {
        logger.debug('No sessions to summarize');
        return;
      }

      logger.info(`📝 Found ${chatIds.length} sessions to summarize`);

      // Summarize each session
      let successCount = 0;
      for (const chatId of chatIds) {
        try {
          const session = await this.memory.summarizeSession(chatId, this.openai);
          if (session) {
            successCount++;
            logger.info(`✅ Summarized session for ${chatId}: ${session.message_count} messages`);
          }
        } catch (error) {
          logger.error(`Failed to summarize session for ${chatId}:`, error);
        }
      }

      logger.info(`📊 Summarization complete: ${successCount}/${chatIds.length} sessions processed`);
    } catch (error) {
      logger.error('Error in session summarization cycle:', error);
    }
  }

  /**
   * Manually trigger summarization (for testing)
   */
  async trigger() {
    logger.info('⚡ Manual summarization triggered');
    await this.runSummarization();
  }
}

module.exports = SessionSummarizer;
