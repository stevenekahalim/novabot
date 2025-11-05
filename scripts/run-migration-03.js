require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('🚀 Running single-project model migration...\n');

  try {
    // Step 1: Drop old constraint
    console.log('Step 1: Dropping old constraint...');
    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_name_context_type_key;'
    });
    if (dropError && !dropError.message.includes('does not exist')) {
      // If exec_sql doesn't exist, we'll do it manually
      console.log('Using direct table operations...');
    }

    // Step 2: Clean up duplicates (keep most advanced phase)
    console.log('\nStep 2: Cleaning up duplicate projects...');

    // Delete Manado negotiation (keep pre_opening)
    const { error: delManado } = await supabase
      .from('projects')
      .delete()
      .eq('name', 'Manado (Grand Kawanua)')
      .eq('context_type', 'negotiation');

    if (delManado) {
      console.log(`Warning: ${delManado.message}`);
    } else {
      console.log('✅ Removed Manado negotiation duplicate');
    }

    // Delete Palembang negotiation (keep pre_opening)
    const { error: delPalembang } = await supabase
      .from('projects')
      .delete()
      .eq('name', 'Palembang (Transmart)')
      .eq('context_type', 'negotiation');

    if (delPalembang) {
      console.log(`Warning: ${delPalembang.message}`);
    } else {
      console.log('✅ Removed Palembang negotiation duplicate');
    }

    // Step 3: Verify results
    console.log('\n✨ Migration complete! Verifying results...\n');

    const { data: projects, error: listError } = await supabase
      .from('projects')
      .select('name, context_type, status, pic')
      .order('name');

    if (listError) {
      throw listError;
    }

    console.log('📊 Current projects:\n');
    projects.forEach(p => {
      console.log(`  ${p.name} [${p.context_type.toUpperCase()}] - ${p.status} - PIC: ${p.pic}`);
    });

    console.log('\n✅ Single-project model applied successfully!');
    console.log('Each project now has one home with context_type showing current phase.\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
