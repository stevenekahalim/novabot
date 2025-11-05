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

    this.model = process.env.OPENAI_MODEL_RESPONSE || 'gpt-4-turbo';
    this.maxTokens = 300; // Keep responses concise (max 5 lines)
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

      // Call OpenAI
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: messages,
        max_tokens: this.maxTokens,
        temperature: 0.7,
        presence_penalty: 0.3, // Avoid repetitive responses
        frequency_penalty: 0.3
      });

      const response = completion.choices[0].message.content.trim();

      logger.info(`Generated response (${response.length} chars): ${response.substring(0, 100)}...`);

      return response;

    } catch (error) {
      logger.error('Error generating V3 response:', error);

      // Fallback response if OpenAI fails
      return '⚠️ Error generating response. Try again.';
    }
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

    // 2. Context: Daily digests (long-term memory)
    if (context.dailyDigests.count > 0) {
      const digestsText = this._formatDailyDigests(context.dailyDigests.data);
      messages.push({
        role: 'system',
        content: `# HISTORICAL CONTEXT (Last ${context.dailyDigests.daysBack} days)\n\n${digestsText}`
      });
    }

    // 3. Context: Hourly notes (medium-term memory)
    if (context.hourlyNotes.count > 0) {
      const hourlyText = this._formatHourlyNotes(context.hourlyNotes.data);
      messages.push({
        role: 'system',
        content: `# RECENT HOURLY SUMMARIES (Last ${context.hourlyNotes.hoursBack} hours)\n\n${hourlyText}`
      });
    }

    // 4. Context: Recent messages (short-term memory - conversation flow)
    if (context.messages.count > 0) {
      const messagesText = this._formatRecentMessages(context.messages.data);
      messages.push({
        role: 'system',
        content: `# CURRENT CONVERSATION (Last ${context.messages.daysBack} days)\n\n${messagesText}`
      });
    }

    // 5. Current message from user
    const senderName = senderInfo.name || senderInfo.sender_name || 'User';
    messages.push({
      role: 'user',
      content: `${senderName}: ${messageText}`
    });

    return messages;
  }

  /**
   * Format daily digests for context
   * @private
   */
  _formatDailyDigests(digests) {
    return digests.map(digest => {
      const parts = [
        `## ${digest.digest_date}`,
        digest.summary_text
      ];

      if (digest.projects_discussed && digest.projects_discussed.length > 0) {
        parts.push(`Projects: ${digest.projects_discussed.join(', ')}`);
      }

      if (digest.key_decisions && digest.key_decisions.length > 0) {
        parts.push(`Key Decisions:\n${digest.key_decisions.map(d => `  - ${d}`).join('\n')}`);
      }

      if (digest.blockers_identified && digest.blockers_identified.length > 0) {
        parts.push(`Blockers:\n${digest.blockers_identified.map(b => `  - ${b}`).join('\n')}`);
      }

      return parts.join('\n');
    }).join('\n\n');
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
