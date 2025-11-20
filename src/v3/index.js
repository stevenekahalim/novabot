/**
 * Nova V3 - Pure Conversational Architecture
 *
 * Philosophy:
 * - Save raw messages, let AI infer from full context
 * - No structured extraction, no classification
 * - Respond only when @mentioned or in DM
 * - Daily knowledge compilation for automated KB updates
 * - Proactive daily updates at 9 AM and 3:30 PM
 *
 * Changes from V2:
 * - ❌ No project_facts table (conflict-prone)
 * - ❌ No message classification (unnecessary)
 * - ❌ No per-message fact extraction (over-engineering)
 * - ❌ No hourly summaries (simplified)
 * - ✅ Simple messages_v3 table (raw daily messages)
 * - ✅ Knowledge base (compressed historical context)
 * - ✅ Mention-based responses only
 * - ✅ Automated knowledge base compilation (midnight daily)
 * - ✅ Proactive team updates (9 AM & 3:30 PM)
 */

const ContextLoader = require('./contextLoader');
const ResponseGenerator = require('./responseGenerator');
const MentionDetector = require('./mentionDetector');
const MessageHandler = require('./messageHandler');
const KnowledgeCompiler = require('./knowledgeCompiler');
const DailyUpdatesJob = require('./dailyUpdatesJob');
const ReminderJob = require('./reminderJob');
const ReminderManager = require('./reminderManager');

/**
 * Initialize V3 system
 * @param {Object} supabaseClient - Supabase client instance
 * @param {Object} whatsappClient - WhatsApp client instance (optional, for daily updates)
 * @returns {Object} V3 handlers and jobs
 */
function initializeV3(supabaseClient, whatsappClient = null) {
  const contextLoader = new ContextLoader(supabaseClient);
  const responseGenerator = new ResponseGenerator();
  const mentionDetector = new MentionDetector();
  const messageHandler = new MessageHandler(supabaseClient);
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

  return {
    contextLoader,
    responseGenerator,
    mentionDetector,
    messageHandler,
    knowledgeCompiler,
    dailyUpdatesJob,
    reminderJob,
    reminderManager,

    // Convenience methods
    async handleMessage(message, chatContext) {
      return await messageHandler.handleMessage(message, chatContext);
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
  KnowledgeCompiler,
  DailyUpdatesJob,
  ReminderJob,
  ReminderManager
};
