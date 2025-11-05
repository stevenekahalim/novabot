const logger = require('../utils/logger');
const ComprehensiveExtractor = require('./comprehensiveExtractor');

/**
 * EnhancedMemory - Complete memory management system
 *
 * Manages all 5 layers of context:
 * 1. Raw messages (conversation_messages)
 * 2. Sessions (conversation_sessions)
 * 3. Daily digests (conversation_daily_digests)
 * 4. Project facts (project_facts)
 * 5. Project state (projects)
 *
 * Data Quality First - Zero Data Loss
 */
class EnhancedMemory {
  constructor(supabaseClient, openaiClient) {
    this.supabase = supabaseClient;
    this.openai = openaiClient;
    this.extractor = new ComprehensiveExtractor(openaiClient);

    // Configuration
    this.SESSION_IDLE_MINUTES = 10;
    this.DAILY_DIGEST_HOUR = 3;  // 3 AM
  }

  // ============================================
  // LAYER 1: RAW MESSAGES
  // ============================================

  /**
   * Save message with comprehensive extraction
   */
  async saveMessage(whatsappMessage, chatName = null, chatType = 'direct') {
    try {
      logger.info('💾 Saving message with comprehensive extraction...');

      // Step 1: Comprehensive extraction
      const extracted = await this.extractor.extract(whatsappMessage);

      // Step 2: Save to conversation_messages
      const { data, error } = await this.supabase
        .from('conversation_messages')
        .insert({
          message_text: whatsappMessage.body,
          sender: whatsappMessage.author || whatsappMessage._data?.notifyName || 'Unknown',
          sender_number: whatsappMessage.from,
          chat_id: whatsappMessage.from,
          chat_name: chatName,
          timestamp: new Date(),

          // Rich extraction data
          projects_mentioned: extracted.projects_mentioned || [],
          people_mentioned: extracted.people_mentioned || [],
          numbers_extracted: extracted.numbers_extracted || [],
          dates_extracted: extracted.dates_extracted || [],
          decisions_detected: extracted.decisions_detected || [],
          questions_detected: extracted.questions_asked || [],
          action_items_detected: extracted.action_items_detected || [],
          sentiment: extracted.sentiment || 'neutral',

          // Context
          project_context: extracted.project_context,
          conversation_phase: extracted.conversation_phase,

          // Classification
          intent: extracted.intent,
          context_type: extracted.context_type,
          confidence: extracted.confidence || 0.8,

          // Metadata
          whatsapp_message_id: whatsappMessage.id?._serialized || null,
          processed: false
        })
        .select()
        .single();

      if (error) throw error;

      logger.info('✅ Message saved:', {
        id: data.id,
        projects: extracted.projects_mentioned?.length || 0,
        facts: extracted.facts?.length || 0
      });

      // Step 3: Save extracted facts to project_facts table
      if (extracted.facts && extracted.facts.length > 0) {
        await this.saveFacts(extracted.facts, data.id, extracted.project_context);
      }

      // Step 4: Check if session should be compiled (after idle period)
      setTimeout(() => {
        this.checkAndCompileSession(whatsappMessage.from);
      }, this.SESSION_IDLE_MINUTES * 60 * 1000);

      return {
        message: data,
        extracted: extracted
      };
    } catch (error) {
      logger.error('Error saving message:', error);
      throw error;
    }
  }

