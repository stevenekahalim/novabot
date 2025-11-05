/**
 * Conversational Core - Makes Nova stateful and intelligent
 *
 * The fix that transforms Nova from template bot to conversational AI
 */

const logger = require('../utils/logger');
const RESPONSE_PROMPT = require('../prompts/response');

class ConversationalCore {
  constructor(supabase, openai) {
    this.supabase = supabase;
    this.openai = openai;
  }

  /**
   * Load complete conversation context
   * This is THE KEY FIX - loading history makes Nova stateful
   */
  async loadConversationContext(chatId, currentMessage) {
    try {
      logger.info('📚 Loading conversation context...');

      // 1. Get last 15 messages from this conversation
      const { data: recentMessages, error: msgError } = await this.supabase.getClient()
        .from('conversation_messages')
        .select('message_text, sender, timestamp, context_type, project_context')
        .eq('chat_id', chatId)
        .order('timestamp', { ascending: false })
        .limit(15);

      if (msgError) {
        logger.warn('Could not load messages:', msgError.message);
      }

      // 2. Detect which project we're discussing
      const projectMentioned = this.detectProjectFromText(currentMessage);

      // 3. Load project facts if project detected
      let projectFacts = null;
      let projectState = null;

      if (projectMentioned) {
        // Get facts for this project
        const { data: facts } = await this.supabase.getClient()
          .from('project_facts')
          .select('*')
          .eq('project_name', projectMentioned)
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(20);

        projectFacts = facts;

        // Get current project state
        const { data: project } = await this.supabase.getClient()
          .from('projects')
          .select('*')
          .ilike('name', `%${projectMentioned}%`)
          .single();

        projectState = project;
      }

      const context = {
        recentMessages: (recentMessages || []).reverse(), // Chronological order
        projectMentioned,
        projectFacts: projectFacts || [],
        projectState,
        currentTime: new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
      };

      logger.info(`✅ Context loaded: ${context.recentMessages.length} msgs, ${context.projectFacts.length} facts`);

      return context;
    } catch (error) {
      logger.error('Error loading conversation context:', error);
      return {
        recentMessages: [],
        projectMentioned: null,
        projectFacts: [],
        projectState: null,
        currentTime: new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
      };
    }
  }

  /**
   * Detect which project is being discussed
   */
  detectProjectFromText(text) {
    const lowerText = text.toLowerCase();
    const projects = ['manado', 'jakarta', 'kuningan', 'bsd', 'serpong', 'palembang', 'bali', 'sanur'];

    for (const project of projects) {
      if (lowerText.includes(project)) {
        return project.charAt(0).toUpperCase() + project.slice(1);
      }
    }

    return null;
  }

  /**
   * Generate intelligent, context-aware response
   * This replaces all the hard-coded templates
   */
  async generateResponse(message, context, messageType) {
    try {
      logger.info('🤖 Generating conversational response...');

      // Build conversation history for OpenAI
      const conversationHistory = context.recentMessages
        .slice(-10) // Last 10 messages
        .map(m => `${m.sender}: ${m.message_text}`)
        .join('\n');

      // Build project context summary
      let projectContextSummary = '';
      if (context.projectState) {
        const project = context.projectState;
        projectContextSummary = `
PROJECT: ${project.name}
Location: ${project.location}
Status: ${project.status}
Phase: ${project.context_type}
Next Action: ${project.next_action || 'Not set'}
Data: ${JSON.stringify(project.data, null, 2)}
`;
      }

      // Build facts summary
      const factsSummary = context.projectFacts.length > 0
        ? context.projectFacts
            .slice(0, 10)
            .map(f => `- ${f.fact_text} (${f.fact_type}, stated at: ${new Date(f.stated_at).toLocaleDateString()})`)
            .join('\n')
        : 'No facts available';

      // Create the system prompt with ALL context
      const systemPrompt = `${RESPONSE_PROMPT}

## CURRENT CONVERSATION CONTEXT

Recent conversation history:
${conversationHistory}

${projectContextSummary}

Known facts about this project:
${factsSummary}

Current time: ${context.currentTime}
Message classification: ${messageType}

## INSTRUCTIONS FOR THIS RESPONSE

- You have the COMPLETE context above
- Reference specific information from the facts and conversation
- Don't repeat the exact same response if user asks similar questions
- Be conversational - respond to what was JUST said
- Use specific names, dates, amounts from the facts
- Max 5 lines
- Mix Indonesian/English naturally
`;

      const userPrompt = `New message: "${message}"

Generate Nova's response based on the conversation context and facts above.`;

      // Call OpenAI with full context
      const response = await this.openai.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      const aiResponse = response.choices[0].message.content.trim();

      logger.info('✅ Response generated');

      return aiResponse;

    } catch (error) {
      logger.error('Error generating response:', error);
      return '⚠️ Maaf, error generating response. Coba lagi?';
    }
  }
}

module.exports = ConversationalCore;
