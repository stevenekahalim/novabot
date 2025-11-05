const logger = require('../utils/logger');

/**
 * DailyDigestCompiler - 3 AM daily compilation job
 *
 * Compiles all sessions from previous day into:
 * - Per-project summaries
 * - Global insights
 * - Action items and blockers
 * - Productivity metrics
 *
 * Layer 3 of context architecture
 */
class DailyDigestCompiler {
  constructor(supabaseClient, openaiClient) {
    this.supabase = supabaseClient;
    this.openai = openaiClient;
  }

  /**
   * Main compilation job - runs at 3 AM
   */
  async compileDaily() {
    try {
      logger.info('🌙 Starting daily digest compilation (3 AM job)...');

      const yesterday = this.getYesterdayDate();

      // Step 1: Get all sessions from yesterday
      const sessions = await this.getYesterdaySessions(yesterday);

      if (!sessions || sessions.length === 0) {
        logger.info('No sessions to compile for', yesterday);
        return null;
      }

      logger.info(`Found ${sessions.length} sessions to compile`);

      // Step 2: Group sessions by project
      const projectGroups = this.groupSessionsByProject(sessions);

      // Step 3: Compile per-project summaries using AI
      const projectSummaries = {};
      for (const [projectName, projectSessions] of Object.entries(projectGroups)) {
        logger.info(`Compiling summary for ${projectName}: ${projectSessions.length} sessions`);
        projectSummaries[projectName] = await this.compileProjectSummary(projectName, projectSessions);
      }

      // Step 4: Extract global insights
      const globalInsights = await this.compileGlobalInsights(sessions);

      // Step 5: Calculate productivity metrics
      const metrics = this.calculateMetrics(sessions, projectSummaries);

      // Step 6: Save digest to database
      const digest = await this.saveDigest(
        yesterday,
        projectSummaries,
        globalInsights,
        metrics,
        sessions
      );

      logger.info('✅ Daily digest compiled:', digest.id);

      return digest;
    } catch (error) {
      logger.error('Error compiling daily digest:', error);
      throw error;
    }
  }

