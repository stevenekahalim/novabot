/**
 * V3 Response Generator
 * Generates AI responses using Claude 3.5 Sonnet with full conversational context
 * Philosophy: Let AI infer from raw context, no structured extraction
 */

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');
const NOVA_PROMPT = require('../prompts/response');

class ResponseGenerator {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Model selection: Claude Sonnet 4.5 for superior reasoning
    this.defaultModel = 'claude-sonnet-4-5-20250929';
    this.maxTokens = 1000; // Increased for more detailed responses

    // Model pricing (per 1K tokens) for cost estimation
    this.modelPricing = {
      'claude-sonnet-4-5-20250929': { input: 0.003, output: 0.015 },
      'claude-3-7-sonnet-20250219': { input: 0.003, output: 0.015 },
      'claude-3-5-haiku-20241022': { input: 0.001, output: 0.005 },
      'gpt-4o': { input: 0.0025, output: 0.01 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 }
    };
  }

  /**
   * Generate a response to the user's message
   * @param {string} messageText - The incoming message
   * @param {Object} context - Full conversation context from ContextLoader
   * @param {Object} senderInfo - Info about the sender
   * @returns {string} Nova's response
   */
  async generate(messageText, context, senderInfo = {}) {
    try {
      logger.info(`Generating V3 response for message: "${messageText.substring(0, 50)}..."`);

      // Build the system prompt and user message for Claude
      const { systemPrompt, userMessage } = this._buildClaudeMessages(messageText, context, senderInfo);

      // Smart model selection based on context size
      const messageCount = context.messages.count;
      const selectedModel = this._selectModel(messageCount);

      logger.info(`[Token Monitor] Context size: ${messageCount} messages | Model: ${selectedModel}`);

      // Call Claude
      const startTime = Date.now();
      const completion = await this.anthropic.messages.create({
        model: selectedModel,
        max_tokens: this.maxTokens,
        temperature: 0.3, // Lower for more consistent project management responses
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage }
        ]
      });

      const duration = Date.now() - startTime;
      const response = completion.content[0].text.trim();

      // Log token usage and cost
      this._logTokenUsage(completion, selectedModel, duration, messageCount);

      logger.info(`Generated response (${response.length} chars): ${response.substring(0, 100)}...`);

      return response;

    } catch (error) {
      logger.error('Error generating V3 response:', error);

      // Fallback response if Claude fails
      return '⚠️ Error generating response. Try again.';
    }
  }

  /**
   * Select the best model based on context size
   * @private
   */
  _selectModel(messageCount) {
    // Always use Claude Sonnet 4.5 for superior reasoning
    return 'claude-sonnet-4-5-20250929';
  }

  /**
   * Log token usage and estimated cost
   * @private
   */
  _logTokenUsage(completion, model, duration, messageCount) {
    const usage = completion.usage;
    if (!usage) return;

    const pricing = this.modelPricing[model] || this.modelPricing['claude-sonnet-4-5-20250929'];

    // Claude uses input_tokens and output_tokens
    const inputTokens = usage.input_tokens;
    const outputTokens = usage.output_tokens;
    const totalTokens = inputTokens + outputTokens;

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    logger.info(`[Token Monitor] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    logger.info(`[Token Monitor] Model: ${model}`);
    logger.info(`[Token Monitor] Context: ${messageCount} messages`);
    logger.info(`[Token Monitor] Input tokens: ${inputTokens}`);
    logger.info(`[Token Monitor] Output tokens: ${outputTokens}`);
    logger.info(`[Token Monitor] Total tokens: ${totalTokens}`);
    logger.info(`[Token Monitor] Duration: ${duration}ms`);
    logger.info(`[Token Monitor] Estimated cost: $${totalCost.toFixed(6)} (Input: $${inputCost.toFixed(6)}, Output: $${outputCost.toFixed(6)})`);
    logger.info(`[Token Monitor] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  /**
   * Build Claude system prompt and user message
   * @private
   */
  _buildClaudeMessages(messageText, context, senderInfo) {
    // 1. System prompt with Nova's personality
    let systemPrompt = NOVA_PROMPT;

    // 2. Build user message with context using XML tags (Claude prefers this)
    let userMessage = '';

    // Add current date/time in Indonesia timezone
    const now = new Date();
    const jakartaOptions = {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    const dateTimeStr = now.toLocaleString('en-US', jakartaOptions);

    userMessage += `<current_datetime>
Today: ${dateTimeStr} WIB
Use this to correct any outdated dates mentioned in messages or knowledge base.
</current_datetime>

`;

    // Add Knowledge base context
    if (context.messages.count > 0) {
      const messagesText = this._formatRecentMessages(context.messages.data);

      // Check if this is knowledge base data
      const isKnowledgeBase = context.messages.data.length > 0 &&
                             context.messages.data[0].sender_name === 'Knowledge Base';

      if (isKnowledgeBase) {
        userMessage += `<knowledge_base>
Format: #id | date | topic | content | tags

${messagesText}
</knowledge_base>

`;
      } else {
        const daysInfo = context.messages.daysBack ? `Last ${context.messages.daysBack} days` : 'All messages';
        userMessage += `<conversation_history period="${daysInfo}">
${messagesText}
</conversation_history>

`;
      }
    }

    // Add Today's raw messages (most recent context)
    if (context.todaysRaw && context.todaysRaw.count > 0) {
      const todaysText = this._formatTodaysRawMessages(context.todaysRaw.data);
      userMessage += `<todays_messages>
${todaysText}
</todays_messages>

<instructions>
This is the most current context - prioritize today's messages when they contain newer information than the knowledge base.
</instructions>

`;
    }

    // Add current message from user
    const senderName = senderInfo.name || senderInfo.sender_name || 'User';
    userMessage += `<current_query sender="${senderName}">
${messageText}
</current_query>`;

    return { systemPrompt, userMessage };
  }

  /**
   * Format recent messages for context
   * @private
   */
  _formatRecentMessages(messages) {
    // Check if this is knowledge base data (formatted messages from contextLoader)
    const isKnowledgeBase = messages.length > 0 &&
                           messages[0].sender_name === 'Knowledge Base';

    if (isKnowledgeBase) {
      // Format as CSV-style for better Nova parsing
      return messages.map(msg => {
        // Extract id, date, topic, content from the formatted message_text
        // Format: "[date] topic: content"
        const match = msg.message_text.match(/^\[([^\]]+)\] ([^:]+): (.+)$/);
        if (match) {
          const [, date, topic, content] = match;
          const tags = msg.tags || '';
          return `#${msg.id} | ${date} | ${topic} | ${content} | ${tags}`;
        }
        return `#${msg.id} | ${msg.message_text}`;
      }).join('\n');
    }

    // Original formatting for raw messages
    return messages.map(msg => {
      const time = new Date(msg.timestamp).toLocaleString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'short'
      });

      let prefix = `[${time}] ${msg.sender_name}`;

      if (msg.mentioned_nova) {
        prefix += ' @Nova';
      }

      return `${prefix}: ${msg.message_text}`;
    }).join('\n');
  }

  /**
   * Format today's raw messages for context
   * @private
   */
  _formatTodaysRawMessages(messages) {
    return messages.map(msg => {
      const time = new Date(msg.timestamp).toLocaleString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      });

      let prefix = `[${time}] ${msg.sender_name}`;

      if (msg.mentioned_nova) {
        prefix += ' @Nova';
      }

      return `${prefix}: ${msg.message_text}`;
    }).join('\n');
  }
}

module.exports = ResponseGenerator;
