/**
 * V3 Hourly Notes Job
 * Generates AI-powered hourly meeting notes
 * Runs every hour, summarizes last hour's messages
 * Philosophy: Non-intrusive summaries instead of per-message responses
 */

const OpenAI = require('openai');
const cron = require('node-cron');
const logger = require('../utils/logger');
const ContextLoader = require('./contextLoader');

class HourlyNotesJob {
  constructor(supabaseClient) {
    this.supabase = supabaseClient.getClient();
    this.contextLoader = new ContextLoader(supabaseClient);

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.model = process.env.OPENAI_MODEL_CLASSIFICATION || 'gpt-3.5-turbo';
    this.cronSchedule = '0 * * * *'; // Every hour at minute 0
    this.isRunning = false;
  }

  /**
   * Start the hourly notes cron job
   */
  start() {
    logger.info('[V3] Starting Hourly Notes Job...');

    // Schedule: Every hour
    this.job = cron.schedule(this.cronSchedule, async () => {
      await this.processHourlyNotes();
    });

    logger.info(`[V3] Hourly Notes Job scheduled: ${this.cronSchedule}`);
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      logger.info('[V3] Hourly Notes Job stopped');
    }
  }

  /**
   * Process hourly notes for all active chats
   */
  async processHourlyNotes() {
    if (this.isRunning) {
      logger.warn('[V3] Hourly notes already running, skipping');
      return;
    }

    this.isRunning = true;

    try {
      logger.info('[V3] 🕐 Generating hourly notes...');

      // Get all chats that had messages in the last hour
      const activeChats = await this._getActiveChats();

      logger.info(`[V3] Found ${activeChats.length} active chats in the last hour`);

      // Process each chat
      for (const chatId of activeChats) {
        await this._generateHourlyNote(chatId);
      }

      logger.info('[V3] ✅ Hourly notes generation complete');

    } catch (error) {
      logger.error('[V3] Error in hourly notes job:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get chats that had activity in the last hour
   * @private
   */
  async _getActiveChats() {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const { data, error } = await this.supabase
      .from('messages_v3')
      .select('chat_id')
      .gte('timestamp', oneHourAgo.toISOString());

    if (error) {
      logger.error('[V3] Error getting active chats:', error);
      return [];
    }

    // Get unique chat IDs
    const chatIds = [...new Set(data.map(m => m.chat_id))];
    return chatIds;
  }

  /**
   * Generate hourly note for a specific chat
   * @private
   */
  async _generateHourlyNote(chatId) {
    try {
      const now = new Date();
      const lastHour = new Date(now);
      lastHour.setHours(now.getHours() - 1);

      // Load messages from the last hour
      const messages = await this.contextLoader.loadMessagesInTimeRange(
        chatId,
        lastHour,
        now
      );

      if (messages.length === 0) {
        logger.info(`[V3] No messages for ${chatId} in the last hour, skipping`);
        return;
      }

      logger.info(`[V3] Generating hourly note for ${chatId} (${messages.length} messages)`);

      // Generate AI summary
      const summary = await this._generateSummary(messages);

      // Extract participants
      const participants = [...new Set(messages.map(m => m.sender_name))];

      // Save to database
      const hourTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);

      const { error } = await this.supabase
        .from('hourly_notes')
        .insert({
          chat_id: chatId,
          chat_name: messages[0].chat_name,
          hour_timestamp: hourTimestamp.toISOString(),
          summary_text: summary.text,
          key_decisions: summary.decisions,
          action_items: summary.actions,
          message_count: messages.length,
          participants: participants
        });

      if (error) {
        logger.error(`[V3] Error saving hourly note for ${chatId}:`, error);
      } else {
        logger.info(`[V3] ✅ Hourly note saved for ${chatId}`);
      }

    } catch (error) {
      logger.error(`[V3] Error generating hourly note for ${chatId}:`, error);
    }
  }

  /**
   * Generate AI summary of messages
   * @private
   */
  async _generateSummary(messages) {
    const messagesText = messages.map(m => {
      const time = new Date(m.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return `[${time}] ${m.sender_name}: ${m.message_text}`;
    }).join('\n');

    const prompt = `You are summarizing a 1-hour WhatsApp conversation for Apex Sports Lab (padel court projects).

MESSAGES:
${messagesText}

Generate a concise hourly note in Indonesian/English mix (Jaksel style).

Output format (JSON):
{
  "text": "2-3 sentence summary of what was discussed",
  "decisions": ["decision 1", "decision 2"],
  "actions": ["action item 1", "action item 2"]
}

Rules:
- Keep summary to 2-3 sentences max
- Only include actual decisions (agreements, confirmations)
- Only include actionable items (tasks with clear next steps)
- Use empty arrays if no decisions/actions
- Be direct, no fluff`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(completion.choices[0].message.content);

      return {
        text: result.text || 'No significant activity',
        decisions: result.decisions || [],
        actions: result.actions || []
      };

    } catch (error) {
      logger.error('[V3] Error generating AI summary:', error);
      return {
        text: `${messages.length} messages exchanged`,
        decisions: [],
        actions: []
      };
    }
  }
}

module.exports = HourlyNotesJob;
