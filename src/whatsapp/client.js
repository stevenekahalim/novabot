const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class WhatsAppClient {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.targetGroupId = null;
    this.latestQR = null;
  }

  async initialize() {
    logger.info('Initializing WhatsApp client...');

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: process.env.WHATSAPP_SESSION_PATH || './whatsapp-session'
      }),
      puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium-browser',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    this.setupEventHandlers();

    try {
      await this.client.initialize();
      logger.info('WhatsApp client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize WhatsApp client:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    // QR Code generation
    this.client.on('qr', async (qr) => {
      this.latestQR = qr;
      logger.info('QR Code received. Scan with your phone:');

      // Show in terminal
      qrcodeTerminal.generate(qr, { small: true });
      console.log('\n📱 Scan the QR code above with your WhatsApp');

      // Save as PNG image
      try {
        const qrPath = path.join(__dirname, '../..', 'qr-code.png');
        await QRCode.toFile(qrPath, qr, {
          width: 400,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        logger.info(`✅ QR code saved to ${qrPath}`);
        logger.info('🌐 View QR code at: http://157.245.206.68:3000/qr');
      } catch (error) {
        logger.error('Error saving QR code image:', error);
      }
    });

    // Authentication
    this.client.on('authenticated', () => {
      logger.info('✅ WhatsApp authenticated successfully');
      this.latestQR = null; // Clear QR after auth

      // Remove QR file
      try {
        const qrPath = path.join(__dirname, '../..', 'qr-code.png');
        if (fs.existsSync(qrPath)) {
          fs.unlinkSync(qrPath);
        }
      } catch (error) {
        logger.error('Error removing QR file:', error);
      }
    });

    this.client.on('auth_failure', (msg) => {
      logger.error('❌ Authentication failed:', msg);
    });

    // Ready state
    this.client.on('ready', async () => {
      this.isReady = true;
      logger.info('✅ WhatsApp client is ready!');

      // Find target group
      await this.findTargetGroup();
    });

    // Disconnection handling
    this.client.on('disconnected', (reason) => {
      logger.warn('WhatsApp disconnected:', reason);
      this.isReady = false;
      this.reconnect();
    });

    // Loading state
    this.client.on('loading_screen', (percent, message) => {
      logger.info(`Loading WhatsApp... ${percent}%`);
    });
  }

  async findTargetGroup() {
    try {
      const chats = await this.client.getChats();
      const targetGroupName = process.env.TARGET_GROUP_NAME || 'APEX';

      // Find the target group (case-insensitive partial match)
      const targetGroup = chats.find(chat =>
        chat.isGroup &&
        chat.name.toLowerCase().includes(targetGroupName.toLowerCase())
      );

      if (targetGroup) {
        this.targetGroupId = targetGroup.id._serialized;
        logger.info(`✅ Found target group: "${targetGroup.name}" (${this.targetGroupId})`);
      } else {
        logger.warn(`⚠️  Target group not found (searching for: "${targetGroupName}")`);
        logger.info('Available groups:');
        chats.filter(chat => chat.isGroup).forEach(chat => {
          logger.info(`  - ${chat.name}`);
        });
      }
    } catch (error) {
      logger.error('Error finding target group:', error);
    }
  }

  async reconnect() {
    logger.info('Attempting to reconnect...');

    // Exponential backoff
    let delay = 5000; // Start with 5 seconds
    const maxDelay = 300000; // Max 5 minutes

    const attemptReconnect = async (attempt = 1) => {
      try {
        logger.info(`Reconnection attempt ${attempt}...`);
        await this.client.destroy();
        await this.initialize();
      } catch (error) {
        logger.error(`Reconnection attempt ${attempt} failed:`, error);

        delay = Math.min(delay * 2, maxDelay);
        logger.info(`Waiting ${delay/1000}s before next attempt...`);

        setTimeout(() => attemptReconnect(attempt + 1), delay);
      }
    };

    setTimeout(() => attemptReconnect(), delay);
  }

  async sendMessage(chatId, message) {
    try {
      if (!this.isReady) {
        logger.warn('WhatsApp client not ready, queueing message');
        // TODO: Implement message queue
        return false;
      }

      await this.client.sendMessage(chatId, message);
      logger.info(`Message sent to ${chatId}`);
      return true;
    } catch (error) {
      logger.error('Error sending message:', error);
      return false;
    }
  }

  async sendToTargetGroup(message) {
    if (!this.targetGroupId) {
      logger.error('Target group not set, cannot send message');
      return false;
    }

    return await this.sendMessage(this.targetGroupId, message);
  }

  isTargetGroup(chatId) {
    return this.targetGroupId && chatId === this.targetGroupId;
  }

  getClient() {
    return this.client;
  }

  async destroy() {
    logger.info('Destroying WhatsApp client...');
    await this.client.destroy();
    this.isReady = false;
  }
}

module.exports = WhatsAppClient;
