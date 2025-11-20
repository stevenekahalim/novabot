/**
 * V4 Message Buffer
 *
 * Purpose: Implements 15-second debounce to batch rapid-fire messages
 * Why: Prevents API spam during active conversations
 * Behavior:
 * - Holds messages for 15s
 * - If more messages arrive, extends the window
 * - Processes all batched messages together after silence
 */

const logger = require('../utils/logger');

class MessageBuffer {
  constructor(supabaseClient, processCallback, whatsappClient = null) {
    this.supabase = supabaseClient ? supabaseClient.getClient() : null;
    this.processCallback = processCallback; // Function to call when processing buffered messages
    this.whatsappClient = whatsappClient; // WhatsApp client for sending responses/reactions

    // Buffer state
    this.buffers = new Map(); // chatId -> { messages: [], timer: timeout }

    // Configuration
    this.debounceTime = 15 * 1000; // 15 seconds
    this.maxBatchSize = 20; // Process immediately if buffer gets this big
    this.enabled = true;
  }

  /**
   * Add message to buffer
   * Starts or extends the debounce timer
   */
  async add(message, chatContext) {
    if (!this.enabled) {
      // Buffer disabled - process immediately
      if (this.processCallback) {
        await this.processCallback(message, chatContext);
      }
      return;
    }

    const chatId = message.from;

    // Get or create buffer for this chat
    if (!this.buffers.has(chatId)) {
      this.buffers.set(chatId, {
        messages: [],
        contexts: [],
        timer: null
      });
    }

    const buffer = this.buffers.get(chatId);

    // Add message to buffer
    buffer.messages.push(message);
    buffer.contexts.push(chatContext);

    logger.debug(`[V4 Buffer] Added message to buffer for ${chatId} (${buffer.messages.length} total)`);

    // Clear existing timer
    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }

    // Check if buffer is full (force flush)
    if (buffer.messages.length >= this.maxBatchSize) {
      logger.info(`[V4 Buffer] Buffer full (${buffer.messages.length}/${this.maxBatchSize}), flushing immediately`);
      await this.flush(chatId);
      return;
    }

    // Set new timer (15s debounce)
    buffer.timer = setTimeout(async () => {
      logger.info(`[V4 Buffer] Silence detected after 15s, flushing buffer for ${chatId}`);
      await this.flush(chatId);
    }, this.debounceTime);

    // Save to database (for audit trail)
    if (this.supabase) {
      await this._saveToDatabase(message, chatId);
    }
  }

  /**
   * Flush (process) all messages in buffer for a chat
   */
  async flush(chatId) {
    const buffer = this.buffers.get(chatId);
    if (!buffer || buffer.messages.length === 0) {
      return;
    }

    // Clear timer
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }

    // Get all buffered messages
    const { messages, contexts } = buffer;
    const count = messages.length;

    logger.info(`[V4 Buffer] Flushing ${count} messages for ${chatId}`);

    // Clear buffer
    this.buffers.delete(chatId);

    // Process each message
    // Note: In V4, we might want to combine them into one context
    // For now, process individually (router will handle each)
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const ctx = contexts[i];

      try {
        if (this.processCallback) {
          const result = await this.processCallback(msg, ctx);

          // V4: Handle response/reaction from messageHandler
          if (result) {
            // Send text reply if needed
            if (result.shouldReply && result.response) {
              logger.info(`[V4 Buffer] Sending reply to message ${i + 1}/${count}`);
              await msg.reply(result.response);
            }

            // React with emoji if needed (V4 silent reminders)
            if (result.reaction) {
              logger.info(`[V4 Buffer] Reacting with ${result.reaction} to message ${i + 1}/${count}`);
              await msg.react(result.reaction);
            }

            // Update buffer record with processing result
            const processedResult = result.shouldReply ? 'responded' :
                                   result.reaction ? 'reminded' :
                                   'silent';
            await this.updateProcessed(
              msg.id._serialized || msg.id,
              processedResult,
              null, // confidence (set by router in messageHandler)
              null, // reason (set by router in messageHandler)
              processedResult
            );
          }
        }
      } catch (error) {
        logger.error(`[V4 Buffer] Error processing buffered message:`, error);
      }
    }

    logger.info(`[V4 Buffer] Finished processing ${count} messages`);
  }

  /**
   * Flush all buffers (useful for shutdown)
   */
  async flushAll() {
    logger.info(`[V4 Buffer] Flushing all buffers (${this.buffers.size} chats)`);

    const chatIds = Array.from(this.buffers.keys());
    for (const chatId of chatIds) {
      await this.flush(chatId);
    }
  }

  /**
   * Save message to database buffer table
   * @private
   */
  async _saveToDatabase(message, chatId) {
    if (!this.supabase) return;

    try {
      const { error } = await this.supabase
        .from('message_buffer')
        .insert({
          message_id: message.id._serialized || message.id,
          chat_id: chatId,
          sender_name: message._data.notifyName || message.from,
          message_text: message.body || '',
          buffer_timestamp: new Date().toISOString(),
          action_decided: 'pending',
          router_confidence: null,
          router_reason: null,
          processed_at: null
        });

      if (error) {
        logger.error('[V4 Buffer] Error saving to database:', error.message);
      }
    } catch (error) {
      logger.error('[V4 Buffer] Error saving to database:', error.message);
    }
  }

  /**
   * Update buffer entry after processing
   */
  async updateProcessed(messageId, action, confidence, reason, result) {
    if (!this.supabase) return;

    try {
      const { error } = await this.supabase
        .from('message_buffer')
        .update({
          action_decided: action,
          router_confidence: confidence,
          router_reason: reason,
          processed_result: result,
          processed_at: new Date().toISOString()
        })
        .eq('message_id', messageId);

      if (error) {
        logger.error('[V4 Buffer] Error updating processed status:', error.message);
      }
    } catch (error) {
      logger.error('[V4 Buffer] Error updating processed status:', error.message);
    }
  }

  /**
   * Enable/disable buffering
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    logger.info(`[V4 Buffer] Buffering ${enabled ? 'enabled' : 'disabled'}`);

    if (!enabled) {
      // Flush all buffers when disabling
      this.flushAll();
    }
  }

  /**
   * Get buffer stats
   */
  getStats() {
    const stats = {
      activeChatBuffers: this.buffers.size,
      totalBufferedMessages: 0,
      bufferDetails: []
    };

    this.buffers.forEach((buffer, chatId) => {
      stats.totalBufferedMessages += buffer.messages.length;
      stats.bufferDetails.push({
        chatId: chatId.substring(0, 20) + '...',
        messageCount: buffer.messages.length,
        hasTimer: buffer.timer !== null
      });
    });

    return stats;
  }

  /**
   * Stop all timers (for graceful shutdown)
   */
  stop() {
    logger.info('[V4 Buffer] Stopping buffer, flushing all messages');

    // Flush all messages
    this.flushAll();

    // Clear all timers
    this.buffers.forEach((buffer) => {
      if (buffer.timer) {
        clearTimeout(buffer.timer);
      }
    });

    this.buffers.clear();
  }
}

module.exports = MessageBuffer;
