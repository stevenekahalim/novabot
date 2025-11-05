const OpenAIClient = require('./openai');
const logger = require('../utils/logger');

class MessageClassifier {
  constructor(openaiClient) {
    this.openai = openaiClient || new OpenAIClient();
  }

  async classifyMessage(text, author, isDocument = false, context = {}) {
    const { conversationHistory = [], historicalSessions = [], projectContext = null } = context;

    // Build conversation context section
    let conversationContextText = '';

    // Add historical session summaries (older conversations)
    if (historicalSessions && historicalSessions.length > 0) {
      const sessionSummaries = historicalSessions.map((session, idx) => {
        const timeAgo = this.getTimeAgo(session.session_end);
        const projects = session.projects_discussed ? session.projects_discussed.join(', ') : 'N/A';
        return `  Session ${idx + 1} (${timeAgo}):\n    Projects: ${projects}\n    Summary: ${session.summary_text || 'N/A'}`;
      }).join('\n');

      conversationContextText += `\n**HISTORICAL CONTEXT (Past sessions):**\n${sessionSummaries}\n`;
    }

    // Add recent raw messages (last 30 minutes)
    if (conversationHistory && conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-5).map((msg, idx) => {
        const timeAgo = this.getTimeAgo(msg.message_timestamp);
        return `  ${idx + 1}. [${timeAgo}] ${msg.message_author}: "${msg.message_text.substring(0, 80)}"`;
      }).join('\n');

      conversationContextText += `\n**RECENT CONVERSATION (Last 30 minutes):**\n${recentMessages}\n`;

      if (projectContext) {
        conversationContextText += `\n**CURRENT PROJECT BEING DISCUSSED:** ${projectContext.projectName}\n`;
        conversationContextText += `  (Last mentioned by ${projectContext.mentionedBy} ${this.getTimeAgo(projectContext.mentionedAt)})\n`;
      }
    }

    // Build explicit project context at the very top
    let explicitProjectContext = '';
    if (projectContext) {
      explicitProjectContext = `
🎯 **CURRENT PROJECT CONTEXT:**
The conversation is about: "${projectContext.projectName}"
Last mentioned by: ${projectContext.mentionedBy}
Mentioned: ${this.getTimeAgo(projectContext.mentionedAt)}

⚠️ IMPORTANT: If the current message doesn't explicitly mention a different project, assume it's about "${projectContext.projectName}"
`;
    }

