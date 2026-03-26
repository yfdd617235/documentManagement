const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function dumpErrors() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data: errors } = await supabase.from('documents').select('*').eq('status', 'error');
  console.log('--- ERROR DOCUMENTS ---');
  console.log(JSON.stringify(errors, null, 2));

  const { data: operations } = await supabase.from('import_operations').select('*');
  console.log('\n--- IMPORT OPERATIONS ---');
  console.log(JSON.stringify(operations, null, 2));
}

dumpErrors().catch(console.error);
