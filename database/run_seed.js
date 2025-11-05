#!/usr/bin/env node

/**
 * Seed Nova's memory database with historical context
 * Usage: node database/run_seed.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SEED_FILE = path.join(__dirname, 'seed_nova_memory.sql');

async function runSeed() {
  console.log('🌱 Seeding Nova memory database...\n');

  // Read SQL file
  console.log(`📄 Reading seed file: ${SEED_FILE}`);
  const sql = fs.readFileSync(SEED_FILE, 'utf8');

  // Initialize Supabase client with service role key
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  }

  console.log(`🔌 Connecting to Supabase: ${supabaseUrl}`);
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Split SQL into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`\n📝 Found ${statements.length} SQL statements\n`);

  let successCount = 0;
  let errorCount = 0;

  // Execute each statement
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ';';

    // Skip comment-only statements
    if (statement.trim().startsWith('--')) continue;

    try {
      // Extract project/fact info for logging
      let logInfo = '';
      if (statement.includes('INSERT INTO projects')) {
        const nameMatch = statement.match(/'([^']+)',\s*'(negotiation|pre_opening|partnership|venture)'/);
        if (nameMatch) {
          logInfo = ` [${nameMatch[1]} - ${nameMatch[2]}]`;
        }
      } else if (statement.includes('INSERT INTO project_facts')) {
        const typeMatch = statement.match(/'(decision|financial|timeline|relationship|milestone|issue)'/);
        if (typeMatch) {
          logInfo = ` [fact: ${typeMatch[1]}]`;
        }
      }

      console.log(`  ${i + 1}/${statements.length} Executing...${logInfo}`);

      const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement });

      if (error) {
        // Try alternative method using direct query
        throw error;
      }

      successCount++;
    } catch (error) {
      console.error(`  ❌ Error executing statement ${i + 1}:`, error.message);
      errorCount++;

      // Show problematic statement (first 200 chars)
      if (process.env.DEBUG) {
        console.error(`  Statement: ${statement.substring(0, 200)}...`);
      }
    }
  }

  console.log(`\n✅ Seed complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors:  ${errorCount}`);

  if (errorCount > 0) {
    console.log(`\n⚠️  Run with DEBUG=1 to see failed SQL statements`);
    process.exit(1);
  }
}

runSeed().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
