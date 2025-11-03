const logger = require('../utils/logger');
const MessageClassifier = require('../ai/classifier');
const SupabaseClient = require('../database/supabase');
const NotionSync = require('../notion/sync');

class MessageHandler {
  constructor(whatsappClient, openaiClient) {
    this.whatsapp = whatsappClient;
    this.classifier = new MessageClassifier(openaiClient);
    this.supabase = new SupabaseClient();
    this.notion = new NotionSync();

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

    // Log incoming message
    logger.info(`Message from ${author} in ${chat.name}: ${message.body.substring(0, 50)}...`);

    // Filter: Only process messages from target group
    if (!this.whatsapp.isTargetGroup(chat.id._serialized)) {
      logger.debug('Message not from target group, ignoring');
      return;
    }

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

    // Filter: Ignore very short messages (likely casual)
    if (messageText.length < 10) {
      logger.debug('Message too short, likely casual');
      return;
    }

    // Classify the message
    const classification = await this.classifier.classifyMessage(messageText, author);

    logger.info(`Classification: ${classification.type} (confidence: ${classification.confidence})`);

    // Only process non-casual messages with good confidence
    if (!this.classifier.shouldProcess(classification)) {
      logger.debug('Message classified as casual or low confidence, skipping');
      return;
    }

    // Process based on type
    await this.processMessage(classification, messageText, author, message.id.id, chat);
  }

  async processMessage(classification, text, author, messageId, chat) {
    try {
      switch (classification.type) {
        case 'PROJECT_UPDATE':
          await this.handleProjectUpdate(classification, text, author, messageId, chat);
          break;

        case 'QUESTION':
          await this.handleQuestion(classification, text, author, chat);
          break;

        case 'BLOCKER':
          await this.handleBlocker(classification, text, author, chat);
          break;

        case 'DECISION':
          await this.handleDecision(classification, text, author, messageId, chat);
          break;

        default:
          logger.debug(`Unhandled message type: ${classification.type}`);
      }
    } catch (error) {
      logger.error('Error processing message:', error);

      // Send error notification to group
      await chat.sendMessage('⚠️  Maaf, ada error processing message. Silakan coba lagi atau tag @Eka');
    }
  }

  async handleProjectUpdate(classification, text, author, messageId, chat) {
    logger.info('Handling project update');

    const projectName = classification.project_name;

    if (!projectName) {
      logger.warn('No project name found in update');
      await chat.sendMessage('📝 Update noted, tapi project mana ya? Tolong mention nama lokasi/project');
      return;
    }

    // Get or create project
    let project = await this.supabase.getProjectByName(projectName);

    if (!project) {
      // Create new project
      project = await this.supabase.upsertProject({
        name: projectName,
        location: projectName,
        status: this.inferStatus(classification),
        pic: this.inferPIC(author),
        monthly_cost: classification.costs || null
      });

      logger.info(`Created new project: ${project.name}`);
    } else {
      // Update existing project
      const updates = {
        name: project.name,
        status: this.inferStatus(classification) || project.status,
        last_update: new Date().toISOString()
      };

      if (classification.costs) {
        updates.monthly_cost = classification.costs;
      }

      project = await this.supabase.upsertProject(updates);
      logger.info(`Updated existing project: ${project.name}`);
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
    await this.sendUpdateConfirmation(chat, project, classification);
  }

  async handleQuestion(classification, text, author, chat) {
    logger.info('Handling question');

    const projectName = classification.project_name;

    if (projectName) {
      // Question about specific project
      const project = await this.supabase.getProjectByName(projectName);

      if (project) {
        const response = this.formatProjectStatus(project);
        await chat.sendMessage(response);
      } else {
        await chat.sendMessage(`🤔 Project "${projectName}" belum ada di database. Mungkin typo?`);
      }
    } else {
      // General question - provide summary
      await chat.sendMessage('📊 For project status, mention nama project ya. Or type "summary" for overview');
    }
  }

  async handleBlocker(classification, text, author, chat) {
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

        // Alert team
        await chat.sendMessage(`⚠️  BLOCKER: ${projectName}\n${classification.key_info}\n\n@Eka FYI`);
      }
    }
  }

  async handleDecision(classification, text, author, messageId, chat) {
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

        await chat.sendMessage(`✅ Decision logged: ${projectName}\n"${classification.key_info}"`);
      }
    }
  }

  async sendUpdateConfirmation(chat, project, classification) {
    let message = `✅ Updated: *${project.name}*\n`;

    if (classification.costs) {
      message += `💰 Cost: Rp ${this.formatCurrency(classification.costs)}\n`;
    }

    if (classification.percentage) {
      message += `📊 Progress: ${classification.percentage}%\n`;
    }

    if (project.status) {
      message += `📍 Status: ${project.status}\n`;
    }

    message += `\n_Last update: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}_`;

    await chat.sendMessage(message);
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
}

module.exports = MessageHandler;
