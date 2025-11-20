/**
 * V3 Daily Updates Job
 * Sends proactive team updates at 9 AM and 3:30 PM
 * Philosophy: Only send if there's something worth saying
 */

const Anthropic = require('@anthropic-ai/sdk');
const cron = require('node-cron');
const logger = require('../utils/logger');
const DAILY_UPDATE_PROMPT = require('../prompts/dailyUpdate');

class DailyUpdatesJob {
  constructor(supabaseClient, whatsappClient) {
    this.supabase = supabaseClient.getClient();
    this.whatsappClient = whatsappClient;

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Use Claude Sonnet 4.5 for superior reasoning
    this.model = 'claude-sonnet-4-5-20250929';
    this.GROUP_CHAT_ID = '120363420201458845@g.us'; // Apex Sports Lab group

    this.morningJob = null;
    this.afternoonJob = null;
    this.isRunning = false;
  }

  /**
   * Start both daily update jobs
   */
  start() {
    logger.info('[Daily Updates] Starting proactive update jobs...');

    // Morning update: 9:00 AM WIB (Asia/Jakarta timezone)
    this.morningJob = cron.schedule('0 9 * * *', async () => {
      await this.sendMorningUpdate();
    }, {
      timezone: 'Asia/Jakarta'
    });

    // Afternoon update: 3:30 PM WIB (Asia/Jakarta timezone)
    this.afternoonJob = cron.schedule('30 15 * * *', async () => {
      await this.sendAfternoonUpdate();
    }, {
      timezone: 'Asia/Jakarta'
    });

    logger.info('[Daily Updates] Jobs scheduled: 9:00 AM and 3:30 PM WIB (Indonesia time)');
  }

  /**
   * Stop both jobs
   */
  stop() {
    if (this.morningJob) {
      this.morningJob.stop();
    }
    if (this.afternoonJob) {
      this.afternoonJob.stop();
    }
    logger.info('[Daily Updates] Jobs stopped');
  }

