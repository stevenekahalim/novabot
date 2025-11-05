/**
 * V3 Mention Detector
 * Detects when Nova is mentioned in WhatsApp messages
 * Simple, focused utility
 */

class MentionDetector {
  constructor() {
    // Patterns that indicate Nova is being addressed
    this.mentionPatterns = [
      /@nova/i,           // @Nova or @nova
      /@nova\b/i,         // @Nova with word boundary
      /\bnova\b/i,        // "nova" as standalone word
      /hey nova/i,        // Direct address
      /hi nova/i,         // Direct address
      /nova,/i,           // Nova with comma
      /nova:/i            // Nova with colon
    ];
  }

  /**
   * Check if Nova is mentioned in the message
   * @param {string} messageText - The message to check
   * @returns {boolean} True if Nova is mentioned
   */
  detectMention(messageText) {
    if (!messageText || typeof messageText !== 'string') {
      return false;
    }

    // Check each pattern
    for (const pattern of this.mentionPatterns) {
      if (pattern.test(messageText)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if this is a direct message (always respond in DMs)
   * @param {Object} message - WhatsApp message object
   * @returns {boolean} True if direct message
   */
  isDirectMessage(message) {
    // WhatsApp web.js: chat IDs ending in @c.us are direct messages
    // Group chats end in @g.us
    return message.from && message.from.endsWith('@c.us');
  }

  /**
   * Determine if Nova should respond to this message
   * @param {Object} message - WhatsApp message object
   * @returns {boolean} True if Nova should respond
   */
  shouldRespond(message) {
    // Always respond to direct messages
    if (this.isDirectMessage(message)) {
      return true;
    }

    // In group chats, only respond if mentioned
    return this.detectMention(message.body);
  }
}

module.exports = MentionDetector;
