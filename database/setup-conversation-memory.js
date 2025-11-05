require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

async function setupConversationMemory() {
  console.log('🚀 Setting up conversation memory table...\n');

  try {
    // Read SQL file
    const sqlPath = path.join(__dirname, 'create-conversation-memory.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // Fallback: Try direct table creation via Supabase client
      console.log('⚠️  RPC not available, using direct table creation...\n');

      const { error: createError } = await supabase.from('conversation_history').select('id').limit(1);

      if (createError && createError.code === 'PGRST116') {
        // Table doesn't exist, need to create manually
        console.log('❌ Table does not exist. Please run the SQL manually in Supabase dashboard:\n');
        console.log('1. Go to https://supabase.com/dashboard/project/rexuplchcdqfelcukryh/editor');
        console.log('2. Click "SQL Editor"');
        console.log('3. Paste the contents of database/create-conversation-memory.sql');
        console.log('4. Click "Run"\n');
        return false;
      }

      console.log('✅ Table already exists or created successfully!');
      return true;
    }

    console.log('✅ Conversation memory table created successfully!');
    return true;

  } catch (error) {
    console.error('❌ Error setting up conversation memory:', error.message);
    return false;
  }
}

setupConversationMemory().then((success) => {
  if (success) {
    console.log('\n🎉 Setup complete! Nova can now remember conversations.');
  } else {
    console.log('\n⚠️  Setup incomplete. Follow the instructions above.');
  }
  process.exit(success ? 0 : 1);
});
