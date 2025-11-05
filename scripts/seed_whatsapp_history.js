require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Chat metadata
const CHAT_ID = '120363420201458845@g.us'; // Apex Sports Lab group ID
const CHAT_NAME = 'Apex Sports Lab';

/**
 * Parse WhatsApp export format
 * Format: [DD/MM/YY, HH.MM.SS] Sender Name: Message text
 */
function parseWhatsAppExport(filePath) {
  console.log(`📖 Reading file: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const messages = [];
  let currentMessage = null;

  // Regex to match WhatsApp message format
  const messageRegex = /^\[(\d{2}\/\d{2}\/\d{2}),\s(\d{2}\.\d{2}\.\d{2})\]\s([^:]+):\s(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) continue;

    const match = line.match(messageRegex);

    if (match) {
      // Save previous message if exists
      if (currentMessage) {
        messages.push(currentMessage);
      }

      const [, date, time, sender, messageText] = match;

      // Parse date: DD/MM/YY -> YYYY-MM-DD
      const [day, month, year] = date.split('/');
      const fullYear = `20${year}`; // Assuming 21 = 2021, etc.

      // Parse time: HH.MM.SS -> HH:MM:SS
      const formattedTime = time.replace(/\./g, ':');

      // Create ISO timestamp
      const timestamp = `${fullYear}-${month}-${day}T${formattedTime}+07:00`; // WIB timezone

      // Check if Nova is mentioned
      const mentionedNova = /(@nova|@Nova|nova|Nova)/i.test(messageText);

      // Check if it's a system message (starts with special character)
      const isSystemMessage = messageText.startsWith('‎');

      // Skip system messages
      if (isSystemMessage) {
        currentMessage = null;
        continue;
      }

      currentMessage = {
        message_text: messageText,
        sender_name: sender,
        sender_number: null, // We don't have phone numbers from export
        chat_id: CHAT_ID,
        chat_name: CHAT_NAME,
        timestamp: timestamp,
        mentioned_nova: mentionedNova,
        is_reply: false,
        replied_to_msg_id: null,
        has_media: messageText.includes('<attached:') || messageText.includes('image omitted') || messageText.includes('video omitted'),
        media_type: getMediaType(messageText)
      };
    } else if (currentMessage) {
      // Multi-line message continuation
      currentMessage.message_text += '\n' + line;
    }
  }

  // Don't forget the last message
  if (currentMessage) {
    messages.push(currentMessage);
  }

  console.log(`✅ Parsed ${messages.length} messages`);
  return messages;
}

/**
 * Detect media type from message text
 */
function getMediaType(text) {
  if (text.includes('image omitted')) return 'image';
  if (text.includes('video omitted')) return 'video';
  if (text.includes('<attached:') && text.includes('.vcf>')) return 'contact';
  if (text.includes('<attached:')) return 'document';
  return null;
}

/**
 * Insert messages in batches
 */
async function insertMessages(messages) {
  const BATCH_SIZE = 100;
  let inserted = 0;
  let errors = 0;

  console.log(`📤 Inserting ${messages.length} messages in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    try {
      const { data, error } = await supabase
        .from('messages_v3')
        .insert(batch);

      if (error) {
        console.error(`❌ Error inserting batch ${i / BATCH_SIZE + 1}:`, error.message);
        errors += batch.length;
      } else {
        inserted += batch.length;
        console.log(`✅ Inserted batch ${i / BATCH_SIZE + 1}: ${inserted}/${messages.length} messages`);
      }
    } catch (err) {
      console.error(`❌ Exception inserting batch ${i / BATCH_SIZE + 1}:`, err.message);
      errors += batch.length;
    }
  }

  console.log(`\n📊 Import Summary:`);
  console.log(`   Total messages: ${messages.length}`);
  console.log(`   Successfully inserted: ${inserted}`);
  console.log(`   Errors: ${errors}`);

  return { inserted, errors };
}

/**
 * Main function
 */
async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('❌ Usage: node seed_whatsapp_history.js <path-to-chat-export>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  console.log('🚀 Starting WhatsApp history import...\n');

  // Parse the export file
  const messages = parseWhatsAppExport(filePath);

  if (messages.length === 0) {
    console.log('⚠️  No messages found to import');
    return;
  }

  // Show sample of first message
  console.log('\n📝 Sample message:');
  console.log(JSON.stringify(messages[0], null, 2));
  console.log('\n');

  // Ask for confirmation (in production, you might want to skip this)
  console.log(`⚠️  About to insert ${messages.length} messages into messages_v3 table`);
  console.log('   Chat: ' + CHAT_NAME);
  console.log('   Date range: ' + messages[0].timestamp + ' to ' + messages[messages.length - 1].timestamp);
  console.log('\n   Press Ctrl+C to cancel, or continuing in 3 seconds...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Insert messages
  const result = await insertMessages(messages);

  console.log('\n✅ Import complete!');
  console.log(`\n📊 Stats:`);
  console.log(`   Total messages: ${messages.length}`);
  console.log(`   Inserted: ${result.inserted}`);
  console.log(`   Errors: ${result.errors}`);
  console.log(`   Mentioned Nova: ${messages.filter(m => m.mentioned_nova).length}`);
  console.log(`   Has media: ${messages.filter(m => m.has_media).length}`);

  // Verify in database
  console.log('\n🔍 Verifying database...');
  const { count, error } = await supabase
    .from('messages_v3')
    .select('*', { count: 'exact', head: true })
    .eq('chat_id', CHAT_ID);

  if (error) {
    console.error('❌ Error verifying:', error.message);
  } else {
    console.log(`✅ Database verification: ${count} messages in messages_v3 for ${CHAT_NAME}`);
  }
}

// Run the script
main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
