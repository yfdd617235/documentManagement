
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function checkColumns() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url, key);

  const { data: cols, error } = await supabase.rpc('inspect_table', { tname: 'document_chunks' });
  // Wait, I don't have this RPC. I'll just try to select id and document_id from it or use a query.

  const { data, error: qError } = await supabase.from('document_chunks').select('id, document_id').limit(1);
  if (qError) {
    console.log(`Error: ${qError.message}`);
  } else {
    console.log(`document_chunks columns: id, document_id exists. Data:`, data);
  }
}
checkColumns();