  /**
   * Send morning update (9 AM)
   */
  async sendMorningUpdate() {
    if (this.isRunning) {
      logger.warn('[Daily Updates] Already running, skipping morning update');
      return;
    }

    this.isRunning = true;

    try {
      logger.info('[Daily Updates] 🌅 Generating morning update...');

      // Load context: Recent KB + overnight messages
      const context = await this._loadMorningContext();

      // Always generate update (even if low activity - show Manado status/blockers)
      logger.info(`[Daily Updates] Morning context: ${context.messages.length} messages, ${context.recentKB.length} KB entries`);

      // Generate update
      const update = await this._generateUpdate('MORNING', context);

      // Always send update (never skip)
      if (update && update.trim()) {
        await this._sendToGroup(update);
        logger.info('[Daily Updates] ✅ Morning update sent');
      } else {
        logger.error('[Daily Updates] Update generation returned empty - this should not happen');
      }

    } catch (error) {
      logger.error('[Daily Updates] Error in morning update:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Send afternoon update (3:30 PM)
   */
  async sendAfternoonUpdate() {
    if (this.isRunning) {
      logger.warn('[Daily Updates] Already running, skipping afternoon update');
      return;
    }

    this.isRunning = true;

    try {
      logger.info('[Daily Updates] 📊 Generating afternoon update...');

      // Load context: Today's messages since morning
      const context = await this._loadAfternoonContext();

      // Always generate update (even if low activity - show Manado status/progress)
      logger.info(`[Daily Updates] Afternoon context: ${context.messages.length} messages since 9 AM`);

      // Generate update
      const update = await this._generateUpdate('AFTERNOON', context);

      // Always send update (never skip)
      if (update && update.trim()) {
        await this._sendToGroup(update);
        logger.info('[Daily Updates] ✅ Afternoon update sent');
      } else {
        logger.error('[Daily Updates] Update generation returned empty - this should not happen');
      }

    } catch (error) {
      logger.error('[Daily Updates] Error in afternoon update:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Load context for morning update
   * @private
   */
  async _loadMorningContext() {
    try {
      // Get messages from midnight WIB to now
      const now = new Date();
      const todayMidnightWIB = new Date(now);

      // Set to midnight today (WIB timezone)
      todayMidnightWIB.setHours(0, 0, 0, 0);

      const { data: messages, error: msgError } = await this.supabase
        .from('messages_v3')
        .select('*')
        .eq('chat_id', this.GROUP_CHAT_ID)
        .gte('timestamp', todayMidnightWIB.toISOString())
        .order('timestamp', { ascending: true });

      if (msgError) throw msgError;

      // Get recent KB entries (last 7 days for context)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: recentKB, error: kbError } = await this.supabase
        .from('knowledge_base')
        .select('id, date, topic, content, tags')
        .gte('date', sevenDaysAgo.toISOString().split('T')[0])
        .order('id', { ascending: true });

      if (kbError) throw kbError;

      // Get midnight compilation status for yesterday
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

      // Fetch compilation status
      const { data: processingStatus } = await this.supabase
        .from('kb_processing_status')
        .select('*')
        .eq('id', 1)
        .single();

      // Fetch yesterday's KB entry (if compiled)
      const { data: yesterdayKB } = await this.supabase
        .from('knowledge_base')
        .select('id, date, topic, content, tags')
        .eq('date', yesterdayDate)
        .order('id', { ascending: false })
        .limit(1);

      // Count yesterday's messages
      const yesterdayStart = new Date(yesterday);
      yesterdayStart.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);

      const { count: yesterdayMessageCount } = await this.supabase
        .from('messages_v3')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', this.GROUP_CHAT_ID)
        .gte('timestamp', yesterdayStart.toISOString())
        .lte('timestamp', yesterdayEnd.toISOString());

      return {
        messages: messages || [],
        recentKB: recentKB || [],
        midnightRecap: {
          processingStatus: processingStatus || null,
          yesterdayKB: yesterdayKB && yesterdayKB.length > 0 ? yesterdayKB[0] : null,
          yesterdayDate: yesterdayDate,
          yesterdayMessageCount: yesterdayMessageCount || 0
        }
      };

    } catch (error) {
      logger.error('[Daily Updates] Error loading morning context:', error);
      return { messages: [], recentKB: [], midnightRecap: null };
    }
  }

  /**
   * Load context for afternoon update
   * @private
   */
  async _loadAfternoonContext() {
    try {
      // Get today's messages from 9 AM WIB to now
      const now = new Date();
      const todayNineAMWIB = new Date(now);

      // Set to 9 AM today (WIB timezone)
      todayNineAMWIB.setHours(9, 0, 0, 0);

      const { data: messages, error } = await this.supabase
        .from('messages_v3')
        .select('*')
        .eq('chat_id', this.GROUP_CHAT_ID)
        .gte('timestamp', todayNineAMWIB.toISOString())
        .order('timestamp', { ascending: true });

      if (error) throw error;

      return {
        messages: messages || [],
        recentKB: [] // Don't need KB for afternoon (just today's activity)
      };

    } catch (error) {
      logger.error('[Daily Updates] Error loading afternoon context:', error);
      return { messages: [], recentKB: [] };
    }
  }

  /**
   * Generate update using GPT-4o
   * @private
   */
  async _generateUpdate(updateType, context) {
    try {
      // Format messages
      const messagesText = context.messages.map(m => {
        const time = new Date(m.timestamp).toLocaleString('id-ID', {
          hour: '2-digit',
          minute: '2-digit'
        });
        return `[${time}] ${m.sender_name}: ${m.message_text}`;
      }).join('\n');

      // Format KB (if any)
      const kbText = context.recentKB.map(row => {
        return `#${row.id} | ${row.date} | ${row.topic} | ${row.content} | ${row.tags || ''}`;
      }).join('\n');

      // Build prompt
      let prompt = `${DAILY_UPDATE_PROMPT}\n\n`;
      prompt += `# UPDATE TYPE: ${updateType}\n\n`;

      // Add midnight recap status (only for MORNING updates)
      if (updateType === 'MORNING' && context.midnightRecap) {
        const recap = context.midnightRecap;
        prompt += `# MIDNIGHT COMPILATION STATUS\n`;
        prompt += `Date: ${recap.yesterdayDate}\n`;
        prompt += `Yesterday's messages: ${recap.yesterdayMessageCount}\n`;

        if (recap.yesterdayKB) {
          prompt += `✅ SUCCESSFULLY COMPILED\n`;
          prompt += `KB Entry #${recap.yesterdayKB.id}\n`;
          prompt += `Topic: ${recap.yesterdayKB.topic}\n`;
          prompt += `Tags: ${recap.yesterdayKB.tags || 'none'}\n`;
        } else if (recap.yesterdayMessageCount === 0) {
          prompt += `⏸️ NO MESSAGES - No compilation needed\n`;
        } else {
          prompt += `❌ COMPILATION MISSING - ${recap.yesterdayMessageCount} messages NOT compiled\n`;
          if (recap.processingStatus) {
            prompt += `Last successful run: ${new Date(recap.processingStatus.last_run_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n`;
          }
        }
        prompt += `\n`;
      }

      if (context.recentKB.length > 0) {
        prompt += `# RECENT KNOWLEDGE BASE (Last 7 days)\n${kbText}\n\n`;
      }

      if (context.messages.length > 0) {
        prompt += `# MESSAGES\n${messagesText}\n\n`;
      }

      prompt += `Generate the ${updateType} update now. Return ONLY the update text or "SKIP".`;

      // Call Claude
      const startTime = Date.now();
      const completion = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 300,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      const duration = Date.now() - startTime;
      const update = completion.content[0].text.trim();

      // Log token usage
      this._logTokenUsage(completion, duration, updateType);

      return update;

    } catch (error) {
      logger.error('[Daily Updates] Error generating update:', error);
      return null;
    }
  }

  /**
   * Send message to WhatsApp group
   * @private
   */
  async _sendToGroup(message) {
    try {
      await this.whatsappClient.sendMessage(this.GROUP_CHAT_ID, message);
      logger.info('[Daily Updates] Message sent to group');
    } catch (error) {
      logger.error('[Daily Updates] Error sending message:', error);
      throw error;
    }
  }

  /**
   * Log token usage and cost
   * @private
   */
  _logTokenUsage(completion, duration, updateType) {
    const usage = completion.usage;
    if (!usage) return;

    // Claude Sonnet 4.5 pricing (per 1K tokens)
    const pricing = { input: 0.003, output: 0.015 };
    const inputCost = (usage.input_tokens / 1000) * pricing.input;
    const outputCost = (usage.output_tokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    logger.info(`[Daily Updates] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    logger.info(`[Daily Updates] Update type: ${updateType}`);
    logger.info(`[Daily Updates] Model: ${this.model}`);
    logger.info(`[Daily Updates] Input tokens: ${usage.input_tokens}`);
    logger.info(`[Daily Updates] Output tokens: ${usage.output_tokens}`);
    logger.info(`[Daily Updates] Total tokens: ${usage.input_tokens + usage.output_tokens}`);
    logger.info(`[Daily Updates] Duration: ${duration}ms`);
    logger.info(`[Daily Updates] Estimated cost: $${totalCost.toFixed(6)} (Input: $${inputCost.toFixed(6)}, Output: $${outputCost.toFixed(6)})`);
    logger.info(`[Daily Updates] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  /**
   * Manual trigger for testing
   */
  async testMorningUpdate() {
    logger.info('[Daily Updates] 🧪 TEST: Morning update');
    await this.sendMorningUpdate();
  }

  async testAfternoonUpdate() {
    logger.info('[Daily Updates] 🧪 TEST: Afternoon update');
    await this.sendAfternoonUpdate();
  }
}

module.exports = DailyUpdatesJob;
