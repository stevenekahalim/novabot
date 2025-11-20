/**
 * V4 Router - The "Satpam" (Security Guard)
 *
 * Purpose: Fast, cheap message classifier
 * Model: GPT-4o-mini (OpenAI)
 * Cost: ~$0.000075 per decision
 *
 * Two-tier system:
 * 1. Heuristics (free, instant) - catches obvious cases
 * 2. AI decision (paid, fast) - handles ambiguous messages
 */

const OpenAI = require('openai');
const logger = require('../utils/logger');
const ROUTER_PROMPT = require('../prompts/router');

class Router {
  constructor(supabaseClient) {
    this.supabase = supabaseClient.getClient();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = 'gpt-4o-mini';

    // Stats
    this.stats = {
      totalDecisions: 0,
      heuristicDecisions: 0,
      aiDecisions: 0,
      totalCost: 0
    };
  }

  /**
   * Main decision method
   * Returns: { action: 'pass'|'ignore', confidence: 0-1, reason: string, method: 'heuristic'|'ai' }
   */
  async decide(messageText, metadata = {}) {
    const { isMentioned = false, senderName = 'Unknown', chatId = null } = metadata;

    // Tier 1: Fast heuristics (free)
    const heuristic = this._checkHeuristics(messageText, metadata);
    if (heuristic) {
      this.stats.totalDecisions++;
      this.stats.heuristicDecisions++;

      // Log decision to database
      await this._logDecision({
        messageText,
        chatId,
        action: heuristic.action,
        confidence: heuristic.confidence,
        reason: heuristic.reason,
        wasMentioned: isMentioned,
        heuristicUsed: true,
        tokensUsed: 0,
        cost: 0
      });

      logger.info(`[V4 Router] Heuristic: ${heuristic.action.toUpperCase()} (${heuristic.reason})`);
      return { ...heuristic, method: 'heuristic' };
    }

    // Tier 2: AI decision (paid, but cheap)
    const aiDecision = await this._askAI(messageText, metadata);
    this.stats.totalDecisions++;
    this.stats.aiDecisions++;
    this.stats.totalCost += aiDecision.cost || 0;

    // Log decision to database
    await this._logDecision({
      messageText,
      chatId,
      action: aiDecision.action,
      confidence: aiDecision.confidence,
      reason: aiDecision.reason,
      wasMentioned: isMentioned,
      heuristicUsed: false,
      tokensUsed: aiDecision.tokensUsed || 0,
      cost: aiDecision.cost || 0
    });

    logger.info(`[V4 Router] AI: ${aiDecision.action.toUpperCase()} (${aiDecision.reason}) | Cost: $${(aiDecision.cost || 0).toFixed(6)}`);
    return { ...aiDecision, method: 'ai' };
  }

  /**
   * Tier 1: Fast heuristic checks (no AI cost)
   * Returns decision object or null if inconclusive
   * @private
   */
  _checkHeuristics(messageText, metadata) {
    const text = messageText.toLowerCase().trim();
    const { isMentioned } = metadata;

    // Rule 1: Always pass if Nova is mentioned
    if (isMentioned) {
      return {
        action: 'pass',
        confidence: 1.0,
        reason: 'Nova explicitly mentioned'
      };
    }

    // Rule 2: Very short messages (likely acknowledgments)
    const wordCount = text.split(/\s+/).length;
    if (wordCount <= 2 && !text.includes('?')) {
      // Common acknowledgments
      const acks = ['ok', 'oke', 'okay', 'ya', 'yes', 'no', 'tidak', 'siap', 'noted', 'thanks', 'makasih', 'terima kasih'];
      if (acks.some(ack => text === ack || text === ack + '.')) {
        return {
          action: 'ignore',
          confidence: 0.95,
          reason: 'Simple acknowledgment (<= 2 words)'
        };
      }
    }

    // Rule 3: Laughter / reactions
    const reactions = ['haha', 'hehe', 'hihi', 'wkwk', 'wkwkwk', 'lol', 'lmao', 'anjir', 'anjay'];
    if (reactions.some(r => text.includes(r)) && wordCount <= 3) {
      return {
        action: 'ignore',
        confidence: 0.9,
        reason: 'Social laughter/reaction'
      };
    }

    // Rule 4: Explicit questions (always pass)
    const questionWords = ['?', 'gimana', 'bagaimana', 'kapan', 'kenapa', 'apa', 'siapa', 'mana', 'berapa'];
    if (questionWords.some(q => text.includes(q))) {
      return {
        action: 'pass',
        confidence: 0.9,
        reason: 'Contains question indicator'
      };
    }

    // Rule 5: Problem indicators (always pass)
    const problemWords = ['error', 'masalah', 'problem', 'issue', 'gagal', 'failed', 'broken', 'delay', 'terlambat', 'belum', 'urgent', 'waduh', 'gawat'];
    if (problemWords.some(p => text.includes(p))) {
      return {
        action: 'pass',
        confidence: 0.85,
        reason: 'Problem/concern keyword detected'
      };
    }

    // Rule 6: Reminder keywords
    const reminderWords = ['remind', 'reminder', 'ingatkan', 'ingetin', 'jangan lupa', 'schedule', 'jadwal'];
    if (reminderWords.some(r => text.includes(r))) {
      return {
        action: 'pass',
        confidence: 0.8,
        reason: 'Reminder keyword detected'
      };
    }

    // Rule 7: Greetings only (no substance)
    const greetings = ['good morning', 'good afternoon', 'good evening', 'selamat pagi', 'selamat siang', 'selamat sore', 'pagi', 'siang', 'sore', 'halo', 'hi', 'hello'];
    if (greetings.some(g => text === g || text === g + '!' || text === g + '.') && wordCount <= 3) {
      return {
        action: 'ignore',
        confidence: 0.85,
        reason: 'Simple greeting'
      };
    }

    // Rule 8: Praise/encouragement (usually social)
    const praise = ['mantap', 'bagus', 'keren', 'nice', 'good', 'oke sip', 'siap', 'roger', 'copy'];
    if (praise.some(p => text === p || text === p + '!' || text === p + 'bro') && wordCount <= 3) {
      return {
        action: 'ignore',
        confidence: 0.8,
        reason: 'Social praise/encouragement'
      };
    }

    // Inconclusive - need AI
    return null;
  }

