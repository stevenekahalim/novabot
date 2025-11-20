require('dotenv').config();
const SupabaseClient = require('./src/database/supabase');

async function test() {
  const supabaseClient = new SupabaseClient();
  const supabase = supabaseClient.getClient();

  // Try to list existing tables
  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');

  console.log('Tables:', data);
  console.log('Error:', error);
}

test();
