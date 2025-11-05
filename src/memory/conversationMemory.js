const logger = require('../utils/logger');

/**
 * ConversationMemory manages chat history and context for intelligent message processing
 *
 * Features:
 * - Stores last 10 messages per conversation
 * - Tracks current project context
 * - 30-minute TTL for conversation expiry
 * - Optimized queries for fast context retrieval
 */
class ConversationMemory {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.CONTEXT_TTL_MINUTES = 30;
    this.MAX_HISTORY_MESSAGES = 10;
    this.SLIDING_WINDOW_MINUTES = 30; // Keep raw messages for 30 minutes
    this.SESSION_IDLE_MINUTES = 10; // Session ends after 10 min idle
  }

  /**
   * Save a message to conversation history
   */
  async saveMessage(chatId, chatName, chatType, message) {
    try {
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.CONTEXT_TTL_MINUTES);

      const { data, error } = await this.supabase
        .from('conversation_history')
        .insert({
          chat_id: chatId,
          chat_name: chatName,
          chat_type: chatType,
          message_timestamp: new Date().toISOString(),
          message_text: message.text,
          message_author: message.author,
          project_mentioned: message.project || null,
          classification: message.classification || null,
          expires_at: expiresAt.toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      logger.debug(`Saved message to conversation history: ${chatId}`);
      return data;
    } catch (error) {
      logger.error('Error saving message to conversation history:', error);
      return null;
    }
  }

  /**
   * Get recent conversation history (last 10 messages within TTL)
   */
  async getRecentHistory(chatId, limit = 10) {
    try {
      const { data, error } = await this.supabase
        .from('conversation_history')
        .select('*')
        .eq('chat_id', chatId)
        .gt('expires_at', new Date().toISOString()) // Only non-expired messages
        .order('message_timestamp', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Return in chronological order (oldest first)
      return data ? data.reverse() : [];
    } catch (error) {
      logger.error(`Error getting conversation history for ${chatId}:`, error);
      return [];
    }
  }

  /**
   * Extract current project context from conversation history
   * Looks at recent messages to determine what project is being discussed
   */
  extractProjectContext(history) {
    if (!history || history.length === 0) return null;

    // Look at last 5 messages for project mentions
    const recentMessages = history.slice(-5);

    // Check for explicit project mentions (most recent first)
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];

      if (msg.project_mentioned) {
        const projectName = msg.project_mentioned;
        logger.debug(`Found project context: ${projectName} from history`);
        return {
          projectName: projectName,
          mentionedAt: msg.message_timestamp,
          mentionedBy: msg.message_author,
          confidence: 0.9
        };
      }
    }

    // Fallback: Search message text for known project names
    const knownProjects = ['Manado', 'Palembang', 'Jakarta', 'Surabaya', 'BSD', 'Graha', 'CariSponsorPadel'];

    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      const text = msg.message_text?.toLowerCase() || '';

      for (const project of knownProjects) {
        if (text.includes(project.toLowerCase())) {
          logger.debug(`Found project context from text search: ${project}`);
          return {
            projectName: project,
            mentionedAt: msg.message_timestamp,
            mentionedBy: msg.message_author,
            confidence: 0.7
          };
        }
      }
    }

    // No explicit project found
    return null;
  }

  /**
   * Format conversation history for AI context
   * Returns a concise summary of recent messages
   */
  formatHistoryForAI(history) {
    if (!history || history.length === 0) {
      return null;
    }

    const formattedMessages = history.map((msg) => {
      const timeAgo = this.getTimeAgo(msg.message_timestamp);
      return `[${timeAgo}] ${msg.message_author}: ${msg.message_text.substring(0, 100)}`;
    });

    return formattedMessages.join('\n');
  }

  /**
   * Update TTL for all messages in a conversation (conversation still active)
   */
  async refreshConversationTTL(chatId) {
    try {
      const newExpiresAt = new Date();
      newExpiresAt.setMinutes(newExpiresAt.getMinutes() + this.CONTEXT_TTL_MINUTES);

      const { error } = await this.supabase
        .from('conversation_history')
        .update({ expires_at: newExpiresAt.toISOString() })
        .eq('chat_id', chatId)
        .gt('expires_at', new Date().toISOString()); // Only update non-expired

      if (error) throw error;

      logger.debug(`Refreshed TTL for conversation: ${chatId}`);
    } catch (error) {
      logger.error(`Error refreshing TTL for ${chatId}:`, error);
    }
  }

  /**
   * Clean up expired conversations (can be called periodically)
   */
  async cleanupExpired() {
    try {
      const { data, error } = await this.supabase
        .from('conversation_history')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .select('id');

      if (error) throw error;

      const count = data ? data.length : 0;
      if (count > 0) {
        logger.info(`Cleaned up ${count} expired conversation messages`);
      }

      return count;
    } catch (error) {
      logger.error('Error cleaning up expired conversations:', error);
      return 0;
    }
  }

  /**
   * Clear all history for a specific chat (for testing or privacy)
   */
  async clearChatHistory(chatId) {
    try {
      const { error } = await this.supabase
        .from('conversation_history')
        .delete()
        .eq('chat_id', chatId);

      if (error) throw error;

      logger.info(`Cleared conversation history for: ${chatId}`);
    } catch (error) {
      logger.error(`Error clearing history for ${chatId}:`, error);
    }
  }

  /**
   * Get conversation statistics
   */
  async getStats(chatId) {
    try {
      const { count, error } = await this.supabase
        .from('conversation_history')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', chatId)
        .gt('expires_at', new Date().toISOString());

      if (error) throw error;

      return {
        chatId,
        activeMessages: count || 0,
        ttlMinutes: this.CONTEXT_TTL_MINUTES
      };
    } catch (error) {
      logger.error(`Error getting stats for ${chatId}:`, error);
      return null;
    }
  }

  /**
   * SLIDING WINDOW: Get context combining recent raw messages + older session summaries
   * This is the main method for getting conversation context
   */
  async getSlidingWindowContext(chatId, windowMinutes = 30) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setMinutes(cutoffTime.getMinutes() - windowMinutes);

      // Get raw messages from last 30 minutes
      const { data: recentMessages, error: msgError } = await this.supabase
        .from('conversation_history')
        .select('*')
        .eq('chat_id', chatId)
        .gte('message_timestamp', cutoffTime.toISOString())
        .order('message_timestamp', { ascending: true });

      if (msgError) throw msgError;

      // Get session summaries older than 30 minutes
      const { data: sessions, error: sessionError } = await this.supabase
        .from('conversation_sessions')
        .select('*')
        .eq('chat_id', chatId)
        .lt('session_end', cutoffTime.toISOString())
        .order('session_end', { ascending: false })
        .limit(5);

      if (sessionError) {
        // Table might not exist yet, that's okay
        logger.debug('Session table not available yet:', sessionError.message);
        return {
          recentMessages: recentMessages || [],
          historicalSessions: []
        };
      }

      return {
        recentMessages: recentMessages || [],
        historicalSessions: sessions || []
      };
    } catch (error) {
      logger.error(`Error getting sliding window context for ${chatId}:`, error);
      return {
        recentMessages: [],
        historicalSessions: []
      };
    }
  }

  /**
   * Find sessions that are ready to be summarized (idle for SESSION_IDLE_MINUTES)
   */
  async findSessionsToSummarize() {
    try {
      const idleCutoff = new Date();
      idleCutoff.setMinutes(idleCutoff.getMinutes() - this.SESSION_IDLE_MINUTES);

      // Find chat_ids with messages older than idle time and no recent messages
      const { data, error } = await this.supabase.rpc('find_idle_sessions', {
        idle_minutes: this.SESSION_IDLE_MINUTES
      });

      if (error) {
        // Function might not exist yet
        logger.debug('find_idle_sessions function not available');

        // Fallback: manually find sessions
        const { data: chatIds, error: chatError } = await this.supabase
          .from('conversation_history')
          .select('chat_id')
          .is('session_id', null)
          .lt('message_timestamp', idleCutoff.toISOString())
          .limit(10);

        if (chatError) throw chatError;

        // Group by chat_id
        const uniqueChats = [...new Set((chatIds || []).map(c => c.chat_id))];
        return uniqueChats;
      }

      return data || [];
    } catch (error) {
      logger.error('Error finding sessions to summarize:', error);
      return [];
    }
  }

  /**
   * Summarize a session using AI
   */
  async summarizeSession(chatId, openaiClient) {
    try {
      const idleCutoff = new Date();
      idleCutoff.setMinutes(idleCutoff.getMinutes() - this.SESSION_IDLE_MINUTES);

      // Get messages for this session (older than idle time, not yet summarized)
      const { data: messages, error } = await this.supabase
        .from('conversation_history')
        .select('*')
        .eq('chat_id', chatId)
        .is('session_id', null)
        .lt('message_timestamp', idleCutoff.toISOString())
        .order('message_timestamp', { ascending: true });

      if (error) throw error;

      if (!messages || messages.length === 0) {
        logger.debug(`No messages to summarize for ${chatId}`);
        return null;
      }

      logger.info(`Summarizing session for ${chatId}: ${messages.length} messages`);

      // Build conversation transcript
      const transcript = messages.map(m =>
        `${m.message_author}: ${m.message_text}`
      ).join('\n');

      // Call AI for summarization
      const prompt = `Analyze this WhatsApp conversation and extract key information:

${transcript}

Extract and return JSON with:
- projects_discussed: array of project names mentioned
- key_updates: array of {project, type (progress/cost/status), details}
- decisions: array of {decision, project, people}
- blockers: array of {blocker, project}
- people_involved: array of person names
- summary_text: 2-3 sentence summary of the conversation

Return valid JSON only.`;

      const response = await openaiClient.chatWithRetry([
        { role: 'system', content: 'You are a construction project management assistant analyzing WhatsApp conversations.' },
        { role: 'user', content: prompt }
      ]);

      const analysis = JSON.parse(response.replace(/```json\n?/g, '').replace(/```\n?/g, ''));

      // Create session record
      const { data: session, error: sessionError } = await this.supabase
        .from('conversation_sessions')
        .insert({
          chat_id: chatId,
          chat_name: messages[0].chat_name,
          chat_type: messages[0].chat_type,
          session_start: messages[0].message_timestamp,
          session_end: messages[messages.length - 1].message_timestamp,
          message_count: messages.length,
          summary_text: analysis.summary_text,
          projects_discussed: analysis.projects_discussed || [],
          key_updates: analysis.key_updates || [],
          decisions: analysis.decisions || [],
          blockers: analysis.blockers || [],
          people_involved: analysis.people_involved || [],
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Link messages to this session
      const messageIds = messages.map(m => m.id);
      const { error: updateError } = await this.supabase
        .from('conversation_history')
        .update({ session_id: session.id })
        .in('id', messageIds);

      if (updateError) throw updateError;

      logger.info(`Session summarized: ${session.id} (${messages.length} messages)`);
      return session;
    } catch (error) {
      logger.error(`Error summarizing session for ${chatId}:`, error);
      return null;
    }
  }

  /**
   * Helper: Get human-readable time ago
   */
  getTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }
}

module.exports = ConversationMemory;
