/**
 * Metrics Service
 *
 * Provides monitoring data for Nova's daily operations:
 * - Yesterday's message statistics
 * - Knowledge base compilation status
 * - API cost tracking
 * - System health
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class MetricsService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient.getClient();
  }

  /**
   * Get comprehensive daily metrics for monitoring dashboard
   * @param {Date} date - Date to get metrics for (defaults to yesterday)
   */
  async getDailyMetrics(date = null) {
    const targetDate = date || this._getYesterday();

    logger.info(`[Metrics] Fetching metrics for ${targetDate.toISOString().split('T')[0]}`);

    try {
      // Fetch all metrics in parallel for speed
      const [rawMessages, knowledgeBase, apiCosts, mtdCosts, systemHealth] = await Promise.all([
        this.getRawMessageStats(targetDate),
        this.getKnowledgeBaseStats(targetDate),
        this.getAPICosts(targetDate),
        this.getMonthToDateCosts(),
        this.getSystemHealth()
      ]);

      return {
        date: targetDate.toISOString().split('T')[0],
        raw_messages: rawMessages,
        knowledge_base: knowledgeBase,
        api_costs: apiCosts,
        api_costs_mtd: mtdCosts,
        system_health: systemHealth,
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      logger.error('[Metrics] Error fetching daily metrics:', error);
      throw error;
    }
  }

  /**
   * Get raw message statistics for a given date
   * @private
   */
  async getRawMessageStats(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      // Get message count and details
      const { data: messages, error } = await this.supabase
        .from('messages_v3')
        .select('id, timestamp, sender_name, mentioned_nova')
        .gte('timestamp', startOfDay.toISOString())
        .lte('timestamp', endOfDay.toISOString())
        .order('timestamp', { ascending: true });

      if (error) throw error;

      if (!messages || messages.length === 0) {
        return {
          count: 0,
          first_message_at: null,
          last_message_at: null,
          participants: [],
          nova_mentions: 0
        };
      }

      // Extract statistics
      const participants = [...new Set(messages.map(m => m.sender_name))];
      const novaMentions = messages.filter(m => m.mentioned_nova).length;

      return {
        count: messages.length,
        first_message_at: messages[0].timestamp,
        last_message_at: messages[messages.length - 1].timestamp,
        participants: participants,
        nova_mentions: novaMentions
      };

    } catch (error) {
      logger.error('[Metrics] Error fetching raw message stats:', error);
      return {
        count: 0,
        error: error.message
      };
    }
  }

  /**
   * Get knowledge base compilation statistics
   * @private
   */
  async getKnowledgeBaseStats(date) {
    const targetDateStr = date.toISOString().split('T')[0];

    try {
      // Get KB entries for the target date
      const { data: entries, error } = await this.supabase
        .from('knowledge_base')
        .select('id, date, topic, content, tags')
        .eq('date', targetDateStr)
        .order('id', { ascending: true });

      if (error) throw error;

      // Get last compilation status
      const { data: status, error: statusError } = await this.supabase
        .from('kb_processing_status')
        .select('last_processed_timestamp, last_run_at')
        .single();

      if (statusError) logger.warn('[Metrics] Could not fetch kb_processing_status:', statusError);

      if (!entries || entries.length === 0) {
        return {
          entries_created: 0,
          total_messages_covered: 0,
          topics: [],
          last_compilation_at: status?.last_run_at || null,
          status: 'no_entries'
        };
      }

      const topics = entries.map(e => e.topic);

      return {
        entries_created: entries.length,
        total_messages_covered: 0, // Not tracked in this table structure
        topics: topics,
        entries: entries, // Full entries for detailed view
        last_compilation_at: status?.last_run_at || null,
        status: 'success'
      };

    } catch (error) {
      logger.error('[Metrics] Error fetching knowledge base stats:', error);
      return {
        entries_created: 0,
        error: error.message,
        status: 'error'
      };
    }
  }

  /**
   * Parse logs to calculate API costs for a given date
   * @private
   */
  async getAPICosts(date) {
    const targetDateStr = date.toISOString().split('T')[0];
    // Also search next day (for midnight jobs that run at 00:00 WIB = 17:00 UTC previous day)
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    try {
      const logPath = path.join(__dirname, '../../logs/combined.log');

      // Check if log file exists
      try {
        await fs.access(logPath);
      } catch {
        logger.warn('[Metrics] combined.log not found, returning zero costs');
        return {
          total_yesterday: 0,
          breakdown: {
            responses: 0,
            daily_updates: 0,
            knowledge_compilation: 0
          },
          source: 'no_logs'
        };
      }

      const logContent = await fs.readFile(logPath, 'utf-8');
      const logLines = logContent.split('\n').filter(line => line.trim());

      let responseCosts = 0;
      let updateCosts = 0;
      let compilationCosts = 0;

      // Parse log lines for cost information
      for (const line of logLines) {
        try {
          // Parse JSON log entry
          const logEntry = JSON.parse(line);
          const timestamp = logEntry.timestamp || '';
          const message = logEntry.message || '';

          // Search for both target date and next day (catches midnight jobs)
          if (!timestamp.includes(targetDateStr) && !timestamp.includes(nextDateStr)) continue;
          if (!message.includes('Estimated cost:')) continue;

          // Extract cost from message like: "[Token Monitor] Estimated cost: $0.085116"
          const costMatch = message.match(/Estimated cost: \$([0-9.]+)/);
          if (!costMatch) continue;

          const cost = parseFloat(costMatch[1]);

          // Categorize by context (check message content)
          if (message.includes('Token Monitor') || message.includes('Generated response')) {
            responseCosts += cost;
          } else if (message.includes('Daily Updates')) {
            updateCosts += cost;
          } else if (message.includes('Knowledge Compiler') || message.includes('Knowledge') || message.includes('compilation')) {
            compilationCosts += cost;
          }
        } catch (parseError) {
          // Skip lines that aren't valid JSON
          continue;
        }
      }

      const total = responseCosts + updateCosts + compilationCosts;

      return {
        total_yesterday: parseFloat(total.toFixed(6)),
        breakdown: {
          responses: parseFloat(responseCosts.toFixed(6)),
          daily_updates: parseFloat(updateCosts.toFixed(6)),
          knowledge_compilation: parseFloat(compilationCosts.toFixed(6))
        },
        monthly_projection: parseFloat((total * 30).toFixed(2)),
        source: 'parsed_logs'
      };

    } catch (error) {
      logger.error('[Metrics] Error parsing API costs from logs:', error);
      return {
        total_yesterday: 0,
        error: error.message,
        source: 'error'
      };
    }
  }

  /**
   * Get month-to-date API costs
   */
  async getMonthToDateCosts() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    logger.info(`[Metrics] Calculating MTD costs from ${startOfMonth.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`);

    try {
      let totalCosts = 0;
      const breakdown = {
        responses: 0,
        daily_updates: 0,
        knowledge_compilation: 0
      };

      // Loop through each day of the month so far
      const currentDate = new Date(startOfMonth);
      while (currentDate <= today) {
        const dayCosts = await this.getAPICosts(new Date(currentDate));

        totalCosts += dayCosts.total_yesterday || 0;
        breakdown.responses += dayCosts.breakdown.responses || 0;
        breakdown.daily_updates += dayCosts.breakdown.daily_updates || 0;
        breakdown.knowledge_compilation += dayCosts.breakdown.knowledge_compilation || 0;

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const daysInMonth = today.getDate();
      const dailyAverage = daysInMonth > 0 ? totalCosts / daysInMonth : 0;

      return {
        total: parseFloat(totalCosts.toFixed(2)),
        breakdown: {
          responses: parseFloat(breakdown.responses.toFixed(2)),
          daily_updates: parseFloat(breakdown.daily_updates.toFixed(2)),
          knowledge_compilation: parseFloat(breakdown.knowledge_compilation.toFixed(2))
        },
        days_in_month: daysInMonth,
        daily_average: parseFloat(dailyAverage.toFixed(2)),
        month: today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      };

    } catch (error) {
      logger.error('[Metrics] Error calculating MTD costs:', error);
      return {
        total: 0,
        breakdown: { responses: 0, daily_updates: 0, knowledge_compilation: 0 },
        days_in_month: 0,
        daily_average: 0,
        error: error.message
      };
    }
  }

  /**
   * Get current system health status
   * @private
   */
  async getSystemHealth() {
    try {
      // Calculate uptime
      const startTime = global.startTime || Date.now();
      const uptimeMs = Date.now() - startTime;
      const uptimeHours = (uptimeMs / (1000 * 60 * 60)).toFixed(1);

      // Check Supabase connection
      let supabaseStatus = 'unknown';
      try {
        const { error } = await this.supabase.from('messages_v3').select('id').limit(1);
        supabaseStatus = error ? 'error' : 'healthy';
      } catch {
        supabaseStatus = 'error';
      }

      // Check WhatsApp status (if available)
      let whatsappStatus = 'unknown';
      if (global.whatsappClient) {
        const info = global.whatsappClient.info;
        whatsappStatus = info ? 'connected' : 'disconnected';
      }

      // Check for recent errors
      let lastError = null;
      try {
        const errorLogPath = path.join(__dirname, '../../logs/error.log');
        const errorContent = await fs.readFile(errorLogPath, 'utf-8');
        const errorLines = errorContent.trim().split('\n');

        if (errorLines.length > 0 && errorLines[errorLines.length - 1]) {
          const lastErrorLine = errorLines[errorLines.length - 1];
          try {
            const errorData = JSON.parse(lastErrorLine);
            lastError = {
              message: errorData.message,
              timestamp: errorData.timestamp
            };
          } catch {
            // Not JSON format, skip
          }
        }
      } catch {
        // No error log or can't read it
      }

      return {
        uptime_hours: parseFloat(uptimeHours),
        services: {
          whatsapp: whatsappStatus,
          supabase: supabaseStatus
        },
        last_error: lastError
      };

    } catch (error) {
      logger.error('[Metrics] Error getting system health:', error);
      return {
        uptime_hours: 0,
        error: error.message
      };
    }
  }

  /**
   * Helper to get yesterday's date
   * @private
   */
  _getYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return yesterday;
  }
}

module.exports = MetricsService;
