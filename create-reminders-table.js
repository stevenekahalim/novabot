require('dotenv').config();
const SupabaseClient = require('./src/database/supabase');

async function createRemindersTable() {
  console.log('🚀 Creating reminders table in Supabase...');
  console.log('');

  const supabaseClient = new SupabaseClient();
  const supabase = supabaseClient.getClient();

  // We'll create the table by trying to insert a test record, which will let us know if the table exists
  // But first, let's use a SQL execution approach via HTTP

  const { Client } = require('pg');

  // Use the Supabase connection pooler
  const projectRef = process.env.SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];

  const client = new Client({
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: `postgres.${projectRef}`,
    password: process.env.SUPABASE_SERVICE_KEY,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!');
    console.log('');

    // Create table
    console.log('📋 Creating reminders table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        assigned_to TEXT NOT NULL,
        reminder_date DATE NOT NULL,
        reminder_time TIME DEFAULT '09:00:00',
        message TEXT NOT NULL,
        created_by TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        sent_at TIMESTAMPTZ
      )
    `);
    console.log('✅ Table created');

    // Create indexes
    console.log('📊 Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reminders_status_date ON reminders(status, reminder_date)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reminders_assigned_to ON reminders(assigned_to)
    `);
    console.log('✅ Indexes created');

    // Add comment
    await client.query(`
      COMMENT ON TABLE reminders IS 'Stores reminder requests for Nova AI assistant'
    `);

    console.log('');
    console.log('🎉 Reminders table created successfully!');
    console.log('');

    // Verify structure
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'reminders'
      ORDER BY ordinal_position
    `);

    console.log('📋 Table structure:');
    console.log('═══════════════════════════════════════════════════════════');
    result.rows.forEach(row => {
      const nullable = row.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE';
      const defaultVal = row.column_default ? ` DEFAULT ${row.column_default}` : '';
      console.log(`  ${row.column_name.padEnd(15)} ${row.data_type.padEnd(25)} ${nullable}${defaultVal}`);
    });
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('');
    console.log('🔌 Connection closed');
  }
}

createRemindersTable();
