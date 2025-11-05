/**
 * V3 Daily Digest Job
 * Generates comprehensive end-of-day summaries at midnight
 * Provides 30-day historical memory for Nova
 * Philosophy: Deep analysis of full day's conversation
 */

const OpenAI = require('openai');
const cron = require('node-cron');
const logger = require('../utils/logger');
const ContextLoader = require('./contextLoader');

class DailyDigestJob {
  constructor(supabaseClient) {
    this.supabase = supabaseClient.getClient();
    this.contextLoader = new ContextLoader(supabaseClient);

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.model = 'gpt-4-turbo'; // Use GPT-4 for better daily analysis
    this.cronSchedule = '0 0 * * *'; // Every day at midnight (00:00 WIB)
    this.isRunning = false;
  }

  /**
   * Start the daily digest cron job
   */
  start() {
    logger.info('[V3] Starting Daily Digest Job...');

    // Schedule: Every day at midnight
    this.job = cron.schedule(this.cronSchedule, async () => {
      await this.processDailyDigests();
    }, {
      timezone: process.env.TIMEZONE || 'Asia/Jakarta'
    });

    logger.info(`[V3] Daily Digest Job scheduled: ${this.cronSchedule} (${process.env.TIMEZONE || 'Asia/Jakarta'})`);
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      logger.info('[V3] Daily Digest Job stopped');
    }
  }

  /**
   * Process daily digests for all active chats
   */
  async processDailyDigests() {
    if (this.isRunning) {
      logger.warn('[V3] Daily digest already running, skipping');
      return;
    }

    this.isRunning = true;

    try {
      logger.info('[V3] 🌙 Generating daily digests...');

      // Get yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const digestDate = yesterday.toISOString().split('T')[0];

      // Get all chats that had messages yesterday
      const activeChats = await this._getActiveChatsForDate(yesterday);

      logger.info(`[V3] Found ${activeChats.length} active chats for ${digestDate}`);

      // Process each chat
      for (const chatId of activeChats) {
        await this._generateDailyDigest(chatId, yesterday);
      }

      logger.info('[V3] ✅ Daily digests generation complete');

    } catch (error) {
      logger.error('[V3] Error in daily digest job:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get chats that had activity on a specific date
   * @private
   */
  async _getActiveChatsForDate(date) {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

    const { data, error } = await this.supabase
      .from('messages_v3')
      .select('chat_id')
      .gte('timestamp', startOfDay.toISOString())
      .lte('timestamp', endOfDay.toISOString());

    if (error) {
      logger.error('[V3] Error getting active chats for date:', error);
      return [];
    }

    // Get unique chat IDs
    const chatIds = [...new Set(data.map(m => m.chat_id))];
    return chatIds;
  }

  /**
   * Generate daily digest for a specific chat
   * @private
   */
  async _generateDailyDigest(chatId, date) {
    try {
      const digestDate = date.toISOString().split('T')[0];

      logger.info(`[V3] Generating daily digest for ${chatId} on ${digestDate}`);

      // Load all messages from the day
      const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
      const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

      const messages = await this.contextLoader.loadMessagesInTimeRange(
        chatId,
        startOfDay,
        endOfDay
      );

      if (messages.length === 0) {
        logger.info(`[V3] No messages for ${chatId} on ${digestDate}, skipping`);
        return;
      }

      logger.info(`[V3] Generating digest for ${chatId} (${messages.length} messages)`);

      // Generate comprehensive AI analysis
      const digest = await this._generateComprehensiveDigest(messages);

      // Extract participants
      const participants = [...new Set(messages.map(m => m.sender_name))];
      const messageCounts = {};
      participants.forEach(p => {
        messageCounts[p] = messages.filter(m => m.sender_name === p).length;
      });
      const mostActive = Object.keys(messageCounts).reduce((a, b) =>
        messageCounts[a] > messageCounts[b] ? a : b
      );

      // Save to database
      const { error } = await this.supabase
        .from('daily_digests_v3')
        .insert({
          chat_id: chatId,
          chat_name: messages[0].chat_name,
          digest_date: digestDate,
          summary_text: digest.summary,
          projects_discussed: digest.projects,
          key_decisions: digest.decisions,
          blockers_identified: digest.blockers,
          financial_mentions: digest.financial,
          message_count: messages.length,
          participants: participants,
          most_active_participant: mostActive
        });

      if (error) {
        logger.error(`[V3] Error saving daily digest for ${chatId}:`, error);
      } else {
        logger.info(`[V3] ✅ Daily digest saved for ${chatId}`);
      }

    } catch (error) {
      logger.error(`[V3] Error generating daily digest for ${chatId}:`, error);
    }
  }

  /**
   * Generate comprehensive AI digest
   * @private
   */
  async _generateComprehensiveDigest(messages) {
    const messagesText = messages.map(m => {
      const time = new Date(m.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return `[${time}] ${m.sender_name}: ${m.message_text}`;
    }).join('\n');

    const prompt = `You are analyzing a full day of WhatsApp conversation for Apex Sports Lab (padel court construction projects).

CONTEXT:
- Projects: Manado, Jakarta Kuningan, BSD, Palembang, Bali
- 5-item checklist: Rental, PT/CV, Bank, Architect, Contractor
- User is CEO Eka, speaks Indonesian/English mix

MESSAGES (${messages.length} total):
${messagesText}

Generate a comprehensive daily digest.

Output format (JSON):
{
  "summary": "3-5 sentence overview of the day's discussions",
  "projects": ["Project1", "Project2"],
  "decisions": ["Decision 1", "Decision 2"],
  "blockers": ["Blocker 1"],
  "financial": {
    "payments": [{"project": "X", "amount": "Y", "description": "Z"}],
    "budgets": []
  }
}

Rules:
- Summary should capture key themes and progress
- List only projects explicitly mentioned
- Include all significant decisions (agreements, approvals, confirmations)
- Flag any blockers, issues, or concerns raised
- Extract all financial mentions (payments, budgets, costs)
- Use empty arrays if nothing found
- Be thorough but concise`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
        max_tokens: 1500
      });

      const result = JSON.parse(completion.choices[0].message.content);

      return {
        summary: result.summary || `${messages.length} messages exchanged`,
        projects: result.projects || [],
        decisions: result.decisions || [],
        blockers: result.blockers || [],
        financial: result.financial || { payments: [], budgets: [] }
      };

    } catch (error) {
      logger.error('[V3] Error generating comprehensive digest:', error);
      return {
        summary: `${messages.length} messages exchanged. AI analysis failed.`,
        projects: [],
        decisions: [],
        blockers: [],
        financial: { payments: [], budgets: [] }
      };
    }
  }
}

module.exports = DailyDigestJob;
