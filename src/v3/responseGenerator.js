/**
 * V3 Response Generator
 * Generates AI responses using OpenAI with full conversational context
 * Philosophy: Let AI infer from raw context, no structured extraction
 */

const OpenAI = require('openai');
const logger = require('../utils/logger');
const NOVA_PROMPT = require('../prompts/response');

class ResponseGenerator {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Model selection will be dynamic based on context size
    this.defaultModel = process.env.OPENAI_MODEL_RESPONSE || 'gpt-4-turbo';
    this.maxTokens = 300; // Keep responses concise (max 5 lines)

    // Model pricing (per 1K tokens) for cost estimation
    this.modelPricing = {
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
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

      // Build the conversation history for OpenAI
      const messages = this._buildChatMessages(messageText, context, senderInfo);

      // Smart model selection based on context size
      const messageCount = context.messages.count;
      const selectedModel = this._selectModel(messageCount);

      logger.info(`[Token Monitor] Context size: ${messageCount} messages | Model: ${selectedModel}`);

      // Call OpenAI
      const startTime = Date.now();
      const completion = await this.openai.chat.completions.create({
        model: selectedModel,
        messages: messages,
        max_tokens: this.maxTokens,
        temperature: 0.7,
        presence_penalty: 0.3, // Avoid repetitive responses
        frequency_penalty: 0.3
      });

      const duration = Date.now() - startTime;
      const response = completion.choices[0].message.content.trim();

      // Log token usage and cost
      this._logTokenUsage(completion, selectedModel, duration, messageCount);

      logger.info(`Generated response (${response.length} chars): ${response.substring(0, 100)}...`);

      return response;

    } catch (error) {
      logger.error('Error generating V3 response:', error);

      // Fallback response if OpenAI fails
      return '⚠️ Error generating response. Try again.';
    }
  }

  /**
   * Select the best model based on context size
   * @private
   */
  _selectModel(messageCount) {
    // Small context: Use fastest, cheapest model
    if (messageCount < 50) {
      return 'gpt-4o-mini';
    }

    // Medium context: Balanced model
    if (messageCount < 200) {
      return 'gpt-4o';
    }

    // Large context: Most capable model
    return 'gpt-4-turbo';
  }

  /**
   * Log token usage and estimated cost
   * @private
   */
  _logTokenUsage(completion, model, duration, messageCount) {
    const usage = completion.usage;
    if (!usage) return;

    const pricing = this.modelPricing[model] || this.modelPricing['gpt-4-turbo'];
    const inputCost = (usage.prompt_tokens / 1000) * pricing.input;
    const outputCost = (usage.completion_tokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    logger.info(`[Token Monitor] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    logger.info(`[Token Monitor] Model: ${model}`);
    logger.info(`[Token Monitor] Context: ${messageCount} messages`);
    logger.info(`[Token Monitor] Input tokens: ${usage.prompt_tokens}`);
    logger.info(`[Token Monitor] Output tokens: ${usage.completion_tokens}`);
    logger.info(`[Token Monitor] Total tokens: ${usage.total_tokens}`);
    logger.info(`[Token Monitor] Duration: ${duration}ms`);
    logger.info(`[Token Monitor] Estimated cost: $${totalCost.toFixed(6)} (Input: $${inputCost.toFixed(6)}, Output: $${outputCost.toFixed(6)})`);
    logger.info(`[Token Monitor] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  /**
   * Build OpenAI chat messages array
   * @private
   */
  _buildChatMessages(messageText, context, senderInfo) {
    const messages = [];

    // 1. System prompt with Nova's personality
    messages.push({
      role: 'system',
      content: NOVA_PROMPT
    });

    // 2. Context: Hourly notes (medium-term memory)
    if (context.hourlyNotes.count > 0) {
      const hourlyText = this._formatHourlyNotes(context.hourlyNotes.data);
      messages.push({
        role: 'system',
        content: `# RECENT HOURLY SUMMARIES (Last ${context.hourlyNotes.hoursBack} hours)\n\n${hourlyText}`
      });
    }

    // 3. Context: Recent messages (short-term memory - conversation flow)
    if (context.messages.count > 0) {
      const messagesText = this._formatRecentMessages(context.messages.data);

      // Check if this is knowledge base data
      const isKnowledgeBase = context.messages.data.length > 0 &&
                             context.messages.data[0].sender_name === 'Knowledge Base';

      if (isKnowledgeBase) {
        messages.push({
          role: 'system',
          content: `# KNOWLEDGE BASE (CSV with 459 entries from 3,785+ messages)

Format: #id | date | topic | content | tags

${messagesText}

Instructions: Use the retrieval rules and synthesis approach from your persona. Search across multiple rows, score matches, and cite row IDs in your response.`
        });
      } else {
        const daysInfo = context.messages.daysBack ? `Last ${context.messages.daysBack} days` : 'All messages';
        messages.push({
          role: 'system',
          content: `# CURRENT CONVERSATION (${daysInfo})\n\n${messagesText}`
        });
      }
    }

    // 4. Current message from user
    const senderName = senderInfo.name || senderInfo.sender_name || 'User';
    messages.push({
      role: 'user',
      content: `${senderName}: ${messageText}`
    });

    return messages;
  }

  /**
   * Format hourly notes for context
   * @private
   */
  _formatHourlyNotes(notes) {
    return notes.map(note => {
      const hour = new Date(note.hour_timestamp).toLocaleString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'short'
      });

      const parts = [
        `### ${hour}`,
        note.summary_text
      ];

      if (note.key_decisions && note.key_decisions.length > 0) {
        parts.push(`Decisions: ${note.key_decisions.join('; ')}`);
      }

      if (note.action_items && note.action_items.length > 0) {
        parts.push(`Actions: ${note.action_items.join('; ')}`);
      }

      return parts.join('\n');
    }).join('\n\n');
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
}

module.exports = ResponseGenerator;
