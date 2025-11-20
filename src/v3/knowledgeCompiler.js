/**
 * V3 Knowledge Compiler
 * Runs daily at midnight to compile raw messages into knowledge_base updates
 * Philosophy: Use Claude 3.5 Sonnet to analyze full context and determine NEW/UPDATE/MERGE actions
 */

const Anthropic = require('@anthropic-ai/sdk');
const cron = require('node-cron');
const logger = require('../utils/logger');
const COMPILATION_PROMPT = require('../prompts/compilation');

class KnowledgeCompiler {
  constructor(supabaseClient) {
    this.supabase = supabaseClient.getClient();

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Use Claude Sonnet 4.5 for critical compilation task (200K context, excellent reasoning)
    this.model = 'claude-sonnet-4-5-20250929';
    this.cronSchedule = '0 0 * * *'; // Every day at midnight WIB (00:00 local time)
    this.isRunning = false;
    this.GROUP_CHAT_ID = '120363420201458845@g.us'; // Apex Sports Lab group
  }

  /**
   * Start the daily compilation cron job
   */
  start() {
    logger.info('[Knowledge Compiler] Starting daily compilation job...');

    // Schedule: Every day at midnight
    this.job = cron.schedule(this.cronSchedule, async () => {
      await this.compileDailyKnowledge();
    });

    logger.info(`[Knowledge Compiler] Job scheduled: ${this.cronSchedule} (midnight WIB daily, 00:00 local time)`);
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      logger.info('[Knowledge Compiler] Job stopped');
    }
  }

  /**
   * Main compilation process
   */
  async compileDailyKnowledge() {
    if (this.isRunning) {
      logger.warn('[Knowledge Compiler] Already running, skipping');
      return;
    }

    this.isRunning = true;

    try {
      logger.info('[Knowledge Compiler] 🧠 Starting daily knowledge compilation...');

      // 1. Load yesterday's raw messages (midnight to midnight)
      const yesterday = this._getYesterdayTimeRange();
      const rawMessages = await this._loadRawMessages(yesterday.start, yesterday.end);

      if (rawMessages.length === 0) {
        logger.info('[Knowledge Compiler] No messages to process, skipping');
        this.isRunning = false;
        return;
      }

      logger.info(`[Knowledge Compiler] Loaded ${rawMessages.length} messages from yesterday`);

      // 2. Load full knowledge base for context
      const knowledgeBase = await this._loadKnowledgeBase();
      logger.info(`[Knowledge Compiler] Loaded ${knowledgeBase.length} knowledge base entries`);

      // 3. Generate compilation instructions using GPT-4
      const compilationResult = await this._generateCompilationInstructions(rawMessages, knowledgeBase);

      if (!compilationResult || compilationResult.actions.length === 0) {
        logger.info('[Knowledge Compiler] No actions to take, knowledge base is up to date');
        await this._updateProcessingStatus(yesterday.end);
        this.isRunning = false;
        return;
      }

      // 4. Execute actions (NEW/UPDATE/MERGE)
      await this._executeActions(compilationResult.actions);

      // 5. Update processing status
      await this._updateProcessingStatus(yesterday.end);

      logger.info('[Knowledge Compiler] ✅ Daily knowledge compilation complete');

    } catch (error) {
      logger.error('[Knowledge Compiler] Error in compilation:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get yesterday's time range (midnight to midnight WIB)
   * @private
   */
  _getYesterdayTimeRange() {
    // Calculate yesterday in WIB timezone (UTC+7)
    // When this runs at 00:00 WIB (17:00 UTC previous day), we want yesterday's full day in WIB
    // Yesterday 00:00 WIB = 17:00 UTC day before yesterday
    // Yesterday 23:59 WIB = 16:59 UTC yesterday
    const now = new Date();

    // Yesterday midnight WIB start (17:00 UTC day before yesterday)
    const start = new Date(now);
    start.setUTCHours(17, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - 1);  // Fixed: was -2, should be -1

    // Yesterday midnight WIB end (16:59:59 UTC yesterday = 23:59:59 WIB yesterday)
    const end = new Date(now);
    end.setUTCHours(16, 59, 59, 999);
    // end date stays at current day (no change needed)

    return { start, end };
  }

  /**
   * Load raw messages from time range
   * @private
   */
  async _loadRawMessages(startTime, endTime) {
    try {
      const { data, error } = await this.supabase
        .from('messages_v3')
        .select('*')
        .eq('chat_id', this.GROUP_CHAT_ID)
        .gte('timestamp', startTime.toISOString())
        .lte('timestamp', endTime.toISOString())
        .order('timestamp', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('[Knowledge Compiler] Error loading raw messages:', error);
      return [];
    }
  }

  /**
   * Load full knowledge base for context
   * @private
   */
  async _loadKnowledgeBase() {
    try {
      const { data, error } = await this.supabase
        .from('knowledge_base')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('[Knowledge Compiler] Error loading knowledge base:', error);
      return [];
    }
  }

  /**
   * Generate compilation instructions using GPT-4
   * @private
   */
  async _generateCompilationInstructions(rawMessages, knowledgeBase) {
    const messagesText = rawMessages.map(m => {
      const time = new Date(m.timestamp).toLocaleString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'short'
      });
      return `[${time}] ${m.sender_name}: ${m.message_text}`;
    }).join('\n');

    const kbText = knowledgeBase.map(row => {
      return `#${row.id} | ${row.date} | ${row.topic} | ${row.content} | ${row.tags || ''}`;
    }).join('\n');

    // Build the full prompt with data context
    const prompt = `${COMPILATION_PROMPT}

# CURRENT KNOWLEDGE BASE (${knowledgeBase.length} entries covering 3,785+ historical messages)
${kbText}

# YESTERDAY'S MESSAGES (${rawMessages.length} messages)
${messagesText}

Return ONLY the JSON, no explanations.`;

    try {
      logger.info('[Knowledge Compiler] Calling Claude 3.5 Sonnet for compilation analysis...');
      const startTime = Date.now();

      const message = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 8192, // Increased for detailed document extraction
        temperature: 0.2, // Low temperature for consistent, focused output
        system: "You are a Knowledge Base Compilation Engine. Your mission: Extract EVERY critical detail from documents and conversations, especially PDFs. Completeness is more important than brevity. Always respond with valid JSON only, no explanations.",
        messages: [
          {
            role: 'user',
            content: prompt + '\n\nIMPORTANT: Return ONLY valid JSON with this exact structure: {"summary": "...", "actions": [...]}'
          }
        ]
      });

      const duration = Date.now() - startTime;

      // Extract text from Claude's response
      let responseText = message.content[0].text;

      // Remove markdown code blocks if present
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      const result = JSON.parse(responseText);

      // Log token usage
      this._logTokenUsage(message, duration);

      logger.info(`[Knowledge Compiler] Analysis complete: ${result.actions.length} actions`);
      logger.info(`[Knowledge Compiler] Summary: ${result.summary}`);

      return result;

    } catch (error) {
      logger.error('[Knowledge Compiler] Error generating compilation instructions:', error);
      return null;
    }
  }

  /**
   * Execute compilation actions (NEW/MERGE only - append-only pattern)
   * @private
   */
  async _executeActions(actions) {
    let newCount = 0;
    let mergeCount = 0;
    let rejectedCount = 0;

    // Validate NEW limit (max 3 per day)
    const newActions = actions.filter(a => a.type === 'NEW');
    if (newActions.length > 3) {
      logger.warn(`[Knowledge Compiler] Too many NEW actions (${newActions.length}), limiting to first 3`);
      // Keep only first 3 NEW actions
      const allowedNewActions = newActions.slice(0, 3);
      const rejectedNewActions = newActions.slice(3);

      // Rebuild actions array with limited NEW
      actions = actions.filter(a => a.type !== 'NEW').concat(allowedNewActions);
      rejectedCount += rejectedNewActions.length;

      logger.warn(`[Knowledge Compiler] Rejected ${rejectedNewActions.length} NEW actions due to 3/day limit`);
    }

    for (const action of actions) {
      try {
        if (action.type === 'NEW') {
          await this._createNewEntry(action);
          newCount++;
        } else if (action.type === 'MERGE') {
          await this._mergeEntry(action);
          mergeCount++;
        } else if (action.type === 'UPDATE') {
          logger.error(`[Knowledge Compiler] ⚠️ UPDATE action rejected - only NEW and MERGE allowed`);
          rejectedCount++;
        } else {
          logger.error(`[Knowledge Compiler] Unknown action type: ${action.type}`);
          rejectedCount++;
        }
      } catch (error) {
        logger.error(`[Knowledge Compiler] Error executing action ${action.type}:`, error);
      }
    }

    logger.info(`[Knowledge Compiler] Actions executed: ${newCount} NEW, ${mergeCount} MERGE, ${rejectedCount} rejected`);
  }

  /**
   * Create new knowledge base entry
   * @private
   */
  async _createNewEntry(action) {
    try {
      // Get the max ID first
      const { data: maxData, error: maxError } = await this.supabase
        .from('knowledge_base')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);

      if (maxError) throw maxError;

      const nextId = maxData && maxData.length > 0 ? maxData[0].id + 1 : 1;

      // Insert with explicit ID
      const { error } = await this.supabase
        .from('knowledge_base')
        .insert({
          id: nextId,
          date: action.date,
          topic: action.topic,
          content: action.content,
          tags: action.tags || ''
        });

      if (error) {
        logger.error('[Knowledge Compiler] Error creating new entry:', error);
      } else {
        logger.info(`[Knowledge Compiler] ✅ Created: #${nextId} - ${action.topic}`);
      }
    } catch (error) {
      logger.error('[Knowledge Compiler] Error in _createNewEntry:', error);
    }
  }

  /**
   * Merge content into existing knowledge base entry
   * @private
   */
  async _mergeEntry(action) {
    try {
      // First, get the existing entry
      const { data: existing, error: fetchError } = await this.supabase
        .from('knowledge_base')
        .select('*')
        .eq('id', action.kb_id)
        .single();

      if (fetchError || !existing) {
        logger.error(`[Knowledge Compiler] Cannot find entry #${action.kb_id} for merge`);
        return;
      }

      // Merge content and tags
      const mergedContent = `${existing.content} ${action.additional_content}`.trim();
      const existingTags = existing.tags || '';
      const newTags = action.tags || '';
      const mergedTags = this._mergeTags(existingTags, newTags);

      // Update with merged data (preserve original date)
      const { error: updateError } = await this.supabase
        .from('knowledge_base')
        .update({
          content: mergedContent,
          tags: mergedTags
        })
        .eq('id', action.kb_id);

      if (updateError) {
        logger.error('[Knowledge Compiler] Error merging entry:', updateError);
      } else {
        logger.info(`[Knowledge Compiler] ✅ Merged: #${action.kb_id} - ${existing.topic}`);
      }

    } catch (error) {
      logger.error('[Knowledge Compiler] Error in merge operation:', error);
    }
  }

  /**
   * Merge tags (deduplicate)
   * @private
   */
  _mergeTags(existingTags, newTags) {
    const allTags = `${existingTags}, ${newTags}`;
    const uniqueTags = [...new Set(allTags.split(',').map(t => t.trim()).filter(t => t))];
    return uniqueTags.join(', ');
  }

  /**
   * Update processing status
   * @private
   */
  async _updateProcessingStatus(processedUpTo) {
    try {
      const { error } = await this.supabase
        .from('kb_processing_status')
        .upsert({
          id: 1, // Single row for tracking
          last_processed_timestamp: processedUpTo.toISOString(),
          last_run_at: new Date().toISOString()
        });

      if (error) {
        logger.error('[Knowledge Compiler] Error updating processing status:', error);
      }
    } catch (error) {
      logger.error('[Knowledge Compiler] Error in _updateProcessingStatus:', error);
    }
  }

  /**
   * Log token usage and cost
   * @private
   */
  _logTokenUsage(message, duration) {
    const usage = message.usage;
    if (!usage) return;

    // Claude 3.5 Sonnet pricing (per 1K tokens)
    const pricing = { input: 0.003, output: 0.015 };
    const inputCost = (usage.input_tokens / 1000) * pricing.input;
    const outputCost = (usage.output_tokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    logger.info(`[Knowledge Compiler] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    logger.info(`[Knowledge Compiler] Model: ${this.model}`);
    logger.info(`[Knowledge Compiler] Input tokens: ${usage.input_tokens}`);
    logger.info(`[Knowledge Compiler] Output tokens: ${usage.output_tokens}`);
    logger.info(`[Knowledge Compiler] Total tokens: ${usage.input_tokens + usage.output_tokens}`);
    logger.info(`[Knowledge Compiler] Duration: ${duration}ms`);
    logger.info(`[Knowledge Compiler] Estimated cost: $${totalCost.toFixed(4)} (Input: $${inputCost.toFixed(4)}, Output: $${outputCost.toFixed(4)})`);
    logger.info(`[Knowledge Compiler] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  /**
   * Manual trigger for testing (process specific date range)
   */
  async testRun(startDate, endDate) {
    logger.info(`[Knowledge Compiler] 🧪 TEST RUN: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const rawMessages = await this._loadRawMessages(startDate, endDate);
    logger.info(`[Knowledge Compiler] Loaded ${rawMessages.length} messages for test run`);

    if (rawMessages.length === 0) {
      logger.info('[Knowledge Compiler] No messages in test range');
      return;
    }

    const knowledgeBase = await this._loadKnowledgeBase();
    logger.info(`[Knowledge Compiler] Loaded ${knowledgeBase.length} KB entries`);

    const compilationResult = await this._generateCompilationInstructions(rawMessages, knowledgeBase);

    logger.info('[Knowledge Compiler] 📋 Compilation Result:');
    logger.info(JSON.stringify(compilationResult, null, 2));

    // Don't execute actions in test mode
    logger.info('[Knowledge Compiler] TEST MODE: Actions not executed. Review the output above.');
  }
}

module.exports = KnowledgeCompiler;
