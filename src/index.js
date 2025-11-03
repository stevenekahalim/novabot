require('dotenv').config();
const express = require('express');
const logger = require('./utils/logger');
const WhatsAppClient = require('./whatsapp/client');
const OpenAIClient = require('./ai/openai');
const MessageHandler = require('./whatsapp/messageHandler');
const SupabaseClient = require('./database/supabase');

// Banner
console.log(`
╔═══════════════════════════════════════╗
║     APEX ASSISTANT v1.0.0             ║
║     WhatsApp AI Agent                 ║
║     Starting up...                    ║
╚═══════════════════════════════════════╝
`);

class ApexAssistant {
  constructor() {
    this.whatsapp = null;
    this.openai = null;
    this.messageHandler = null;
    this.healthServer = null;
    this.startTime = Date.now();
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

      logger.info('✅ APEX Assistant is running!');
      logger.info('📱 WhatsApp: Connected');
      logger.info('🤖 OpenAI: Ready');
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
      'SUPABASE_KEY'
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
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>APEX Assistant</title>
          <style>
            body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
            h1 { color: #10b981; }
            .status { padding: 10px; background: #f0f0f0; border-radius: 5px; margin: 10px 0; }
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
          <p><small>© 2025 APEX Team</small></p>
        </body>
        </html>
      `);
    });

    this.healthServer = app.listen(port, () => {
      logger.info(`✅ Health server running on port ${port}`);
    });
  }

  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      logger.info(`\n${signal} received. Shutting down gracefully...`);

      try {
        // Close WhatsApp connection
        if (this.whatsapp) {
          await this.whatsapp.destroy();
        }

        // Close health server
        if (this.healthServer) {
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
