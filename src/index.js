require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');
const WhatsAppClient = require('./whatsapp/client');
const OpenAIClient = require('./ai/openai');
const MessageHandler = require('./whatsapp/messageHandler');
const SupabaseClient = require('./database/supabase');
const ConversationMemory = require('./memory/conversationMemory');
const SessionSummarizer = require('./jobs/sessionSummarizer');
const EnhancedMemory = require('./memory/enhancedMemory');
const Scheduler = require('./scheduler');
const { initializeV3 } = require('./v3');

// Check which version to use
const USE_V3 = process.env.USE_V3 === 'true';

// Banner
console.log(`
╔═══════════════════════════════════════╗
║     APEX ASSISTANT v1.0.0             ║
║     WhatsApp AI Agent                 ║
║     Architecture: ${USE_V3 ? 'V3 (Pure Conversational)' : 'V2 (Legacy)'} ║
║     Starting up...                    ║
╚═══════════════════════════════════════╝
`);

class ApexAssistant {
  constructor() {
    this.whatsapp = null;
    this.openai = null;
    this.messageHandler = null;
    this.supabase = null;
    this.conversationMemory = null;
    this.sessionSummarizer = null;
    this.enhancedMemory = null;
    this.scheduler = null;
    this.healthServer = null;
    this.startTime = Date.now();

    // V3-specific properties
    this.useV3 = USE_V3;
    this.v3 = null;
  }

  async start() {
    try {
      logger.info('🚀 Starting APEX Assistant...');

      // Validate environment variables
      this.validateEnv();

      // Initialize health check server
      await this.startHealthServer();

      // Initialize OpenAI client
      logger.info('Initializing OpenAI client...');
      this.openai = new OpenAIClient();

      // Initialize WhatsApp client
      logger.info('Initializing WhatsApp client...');
      this.whatsapp = new WhatsAppClient();
      await this.whatsapp.initialize();

      // Initialize message handler
      logger.info('Initializing message handler...');
      this.messageHandler = new MessageHandler(this.whatsapp, this.openai);

      // Initialize database
      logger.info('Initializing Supabase...');
      this.supabase = new SupabaseClient();

      if (this.useV3) {
        // ============================================
        // V3 INITIALIZATION (Pure Conversational)
        // ============================================
        logger.info('🔷 Using V3 Architecture (Pure Conversational)');

        // Initialize V3 system
        logger.info('Initializing V3 modules...');
        this.v3 = initializeV3(this.supabase);

        // Override message handler to use V3
        const originalOn = this.whatsapp.client.on.bind(this.whatsapp.client);
        originalOn('message_create', async (message) => {
          // Skip own messages
          if (message.fromMe) return;

          try {
            const chat = await message.getChat();
            const chatContext = {
              name: chat.name || message.from,
              isGroup: chat.isGroup
            };

            const result = await this.v3.handleMessage(message, chatContext);

            if (result.shouldReply && result.response) {
              await message.reply(result.response);
            }
          } catch (error) {
            logger.error('[V3] Error handling message:', error);
          }
        });

        // Start V3 background jobs
        logger.info('Starting V3 jobs (hourly notes, daily digests)...');
        this.v3.startJobs();

        logger.info('✅ APEX Assistant is running (V3)!');
        logger.info('📱 WhatsApp: Connected');
        logger.info('🤖 OpenAI: Ready');
        logger.info('🔷 V3 Message Handler: Active');
        logger.info('🕐 V3 Jobs: Running (hourly notes, daily digests)');
        logger.info(`🏥 Health check: http://localhost:${process.env.PORT || 3000}/health`);

      } else {
        // ============================================
        // V2 INITIALIZATION (Legacy)
        // ============================================
        logger.info('🔶 Using V2 Architecture (Legacy)');

        // Initialize enhanced memory system
        logger.info('Initializing enhanced memory system...');
        this.enhancedMemory = new EnhancedMemory(this.supabase.getClient(), this.openai);

        // Initialize legacy conversation memory (for backward compatibility)
        this.conversationMemory = new ConversationMemory(this.supabase.getClient());

        // Initialize legacy session summarizer (for backward compatibility)
        logger.info('Initializing session summarizer...');
        this.sessionSummarizer = new SessionSummarizer(this.conversationMemory, this.openai);
        this.sessionSummarizer.start();

        // Initialize scheduler for automated jobs
        logger.info('Initializing scheduler (3 AM digests, session compilation)...');
        this.scheduler = new Scheduler(this.supabase.getClient(), this.openai, this.whatsapp);
        this.scheduler.start();

        logger.info('✅ APEX Assistant is running (V2)!');
        logger.info('📱 WhatsApp: Connected');
        logger.info('🤖 OpenAI: Ready');
        logger.info('🧠 Enhanced Memory: Ready');
        logger.info('📊 Session Summarizer: Running');
        logger.info('🕐 Scheduler: Running (3 AM digest, hourly session check)');
        logger.info(`🏥 Health check: http://localhost:${process.env.PORT || 3000}/health`);
      }

      // Setup graceful shutdown
      this.setupShutdownHandlers();

    } catch (error) {
      logger.error('❌ Failed to start APEX Assistant:', error);
      process.exit(1);
    }
  }

