require('dotenv').config();
const SupabaseClient = require('./src/database/supabase');
const DailyUpdatesJob = require('./src/v3/dailyUpdatesJob');

async function testMorningUpdate() {
  console.log('🧪 Testing Morning Update with Midnight Recap...\n');

  const supabaseClient = new SupabaseClient();

  // Create a mock WhatsApp client (won't actually send)
  const mockWhatsApp = {
    sendMessage: async (chatId, message) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📨 MORNING UPDATE OUTPUT:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(message);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return Promise.resolve();
    }
  };

  const dailyUpdates = new DailyUpdatesJob(supabaseClient, mockWhatsApp);

  // Manually trigger morning update
  await dailyUpdates.sendMorningUpdate();

  console.log('\n✅ Test complete!');
  console.log('Check the output above to verify midnight recap appears.');
}

testMorningUpdate().catch(console.error);
