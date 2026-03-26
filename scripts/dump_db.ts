const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function dumpDB() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('--- RAG_CORPORA ---');
  const { data: corpora } = await supabase.from('rag_corpora').select('*');
  console.log(JSON.stringify(corpora, null, 2));

  console.log('\n--- DOCUMENTS (Summary) ---');
  const { data: docs } = await supabase.from('documents').select('id, name, original_path, status').limit(5);
  console.log(JSON.stringify(docs, null, 2));

  console.log('\n--- USER_SETTINGS ---');
  const { data: settings } = await supabase.from('user_settings').select('*');
  console.log(JSON.stringify(settings, null, 2));
}

dumpDB().catch(console.error);
