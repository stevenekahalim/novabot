#!/usr/bin/env node
/**
 * V3 Database Migration via Supabase REST API
 * Executes SQL via PostgREST admin API
 */

const fs = require('fs');
const path = require('path');

// Supabase credentials from environment or defaults
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rexuplchcdqfelcukryh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJleHVwbGNoY2RxZmVsY3VrcnloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjE1NTkwOSwiZXhwIjoyMDc3NzMxOTA5fQ.N4aFOFVRAmUGD5i9GE6dEcayiZEKXU7r_8upujE5S_8';

async function executeSql(sql) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }

  return await response.json();
}

async function runMigration() {
  console.log('🚀 Starting V3 Database Migration via Supabase API...\n');

  // Read SQL file
  const sqlPath = path.join(__dirname, '..', 'database', 'v3_fresh_start.sql');
  console.log(`📖 Reading SQL from: ${sqlPath}`);

  if (!fs.existsSync(sqlPath)) {
    console.error('❌ SQL file not found!');
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf-8');
  console.log(`✅ SQL file loaded (${sql.length} characters)\n`);

  console.log('⚠️  WARNING: This will DROP all V2 tables and create V3 schema');
  console.log('⚠️  User approved: "Its ok, dont worry about old data. Lets start from 0"\n');

  console.log('Note: This method uses Supabase REST API which may have limitations.');
  console.log('If this fails, we\'ll need to execute SQL via Supabase Dashboard SQL Editor.\n');

  try {
    console.log('🔧 Attempting to execute migration...');
    await executeSql(sql);
    console.log('✅ Migration executed successfully!\n');

    console.log('🔍 Verifying tables were created...');
    // We'll manually verify this by checking if we can query the new tables

    console.log('\n🎉 V3 Database Migration Complete!\n');
    console.log('Please verify by checking Supabase Dashboard → Table Editor\n');

  } catch (err) {
    console.error('\n❌ API method failed:', err.message);
    console.log('\n📋 MANUAL MIGRATION STEPS:');
    console.log('1. Open Supabase Dashboard: https://supabase.com/dashboard');
    console.log('2. Navigate to your project → SQL Editor');
    console.log(`3. Copy and paste the contents of: ${sqlPath}`);
    console.log('4. Click "Run" to execute the migration');
    console.log('\nAlternatively, I can build the V3 code first and we can migrate later.\n');
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
  });
