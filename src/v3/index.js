/**
 * Nova V4 - Silent Observer Architecture
 *
 * Philosophy:
 * - Save raw messages, let AI infer from full context
 * - V4: Router (GPT-4o-mini) decides PASS/IGNORE for non-mentions
 * - V4: Nova decides SILENT/REMIND/REPLY after router passes
 * - 15-second message buffering to batch rapid-fire conversations
 * - Daily knowledge compilation for automated KB updates
 * - Proactive daily updates at 9 AM and 3:30 PM
 *
 * V4 Changes:
 * - ✅ Message buffer (15s debounce)
 * - ✅ Router (GPT-4o-mini for PASS/IGNORE decisions)
 * - ✅ Nova sees all passed messages (not just mentions)
 * - ✅ Action tags: [SILENT], [REMIND], [REPLY]
 * - ✅ Silent reminders with emoji reactions
 * - ✅ Two-identity system (Router ≠ Nova)
 */

const ContextLoader = require('./contextLoader');
const ResponseGenerator = require('./responseGenerator');
const MentionDetector = require('./mentionDetector');
const MessageHandler = require('./messageHandler');
const MessageBuffer = require('./messageBuffer');
const Router = require('./router');
const KnowledgeCompiler = require('./knowledgeCompiler');
const DailyUpdatesJob = require('./dailyUpdatesJob');
const ReminderJob = require('./reminderJob');
const ReminderManager = require('./reminderManager');

/**
 * Initialize V4 system
 * @param {Object} supabaseClient - Supabase client instance
 * @param {Object} whatsappClient - WhatsApp client instance (optional, for daily updates)
 * @returns {Object} V4 handlers and jobs
 */
function initializeV3(supabaseClient, whatsappClient = null) {
  const contextLoader = new ContextLoader(supabaseClient);
  const responseGenerator = new ResponseGenerator();
  const mentionDetector = new MentionDetector();
  const messageHandler = new MessageHandler(supabaseClient);
  const router = new Router(supabaseClient);
  const knowledgeCompiler = new KnowledgeCompiler(supabaseClient);

  // Initialize daily updates job if WhatsApp client provided
  const dailyUpdatesJob = whatsappClient
    ? new DailyUpdatesJob(supabaseClient, whatsappClient)
    : null;

  // Initialize reminder job if WhatsApp client provided
  const reminderManager = new ReminderManager(supabaseClient);
  const reminderJob = whatsappClient
    ? new ReminderJob(reminderManager, whatsappClient)
    : null;

  // V4: Initialize message buffer (15s debounce)
  // The buffer will call messageHandler.handleMessage() after the debounce period
  const messageBuffer = new MessageBuffer(
    supabaseClient,
    async (message, chatContext) => {
      return await messageHandler.handleMessage(message, chatContext);
    },
    whatsappClient // Pass WhatsApp client for sending responses/reactions
  );

  return {
    contextLoader,
    responseGenerator,
    mentionDetector,
    messageHandler,
    messageBuffer,  // V4: Expose buffer for direct access
    router,         // V4: Expose router for stats
    knowledgeCompiler,
    dailyUpdatesJob,
    reminderJob,
    reminderManager,

    // V4 Convenience method: Add message to buffer (replaces direct handleMessage)
    async handleMessage(message, chatContext) {
      // V4: Route through buffer instead of direct processing
      await messageBuffer.add(message, chatContext);
      // Note: This returns immediately (buffering)
      // Actual processing happens after 15s silence
      return { shouldReply: false, response: null, reaction: null, buffered: true };
    },

    startJobs() {
      knowledgeCompiler.start();
      if (dailyUpdatesJob) {
        dailyUpdatesJob.start();
      }
      if (reminderJob) {
        reminderJob.start();
      }
    },

    stopJobs() {
      // V4: Flush buffer before stopping
      if (messageBuffer) {
        messageBuffer.stop();
      }

      knowledgeCompiler.stop();
      if (dailyUpdatesJob) {
        dailyUpdatesJob.stop();
      }
      if (reminderJob) {
        reminderJob.stop();
      }
    }
  };
}

module.exports = {
  initializeV3,
  ContextLoader,
  ResponseGenerator,
  MentionDetector,
  MessageHandler,
  MessageBuffer,  // V4: Export buffer
  Router,         // V4: Export router
  KnowledgeCompiler,
  DailyUpdatesJob,
  ReminderJob,
  ReminderManager
};
