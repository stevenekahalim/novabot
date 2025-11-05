const logger = require('../utils/logger');

/**
 * ComprehensiveExtractor - Deep AI analysis for every message
 *
 * Extracts ALL information from WhatsApp messages:
 * - Projects, people, numbers, dates
 * - Decisions, questions, action items
 * - Sentiment, intent, context
 * - Facts for knowledge base
 *
 * Data Quality First - Cost optimization later
 */
class ComprehensiveExtractor {
  constructor(openaiClient) {
    this.openai = openaiClient;

    // Known entities for pattern matching (hybrid approach)
    this.knownProjects = [
      'Manado', 'Manado (Grand Kawanua)', 'Grand Kawanua',
      'Palembang', 'Palembang (Transmart)', 'Transmart',
      'Jakarta', 'Jakarta (TBD)',
      'Surabaya', 'BSD', 'Graha', 'CariSponsorPadel'
    ];

    this.knownPeople = [
      'Eka', 'Eka Halim',
      'Ilalang', 'Ilalang Design',
      'Architect', 'Arsitek',
      'Contractor', 'Kontraktor'
    ];
  }

  /**
   * Main extraction method - analyzes message comprehensively
   */
  async extract(message) {
    try {
      logger.info('🔍 Starting comprehensive extraction...');

      // Run both pattern-based (fast) and AI-based (deep) extraction in parallel
      const [patternResults, aiResults] = await Promise.all([
        this.patternBasedExtraction(message),
        this.aiBasedExtraction(message)
      ]);

      // Merge results (AI takes precedence for conflicts)
      const merged = this.mergeExtractionResults(patternResults, aiResults);

      logger.info('✅ Comprehensive extraction complete:', {
        projects: merged.projects_mentioned?.length || 0,
        people: merged.people_mentioned?.length || 0,
        numbers: merged.numbers_extracted?.length || 0,
        decisions: merged.decisions_detected?.length || 0,
        facts: merged.facts?.length || 0
      });

      return merged;
    } catch (error) {
      logger.error('Error in comprehensive extraction:', error);

      // Fallback to pattern-based only
      return this.patternBasedExtraction(message);
    }
  }

  /**
   * Pattern-based extraction (fast, deterministic)
   */
  async patternBasedExtraction(message) {
    const text = message.body?.toLowerCase() || '';

    return {
      // Projects
      projects_mentioned: this.knownProjects.filter(project =>
        text.includes(project.toLowerCase())
      ),

      // People
      people_mentioned: this.knownPeople.filter(person =>
        text.includes(person.toLowerCase())
      ),

      // Numbers (basic detection)
      numbers_extracted: this.extractNumbers(text),

      // Dates (basic detection)
      dates_extracted: this.extractDates(text),

      // Sentiment (keyword-based)
      sentiment: this.detectSentiment(text),

      // Intent (keyword-based)
      intent: this.detectIntent(text),

      extraction_method: 'pattern'
    };
  }

