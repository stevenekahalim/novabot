const schedule = require('node-cron');
const logger = require('./utils/logger');
const DailyDigestCompiler = require('./memory/dailyDigestCompiler');

/**
 * Scheduler - Automated background jobs
 *
 * Jobs:
 * - 3:00 AM: Compile daily digest
 * - 9:00 AM: Send morning digest to WhatsApp (optional)
 * - 3:30 PM: Send afternoon update to WhatsApp (optional)
 * - Every hour: Check and compile idle sessions
 */
class Scheduler {
  constructor(supabaseClient, openaiClient, whatsappClient = null) {
    this.supabase = supabaseClient;
    this.openai = openaiClient;
    this.whatsapp = whatsappClient;

    this.dailyCompiler = new DailyDigestCompiler(supabaseClient, openaiClient);

    this.jobs = [];
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    logger.info('🕐 Starting scheduler...');

    // Job 1: Daily digest compilation at 3 AM
    const dailyDigestJob = schedule.schedule('0 3 * * *', async () => {
      logger.info('⏰ 3 AM: Running daily digest compilation...');
      try {
        await this.dailyCompiler.compileDaily();
        logger.info('✅ Daily digest compilation complete');
      } catch (error) {
        logger.error('❌ Daily digest compilation failed:', error);
      }
    }, {
      timezone: 'Asia/Jakarta'
    });

    this.jobs.push({ name: 'daily_digest', job: dailyDigestJob });

    // Job 2: Morning digest at 9 AM (optional - can be enabled later)
    /*
    const morningDigestJob = schedule.schedule('0 9 * * *', async () => {
      logger.info('⏰ 9 AM: Sending morning digest...');
      try {
        await this.sendMorningDigest();
        logger.info('✅ Morning digest sent');
      } catch (error) {
        logger.error('❌ Morning digest failed:', error);
      }
    }, {
      timezone: 'Asia/Jakarta'
    });

    this.jobs.push({ name: 'morning_digest', job: morningDigestJob });
    */

    // Job 3: Session compilation check every hour
    const sessionCheckJob = schedule.schedule('0 * * * *', async () => {
      logger.info('⏰ Hourly: Checking for idle sessions...');
      try {
        await this.checkIdleSessions();
        logger.info('✅ Session check complete');
      } catch (error) {
        logger.error('❌ Session check failed:', error);
      }
    });

    this.jobs.push({ name: 'session_check', job: sessionCheckJob });

    logger.info(`✅ Scheduler started with ${this.jobs.length} jobs:`,
      this.jobs.map(j => j.name).join(', '));
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    logger.info('🛑 Stopping scheduler...');

    this.jobs.forEach(({ name, job }) => {
      job.stop();
      logger.info(`Stopped job: ${name}`);
    });

    this.jobs = [];
    logger.info('✅ Scheduler stopped');
  }

  /**
   * Check for idle sessions and compile them
   */
  async checkIdleSessions() {
    try {
      // Find chats with idle messages (using the helper function from SQL)
      const { data, error } = await this.supabase
        .rpc('find_idle_sessions', { idle_minutes: 10 });

      if (error) {
        logger.debug('find_idle_sessions function not available, using fallback');
        return;
      }

      if (!data || data.length === 0) {
        logger.debug('No idle sessions found');
        return;
      }

      logger.info(`Found ${data.length} idle sessions to compile`);

      // Import EnhancedMemory dynamically to avoid circular dependency
      const EnhancedMemory = require('./memory/enhancedMemory');
      const memory = new EnhancedMemory(this.supabase, this.openai);

      // Compile each idle session
      for (const session of data) {
        try {
          await memory.checkAndCompileSession(session.chat_id);
        } catch (error) {
          logger.error(`Error compiling session for ${session.chat_id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error in checkIdleSessions:', error);
    }
  }

  /**
   * Send morning digest to WhatsApp (optional feature)
   */
  async sendMorningDigest() {
    if (!this.whatsapp) {
      logger.debug('WhatsApp client not available, skipping morning digest');
      return;
    }

    try {
      // Get yesterday's digest
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];

      const digest = await this.dailyCompiler.getDigest(dateStr);

      if (!digest) {
        logger.info('No digest available for yesterday');
        return;
      }

      // Format digest message
      const message = this.formatMorningDigest(digest);

      // Send to configured chat (e.g., user's personal chat)
      // TODO: Get user's chat ID from config
      const targetChatId = process.env.OWNER_CHAT_ID;

      if (targetChatId) {
        await this.whatsapp.sendMessage(targetChatId, message);
        logger.info('✅ Morning digest sent to', targetChatId);
      }
    } catch (error) {
      logger.error('Error sending morning digest:', error);
    }
  }

  /**
   * Format digest into WhatsApp message
   */
  formatMorningDigest(digest) {
    let message = `☀️ *GOOD MORNING - Daily Recap*\n`;
    message += `${digest.date}\n\n`;

    message += `📊 *OVERVIEW*\n`;
    message += `• ${digest.total_sessions} sessions\n`;
    message += `• ${digest.total_messages} messages\n`;
    message += `• Productivity: ${digest.productivity_score}/10\n\n`;

    if (digest.daily_summary) {
      message += `*SUMMARY:*\n${digest.daily_summary}\n\n`;
    }

    // Per-project highlights
    if (digest.project_summaries && Object.keys(digest.project_summaries).length > 0) {
      message += `*PROJECT HIGHLIGHTS:*\n`;

      Object.entries(digest.project_summaries).forEach(([project, summary]) => {
        if (summary.highlights) {
          message += `\n*${project}*\n`;
          message += `${summary.highlights}\n`;

          if (summary.progress_made) {
            message += `✅ Progress made\n`;
          }

          if (summary.blockers && summary.blockers.length > 0) {
            message += `⚠️ ${summary.blockers.length} blocker(s)\n`;
          }
        }
      });

      message += `\n`;
    }

    // Top priorities for today
    message += `🎯 *TOP PRIORITIES TODAY:*\n`;
    if (digest.action_items && digest.action_items.length > 0) {
      digest.action_items.slice(0, 5).forEach((item, i) => {
        message += `${i + 1}. ${item.action} (${item.project})\n`;
      });
    } else {
      message += `No pending action items\n`;
    }

    message += `\n_Have a productive day! 🚀_`;

    return message;
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      running: this.jobs.length > 0,
      jobs: this.jobs.map(({ name, job }) => ({
        name,
        running: job.running || false
      }))
    };
  }
}

module.exports = Scheduler;
