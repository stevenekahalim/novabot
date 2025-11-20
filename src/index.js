require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');

// Core modules
const WhatsAppClient = require('./whatsapp/client');
const OpenAIClient = require('./ai/openai');
const SupabaseClient = require('./database/supabase');

// V3 Architecture (Pure Conversational)
const { initializeV3 } = require('./v3');

// Banner
console.log(`
╔═══════════════════════════════════════╗
║     APEX ASSISTANT v1.0.0             ║
║     WhatsApp AI Agent                 ║
║     Architecture: V4 (Silent Observer) ║
║     Starting up...                    ║
╚═══════════════════════════════════════╝
`);

class ApexAssistant {
  constructor() {
    this.whatsapp = null;
    this.openai = null;
    this.supabase = null;
    this.v3 = null;
    this.healthServer = null;
    this.startTime = Date.now();
  }

  async start() {
    try {
      logger.info('🚀 Starting APEX Assistant...');

      // Validate environment variables
      this.validateEnv();

      // Initialize database FIRST (needed for metrics)
      logger.info('Initializing Supabase...');
      this.supabase = new SupabaseClient();

      // Initialize health check server (now has Supabase available)
      await this.startHealthServer();

      // Initialize OpenAI client
      logger.info('Initializing OpenAI client...');
      this.openai = new OpenAIClient();

      // Initialize WhatsApp client
      logger.info('Initializing WhatsApp client...');
      this.whatsapp = new WhatsAppClient();
      await this.whatsapp.initialize();

      // Update global references for metrics
      global.whatsappClient = this.whatsapp;

      // ============================================
      // V4 INITIALIZATION (Silent Observer)
      // ============================================
      logger.info('🔷 Using V4 Architecture (Silent Observer)');

      // Initialize V4 system with WhatsApp client for daily updates
      logger.info('Initializing V4 modules...');
      this.v3 = initializeV3(this.supabase, this.whatsapp.client);

      // Setup V4 message handler (with buffer + router)
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

          // V4: Add to buffer (async, returns immediately)
          await this.v3.handleMessage(message, chatContext);

          // Note: Actual processing happens in messageBuffer after 15s debounce
          // The buffer's processCallback will call messageHandler.handleMessage()
          // which returns { shouldReply, response, reaction }

        } catch (error) {
          logger.error('[V4] Error handling message:', error);
        }
      });

      // Start V4 background jobs
      logger.info('Starting V4 jobs (knowledge compilation + daily updates + reminders)...');
      this.v3.startJobs();

      // Make dailyUpdates accessible to trigger API routes
      this.healthServer.app.locals.dailyUpdates = this.v3.dailyUpdatesJob;

      logger.info('✅ APEX Assistant is running (V4)!');
      logger.info('📱 WhatsApp: Connected');
      logger.info('🤖 AI Models: OpenAI (Router: GPT-4o-mini, Compiler: GPT-4) + Anthropic (Nova: Sonnet 4.5)');
      logger.info('🔷 V4 Silent Observer: Active (15s buffer + Router + Nova)');
      logger.info('🕐 V4 Jobs: Running (midnight WIB compilation + 9 AM/3:30 PM WIB updates + reminders)');
      logger.info('🌏 Timezone: All jobs run on Indonesia WIB (UTC+7)');
      logger.info(`🏥 Health check: http://localhost:${process.env.PORT || 3000}/health`);

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
      'SUPABASE_SERVICE_KEY'
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

    // Store supabase client in app locals for metrics routes
    app.locals.supabase = this.supabase;

    // Store startTime globally for metrics
    global.startTime = this.startTime;
    global.whatsappClient = this.whatsapp;

    // Serve static files from public directory
    app.use(express.static(path.join(__dirname, '..', 'public')));

    // Metrics API routes
    const metricsRoutes = require('./routes/metrics');
    app.use('/api/metrics', metricsRoutes);

    // Trigger routes for manual daily updates
    const triggerRoutes = require('./routes/triggers');
    app.use('/api/trigger', triggerRoutes);

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
        architecture: 'V4 (Silent Observer)',
        services: {
          whatsapp: this.whatsapp ? this.whatsapp.isReady : false,
          openai: this.openai ? true : false,
          supabase: supabaseHealthy
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
          <title>APEX Assistant V4</title>
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
          <h1>🤖 APEX Assistant V4</h1>
          <p>WhatsApp AI Agent - Silent Observer Architecture</p>
          <div class="status">
            <strong>Status:</strong> Running ✅<br>
            <strong>Version:</strong> 1.0.0 (V4)<br>
            <strong>Architecture:</strong> Silent Observer (Router + Buffer + Nova)<br>
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

    // Store app reference for later use
    this.healthServer.app = app;
  }

  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      logger.info(`\n${signal} received. Shutting down gracefully...`);

      try {
        // Stop V3 jobs
        if (this.v3) {
          logger.info('Stopping V3 jobs...');
          this.v3.stopJobs();
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