  /**
   * AI-based extraction (deep, comprehensive)
   */
  async aiBasedExtraction(message) {
    const prompt = `Analyze this WhatsApp message comprehensively and extract ALL information.

MESSAGE:
From: ${message.author || 'Unknown'}
Text: "${message.body}"

Extract and return JSON with:

1. projects_mentioned: Array of project names mentioned (explicit or implicit)
   Example: ["Manado", "Palembang"]

2. people_mentioned: Array of people names mentioned
   Example: ["Eka", "Ilalang Design", "Architect"]

3. numbers_extracted: Array of number objects with context
   Structure: [{type: "amount|percentage|quantity", value: number, context: string, currency: string}]
   Example: [{type: "amount", value: 21000000, context: "DP for architect", currency: "IDR"}]

4. dates_extracted: Array of date objects with context
   Structure: [{type: "deadline|meeting|target", value: "YYYY-MM-DD", context: string}]
   Example: [{type: "target", value: "2026-03-31", context: "opening target"}]

5. decisions_detected: Array of decisions made or implied
   Example: ["Go with Ilalang Design as architect", "Pay DP 21jt"]

6. questions_asked: Array of questions in the message
   Example: ["When is the meeting?", "How much is the DP?"]

7. action_items_detected: Array of todos or actions mentioned
   Example: ["Call architect tomorrow", "Sign rental agreement"]

8. sentiment: One of: positive, neutral, negative, urgent
   Consider tone, urgency, emotion

9. intent: Primary intent of message
   Options: update, status_query, question, decision, reminder, greeting, casual

10. context_type: Business context
    Options: negotiation, pre_opening, partnership, venture, general

11. project_context: Primary project being discussed (or null)
    Example: "Manado"

12. conversation_phase: Current phase of conversation
    Options: greeting, update, question, decision, closing

13. confidence: Confidence score 0-1 for the overall extraction

14. facts: Array of factual statements that should be remembered
    Structure: [{fact_text: string, fact_type: "cost|date|person|decision|status", category: string, confidence: number}]
    Example: [{fact_text: "Architect fee is 30 million", fact_type: "cost", category: "financial", confidence: 0.9}]

IMPORTANT:
- Be thorough - extract EVERYTHING
- Include implicit information (e.g., if they say "PT sudah" that's a decision/update)
- For numbers, always include context and currency if applicable
- For dates, parse to YYYY-MM-DD format
- Facts should be atomic statements that can be stored in knowledge base
- Return ONLY valid JSON, no markdown formatting

JSON:`;

    try {
      const response = await this.openai.chatWithRetry([
        {
          role: 'system',
          content: 'You are Nova\'s extraction engine. Extract ALL information comprehensively. Return only valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.1,  // Low temperature for consistency
        max_tokens: 2000
      });

      // Log raw response for debugging
      logger.debug('AI extraction raw response:', response);

      // Parse JSON response
      const cleaned = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const extracted = JSON.parse(cleaned);

      return {
        ...extracted,
        extraction_method: 'ai'
      };
    } catch (error) {
      logger.error('AI extraction failed:', error);
      logger.error('Raw response:', error.response);
      throw error;
    }
  }

  /**
   * Merge pattern and AI extraction results
   */
  mergeExtractionResults(pattern, ai) {
    return {
      // Projects: Combine and deduplicate
      projects_mentioned: [...new Set([
        ...(pattern.projects_mentioned || []),
        ...(ai.projects_mentioned || [])
      ])],

      // People: Combine and deduplicate
      people_mentioned: [...new Set([
        ...(pattern.people_mentioned || []),
        ...(ai.people_mentioned || [])
      ])],

      // Numbers: AI takes precedence (more context)
      numbers_extracted: ai.numbers_extracted || pattern.numbers_extracted || [],

      // Dates: AI takes precedence
      dates_extracted: ai.dates_extracted || pattern.dates_extracted || [],

      // Decisions: AI only (pattern can't detect these)
      decisions_detected: ai.decisions_detected || [],

      // Questions: AI only
      questions_asked: ai.questions_asked || [],

      // Action items: AI only
      action_items_detected: ai.action_items_detected || [],

      // Sentiment: AI takes precedence, fallback to pattern
      sentiment: ai.sentiment || pattern.sentiment || 'neutral',

      // Intent: AI takes precedence, fallback to pattern
      intent: ai.intent || pattern.intent || 'unknown',

      // Context: AI only (pattern can't infer this)
      context_type: ai.context_type || null,
      project_context: ai.project_context || (pattern.projects_mentioned?.[0]) || null,
      conversation_phase: ai.conversation_phase || null,

      // Confidence: AI only
      confidence: ai.confidence || 0.7,

      // Facts: AI only (most important for knowledge base)
      facts: ai.facts || [],

      // Metadata
      extraction_method: 'hybrid',
      pattern_found: Object.keys(pattern).length,
      ai_found: Object.keys(ai).length
    };
  }

  /**
   * Extract numbers from text (pattern-based)
   */
  extractNumbers(text) {
    const numbers = [];

    // Indonesian currency patterns
    const currencyPattern = /(?:rp\.?|idr\.?)\s*([\d.,]+(?:jt|juta|rb|ribu|m|million|k)?)/gi;
    let match;

    while ((match = currencyPattern.exec(text)) !== null) {
      const valueStr = match[1].replace(/[.,]/g, '');
      let value = parseInt(valueStr);

      // Handle suffixes
      if (/jt|juta/.test(match[1])) value *= 1000000;
      if (/rb|ribu/.test(match[1])) value *= 1000;
      if (/m|million/.test(match[1])) value *= 1000000;
      if (/k/.test(match[1])) value *= 1000;

      numbers.push({
        type: 'amount',
        value: value,
        context: 'currency mentioned',
        currency: 'IDR'
      });
    }

    // Percentage patterns
    const percentPattern = /(\d+(?:\.\d+)?)\s*%/g;
    while ((match = percentPattern.exec(text)) !== null) {
      numbers.push({
        type: 'percentage',
        value: parseFloat(match[1]),
        context: 'percentage mentioned'
      });
    }

    return numbers;
  }

  /**
   * Extract dates from text (pattern-based)
   */
  extractDates(text) {
    const dates = [];

    // ISO date pattern (YYYY-MM-DD)
    const isoPattern = /(\d{4})-(\d{2})-(\d{2})/g;
    let match;

    while ((match = isoPattern.exec(text)) !== null) {
      dates.push({
        type: 'date',
        value: match[0],
        context: 'date mentioned'
      });
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const dmyPattern = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/g;
    while ((match = dmyPattern.exec(text)) !== null) {
      const [_, day, month, year] = match;
      dates.push({
        type: 'date',
        value: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
        context: 'date mentioned'
      });
    }

    return dates;
  }

  /**
   * Detect sentiment from keywords (pattern-based)
   */
  detectSentiment(text) {
    const urgentKeywords = ['urgent', 'asap', 'segera', 'penting', 'immediately', 'now'];
    const positiveKeywords = ['good', 'great', 'bagus', 'mantap', 'oke', 'ok', 'yes', 'done', 'selesai', 'sukses'];
    const negativeKeywords = ['problem', 'issue', 'stuck', 'terhambat', 'masalah', 'gagal', 'fail', 'tidak', 'belum'];

    if (urgentKeywords.some(kw => text.includes(kw))) return 'urgent';
    if (negativeKeywords.some(kw => text.includes(kw))) return 'negative';
    if (positiveKeywords.some(kw => text.includes(kw))) return 'positive';

    return 'neutral';
  }

  /**
   * Detect intent from keywords (pattern-based)
   */
  detectIntent(text) {
    // Status query patterns
    if (/status|how|bagaimana|gimana|recap|summary/.test(text)) {
      return 'status_query';
    }

    // Update patterns
    if (/done|selesai|sudah|completed|finish|update/.test(text)) {
      return 'update';
    }

    // Question patterns
    if (/\?|when|kapan|berapa|how much|apa/.test(text)) {
      return 'question';
    }

    // Decision patterns
    if (/decide|pilih|go with|confirm|setuju|agree/.test(text)) {
      return 'decision';
    }

    // Reminder patterns
    if (/remind|ingatkan|jangan lupa/.test(text)) {
      return 'reminder';
    }

    return 'update';  // Default to update
  }
}

module.exports = ComprehensiveExtractor;
