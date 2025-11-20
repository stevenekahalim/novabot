require('dotenv').config();
const { Client } = require('pg');

async function createRemindersTable() {
  // Connection string for Supabase
  const connectionString = `postgresql://postgres.rexuplchcdqfelcukryh:Apex@2025Sports!@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to Supabase...');
    await client.connect();
    console.log('✅ Connected!');

    console.log('📋 Creating reminders table...');

    // Create table
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
    console.log('✅ Reminders table created successfully!');
    console.log('');

    // Verify
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'reminders'
      ORDER BY ordinal_position
    `);

    console.log('📋 Table structure:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
}

createRemindersTable();
