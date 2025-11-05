#!/usr/bin/env node
/**
 * V3 Database Migration Script
 * Executes the v3_fresh_start.sql migration using direct Postgres connection
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Supabase connection string
// Format: postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
const CONNECTION_STRING = 'postgresql://postgres.rexuplchcdqfelcukryh:85Lombokjn@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

async function runMigration() {
  console.log('🚀 Starting V3 Database Migration...\n');

  // Create Postgres client
  const client = new Client({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false } // Supabase requires SSL
  });

  try {
    // Connect to database
    console.log('🔌 Connecting to Supabase Postgres...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

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

    // Execute the SQL
    console.log('🔧 Executing migration SQL...');
    const result = await client.query(sql);
    console.log('✅ Migration executed successfully!\n');

    // Verify V3 tables exist
    console.log('🔍 Verifying V3 tables...');
    const verifyResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('messages_v3', 'hourly_notes', 'daily_digests_v3')
      ORDER BY table_name;
    `);

    console.log(`✅ Found ${verifyResult.rows.length} V3 tables:`);
    verifyResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    // Get table sizes
    console.log('\n📊 Table information:');
    const sizeResult = await client.query(`
      SELECT
        tablename,
        pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS size
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('messages_v3', 'hourly_notes', 'daily_digests_v3')
      ORDER BY tablename;
    `);

    sizeResult.rows.forEach(row => {
      console.log(`   ${row.tablename}: ${row.size}`);
    });

    console.log('\n🎉 V3 Database Migration Complete!\n');

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
  });
