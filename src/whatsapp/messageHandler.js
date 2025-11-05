const logger = require('../utils/logger');
const MessageClassifier = require('../ai/classifier');
const SupabaseClient = require('../database/supabase');
// const NotionSync = require('../notion/sync'); // Disabled for MVP
const EnhancedMemory = require('../memory/enhancedMemory');
const ConversationalCore = require('./conversationalCore');
const RESPONSE_PROMPT = require('../prompts/response');

class MessageHandler {
  constructor(whatsappClient, openaiClient) {
    this.whatsapp = whatsappClient;
    this.openai = openaiClient;
    this.classifier = new MessageClassifier(openaiClient);
    this.supabase = new SupabaseClient();
    // this.notion = new NotionSync(); // Disabled for MVP - focus on WhatsApp + Supabase only
    this.memory = new EnhancedMemory(this.supabase.getClient(), openaiClient);
    this.conversational = new ConversationalCore(this.supabase, openaiClient);

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
    // ENHANCED MEMORY: Load context for message understanding
    // (Recent messages + sessions + project facts)
    // ========================================
    // Get initial context without knowing project yet
    const context = await this.memory.getContextForQuery(messageText, null, chatId);
    const conversationHistory = context.recentMessages || [];
    const historicalSessions = context.recentSessions || [];
    const projectFacts = context.projectFacts || [];

    // Extract project context from conversation history for classification
    const projectContext = this.extractProjectFromHistory(conversationHistory);

    if (projectContext) {
      logger.info(`📚 Project context from history: ${projectContext.projectName} (${projectContext.mentions} mentions)`);
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

      // Still save to enhanced memory (with comprehensive extraction)
      await this.memory.saveMessage(message, chatName, isGroup ? 'GROUP' : 'PRIVATE');

      return;
    }

    // Process based on type
    const chatContext = { chat, isGroup, isPrivate, chatName, chatId };
    await this.processMessage(classification, messageText, author, message.id.id, chatContext);

    // ========================================
    // ENHANCED MEMORY: Save message with comprehensive extraction
    // (Projects, people, numbers, dates, decisions, facts - all extracted)
    // ========================================
    await this.memory.saveMessage(message, chatName, isGroup ? 'GROUP' : 'PRIVATE');
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

      // Normalize checklist format: convert object to array if needed
      if (existingChecklist && typeof existingChecklist === 'object' && !Array.isArray(existingChecklist)) {
        logger.info('Converting legacy checklist object to array format');
        existingChecklist = Object.entries(existingChecklist).map(([key, value]) => ({
          item: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          status: value ? 'done' : 'pending',
          updated_at: new Date().toISOString()
        }));
      }

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

    // Sync to Notion (Disabled for MVP)
    // await this.notion.syncProject(project);

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
    const { chat, chatId } = chatContext;
    logger.info('Handling question');

    // Load conversation context (THIS IS THE FIX!)
    const context = await this.conversational.loadConversationContext(chatId, text);

    // Generate conversational response instead of template
    const response = await this.conversational.generateResponse(
      text,
      context,
      'QUESTION'
    );

    await chat.sendMessage(response);
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
    // Build context for AI using Nova V2 prompts
    const contextType = project.context_type || 'pre_opening';
    const updateText = classification.key_info;
    const projectData = project.data || {};
    const checklist = projectData.checklist || [];

    // Calculate checklist progress for PRE_OPENING projects
    let checklistSummary = '';
    if (contextType === 'pre_opening' && checklist.length > 0) {
      const doneCount = checklist.filter(item => item.status === 'done').length;
      const totalCount = checklist.length;
      const doneItems = checklist.filter(item => item.status === 'done').map(item => `• ${item.item}`).join('\n');
      const pendingItems = checklist.filter(item => item.status === 'pending').map(item => `• ${item.item}`).join('\n');

      checklistSummary = `
CHECKLIST PROGRESS: ${doneCount}/${totalCount} items

✅ Done:
${doneItems || '(none)'}

⏳ Pending:
${pendingItems || '(all done!)'}`;
    }

    // Build user message with project context
    const userPrompt = `Current message: "${updateText}"

PROJECT CONTEXT:
- Name: ${project.name}
- Phase: ${contextType.toUpperCase()}
- Status: ${project.status || 'active'}
${checklistSummary}

Generate Nova's response to confirm this update.`;

    try {
      const aiResponse = await this.classifier.openai.chatWithRetry([
        { role: 'system', content: RESPONSE_PROMPT },
        { role: 'user', content: userPrompt }
      ], {
        temperature: 0.7,
        max_tokens: 150  // Keep responses concise (5 lines max)
      });

      // Nova V2: No context label prefix, let AI handle formatting
      return aiResponse.trim();
    } catch (error) {
      logger.error('Error generating intelligent confirmation:', error);

      // Fallback to simple Nova V2 style confirmation
      if (contextType === 'pre_opening' && checklist.length > 0) {
        const doneCount = checklist.filter(item => item.status === 'done').length;
        return `✅ ${project.name}: ${updateText}\n${doneCount}/5 complete. Next?`;
      }

      return `✅ ${project.name}\n${updateText}\nNext?`;
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

  extractProjectFromHistory(conversationHistory) {
    // Extract project mentions from recent conversation
    const projectNames = ['Manado', 'Jakarta', 'Palembang']; // TODO: get from database
    const mentions = {};

    conversationHistory.forEach(msg => {
      projectNames.forEach(project => {
        if (msg.message_text && msg.message_text.toLowerCase().includes(project.toLowerCase())) {
          mentions[project] = (mentions[project] || 0) + 1;
        }
      });
    });

    // Return most mentioned project
    const entries = Object.entries(mentions);
    if (entries.length === 0) return null;

    entries.sort((a, b) => b[1] - a[1]);
    return {
      projectName: entries[0][0],
      mentions: entries[0][1]
    };
  }
}

module.exports = MessageHandler;
