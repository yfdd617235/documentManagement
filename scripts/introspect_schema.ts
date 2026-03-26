const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function introspect() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data, error } = await supabase.rpc('get_table_columns', { t_name: 'document_chunks' });
  if (error) {
    // If get_table_columns RPC doesn't exist, try direct query to information_schema
    const { data: cols, error: infoError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'document_chunks');
    
    if (infoError) {
      console.error('Error introspecting columns:', infoError);
      // Fallback: try to select one row
      const { data: row, error: selectError } = await supabase.from('document_chunks').select('*').limit(1);
      if (selectError) {
        console.error('Select error:', selectError.message);
      } else {
        console.log('Columns found via select *:', Object.keys(row[0] || {}));
      }
    } else {
      console.log('Columns for document_chunks:', cols);
    }
  } else {
    console.log('Columns for document_chunks:', data);
  }
}

introspect().catch(console.error);
