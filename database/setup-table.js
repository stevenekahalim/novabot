require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

console.log('🗄️  Creating conversation_history table...\n');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Read SQL file
const sqlPath = path.join(__dirname, 'create-conversation-memory.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function createTable() {
  try {
    console.log('📝 Executing SQL...');

    // Execute the SQL using Supabase's RPC or direct query
    // Note: Supabase client doesn't support raw SQL execution directly
    // We need to use the SQL Editor in dashboard OR use supabase CLI

    console.log('\n⚠️  The Supabase JS client cannot execute raw SQL directly.');
    console.log('Please run this SQL in your Supabase Dashboard:\n');
    console.log('🔗 https://supabase.com/dashboard/project/rexuplchcdqfelcukryh/editor\n');
    console.log('═'.repeat(80));
    console.log(sql);
    console.log('═'.repeat(80));
    console.log('\n✅ Copy the SQL above and run it in the SQL Editor.');

    // Test connection at least
    console.log('\n🧪 Testing Supabase connection...');
    const { data, error } = await supabase.from('projects').select('id').limit(1);

    if (error) {
      console.log('❌ Supabase connection error:', error.message);
    } else {
      console.log('✅ Supabase connection successful!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTable();
