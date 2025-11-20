/**
 * Analysis script to compare Nov 6, 2025 raw messages vs recap Entry #152
 * Identifies what information was missed during knowledge compilation
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const GROUP_CHAT_ID = '120363420201458845@g.us';

async function analyzeNov6Gap() {
  console.log('='.repeat(80));
  console.log('ANALYSIS: Nov 6, 2025 - Raw Messages vs Recap Entry #152');
  console.log('='.repeat(80));
  console.log();

  // 1. Fetch Nov 6, 2025 raw messages (00:00 - 23:59 WIB = Nov 5 17:00 UTC to Nov 6 16:59:59 UTC)
  const startTime = new Date('2025-11-05T17:00:00.000Z'); // Nov 6 00:00 WIB
  const endTime = new Date('2025-11-06T16:59:59.999Z');   // Nov 6 23:59:59 WIB

  console.log(`Fetching messages from ${startTime.toISOString()} to ${endTime.toISOString()}`);
  console.log(`(Nov 6, 2025 00:00 - 23:59 WIB)\n`);

  const { data: messages, error: messagesError } = await supabase
    .from('messages_v3')
    .select('*')
    .eq('chat_id', GROUP_CHAT_ID)
    .gte('timestamp', startTime.toISOString())
    .lte('timestamp', endTime.toISOString())
    .order('timestamp', { ascending: true });

  if (messagesError) {
    console.error('Error fetching messages:', messagesError);
    return;
  }

  console.log(`✓ Found ${messages.length} raw messages\n`);

  // 2. Fetch Entry #152 (the recap)
  const { data: recap, error: recapError } = await supabase
    .from('knowledge_base')
    .select('*')
    .eq('id', 152)
    .single();

  if (recapError) {
    console.error('Error fetching recap:', recapError);
    return;
  }

  console.log('✓ Found Entry #152 (Recap)\n');
  console.log('='.repeat(80));
  console.log('RECAP ENTRY #152');
  console.log('='.repeat(80));
  console.log(`Date: ${recap.date}`);
  console.log(`Topic: ${recap.topic}`);
  console.log(`Tags: ${recap.tags}`);
  console.log('\nContent:');
  console.log(recap.content);
  console.log('\n');

  // 3. Display all raw messages
  console.log('='.repeat(80));
  console.log(`RAW MESSAGES (${messages.length} total)`);
  console.log('='.repeat(80));
  console.log();

  messages.forEach((msg, index) => {
    const time = new Date(msg.timestamp).toLocaleString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    console.log(`[${index + 1}] [${time}] ${msg.sender_name}:`);
    console.log(`    ${msg.message_text}`);
    console.log();
  });

  // 4. Save to JSON for detailed analysis
  const analysis = {
    recap: recap,
    rawMessages: messages,
    metadata: {
      messageCount: messages.length,
      timeRange: {
        start: startTime.toISOString(),
        end: endTime.toISOString()
      }
    }
  };

  const fs = require('fs');
  const outputPath = '/Users/stevenekahalim/apex-assistant/scripts/nov6-analysis.json';
  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
  console.log('='.repeat(80));
  console.log(`✓ Full data saved to: ${outputPath}`);
  console.log('='.repeat(80));
}

analyzeNov6Gap().catch(console.error);
