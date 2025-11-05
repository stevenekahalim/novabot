const logger = require('../utils/logger');
const MessageClassifier = require('../ai/classifier');
const SupabaseClient = require('../database/supabase');
const NotionSync = require('../notion/sync');
const ConversationMemory = require('../memory/conversationMemory');

class MessageHandler {
  constructor(whatsappClient, openaiClient) {
    this.whatsapp = whatsappClient;
    this.classifier = new MessageClassifier(openaiClient);
    this.supabase = new SupabaseClient();
    this.notion = new NotionSync();
    this.memory = new ConversationMemory(this.supabase.getClient());

    this.setupListener();
  }

  setupListener() {
    const client = this.whatsapp.getClient();

    client.on('message', async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        logger.error('Error handling message:', error);
      }
    });

    logger.info('Message handler listening for messages');
  }

  async handleMessage(message) {
    // Get message details
    const chat = await message.getChat();
    const contact = await message.getContact();
    const author = contact.pushname || contact.number;

    // Determine chat type
    const isGroup = chat.isGroup;
    const isPrivate = !chat.isGroup;
    const chatName = chat.name || 'Private Chat';
    const chatId = chat.id._serialized;

    // Log incoming message
    logger.info(`Message from ${author} in ${chatName} (${isGroup ? 'GROUP' : 'PRIVATE'}): ${message.body.substring(0, 50)}...`);

    // Filter: Ignore messages from the bot itself
    if (message.fromMe) {
      logger.debug('Message from bot, ignoring');
      return;
    }

    // Get message text
    let messageText = message.body;

    // Handle voice notes (Week 2 feature, skip for now)
    if (message.hasMedia && message.type === 'ptt') {
      logger.info('Voice note detected - transcription coming in Week 2');
      return;
    }

    // REMOVED: 10-character filter - now store ALL messages for better context
    // Even "ok", "noted", "Manado" are valuable for conversation understanding

    // ========================================
    // CONVERSATION MEMORY: Load sliding window context
    // (30 min raw messages + older session summaries)
    // ========================================
    const context = await this.memory.getSlidingWindowContext(chatId, 30);
    const conversationHistory = context.recentMessages;
    const historicalSessions = context.historicalSessions;

    const projectContext = this.memory.extractProjectContext(conversationHistory);

    if (projectContext) {
      logger.info(`📚 Project context from history: ${projectContext.projectName} (mentioned ${projectContext.confidence * 100}% confident)`);
    }

    // Detect if message is a document/PDF attachment
    const isDocument = this.isDocumentAttachment(messageText);
    const documentContext = isDocument ? ' [DOCUMENT ATTACHMENT]' : '';

    // Classify the message (with conversation context and document context)
    const classification = await this.classifier.classifyMessage(
      messageText + documentContext,
      author,
      isDocument,
      {
        conversationHistory: conversationHistory,
        historicalSessions: historicalSessions,
        projectContext: projectContext
      }
    );

    logger.info(`Classification: ${classification.type} (confidence: ${classification.confidence})`);

    // Only process non-casual messages with good confidence
    if (!this.classifier.shouldProcess(classification)) {
      logger.debug('Message classified as casual or low confidence, skipping');

      // Still save to conversation history (for future context)
      await this.memory.saveMessage(chatId, chatName, isGroup ? 'GROUP' : 'PRIVATE', {
        text: messageText,
        author: author,
        classification: 'CASUAL'
      });

      return;
    }

    // Process based on type
    const chatContext = { chat, isGroup, isPrivate, chatName, chatId };
    await this.processMessage(classification, messageText, author, message.id.id, chatContext);

    // ========================================
    // CONVERSATION MEMORY: Save this message
    // ========================================
    await this.memory.saveMessage(chatId, chatName, isGroup ? 'GROUP' : 'PRIVATE', {
      text: messageText,
      author: author,
      project: classification.project_name,
      classification: classification.type
    });

    // Refresh TTL for active conversation
    await this.memory.refreshConversationTTL(chatId);
  }

  async processMessage(classification, text, author, messageId, chatContext) {
    const { chat, isGroup, isPrivate } = chatContext;

    try {
      switch (classification.type) {
        case 'PROJECT_UPDATE':
          await this.handleProjectUpdate(classification, text, author, messageId, chatContext);
          break;

        case 'QUESTION':
          await this.handleQuestion(classification, text, author, chatContext);
          break;

        case 'BLOCKER':
          await this.handleBlocker(classification, text, author, chatContext);
          break;

        case 'DECISION':
          await this.handleDecision(classification, text, author, messageId, chatContext);
          break;

        default:
          logger.debug(`Unhandled message type: ${classification.type}`);
      }
    } catch (error) {
      logger.error('Error processing message:', error);

      // Send error notification (more detailed in private)
      if (isPrivate) {
        await chat.sendMessage('⚠️ Maaf, ada error processing message.\n\nDetail: ' + error.message + '\n\nSilakan coba lagi atau hubungi admin.');
      } else {
        await chat.sendMessage('⚠️ Maaf, ada error processing message. Silakan coba lagi atau tag @Eka');
      }
    }
  }

  async handleProjectUpdate(classification, text, author, messageId, chatContext) {
    const { chat, isPrivate } = chatContext;
    logger.info('Handling project update');

    const projectName = classification.project_name;

    if (!projectName) {
      logger.warn('No project name found in update');
      // Assertive: demand specifics
      await chat.sendMessage(
        `Project mana? Ga bisa track tanpa nama project.\n\n` +
        `Contoh: "Manado design 80%" atau "Jakarta cost 15M"`
      );
      return;
    }

    // Get or create project
    let project = await this.supabase.getProjectByName(projectName);

    // Determine context type from classification
    const contextType = classification.context_type || 'negotiation'; // default to negotiation

    // Parse checklist updates from message (for PRE_OPENING projects)
    let checklistUpdates = null;
    if (contextType === 'pre_opening') {
      // PRIMARY: Use fast, reliable keyword matching
      checklistUpdates = this.keywordParseChecklistUpdates(text);
      logger.info(`Keyword parser found ${checklistUpdates?.length || 0} completed items`);

      // FALLBACK: If keyword parser found nothing, try AI (for complex/edge cases)
      if (!checklistUpdates || checklistUpdates.length === 0) {
        logger.info('Keyword parser found nothing, trying AI fallback...');
        checklistUpdates = await this.parseChecklistUpdates(text, project);
        logger.info(`AI parser found ${checklistUpdates?.length || 0} items`);
      }

      if (checklistUpdates && checklistUpdates.length > 0) {
        logger.info('Checklist updates:', JSON.stringify(checklistUpdates));
      }
    }

    if (!project) {
      // Create new project
      const initialChecklist = contextType === 'pre_opening'
        ? this.getStandardPreOpeningChecklist()
        : [];

      // If there are updates, merge them with the initial checklist
      const finalChecklist = checklistUpdates && checklistUpdates.length > 0
        ? this.mergeChecklistUpdates(initialChecklist, checklistUpdates)
        : initialChecklist;

      project = await this.supabase.upsertProject({
        name: projectName,
        context_type: contextType,
        location: projectName,
        status: this.inferStatus(classification),
        pic: this.inferPIC(author),
        data: {
          monthly_cost: classification.costs || null,
          checklist: finalChecklist
        }
      });

      logger.info(`Created new project: ${project.name} [${contextType.toUpperCase()}]`);
      if (contextType === 'pre_opening') {
        logger.info(`✅ Initialized with 5-item MVP checklist`);
      }
    } else {
      // Update existing project in the same context
      const existingData = project.data || {};
      let existingChecklist = existingData.checklist || [];

      // If this is a PRE_OPENING project but has no checklist, initialize it
      if (contextType === 'pre_opening' && existingChecklist.length === 0) {
        existingChecklist = this.getStandardPreOpeningChecklist();
        logger.info(`Initializing 5-item MVP checklist for: ${project.name}`);
      }

      // Merge checklist updates
      const updatedChecklist = checklistUpdates && checklistUpdates.length > 0
        ? this.mergeChecklistUpdates(existingChecklist, checklistUpdates)
        : existingChecklist;

      // Debug: Log checklist state
      if (contextType === 'pre_opening') {
        const doneCount = updatedChecklist.filter(item => item.status === 'done').length;
        logger.info(`Checklist state: ${doneCount}/${updatedChecklist.length} items done`);
      }

      const updates = {
        name: project.name,
        context_type: contextType,
        status: this.inferStatus(classification) || project.status,
        data: {
          ...existingData,
          monthly_cost: classification.costs || existingData.monthly_cost || null,
          checklist: updatedChecklist
        }
      };

      project = await this.supabase.upsertProject(updates);
      logger.info(`Updated existing project: ${project.name} [${contextType.toUpperCase()}]`);

      if (checklistUpdates && checklistUpdates.length > 0) {
        logger.info(`✅ Updated ${checklistUpdates.length} checklist items`);
        // Log which items were marked done
        updatedChecklist.filter(item => item.status === 'done').forEach(item => {
          logger.debug(`  - ${item.item}: ${item.status}`);
        });
      }
    }

    // Log the update
    await this.supabase.logUpdate({
      project_id: project.id,
      author: author,
      update_text: text,
      message_type: 'progress',
      whatsapp_message_id: messageId
    });

    // Sync to Notion
    await this.notion.syncProject(project);

    // Send confirmation
    await this.sendUpdateConfirmation(chatContext, project, classification);
  }

  getStandardPreOpeningChecklist() {
    // Simplified 5-item MVP checklist (most critical items only)
    return [
      { item: 'Sign rental agreement', status: 'pending', phase: 'Legal' },
      { item: 'Create PT/CV (Akta pendirian)', status: 'pending', phase: 'Legal' },
      { item: 'Open bank account', status: 'pending', phase: 'Legal' },
      { item: 'Hire architect/designer', status: 'pending', phase: 'Design' },
      { item: 'Select contractor', status: 'pending', phase: 'Construction' }
    ];
  }

  /**
   * FALLBACK: Simple keyword-based parsing (FAST, RELIABLE, FREE)
   * This is the PRIMARY parser. AI is only for edge cases.
   */
  keywordParseChecklistUpdates(text) {
    const completed = [];
    const lowerText = text.toLowerCase();

    // Keyword patterns mapped to exact checklist item names
    const patterns = {
      'Sign rental agreement': ['rental', 'sewa', 'lease', 'sign rental'],
      'Create PT/CV (Akta pendirian)': ['pt', 'akta', 'cv', 'pendirian'],
      'Open bank account': ['bank', 'account', 'rekening'],
      'Hire architect/designer': ['architect', 'arsitek', 'designer', 'desainer'],
      'Select contractor': ['contractor', 'kontraktor', 'pemborong']
    };

    // Check for "done" indicators
    const isDone = /done|sudah|selesai|completed|finish/i.test(text);

    if (!isDone) {
      logger.debug('No completion keywords found, skipping checklist update');
      return [];
    }

    // Match keywords to checklist items
    for (const [item, keywords] of Object.entries(patterns)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          completed.push({ item, status: 'done' });
          logger.info(`✓ Keyword match: "${keyword}" → "${item}"`);
          break; // Only add each item once
        }
      }
    }

    return completed;
  }

  async parseChecklistUpdates(text, project) {
    // AI fallback for complex/edge cases (simplified to 5 items)
    const prompt = `Extract checklist completion from this message:

"${text}"

Known PRE-OPENING checklist items (5 critical items only):
1. Sign rental agreement
2. Create PT/CV (Akta pendirian)
3. Open bank account
4. Hire architect/designer
5. Select contractor

Extract items that are marked as done/completed. Return JSON array with exact item names:
[
  {"item": "Create PT/CV (Akta pendirian)", "status": "done"},
  {"item": "Open bank account", "status": "done"}
]

Return ONLY valid JSON array, no explanation.`;

    try {
      const response = await this.classifier.openai.chatWithRetry([
        { role: 'system', content: 'You extract checklist completions from messages. Return only JSON.' },
        { role: 'user', content: prompt }
      ]);

      // LOG RAW RESPONSE (critical for debugging)
      logger.info('AI RAW RESPONSE:', response);

      const cleaned = response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const updates = JSON.parse(cleaned);

      logger.info('AI parsed updates:', JSON.stringify(updates));

      return Array.isArray(updates) ? updates : [];
    } catch (error) {
      logger.error('AI parsing failed:', error.message);
      logger.error('Raw response was:', response || 'undefined');
      return [];
    }
  }

  mergeChecklistUpdates(existingChecklist, newUpdates) {
    // Start with existing checklist
    const merged = [...existingChecklist];

    // Update or add new items
    newUpdates.forEach(newItem => {
      const existingIndex = merged.findIndex(item =>
        item.item.toLowerCase().includes(newItem.item.toLowerCase()) ||
        newItem.item.toLowerCase().includes(item.item.toLowerCase())
      );

      if (existingIndex >= 0) {
        // Update existing item
        logger.info(`Marking checklist item as ${newItem.status}: ${merged[existingIndex].item}`);
        merged[existingIndex] = {
          ...merged[existingIndex],
          status: newItem.status,
          updated_at: new Date().toISOString()
        };
      } else {
        // Add new item
        logger.info(`Adding new checklist item: ${newItem.item} (${newItem.status})`);
        merged.push({
          ...newItem,
          updated_at: new Date().toISOString()
        });
      }
    });

    return merged;
  }

  async handleQuestion(classification, text, author, chatContext) {
    const { chat } = chatContext;
    logger.info('Handling question');

    const projectName = classification.project_name;

    // Check if user is asking for a recap/summary of all projects
    const isRecapRequest = text.toLowerCase().includes('recap') ||
                           text.toLowerCase().includes('what did you') ||
                           text.toLowerCase().includes('show me') ||
                           text.toLowerCase().includes('summary');

    if (projectName) {
      // Question about specific project - report shows current phase
      const status = await this.supabase.getProjectStatus(projectName);
      await chat.sendMessage(status);
    } else if (isRecapRequest) {
      // User wants full recap using multi-context report templates
      const recap = await this.supabase.generateRecap();
      await chat.sendMessage(recap);
    } else {
      // General question - be direct
      await chat.sendMessage('Project mana? Sebut nama project buat status check.\n\nOr type "recap" buat overview semua.');
    }
  }

  async handleBlocker(classification, text, author, chatContext) {
    const { chat } = chatContext;
    logger.info('Handling blocker');

    const projectName = classification.project_name;

    if (projectName) {
      const project = await this.supabase.getProjectByName(projectName);

      if (project) {
        await this.supabase.logUpdate({
          project_id: project.id,
          author: author,
          update_text: text,
          message_type: 'blocker'
        });

        // Assertive blocker alert
        await chat.sendMessage(
          `🚨 *BLOCKER: ${projectName}*\n\n` +
          `Issue: ${classification.key_info}\n\n` +
          `@Eka - This is blocking progress. Need your call here.`
        );
      }
    }
  }

  async handleDecision(classification, text, author, messageId, chatContext) {
    const { chat } = chatContext;
    logger.info('Handling decision');

    // Log as important update
    const projectName = classification.project_name;

    if (projectName) {
      const project = await this.supabase.getProjectByName(projectName);

      if (project) {
        await this.supabase.logUpdate({
          project_id: project.id,
          author: author,
          update_text: text,
          message_type: 'decision',
          whatsapp_message_id: messageId
        });

        // Assertive: confirm and prompt for execution
        await chat.sendMessage(
          `✅ *Decision: ${projectName}*\n\n` +
          `"${classification.key_info}"\n\n` +
          `Logged. Next step apa buat execute this?`
        );
      }
    } else {
      // Decision without project context - still log but ask for clarity
      await chat.sendMessage(
        `Decision logged, tapi project mana? Tag project name biar gw bisa track execution.`
      );
    }
  }

  async sendUpdateConfirmation(chatContext, project, classification) {
    const { chat, isPrivate, isGroup } = chatContext;

    // Generate intelligent, contextual response using AI
    const response = await this.generateIntelligentConfirmation(
      project,
      classification,
      isPrivate,
      isGroup
    );

    await chat.sendMessage(response);
  }

  async generateIntelligentConfirmation(project, classification, isPrivate, isGroup) {
    // Build context for AI
    const contextType = project.context_type || 'unknown';
    const updateText = classification.key_info;
    const projectData = project.data || {};

    // Check missing info
    const missingInfo = [];
    if (!project.pic || project.pic === 'Unassigned') missingInfo.push('PIC');
    if (!project.deadline && project.context_type === 'negotiation') missingInfo.push('deadline');
    if (!project.next_action) missingInfo.push('next action');

    const prompt = `You are Nova, an assertive project manager for APEX padel court construction company.

PROJECT: ${project.name}
PHASE: ${contextType.toUpperCase()}
UPDATE RECEIVED: "${updateText}"
CURRENT STATUS: ${project.status || 'unknown'}

${missingInfo.length > 0 ? `MISSING INFO: ${missingInfo.join(', ')}` : ''}

Generate a SHORT (2-3 sentences max), assertive confirmation message that:
1. Acknowledges what was just updated (be specific, not generic)
2. Understands the context and what naturally comes NEXT in this phase
3. Asks a pointed, specific follow-up question (not generic "what's next?")
4. Sounds like a leader who understands construction project management
5. Uses casual Indonesian/English mix when appropriate

${missingInfo.length > 0 && isGroup ? 'IMPORTANT: Demand the missing info assertively. Tag @Eka @Hendry @Win and ask who is handling this.' : ''}

EXAMPLES OF GOOD RESPONSES:
- "Rental signed and PT set up - legal foundation solid. With architect onboard, you're moving into design. Get 3 contractor bids by when?"
- "80% construction done means you're in final stretch. MEP and amenities - target completion date?"
- "Payment terms being finalized. Grace period structure looks like? And who's the local investor requirement?"

BAD RESPONSES (avoid these):
- "Great progress! Keep it up!" (too generic)
- "Next milestone apa?" (asking what's next shows you don't know the process)
- "Update received. What else?" (sounds like note-taking staff)

${isPrivate ? '\nADD AT END: Brief status summary (Phase, PIC, key data point)' : ''}

Respond in plain text, no markdown formatting except *bold* for project name.`;

    try {
      const aiResponse = await this.classifier.openai.chatWithRetry([
        { role: 'system', content: 'You are Nova, an assertive construction project manager. Be concise, specific, and show you understand the workflow.' },
        { role: 'user', content: prompt }
      ]);

      // Add context label
      const contextLabel = `[${contextType.toUpperCase()}]`;
      return `✅ ${contextLabel} *${project.name}*\n\n${aiResponse.trim()}`;
    } catch (error) {
      logger.error('Error generating intelligent confirmation:', error);

      // Fallback to simple confirmation
      return `✅ [${contextType.toUpperCase()}] *${project.name}*\n\nUpdate logged: ${updateText}\n\n${missingInfo.length > 0 ? `⚠️ Missing: ${missingInfo.join(', ')}` : 'What\'s the next critical milestone?'}`;
    }
  }

  formatProjectStatus(project) {
    let message = `📋 *${project.name}*\n\n`;
    message += `📍 Status: ${project.status || 'N/A'}\n`;
    message += `👤 PIC: ${project.pic || 'Unassigned'}\n`;

    if (project.monthly_cost) {
      message += `💰 Monthly Cost: Rp ${this.formatCurrency(project.monthly_cost)}\n`;
    }

    if (project.phase) {
      message += `🏗️ Phase: ${project.phase}\n`;
    }

    const lastUpdate = new Date(project.last_update);
    const daysAgo = Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
    message += `\n_Last update: ${daysAgo} days ago_`;

    return message;
  }

  inferStatus(classification) {
    const statusKeywords = {
      'rental': 'rental',
      'design': 'design',
      'construction': 'construction',
      'complete': 'complete',
      'done': 'complete',
      'selesai': 'complete'
    };

    for (const [keyword, status] of Object.entries(statusKeywords)) {
      if (classification.key_info.toLowerCase().includes(keyword)) {
        return status;
      }
    }

    return null;
  }

  inferPIC(author) {
    if (author.includes('Eka') || author.includes('eka')) return 'Eka';
    if (author.includes('Hendry') || author.includes('hendry')) return 'Hendry';
    if (author.includes('Win') || author.includes('win')) return 'Win';
    return null;
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID').format(amount);
  }

  isDocumentAttachment(messageText) {
    // Check if message contains file extensions
    const fileExtensions = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|zip)$/i;

    // Check if message contains document-related keywords
    const documentKeywords = [
      'lingkup kerja',
      'scope of work',
      'penawaran',
      'proposal',
      'invoice',
      'contract',
      'kontrak',
      'fee',
      'quotation',
      'surat',
      'dokumen',
      'agreement'
    ];

    const lowerText = messageText.toLowerCase();

    // Check for file extensions
    if (fileExtensions.test(messageText)) {
      logger.info(`Detected document attachment: ${messageText.substring(0, 50)}`);
      return true;
    }

    // Check for document keywords
    for (const keyword of documentKeywords) {
      if (lowerText.includes(keyword)) {
        logger.info(`Detected document keyword '${keyword}' in message`);
        return true;
      }
    }

    return false;
  }
}

module.exports = MessageHandler;