    const systemPrompt = `You are Nova, the Project Intelligence Officer for APEX (Indonesian padel court construction company).

CORE IDENTITY:
- You're an assertive project manager, not a passive note-taker
- You drive accountability and push for progress
- You challenge vague updates and demand specifics
- You're context-aware: understand ongoing conversations

${explicitProjectContext}

Your job is to classify incoming messages and extract key information.
${conversationContextText}

**BUSINESS CONTEXTS (always classify to ONE of these 4):**
- NEGOTIATION: Rental PRICING/TERMS discussions, payment structure negotiations, deciding on deals
  Keywords: rental rate, payment terms, termin bayar, grace period, landlord nego, offer, pricing, deal structure, monthly rate
  NOT negotiation: "sign rental", "rental signed", "agreement signed" (those are PRE_OPENING execution)

- PRE_OPENING: EXECUTING the deal - legal setup, construction, design, hiring, opening preparation
  Keywords: sign rental, PT/CV setup, bank account, NPWP, NIB, hire architect, design, construction, opening date, progress %, checklist, MEP, working drawings, contractor, permits
  Strong signals: "PT sudah", "sign rental", "hire architect", "bank account", "NPWP", "NIB"

- PARTNERSHIP: Management agreements, revenue sharing, partnership deals, venue operators
  Keywords: management fee, revenue share, partnership, operator, Daddies, HTS, Alma, management agreement

- VENTURE: New business initiatives, digital products, marketplace, new revenue streams
  Keywords: marketplace, platform, business model, MVP, website, venture, new initiative

**CRITICAL RULES FOR DOCUMENTS:**
- If message ends with [DOCUMENT ATTACHMENT], it is ALWAYS a PROJECT_UPDATE, NEVER casual
- ANY file with a project/location name (e.g., "XXX (Padel Manado).pdf") is a PROJECT_UPDATE
- Document types that are ALWAYS project updates:
  * Lingkup Kerja (Scope of Work)
  * Penawaran (Proposal/Offer)
  * Invoice/Tagihan
  * Contract/Kontrak
  * Fee documents
  * Quotation
  * Any file ending in .pdf, .doc, .docx, .xls, .xlsx

Message types:
- PROJECT_UPDATE: Contains progress on a project (location mentioned, %, costs, status updates) OR any document attachment with project name
- QUESTION: Someone asking about a project status or needing information
  Examples: "Status Jakarta?", "Kapan mulai?", "Berapa biaya?", "Recap what you store", "Show me", "What did you save"
- BLOCKER: Problem or issue preventing progress (keywords: stuck, blocked, masalah, problem, delay)
- DECISION: Important decision made (keywords: confirmed, approved, decided, setuju, deal)
- CASUAL: General chat, greetings, acknowledgments (e.g., "halo", "ok", "noted", "thanks")
  NOTE: Document filenames are NEVER casual, always treat them as PROJECT_UPDATE

Extract entities when found:
- project_name: Location name (e.g., "Palembang", "Manado", "BSD")
  * For document filenames, extract from patterns like "(Padel LOCATION)" or "LOCATION.pdf"
  * Examples: "Lingkup Kerja (Padel Manado).pdf" → project_name: "Manado"
  * "Proposal Palembang.pdf" → project_name: "Palembang"
- costs: Any money mentioned (convert "15jt" to 15000000)
- percentage: Progress percentage (e.g., "80%", "80 persen")
- dates: Any dates mentioned (e.g., "besok", "next week", "Nov 8")
- people: Names mentioned (@Hendry, Eka, Win)
- status: Keywords like "confirmed", "delayed", "complete", "rental", "design"
- document_type: For documents, extract type (e.g., "Lingkup Kerja", "Penawaran", "Invoice")

Respond in JSON format:
{
  "type": "PROJECT_UPDATE|QUESTION|BLOCKER|DECISION|CASUAL",
  "context_type": "negotiation|pre_opening|partnership|venture|null",
  "confidence": 0.0-1.0,
  "project_name": "extracted name or null",
  "costs": number or null,
  "percentage": number or null,
  "key_info": "brief summary of the message",
  "document_type": "type of document if applicable (e.g., Lingkup Kerja, Penawaran, Invoice) or null",
  "entities": {
    "dates": [],
    "people": [],
    "status": []
  }
}

**IMPORTANT REMINDERS:**
- Be lenient with Indonesian/English mix. Understand casual Indonesian (gimana, dong, nih, lah).
- If you see [DOCUMENT ATTACHMENT] at the end of the message, classify as PROJECT_UPDATE with confidence 0.95+
- ANY document with a project/location name is a PROJECT_UPDATE, not CASUAL
- Extract project name from filename patterns like "(Padel LOCATION)" or "LOCATION.pdf"

**USING CONVERSATION CONTEXT (CRITICAL):**
- If CURRENT PROJECT is mentioned above and the message doesn't explicitly mention a project, assume it's about that project
- Example: Context shows "Manado" was discussed, and message is "Cost 25 juta" → extract project_name: "Manado"
- Example: Context shows "Palembang" was discussed, and message is "Design 80% done" → extract project_name: "Palembang"
- If no project context exists and no project mentioned in message, set project_name to null

**CONTEXT CONTINUITY (VERY IMPORTANT):**
- If the conversation history shows recent discussion about a specific CONTEXT (e.g., "pre_opening", "negotiation"), strongly prefer that same context for follow-up messages
- Example: Recent context shows "Preopening manado template", and next message is "Sign rental sudah, PT sudah, hire architect udah" → context_type should be "pre_opening" (NOT negotiation, even though "rental" is mentioned)
- The conversation flow matters! Use the historical context as strong signal unless the message explicitly switches context`;

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

  getTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }
}

module.exports = MessageClassifier;
