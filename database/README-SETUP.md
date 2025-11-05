# Setting Up Conversation Memory Table

## Method 1: Via Supabase Dashboard (RECOMMENDED)

1. Go to https://supabase.com/dashboard/project/rexuplchcdqfelcukryh/editor
2. Click "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy and paste the entire contents of `create-conversation-memory.sql`
5. Click "Run" or press `Cmd/Ctrl + Enter`
6. Verify the table was created by going to "Table Editor" → check for "conversation_history"

## Method 2: Via Node.js Script (On Server)

```bash
# SSH into the server
ssh root@157.245.206.68

# Navigate to project
cd ~/apex-assistant

# Run the setup script
node database/setup-conversation-memory-direct.js
```

## Verification

After creating the table, verify it works:

```bash
# On server
cd ~/apex-assistant
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
  const { data, error } = await supabase.from('conversation_history').select('*').limit(1);
  if (error) {
    console.log('❌ Error:', error.message);
  } else {
    console.log('✅ Table exists and is accessible!');
  }
})();
"
```

## Table Schema

- **id**: UUID primary key
- **chat_id**: WhatsApp chat ID (group or private)
- **chat_name**: Human-readable chat name
- **chat_type**: 'GROUP' or 'PRIVATE'
- **message_timestamp**: When message was sent
- **message_text**: Message content
- **message_author**: Who sent it
- **mentioned_project**: Extracted project name (if any)
- **classification_type**: Message classification
- **expires_at**: When conversation context expires (30 min TTL)
- **created_at**: Record creation timestamp

## Features

- **30-minute TTL**: Messages expire after 30 minutes of inactivity
- **Automatic cleanup**: Use `cleanup_expired_conversations()` function to remove old data
- **Indexed queries**: Optimized for fast conversation history retrieval
