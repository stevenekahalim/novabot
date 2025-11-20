/**
 * Reminder Cron Job
 * Runs hourly to check for pending reminders and send them via WhatsApp
 */

const cron = require('node-cron');
const logger = require('../utils/logger');

class ReminderJob {
  constructor(reminderManager, whatsappClient) {
    this.reminderManager = reminderManager;
    this.whatsappClient = whatsappClient;
    this.cronSchedule = '0 * * * *'; // Every hour at :00
    this.job = null;
    this.isRunning = false;
  }

  /**
   * Start the hourly reminder check job
   */
  start() {
    logger.info('[Reminder Job] Starting hourly reminder check...');

    this.job = cron.schedule(this.cronSchedule, async () => {
      await this.checkAndSendReminders();
    });

    logger.info(`[Reminder Job] Scheduled: ${this.cronSchedule} (every hour at :00)`);
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      logger.info('[Reminder Job] Job stopped');
    }
  }

  /**
   * Main reminder checking and sending process
   */
  async checkAndSendReminders() {
    if (this.isRunning) {
      logger.warn('[Reminder Job] Already running, skipping');
      return;
    }

    this.isRunning = true;

    try {
      logger.info('[Reminder Job] ⏰ Checking for pending reminders...');

      // Get pending reminders for this hour
      const pendingReminders = await this.reminderManager.getPendingReminders();

      if (pendingReminders.length === 0) {
        logger.info('[Reminder Job] No reminders due this hour');
        this.isRunning = false;
        return;
      }

      logger.info(`[Reminder Job] Found ${pendingReminders.length} reminders to send`);

      // Send each reminder
      for (const reminder of pendingReminders) {
        await this.sendReminder(reminder);
      }

      logger.info('[Reminder Job] ✅ All reminders processed');

    } catch (error) {
      logger.error('[Reminder Job] Error in checkAndSendReminders:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Send a single reminder via WhatsApp
   * @private
   */
  async sendReminder(reminder) {
    try {
      // Format the reminder message
      const reminderText = this._formatReminderMessage(reminder);

      // Send to the chat
      logger.info(`[Reminder Job] Sending reminder to chat ${reminder.chat_id}`);

      await this.whatsappClient.sendMessage(reminder.chat_id, reminderText);

      // Mark as sent
      await this.reminderManager.markAsSent(reminder.id);

      logger.info(`[Reminder Job] ✅ Reminder sent: ${reminder.id}`);

    } catch (error) {
      logger.error(`[Reminder Job] Error sending reminder ${reminder.id}:`, error.message);
    }
  }

  /**
   * Format reminder message for WhatsApp
   * @private
   */
  _formatReminderMessage(reminder) {
    const time = new Date().toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Tag the person if it's a specific person
    const mention = reminder.assigned_to === 'all'
      ? '@everyone'
      : `@${reminder.assigned_to}`;

    return `⏰ *REMINDER* (${time} WIB)\n\n${mention}\n\n${reminder.message}\n\n_Set by ${reminder.created_by}_`;
  }

  /**
   * Manual trigger for testing
   */
  async testRun() {
    logger.info('[Reminder Job] 🧪 TEST RUN: Checking reminders manually...');
    await this.checkAndSendReminders();
  }
}

module.exports = ReminderJob;
