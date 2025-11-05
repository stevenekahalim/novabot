const OpenAI = require('openai');
const logger = require('../utils/logger');

class OpenAIClient {
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.modelClassification = process.env.OPENAI_MODEL_CLASSIFICATION || 'gpt-3.5-turbo';
    this.modelResponse = process.env.OPENAI_MODEL_RESPONSE || 'gpt-4-turbo';
    this.requestCount = 0;
    this.maxRequestsPerHour = 100;
    this.requestTimestamps = [];
  }

  checkRateLimit() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Remove timestamps older than 1 hour
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => timestamp > oneHourAgo
    );

    if (this.requestTimestamps.length >= this.maxRequestsPerHour) {
      logger.warn(`Rate limit reached: ${this.requestTimestamps.length} requests in last hour`);
      return false;
    }

    this.requestTimestamps.push(now);
    return true;
  }

  async chat(messages, model = this.modelClassification, options = {}) {
    if (!this.checkRateLimit()) {
      throw new Error('OpenAI rate limit exceeded (100 requests/hour)');
    }

    try {
      this.requestCount++;
      logger.info(`OpenAI request #${this.requestCount} with ${model}`);

      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 500,
        ...options
      });

      const result = response.choices[0].message.content;
      logger.info(`OpenAI response received (${response.usage.total_tokens} tokens)`);

      return result;
    } catch (error) {
      logger.error('OpenAI API error:', error);
      throw error;
    }
  }

  async chatWithRetry(messages, options = {}, maxRetries = 3) {
    // Support both old signature (messages, model, maxRetries) and new (messages, options, maxRetries)
    const model = typeof options === 'string' ? options : (options.model || this.modelClassification);
    const opts = typeof options === 'string' ? {} : options;

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.chat(messages, model, opts);
      } catch (error) {
        lastError = error;
        logger.warn(`OpenAI attempt ${attempt} failed: ${error.message}`);

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff
          logger.info(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  async transcribeAudio(audioBuffer) {
    if (!this.checkRateLimit()) {
      throw new Error('OpenAI rate limit exceeded');
    }

    try {
      logger.info('Transcribing audio with Whisper API...');

      const response = await this.client.audio.transcriptions.create({
        file: audioBuffer,
        model: 'whisper-1',
        language: 'id' // Indonesian (also handles English)
      });

      logger.info('Audio transcription completed');
      return response.text;
    } catch (error) {
      logger.error('Whisper API error:', error);
      throw error;
    }
  }

  getRequestStats() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const recentRequests = this.requestTimestamps.filter(
      timestamp => timestamp > oneHourAgo
    );

    return {
      totalRequests: this.requestCount,
      requestsLastHour: recentRequests.length,
      remainingThisHour: this.maxRequestsPerHour - recentRequests.length
    };
  }
}

module.exports = OpenAIClient;
