const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('Testing connection to Supabase...');
  const { data: docs, error: docError } = await supabase.from('documents').select('count', { count: 'exact', head: true });
  if (docError) {
    console.error('Error connecting to documents table:', docError);
  } else {
    console.log('Connection successful! Document count:', docs);
  }

  console.log('Testing RPC match_documents...');
  // Dummy 768-dim vector
  const dummyVector = Array(768).fill(0.1);
  const { data: matches, error: rpcError } = await supabase.rpc('match_documents', {
    query_embedding: dummyVector,
    match_threshold: 0.1,
    match_count: 5
  });
  
  if (rpcError) {
    console.error('Error executing RPC match_documents:', rpcError);
  } else {
    console.log('RPC execution successful! Matches found:', matches.length);
  }
}

testSupabase().catch(console.error);
