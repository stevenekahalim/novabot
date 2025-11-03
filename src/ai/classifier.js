const OpenAIClient = require('./openai');
const logger = require('../utils/logger');

class MessageClassifier {
  constructor(openaiClient) {
    this.openai = openaiClient || new OpenAIClient();
  }

  async classifyMessage(text, author) {
    const systemPrompt = `You are an AI assistant analyzing messages in a WhatsApp group for an Indonesian padel court construction company (APEX).

Your job is to classify incoming messages and extract key information.

Message types:
- PROJECT_UPDATE: Contains progress on a project (location mentioned, %, costs, status updates)
- QUESTION: Someone asking about a project status or needing information
- BLOCKER: Problem or issue preventing progress (keywords: stuck, blocked, masalah, problem, delay)
- DECISION: Important decision made (keywords: confirmed, approved, decided, setuju)
- CASUAL: General chat, greetings, acknowledgments (ignore these)

Extract entities when found:
- project_name: Location name (e.g., "Palembang", "Manado", "BSD")
- costs: Any money mentioned (convert "15jt" to 15000000)
- percentage: Progress percentage (e.g., "80%", "80 persen")
- dates: Any dates mentioned (e.g., "besok", "next week", "Nov 8")
- people: Names mentioned (@Hendry, Eka, Win)
- status: Keywords like "confirmed", "delayed", "complete", "rental", "design"

Respond in JSON format:
{
  "type": "PROJECT_UPDATE|QUESTION|BLOCKER|DECISION|CASUAL",
  "confidence": 0.0-1.0,
  "project_name": "extracted name or null",
  "costs": number or null,
  "percentage": number or null,
  "key_info": "brief summary of the message",
  "entities": {
    "dates": [],
    "people": [],
    "status": []
  }
}

Be lenient with Indonesian/English mix. Understand casual Indonesian (gimana, dong, nih, lah).`;

    const userPrompt = `Author: ${author}
Message: ${text}

Classify this message and extract information.`;

    try {
      const response = await this.openai.chatWithRetry([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      // Parse JSON response
      const cleaned = response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const classification = JSON.parse(cleaned);

      logger.info(`Message classified as: ${classification.type} (confidence: ${classification.confidence})`);

      return classification;
    } catch (error) {
      logger.error('Error classifying message:', error);

      // Return default classification on error
      return {
        type: 'CASUAL',
        confidence: 0.1,
        project_name: null,
        costs: null,
        percentage: null,
        key_info: text.substring(0, 100),
        entities: { dates: [], people: [], status: [] }
      };
    }
  }

  shouldProcess(classification) {
    // Only process if it's not casual chat and confidence is reasonable
    return classification.type !== 'CASUAL' && classification.confidence > 0.5;
  }

  extractProjectInfo(classification, text) {
    return {
      project: classification.project_name,
      cost: classification.costs,
      progress: classification.percentage,
      status: classification.entities.status[0] || null,
      summary: classification.key_info,
      rawText: text
    };
  }
}

module.exports = MessageClassifier;