  /**
   * Get yesterday's date (YYYY-MM-DD)
   */
  getYesterdayDate() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  /**
   * Get all sessions from yesterday
   */
  async getYesterdaySessions(date) {
    try {
      const startOfDay = `${date}T00:00:00Z`;
      const endOfDay = `${date}T23:59:59Z`;

      const { data, error } = await this.supabase
        .from('conversation_sessions')
        .select('*')
        .gte('session_start', startOfDay)
        .lte('session_start', endOfDay)
        .order('session_start', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('Error getting yesterday sessions:', error);
      return [];
    }
  }

  /**
   * Group sessions by project
   */
  groupSessionsByProject(sessions) {
    const groups = {};

    sessions.forEach(session => {
      const projects = session.projects_discussed || [session.primary_project];

      projects.forEach(project => {
        if (project) {
          if (!groups[project]) {
            groups[project] = [];
          }
          groups[project].push(session);
        }
      });
    });

    return groups;
  }

  /**
   * Compile summary for a specific project using AI
   */
  async compileProjectSummary(projectName, sessions) {
    try {
      // Build session summaries text
      const sessionTexts = sessions.map(s => `
SESSION ${s.id.substring(0, 8)} (${s.message_count} messages):
Summary: ${s.summary_text}
Decisions: ${JSON.stringify(s.decisions_made)}
Updates: ${JSON.stringify(s.updates_made)}
Blockers: ${JSON.stringify(s.blockers_identified)}
Action Items: ${JSON.stringify(s.action_items)}
Numbers: ${JSON.stringify(s.numbers_discussed)}
Sentiment: ${s.overall_sentiment}
`).join('\n---\n');

      const prompt = `Analyze all sessions for project "${projectName}" from yesterday and compile a comprehensive daily summary.

SESSIONS:
${sessionTexts}

Compile and return JSON with:

1. sessions: Number of sessions (${sessions.length})

2. messages: Total message count

3. key_updates: Array of the most important updates
   Structure: [{type: "checklist|cost|status|decision", item: string, timestamp: string, source_session_id: string}]
   Select only the 5 most important updates

4. decisions: Array of key decisions made
   Extract from all decisions_made arrays, deduplicate

5. blockers: Array of blockers identified
   Extract from all blockers_identified arrays

6. participants: Array of unique people involved
   Extract from all people_involved arrays

7. sentiment: Overall sentiment (positive, neutral, negative, mixed)
   Based on overall_sentiment from all sessions

8. progress_made: Boolean - was there actual progress?
   True if there were updates, decisions, or completed actions

9. next_actions: Array of pending action items
   Extract from all action_items that are not completed

10. financial_activity: Object with financial summary
    {
      total_discussed: sum of amounts,
      transactions: [{type, amount, context}],
      budget_impact: "high|medium|low"
    }

11. highlights: String - 1-2 sentence highlight of the day
    Most important thing that happened

12. concerns: Array of concerning items or risks identified

Be comprehensive but concise. Return ONLY valid JSON.`;

      const response = await this.openai.chatWithRetry([
        {
          role: 'system',
          content: 'You are Nova\'s daily digest compiler. Create comprehensive project summaries.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.2,
        max_tokens: 2000
      });

      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const summary = JSON.parse(cleaned);

      // Add computed fields
      summary.sessions = sessions.length;
      summary.messages = sessions.reduce((sum, s) => sum + s.message_count, 0);

      return summary;
    } catch (error) {
      logger.error(`Error compiling summary for ${projectName}:`, error);

      // Fallback to basic summary
      return {
        sessions: sessions.length,
        messages: sessions.reduce((sum, s) => sum + s.message_count, 0),
        key_updates: [],
        decisions: sessions.flatMap(s => s.decisions_made || []),
        blockers: sessions.flatMap(s => s.blockers_identified || []),
        participants: [...new Set(sessions.flatMap(s => s.people_involved || []))],
        sentiment: 'neutral',
        progress_made: sessions.some(s => s.updates_made?.length > 0),
        next_actions: sessions.flatMap(s => s.action_items || []).filter(a => !a.completed),
        highlights: `${sessions.length} sessions recorded`,
        concerns: []
      };
    }
  }

  /**
   * Compile global insights across all projects
   */
  async compileGlobalInsights(sessions) {
    try {
      // Extract all key decisions
      const allDecisions = sessions.flatMap(s => s.decisions_made || []);

      // Extract all action items
      const allActionItems = sessions.flatMap(s => s.action_items || []);

      // Extract all blockers
      const allBlockers = sessions.flatMap(s => s.blockers_identified || []);

      // Get unique projects
      const activeProjects = [...new Set(sessions.flatMap(s => s.projects_discussed || []))].filter(Boolean);

      const prompt = `Analyze yesterday's business activity across all projects and provide global insights.

SUMMARY:
- Total sessions: ${sessions.length}
- Active projects: ${activeProjects.join(', ')}
- Total decisions: ${allDecisions.length}
- Total action items: ${allActionItems.length}
- Total blockers: ${allBlockers.length}

KEY DECISIONS:
${allDecisions.map(d => `- ${d.decision} (${d.project})`).join('\n')}

ACTION ITEMS:
${allActionItems.map(a => `- ${a.action} (${a.project}, assigned to: ${a.assigned_to})`).join('\n')}

BLOCKERS:
${allBlockers.map(b => `- ${b.blocker} (${b.project}, severity: ${b.severity})`).join('\n')}

Provide global insights as JSON:

1. daily_summary: 2-3 sentence summary of the entire day

2. top_priorities: Array of 3-5 most important items for today
   [{priority: string, project: string, why: string}]

3. risks_identified: Array of business risks or concerns
   [{risk: string, severity: "high|medium|low", mitigation: string}]

4. productivity_notes: Observations about team productivity

5. cross_project_insights: Any patterns or connections across projects

Return ONLY valid JSON.`;

      const response = await this.openai.chatWithRetry([
        {
          role: 'system',
          content: 'You are Nova\'s strategic analyst. Provide high-level business insights.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.3,
        max_tokens: 1500
      });

      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      logger.error('Error compiling global insights:', error);

      return {
        daily_summary: `${sessions.length} sessions across projects`,
        top_priorities: [],
        risks_identified: [],
        productivity_notes: 'Normal activity',
        cross_project_insights: null
      };
    }
  }

  /**
   * Calculate productivity metrics
   */
  calculateMetrics(sessions, projectSummaries) {
    // Count various activities
    const totalMessages = sessions.reduce((sum, s) => sum + s.message_count, 0);
    const totalDecisions = sessions.reduce((sum, s) => (s.decisions_made?.length || 0) + sum, 0);
    const totalUpdates = sessions.reduce((sum, s) => (s.updates_made?.length || 0) + sum, 0);
    const totalBlockers = sessions.reduce((sum, s) => (s.blockers_identified?.length || 0) + sum, 0);
    const totalActionItems = sessions.reduce((sum, s) => (s.action_items?.length || 0) + sum, 0);

    // Calculate productivity score (1-10)
    let score = 5;  // Baseline

    // Bonus for decisions (+1 per 2 decisions, max +2)
    score += Math.min(2, Math.floor(totalDecisions / 2));

    // Bonus for updates (+1 per 3 updates, max +2)
    score += Math.min(2, Math.floor(totalUpdates / 3));

    // Penalty for blockers (-1 per blocker, max -2)
    score -= Math.min(2, totalBlockers);

    // Bonus for action items (+1 if any, max +1)
    if (totalActionItems > 0) score += 1;

    // Ensure 1-10 range
    score = Math.max(1, Math.min(10, score));

    return {
      total_sessions: sessions.length,
      total_messages: totalMessages,
      total_decisions: totalDecisions,
      total_updates: totalUpdates,
      total_blockers: totalBlockers,
      total_action_items: totalActionItems,
      productivity_score: score,
      issues_detected: totalBlockers,
      projects_with_progress: Object.values(projectSummaries).filter(p => p.progress_made).length,
      projects_with_blockers: Object.values(projectSummaries).filter(p => p.blockers?.length > 0).length
    };
  }

  /**
   * Save digest to database
   */
  async saveDigest(date, projectSummaries, globalInsights, metrics, sessions) {
    try {
      const { data, error } = await this.supabase
        .from('conversation_daily_digests')
        .insert({
          date: date,

          project_summaries: projectSummaries,

          total_sessions: metrics.total_sessions,
          total_messages: metrics.total_messages,
          active_projects: Object.keys(projectSummaries),

          key_decisions: sessions.flatMap(s => s.decisions_made || []).slice(0, 20),
          action_items: sessions.flatMap(s => s.action_items || []).filter(a => !a.completed).slice(0, 20),
          blockers: sessions.flatMap(s => s.blockers_identified || []).slice(0, 10),

          daily_summary: globalInsights.daily_summary,
          productivity_score: metrics.productivity_score,
          issues_detected: metrics.issues_detected,

          session_ids: sessions.map(s => s.id)
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      logger.error('Error saving digest:', error);
      throw error;
    }
  }

  /**
   * Get digest for specific date
   */
  async getDigest(date) {
    try {
      const { data, error } = await this.supabase
        .from('conversation_daily_digests')
        .select('*')
        .eq('date', date)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Error getting digest for ${date}:`, error);
      return null;
    }
  }

  /**
   * Get recent digests
   */
  async getRecentDigests(days = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const { data, error } = await this.supabase
        .from('conversation_daily_digests')
        .select('*')
        .gte('date', cutoffDate.toISOString().split('T')[0])
        .order('date', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('Error getting recent digests:', error);
      return [];
    }
  }
}

module.exports = DailyDigestCompiler;