  /**
   * Tier 2: AI decision using GPT-4o-mini
   * @private
   */
  async _askAI(messageText, metadata) {
    try {
      const startTime = Date.now();

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: ROUTER_PROMPT },
          { role: 'user', content: `Message: "${messageText}"` }
        ],
        temperature: 0.2, // Low temperature for consistent decisions
        max_tokens: 100, // Short response (just JSON)
        response_format: { type: 'json_object' }
      });

      const duration = Date.now() - startTime;
      const responseText = completion.choices[0].message.content;
      const usage = completion.usage;

      // Parse JSON response
      let decision;
      try {
        decision = JSON.parse(responseText);
      } catch (parseError) {
        logger.error('[V4 Router] Failed to parse AI response:', responseText);
        // Fallback: pass to Nova if parsing fails (safer)
        return {
          action: 'pass',
          confidence: 0.5,
          reason: 'Router parsing error - defaulting to PASS',
          tokensUsed: usage.total_tokens,
          cost: 0
        };
      }

      // Calculate cost (GPT-4o-mini pricing: $0.15 per 1M input tokens, $0.60 per 1M output tokens)
      const inputCost = (usage.prompt_tokens / 1_000_000) * 0.15;
      const outputCost = (usage.completion_tokens / 1_000_000) * 0.60;
      const totalCost = inputCost + outputCost;

      logger.debug(`[V4 Router] AI decision: ${JSON.stringify(decision)} | Tokens: ${usage.total_tokens} | Cost: $${totalCost.toFixed(6)} | Duration: ${duration}ms`);

      return {
        action: decision.action.toLowerCase(),
        confidence: decision.confidence || 0.7,
        reason: decision.reason || 'AI classification',
        tokensUsed: usage.total_tokens,
        cost: totalCost
      };

    } catch (error) {
      logger.error('[V4 Router] Error calling OpenAI:', error.message);
      // Fallback: pass to Nova if API fails (safer)
      return {
        action: 'pass',
        confidence: 0.5,
        reason: 'Router API error - defaulting to PASS',
        tokensUsed: 0,
        cost: 0
      };
    }
  }

  /**
   * Log decision to database for monitoring
   * @private
   */
  async _logDecision(data) {
    try {
      const { error } = await this.supabase
        .from('router_decisions')
        .insert({
          message_id: null, // Will be set later if needed
          message_text: data.messageText.substring(0, 500), // Limit text length
          chat_id: data.chatId,
          action: data.action,
          confidence: data.confidence,
          reason: data.reason,
          was_mentioned: data.wasMentioned,
          heuristic_used: data.heuristicUsed,
          model_used: data.heuristicUsed ? 'heuristic' : this.model,
          tokens_used: data.tokensUsed,
          cost: data.cost
        });

      if (error) {
        logger.error('[V4 Router] Error logging decision:', error.message);
      }
    } catch (error) {
      logger.error('[V4 Router] Error logging decision:', error.message);
    }
  }

  /**
   * Get router statistics
   */
  getStats() {
    return {
      ...this.stats,
      heuristicPercentage: this.stats.totalDecisions > 0
        ? ((this.stats.heuristicDecisions / this.stats.totalDecisions) * 100).toFixed(1) + '%'
        : '0%',
      avgCost: this.stats.aiDecisions > 0
        ? (this.stats.totalCost / this.stats.aiDecisions).toFixed(6)
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalDecisions: 0,
      heuristicDecisions: 0,
      aiDecisions: 0,
      totalCost: 0
    };
  }
}

module.exports = Router;
