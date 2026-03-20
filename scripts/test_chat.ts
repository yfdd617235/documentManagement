import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { retrieveContexts } from '../lib/rag-engine';
import { getCorpusForUser } from '../lib/supabase';
import { getFallbackChain } from '../lib/llm-provider';
import { streamText } from 'ai';

async function main() {
  console.log('1. Fetching corpus from Supabase...');
  // I don't know the exact user_id without token, so I will bypass supabase for the test if needed.
  // Actually, I can just hardcode the corpus name from the UI screenshot: 'projects/...'
  // I will use `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/locations/${process.env.VERTEX_AI_LOCATION}/ragCorpora/1exMfHkzOP1zwF4nwwvjNk0AiObmnat0v` 
  // Wait, no, the corpus ID is a UUID. I can't guess it. Let's just create a mock user and fetch the first corpus in the table!
  const { createClient } = require('@supabase/supabase-js');
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data } = await db.from('rag_corpora').select('*').limit(1);
  const corpus = data[0];

  if (!corpus) {
    console.log('No corpus found in DB.');
    return;
  }
  console.log('Using corpus:', corpus.corpus_name);

  console.log('\n2. Testing retrieveContexts...');
  try {
    const contexts = await retrieveContexts(corpus.corpus_name, 'What is the content of this folder?', 5, 0.4);
    console.log('Success! Contexts:', contexts);

    console.log('\n3. Testing LLM Stream...');
    const chain = getFallbackChain('gemini', 'gemini-1.5-flash');
    const result = await streamText({
      model: chain[0],
      system: 'You are a test assistant.',
      messages: [{ role: 'user', content: 'What is the content of this folder?' }],
    });

    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
    console.log('\nDone.');
  } catch (err: any) {
    console.error('\nERROR:', err.message);
  }
}

main();