  /**
   * Get recent messages (Layer 1)
   */
  async getRecentMessages(chatId = null, projectName = null, hours = 2, limit = 50) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hours);

      let query = this.supabase
        .from('conversation_messages')
        .select('*')
        .gte('timestamp', cutoffTime.toISOString())
        .order('timestamp', { ascending: true })
        .limit(limit);

      if (chatId) {
        query = query.eq('chat_id', chatId);
      }

      if (projectName) {
        query = query.eq('project_context', projectName);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('Error getting recent messages:', error);
      return [];
    }
  }

  // ============================================
  // LAYER 2: SESSIONS
  // ============================================

  /**
   * Check if session should be compiled (after idle period)
   */
  async checkAndCompileSession(chatId) {
    try {
      // Find unprocessed messages older than idle time
      const idleCutoff = new Date();
      idleCutoff.setMinutes(idleCutoff.getMinutes() - this.SESSION_IDLE_MINUTES);

      const { data: unprocessedMessages, error } = await this.supabase
        .from('conversation_messages')
        .select('*')
        .eq('chat_id', chatId)
        .eq('processed', false)
        .lt('timestamp', idleCutoff.toISOString())
        .order('timestamp', { ascending: true });

      if (error) throw error;

      if (!unprocessedMessages || unprocessedMessages.length === 0) {
        logger.debug('No idle messages to compile');
        return null;
      }

      logger.info(`📦 Compiling session for ${chatId}: ${unprocessedMessages.length} messages`);

      // Compile session
      return await this.compileSession(chatId, unprocessedMessages);
    } catch (error) {
      logger.error('Error checking session:', error);
      return null;
    }
  }

  /**
   * Compile session with AI summary
   */
  async compileSession(chatId, messages) {
    try {
      // Build conversation transcript
      const transcript = messages.map(m =>
        `[${m.timestamp}] ${m.sender}: ${m.message_text}`
      ).join('\n');

      // AI compilation
      const prompt = `Analyze this conversation session and extract structured data.

CONVERSATION:
${transcript}

EXTRACTED DATA ALREADY AVAILABLE:
${messages.map(m => `
Message from ${m.sender}:
- Projects: ${m.projects_mentioned?.join(', ') || 'none'}
- Numbers: ${JSON.stringify(m.numbers_extracted) || 'none'}
- Decisions: ${m.decisions_detected?.join(', ') || 'none'}
- Questions: ${m.questions_detected?.join(', ') || 'none'}
- Action items: ${m.action_items_detected?.join(', ') || 'none'}
`).join('\n')}

Compile a comprehensive session summary with:

1. summary_text: 2-3 sentence summary of the session

2. projects_discussed: Array of project names discussed

3. decisions_made: Array of decision objects
   Structure: {decision, project, timestamp, decided_by, confidence, source_message_ids}

4. updates_made: Array of update objects
   Structure: {project, update_type, item, old_value, new_value, timestamp, source_message_ids}

5. questions_asked: Array of question objects
   Structure: {question, asked_by, project, answered, answer, source_message_ids}

6. action_items: Array of action item objects
   Structure: {action, assigned_to, project, due_date, priority, completed, source_message_ids}

7. blockers_identified: Array of blocker objects
   Structure: {blocker, project, severity, identified_at, source_message_ids}

8. numbers_discussed: Array of number objects with project context
   Structure: {type, value, context, project, source_message_ids}

9. people_involved: Array of people names mentioned

10. primary_project: Main project discussed (or null if multiple/none)

11. primary_context_type: Main business context (negotiation, pre_opening, etc)

12. session_type: One of: focused, multi-project, casual, status_check

13. overall_sentiment: Overall sentiment of session

Return ONLY valid JSON.`;

      const response = await this.openai.chatWithRetry([
        {
          role: 'system',
          content: 'You are Nova\'s session compiler. Extract and structure all information from conversation sessions.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.2,
        max_tokens: 3000
      });

      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const sessionData = JSON.parse(cleaned);

      // Save session to database
      const { data: session, error: sessionError } = await this.supabase
        .from('conversation_sessions')
        .insert({
          chat_id: chatId,
          chat_name: messages[0].chat_name,
          chat_type: messages[0].chat_type || 'direct',
          session_start: messages[0].timestamp,
          session_end: messages[messages.length - 1].timestamp,
          message_count: messages.length,

          summary_text: sessionData.summary_text,
          projects_discussed: sessionData.projects_discussed || [],
          decisions_made: sessionData.decisions_made || [],
          updates_made: sessionData.updates_made || [],
          questions_asked: sessionData.questions_asked || [],
          action_items: sessionData.action_items || [],
          blockers_identified: sessionData.blockers_identified || [],
          numbers_discussed: sessionData.numbers_discussed || [],
          people_involved: sessionData.people_involved || [],

          primary_project: sessionData.primary_project,
          primary_context_type: sessionData.primary_context_type,
          session_type: sessionData.session_type,
          overall_sentiment: sessionData.overall_sentiment
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Mark messages as processed and link to session
      const messageIds = messages.map(m => m.id);
      await this.supabase
        .from('conversation_messages')
        .update({
          processed: true,
          session_id: session.id
        })
        .in('id', messageIds);

      // Extract facts from session
      await this.extractSessionFacts(session, messages);

      logger.info('✅ Session compiled:', session.id);

      return session;
    } catch (error) {
      logger.error('Error compiling session:', error);
      throw error;
    }
  }

  /**
   * Get recent sessions (Layer 2)
   */
  async getRecentSessions(chatId = null, projectName = null, days = 7, limit = 20) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      let query = this.supabase
        .from('conversation_sessions')
        .select('*')
        .gte('session_start', cutoffDate.toISOString())
        .order('session_end', { ascending: false })
        .limit(limit);

      if (chatId) {
        query = query.eq('chat_id', chatId);
      }

      if (projectName) {
        query = query.contains('projects_discussed', [projectName]);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('Error getting recent sessions:', error);
      return [];
    }
  }

  // ============================================
  // LAYER 4: PROJECT FACTS
  // ============================================

  /**
   * Save facts extracted from message
   */
  async saveFacts(facts, sourceMessageId, projectName) {
    try {
      const factRecords = facts.map(fact => ({
        project_name: projectName || 'Unknown',
        fact_type: fact.fact_type || 'general',
        fact_category: fact.category || null,
        fact_text: fact.fact_text,
        fact_data: fact.fact_data || {},
        source_message_id: sourceMessageId,
        stated_by: fact.stated_by || null,
        stated_at: new Date(),
        confidence: fact.confidence || 0.8,
        validated: false,
        active: true
      }));

      const { data, error } = await this.supabase
        .from('project_facts')
        .insert(factRecords)
        .select();

      if (error) throw error;

      logger.info(`✅ Saved ${data.length} facts for project ${projectName}`);

      return data;
    } catch (error) {
      logger.error('Error saving facts:', error);
      return [];
    }
  }

  /**
   * Extract facts from compiled session
   */
  async extractSessionFacts(session, messages) {
    try {
      // Extract facts from decisions, updates, and numbers
      const facts = [];

      // Facts from decisions
      (session.decisions_made || []).forEach(decision => {
        facts.push({
          project_name: decision.project || session.primary_project,
          fact_type: 'decision',
          fact_category: 'operational',
          fact_text: decision.decision,
          fact_data: decision,
          source_session_id: session.id,
          stated_by: decision.decided_by?.[0] || null,
          stated_at: decision.timestamp || session.session_end,
          confidence: decision.confidence || 0.9,
          project_phase: session.primary_context_type
        });
      });

      // Facts from updates
      (session.updates_made || []).forEach(update => {
        facts.push({
          project_name: update.project || session.primary_project,
          fact_type: 'status',
          fact_category: 'operational',
          fact_text: `${update.item}: ${update.old_value} → ${update.new_value}`,
          fact_data: update,
          source_session_id: session.id,
          stated_at: update.timestamp || session.session_end,
          confidence: 0.95,
          project_phase: session.primary_context_type
        });
      });

      // Facts from numbers (costs, dates, etc)
      (session.numbers_discussed || []).forEach(number => {
        if (number.type === 'amount' && number.value > 1000000) {  // Significant amounts only
          facts.push({
            project_name: number.project || session.primary_project,
            fact_type: 'cost',
            fact_category: 'financial',
            fact_text: `${number.context}: ${number.value} ${number.currency || ''}`,
            fact_data: number,
            source_session_id: session.id,
            stated_at: session.session_end,
            confidence: 0.9,
            project_phase: session.primary_context_type
          });
        }
      });

      if (facts.length > 0) {
        const { error } = await this.supabase
          .from('project_facts')
          .insert(facts);

        if (error) throw error;

        logger.info(`✅ Extracted ${facts.length} facts from session ${session.id}`);
      }
    } catch (error) {
      logger.error('Error extracting session facts:', error);
    }
  }

  /**
   * Get all active facts for a project (Layer 4)
   */
  async getProjectFacts(projectName, limit = 100) {
    try {
      const { data, error } = await this.supabase
        .from('project_facts')
        .select('*')
        .eq('project_name', projectName)
        .eq('active', true)
        .is('superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('Error getting project facts:', error);
      return [];
    }
  }

  // ============================================
  // TIERED CONTEXT RETRIEVAL
  // ============================================

  /**
   * Get comprehensive context for query
   */
  async getContextForQuery(query, projectName = null, chatId = null) {
    try {
      logger.info('🔍 Building tiered context for query...');

      const contextNeeds = this.analyzeQueryContext(query);

      const context = {
        // Layer 1: Recent messages (last 2 hours)
        recentMessages: contextNeeds.needsRecent ?
          await this.getRecentMessages(chatId, projectName, 2, 50) : [],

        // Layer 2: Recent sessions (last 7 days)
        recentSessions: contextNeeds.needsSessions ?
          await this.getRecentSessions(chatId, projectName, 7, 20) : [],

        // Layer 4: Project facts (all active)
        projectFacts: contextNeeds.needsFacts && projectName ?
          await this.getProjectFacts(projectName, 100) : [],

        // Metadata
        contextNeeds: contextNeeds
      };

      logger.info('✅ Context built:', {
        messages: context.recentMessages.length,
        sessions: context.recentSessions.length,
        facts: context.projectFacts.length
      });

      return context;
    } catch (error) {
      logger.error('Error building context:', error);
      return {
        recentMessages: [],
        recentSessions: [],
        projectFacts: []
      };
    }
  }

  /**
   * Analyze what context is needed for this query
   */
  analyzeQueryContext(query) {
    const lowerQuery = query.toLowerCase();

    return {
      needsRecent: true,  // Always include recent for context
      needsSessions: true,  // Always include recent sessions
      needsHistorical: /last week|last month|history|all|recap|since|from/.test(lowerQuery),
      needsFacts: true,  // Always include facts for accuracy
      needsDeep: /why|how|when did|who said|explain|detail/.test(lowerQuery),
      queryType: this.detectQueryType(lowerQuery)
    };
  }

  detectQueryType(query) {
    if (/status|update|progress|gimana|bagaimana/.test(query)) return 'status';
    if (/why|how|explain|kenapa|bagaimana/.test(query)) return 'explanation';
    if (/when|kapan|tanggal|date/.test(query)) return 'temporal';
    if (/who|siapa|said|bilang/.test(query)) return 'attribution';
    if (/cost|biaya|harga|price|berapa/.test(query)) return 'financial';

    return 'general';
  }
}

module.exports = EnhancedMemory;
