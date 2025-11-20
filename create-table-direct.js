require('dotenv').config();
const https = require('https');

// Using Supabase's database REST API to execute DDL
const projectRef = 'rexuplchcdqfelcukryh';
const serviceRoleKey = process.env.SUPABASE_SERVICE_KEY;

const sql = `
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
);

CREATE INDEX IF NOT EXISTS idx_reminders_status_date ON reminders(status, reminder_date);
CREATE INDEX IF NOT EXISTS idx_reminders_assigned_to ON reminders(assigned_to);

COMMENT ON TABLE reminders IS 'Stores reminder requests for Nova AI assistant';
`.trim();

const options = {
  hostname: `${projectRef}.supabase.co`,
  port: 443,
  path: '/rest/v1/rpc/exec',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`
  }
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response Status:', res.statusCode);
    console.log('Response:', data);

    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('✅ Table created successfully!');
    } else {
      console.error('❌ Failed to create table');
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.write(JSON.stringify({ sql }));
req.end();
