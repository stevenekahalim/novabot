require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

async function fullReview() {
  console.log('═════════════════════════════════════');
  console.log('FULL SYSTEM REVIEW');
  console.log('═════════════════════════════════════\n');

  // 1. Check all projects
  console.log('1. CURRENT PROJECTS IN DATABASE:');
  console.log('─────────────────────────────────────');
  const { data: projects, error: projError } = await supabase
    .from('projects')
    .select('id, name, context_type, status, pic, updated_at')
    .order('name');

  if (projError) {
    console.error('ERROR:', projError);
    return;
  }

  projects.forEach(p => {
    console.log(`  ${p.name}`);
    console.log(`    Context: ${p.context_type}`);
    console.log(`    Status: ${p.status}`);
    console.log(`    PIC: ${p.pic}`);
    console.log(`    ID: ${p.id}`);
    console.log(`    Updated: ${p.updated_at}`);
    console.log();
  });

  // Check for duplicates
  const names = projects.map(p => p.name);
  const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
  if (duplicates.length > 0) {
    console.log('⚠️  DUPLICATES FOUND:', [...new Set(duplicates)]);
  } else {
    console.log('✅ No duplicate project names\n');
  }

  // 2. Check conversation_history table
  console.log('\n2. CONVERSATION HISTORY TABLE:');
  console.log('─────────────────────────────────────');
  const { data: convHistory, error: convError } = await supabase
    .from('conversation_history')
    .select('*')
    .order('message_timestamp', { ascending: false })
    .limit(5);

  if (convError) {
    console.log('ERROR:', convError.message);
  } else {
    console.log(`Found ${convHistory.length} recent messages`);
    if (convHistory.length > 0) {
      console.log('Latest message:');
      const latest = convHistory[0];
      console.log(`  Author: ${latest.message_author}`);
      console.log(`  Text: ${latest.message_text?.substring(0, 50)}...`);
      console.log(`  Project: ${latest.mentioned_project || 'N/A'}`);
      console.log(`  Classification: ${latest.classification_type || 'N/A'}`);
    }
  }

  // 3. Check table schemas
  console.log('\n3. TABLE SCHEMA CHECK:');
  console.log('─────────────────────────────────────');

  // Test projects table structure
  const { data: testProject } = await supabase
    .from('projects')
    .select('*')
    .limit(1)
    .single();

  if (testProject) {
    console.log('Projects table columns:');
    Object.keys(testProject).forEach(col => console.log(`  - ${col}`));
  }

  // 4. Check for Manado specifically
  console.log('\n4. MANADO PROJECT DETAILS:');
  console.log('─────────────────────────────────────');
  const { data: manado, error: manadoError } = await supabase
    .from('projects')
    .select('*')
    .ilike('name', '%manado%');

  if (manadoError) {
    console.log('ERROR:', manadoError.message);
  } else {
    console.log(`Found ${manado.length} Manado project(s):`);
    manado.forEach(p => {
      console.log(`\n  Name: ${p.name}`);
      console.log(`  Context: ${p.context_type}`);
      console.log(`  Status: ${p.status}`);
      console.log(`  PIC: ${p.pic}`);
      console.log(`  Data: ${JSON.stringify(p.data, null, 2)}`);
    });
  }

  console.log('\n═════════════════════════════════════');
  console.log('REVIEW COMPLETE');
  console.log('═════════════════════════════════════');
}

fullReview();
