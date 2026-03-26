
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

async function checkTables() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url, key);

  for (const table of (['rag_corpora', 'user_settings', 'operation_logs', 'documents', 'document_chunks', 'import_operations'])) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`[${table}]: ERROR - ${error.message}`);
    } else {
      console.log(`[${table}]: OK`);
    }
  }
}

checkTables();
