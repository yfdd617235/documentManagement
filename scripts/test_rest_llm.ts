import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getAdcToken } from '../lib/rag-engine';

async function testFetchLLM() {
  const token = await getAdcToken();
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = 'us-central1';
  const modelId = 'gemini-1.5-flash';
  
  const url = `https://${location}-aiplatform.googleapis.com/v1/publishers/google/models/${modelId}:streamGenerateContent`;

  console.log('Testing direct REST LLM for:', modelId);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Say Working!' }] }]
    })
  });

  if (!res.ok) {
    const err = await res.json();
    console.error('FAILED:', JSON.stringify(err, null, 2));
    return;
  }

  const data = await res.json();
  console.log('SUCCESS! Response received.');
}

testFetchLLM();
