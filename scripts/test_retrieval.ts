import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { retrieveContexts } from '../lib/rag-engine';

async function testRetrieval() {
  const corpusId = '6917529027641081856'; // From user log
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION || 'europe-west4';
  const corpusName = `projects/${project}/locations/${location}/ragCorpora/${corpusId}`;
  
  console.log('Testing retrieval for:', corpusName);
  try {
    const context = await retrieveContexts(corpusName, 'SN-2101 content', 5, 0.7);
    console.log('SUCCESS! Retrieved:', context.length, 'chunks.');
    context.forEach((c, i) => {
      console.log(`\n--- Chunk ${i+1} (${c.file_name}) ---`);
      console.log(c.text.substring(0, 200) + '...');
    });
  } catch (err) {
    console.error('FAILED:', err);
  }
}

testRetrieval();
