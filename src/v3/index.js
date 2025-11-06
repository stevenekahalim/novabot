/**
 * Nova V3 - Pure Conversational Architecture
 *
 * Philosophy:
 * - Save raw messages, let AI infer from full context
 * - No structured extraction, no classification
 * - Respond only when @mentioned or in DM
 * - Hourly notes for monitoring and medium-term context
 *
 * Changes from V2:
 * - ❌ No project_facts table (conflict-prone)
 * - ❌ No message classification (unnecessary)
 * - ❌ No per-message fact extraction (over-engineering)
 * - ✅ Simple messages_v3 table
 * - ✅ Hourly notes for monitoring and context
 * - ✅ Mention-based responses only
 */

const ContextLoader = require('./contextLoader');
const ResponseGenerator = require('./responseGenerator');
const MentionDetector = require('./mentionDetector');
const MessageHandler = require('./messageHandler');
const HourlyNotesJob = require('./hourlyNotesJob');

/**
 * Initialize V3 system
 * @param {Object} supabaseClient - Supabase client instance
 * @returns {Object} V3 handlers and jobs
 */
function initializeV3(supabaseClient) {
  const contextLoader = new ContextLoader(supabaseClient);
  const responseGenerator = new ResponseGenerator();
  const mentionDetector = new MentionDetector();
  const messageHandler = new MessageHandler(supabaseClient);
  const hourlyNotesJob = new HourlyNotesJob(supabaseClient);

  return {
    contextLoader,
    responseGenerator,
    mentionDetector,
    messageHandler,
    hourlyNotesJob,

    // Convenience methods
    async handleMessage(message, chatContext) {
      return await messageHandler.handleMessage(message, chatContext);
    },

    startJobs() {
      hourlyNotesJob.start();
    },

    stopJobs() {
      hourlyNotesJob.stop();
    }
  };
}

module.exports = {
  initializeV3,
  ContextLoader,
  ResponseGenerator,
  MentionDetector,
  MessageHandler,
  HourlyNotesJob
};