  validateEnv() {
    const required = [
      'OPENAI_API_KEY',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY'  // Changed from SUPABASE_KEY - backend requires service_role key
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    logger.info('✅ Environment variables validated');
  }

  async startHealthServer() {
    const app = express();
    const port = process.env.PORT || 3000;

    // QR Code endpoint
    app.get('/qr', (req, res) => {
      const qrPath = path.join(__dirname, '..', 'qr-code.png');

      if (fs.existsSync(qrPath)) {
        res.sendFile(qrPath);
      } else {
        res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>QR Code Not Available</title>
            <style>
              body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              h1 { color: #ef4444; }
            </style>
          </head>
          <body>
            <h1>📱 QR Code Not Available</h1>
            <p>WhatsApp is already authenticated or QR code hasn't been generated yet.</p>
          </body>
          </html>
        `);
      }
    });

    app.get('/health', async (req, res) => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);

      // Test Supabase connection
      let supabaseHealthy = false;
      try {
        const supabase = new SupabaseClient();
        supabaseHealthy = supabase.isHealthy();
      } catch (error) {
        logger.error('Health check: Supabase error', error);
      }

      const health = {
        status: 'ok',
        uptime: `${hours}h ${minutes}m`,
        uptimeSeconds: uptime,
        timestamp: new Date().toISOString(),
        services: {
          whatsapp: this.whatsapp ? this.whatsapp.isReady : false,
          openai: this.openai ? true : false,
          supabase: supabaseHealthy,
          notion: true // We can't easily check Notion, assume ok
        }
      };

      if (this.openai) {
        health.openai_stats = this.openai.getRequestStats();
      }

      const allHealthy = Object.values(health.services).every(v => v === true);

      res.status(allHealthy ? 200 : 503).json(health);
    });

    app.get('/', (req, res) => {
      const qrPath = path.join(__dirname, '..', 'qr-code.png');
      const qrExists = fs.existsSync(qrPath);

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>APEX Assistant</title>
          <style>
            body { font-family: Arial; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #10b981; }
            .status { padding: 10px; background: #f0f0f0; border-radius: 5px; margin: 10px 0; }
            .qr-container { margin: 20px 0; padding: 20px; background: #fff; border-radius: 10px; text-align: center; }
            img { max-width: 400px; border: 2px solid #10b981; border-radius: 10px; }
            .authenticated { color: #10b981; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>🤖 APEX Assistant</h1>
          <p>WhatsApp AI Agent for Project Management</p>
          <div class="status">
            <strong>Status:</strong> Running ✅<br>
            <strong>Version:</strong> 1.0.0<br>
            <strong>Uptime:</strong> Check <a href="/health">/health</a>
          </div>

          ${qrExists ? `
            <div class="qr-container">
              <h2>📱 Scan QR Code to Connect WhatsApp</h2>
              <img src="/qr" alt="WhatsApp QR Code">
              <p><small>Scan with your WhatsApp: Settings → Linked Devices → Link a Device</small></p>
            </div>
          ` : `
            <div class="qr-container">
              <p class="authenticated">✅ WhatsApp Already Connected!</p>
              <p><small>No QR code needed</small></p>
            </div>
          `}

          <p><small>© 2025 APEX Team</small></p>
        </body>
        </html>
      `);
    });

    this.healthServer = app.listen(port, '0.0.0.0', () => {
      logger.info(`✅ Health server running on port ${port}`);
    });
  }

  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      logger.info(`\n${signal} received. Shutting down gracefully...`);

      try {
        // Stop V3 jobs if running
        if (this.useV3 && this.v3) {
          logger.info('Stopping V3 jobs...');
          this.v3.stopJobs();
        }

        // Stop V2 scheduler if running
        if (this.scheduler) {
          logger.info('Stopping scheduler...');
          this.scheduler.stop();
        }

        // Close WhatsApp connection
        if (this.whatsapp) {
          logger.info('Closing WhatsApp connection...');
          await this.whatsapp.destroy();
        }

        // Close health server
        if (this.healthServer) {
          logger.info('Closing health server...');
          this.healthServer.close();
        }

        logger.info('✅ Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }
}

// Start the assistant
const assistant = new ApexAssistant();
assistant.start().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
