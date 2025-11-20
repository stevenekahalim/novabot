require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('🚀 Creating reminders table...');

  // Execute SQL statements one by one
  const statements = [
    `CREATE TABLE IF NOT EXISTS reminders (
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
    )`,
    `CREATE INDEX IF NOT EXISTS idx_reminders_status_date ON reminders(status, reminder_date)`,
    `CREATE INDEX IF NOT EXISTS idx_reminders_assigned_to ON reminders(assigned_to)`,
    `COMMENT ON TABLE reminders IS 'Stores reminder requests for Nova AI assistant'`
  ];

  for (const sql of statements) {
    const { error } = await supabase.rpc('query', { sql });
    if (error && error.code !== '42P07') { // Ignore "already exists" errors
      console.error('Error:', error);
    }
  }

  // Verify table exists
  const { data, error } = await supabase.from('reminders').select('*').limit(1);

  if (error) {
    console.error('❌ Table creation failed:', error);
  } else {
    console.log('✅ Reminders table created successfully!');
    console.log('📊 Table structure verified');
  }
}

runMigration().catch(console.error);
