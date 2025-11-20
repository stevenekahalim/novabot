/**
 * Reminder Manager
 * Handles database operations for reminders
 */

const logger = require('../utils/logger');

class ReminderManager {
  constructor(supabaseClient) {
    this.supabase = supabaseClient.getClient();
  }

  /**
   * Create a new reminder
   * @param {Object} reminderData - Parsed reminder data from ReminderParser
   * @returns {Object} Created reminder or null on error
   */
  async createReminder(reminderData) {
    try {
      const { data, error } = await this.supabase
        .from('reminders')
        .insert({
          assigned_to: reminderData.assigned_to,
          reminder_date: reminderData.reminder_date,
          reminder_time: reminderData.reminder_time,
          message: reminderData.message,
          created_by: reminderData.created_by,
          chat_id: reminderData.chat_id,
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        logger.error('[Reminder Manager] Error creating reminder:', error);
        return null;
      }

      logger.info(`[Reminder Manager] ✅ Reminder created: ID ${data.id}`);
      return data;

    } catch (error) {
      logger.error('[Reminder Manager] Error in createReminder:', error.message);
      return null;
    }
  }

  /**
   * Get pending reminders that need to be sent now
   * Checks every hour for reminders due in the current hour
   * @returns {Array} Array of pending reminders
   */
  async getPendingReminders() {
    try {
      // Get current date and hour in Jakarta timezone
      const now = new Date();
      const jakartaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));

      const currentDate = jakartaTime.toISOString().split('T')[0]; // YYYY-MM-DD
      const currentHour = jakartaTime.getHours().toString().padStart(2, '0'); // HH

      // Get reminders for today that are pending
      const { data, error } = await this.supabase
        .from('reminders')
        .select('*')
        .eq('status', 'pending')
        .eq('reminder_date', currentDate);

      if (error) {
        logger.error('[Reminder Manager] Error fetching pending reminders:', error);
        return [];
      }

      // Filter by hour (we check hourly, so any reminder in the current hour gets sent)
      const remindersThisHour = data.filter(reminder => {
        const reminderHour = reminder.reminder_time.split(':')[0];
        return reminderHour === currentHour;
      });

      logger.info(`[Reminder Manager] Found ${remindersThisHour.length} reminders due this hour`);
      return remindersThisHour;

    } catch (error) {
      logger.error('[Reminder Manager] Error in getPendingReminders:', error.message);
      return [];
    }
  }

  /**
   * Mark a reminder as sent
   * @param {string} reminderId - UUID of the reminder
   * @returns {boolean} Success status
   */
  async markAsSent(reminderId) {
    try {
      const { error } = await this.supabase
        .from('reminders')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', reminderId);

      if (error) {
        logger.error('[Reminder Manager] Error marking reminder as sent:', error);
        return false;
      }

      logger.info(`[Reminder Manager] ✅ Reminder ${reminderId} marked as sent`);
      return true;

    } catch (error) {
      logger.error('[Reminder Manager] Error in markAsSent:', error.message);
      return false;
    }
  }

  /**
   * Cancel a reminder
   * @param {string} reminderId - UUID of the reminder
   * @returns {boolean} Success status
   */
  async cancelReminder(reminderId) {
    try {
      const { error } = await this.supabase
        .from('reminders')
        .update({ status: 'cancelled' })
        .eq('id', reminderId);

      if (error) {
        logger.error('[Reminder Manager] Error cancelling reminder:', error);
        return false;
      }

      logger.info(`[Reminder Manager] ✅ Reminder ${reminderId} cancelled`);
      return true;

    } catch (error) {
      logger.error('[Reminder Manager] Error in cancelReminder:', error.message);
      return false;
    }
  }

  /**
   * Get all reminders for a specific person
   * @param {string} personName - Name of the person
   * @returns {Array} Array of reminders
   */
  async getRemindersByPerson(personName) {
    try {
      const { data, error } = await this.supabase
        .from('reminders')
        .select('*')
        .eq('assigned_to', personName)
        .order('reminder_date', { ascending: true })
        .order('reminder_time', { ascending: true });

      if (error) {
        logger.error('[Reminder Manager] Error fetching reminders:', error);
        return [];
      }

      return data || [];

    } catch (error) {
      logger.error('[Reminder Manager] Error in getRemindersByPerson:', error.message);
      return [];
    }
  }

  /**
   * Get all upcoming reminders (for status checks)
   * @returns {Array} Array of pending reminders
   */
  async getUpcomingReminders() {
    try {
      const now = new Date();
      const jakartaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
      const currentDate = jakartaTime.toISOString().split('T')[0];

      const { data, error} = await this.supabase
        .from('reminders')
        .select('*')
        .eq('status', 'pending')
        .gte('reminder_date', currentDate)
        .order('reminder_date', { ascending: true })
        .order('reminder_time', { ascending: true });

      if (error) {
        logger.error('[Reminder Manager] Error fetching upcoming reminders:', error);
        return [];
      }

      return data || [];

    } catch (error) {
      logger.error('[Reminder Manager] Error in getUpcomingReminders:', error.message);
      return [];
    }
  }
}

module.exports = ReminderManager;
