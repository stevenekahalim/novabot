require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function getTodayMessages() {
  const start = '2025-11-20T00:00:00+07:00';
  const end = '2025-11-20T23:59:59+07:00';

  const { data: messages, error } = await supabase
    .from('messages_v3')
    .select('*')
    .eq('chat_id', '120363420201458845@g.us')
    .gte('timestamp', start)
    .lte('timestamp', end)
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('📅 CONVERSATION: Nov 20, 2025 (Today)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Total messages:', messages.length);
  console.log('');

  messages.forEach(msg => {
    const time = new Date(msg.timestamp).toLocaleTimeString('en-US', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    console.log(`[${time}] ${msg.sender_name}:`);
    console.log(`   ${msg.message_text}`);
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════════════');
}

getTodayMessages().catch(console.error);
