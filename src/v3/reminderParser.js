/**
 * AI Reminder Parser
 * Uses Claude Sonnet 4.5 to parse natural language reminder requests
 */

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

class ReminderParser {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    this.model = 'claude-sonnet-4-5-20250929';
  }

  /**
   * Parse a message to detect and extract reminder requests
   * @param {string} messageText - The message to parse
   * @param {string} senderName - Who sent the message
   * @param {string} chatId - Which chat it came from
   * @returns {Object|null} - Parsed reminder or null if not a reminder
   */
  async parseReminder(messageText, senderName, chatId) {
    try {
      const now = new Date();
      const todayDate = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Jakarta'
      });
      const currentTime = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jakarta'
      });

      const prompt = `Analyze this WhatsApp message and determine if it's a reminder request.

MESSAGE: "${messageText}"
SENDER: ${senderName}
CHAT_ID: ${chatId}
CURRENT DATE & TIME: ${todayDate}, ${currentTime} WIB

If this is a reminder request, extract:
1. WHO should be reminded (person's name or "all")
2. WHEN (date and time in ISO format, timezone Asia/Jakarta)
3. WHAT (the reminder message)

Examples of reminder requests:
- "@Nova remind me tomorrow about RKAB" → tomorrow at 09:00
- "@Nova remind me in 2 hours about meeting" → 2 hours from current time
- "@Nova ingetin Eka besok meeting investor" → tomorrow at 09:00
- "@Nova reminder: Monday send RAB to Win" → next Monday at 09:00
- "@Nova ingatkan aku senin jam 9 follow up permit" → next Monday at 09:00

IMPORTANT:
- "in X hours" means X hours from CURRENT TIME
- "tomorrow" without time means tomorrow at 09:00
- "Monday" without time means next Monday at 09:00

Return JSON in this EXACT format (no explanations):
{
  "is_reminder": true/false,
  "assigned_to": "Name" or "all",
  "reminder_date": "YYYY-MM-DD",
  "reminder_time": "HH:MM:SS",
  "message": "What to remind about",
  "created_by": "${senderName}"
}

If NOT a reminder request, return:
{
  "is_reminder": false
}

IMPORTANT: Return ONLY the JSON, no markdown, no explanations.`;

      const message = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 500,
        temperature: 0.2,
        system: "You are a reminder extraction engine. Your job is to detect reminder requests and extract structured data. Always respond with valid JSON only.",
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      // Extract text and clean markdown if present
      let responseText = message.content[0].text.trim();
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      const result = JSON.parse(responseText);

      // Log token usage
      this._logTokenUsage(message, messageText);

      // If it's a reminder, add metadata
      if (result.is_reminder) {
        result.chat_id = chatId;
        logger.info(`[Reminder Parser] ✅ Reminder detected: ${result.assigned_to} on ${result.reminder_date} ${result.reminder_time}`);
        return result;
      }

      return null;

    } catch (error) {
      logger.error('[Reminder Parser] Error parsing reminder:', error.message);
      return null;
    }
  }

  /**
   * Log token usage for cost tracking
   * @private
   */
  _logTokenUsage(message, originalMessage) {
    const usage = message.usage;
    if (!usage) return;

    // Claude Sonnet 4.5 pricing (per 1K tokens)
    const pricing = { input: 0.003, output: 0.015 };
    const inputCost = (usage.input_tokens / 1000) * pricing.input;
    const outputCost = (usage.output_tokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    // Convert to IDR (approximate: $1 = Rp 15,000)
    const totalCostIDR = totalCost * 15000;

    logger.info(`[Reminder Parser] Tokens: ${usage.input_tokens}in + ${usage.output_tokens}out | Cost: Rp ${totalCostIDR.toFixed(0)} ($${totalCost.toFixed(4)})`);
  }
}

module.exports = ReminderParser;
