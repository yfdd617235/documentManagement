import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getAdcToken } from '../lib/rag-engine';

async function listFiles() {
  const token = await getAdcToken();
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION || 'europe-west4';
  const corpusId = '6917529027641081856'; // From user log
  
  const parent = `projects/${project}/locations/${location}/ragCorpora/${corpusId}`;
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${parent}/ragFiles`;

  console.log('Listing files in:', parent);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const err = await res.json();
    console.error('Error:', err);
    return;
  }

  const data = await res.json();
  console.log('Files found:', data.ragFiles?.length || 0);
  (data.ragFiles || []).forEach((f: any) => {
    console.log(`- ${f.displayName} (${f.name})`);
  });
}

listFiles();
