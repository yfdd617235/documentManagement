import { createCorpus } from '../lib/rag-engine';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import { config } from 'dotenv';
import * as fs from 'fs';
config({ path: '.env.local' });

async function run() {
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID;

  // 1. Create a dummy corpus using the CORRECTED logic from rag-engine
  let realCorpusName = await createCorpus('1PnbPT8ExANIfLOLz8pF0AoS9Q8QMaGCo', 'Test-OCR-Pipeline-2');
  console.log("CREATED CORPUS NATIVE:", realCorpusName);

  // 2. Try import with layout parser
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${realCorpusName}/ragFiles:import`;
  const payload = {
    importRagFilesConfig: {
      googleDriveSource: {
        resourceIds: [{ resourceId: '1PnbPT8ExANIfLOLz8pF0AoS9Q8QMaGCo', resourceType: 'RESOURCE_TYPE_FOLDER' }],
      },
      ragFileParsingConfig: {
        layoutParser: {
          maxParsingRequestsPerMin: 120
        }
      }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const txt = await res.text();
  console.log("IMPORT STATUS:", res.status);
  
  if (!res.ok) {
     console.error(txt);
     return;
  }
  
  const importData = JSON.parse(txt);
  const opName = importData.name;
  console.log("IMPORT OP:", opName);

  let pollData;
  do {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes = await fetch(`https://${location}-aiplatform.googleapis.com/v1/${opName}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    pollData = await pollRes.json();
    console.log("polling...", pollData.done);
  } while (!pollData.done);

  fs.writeFileSync('test_poll_layout.json', JSON.stringify(pollData, null, 2), 'utf-8');
  console.log("Done layout parsing!");
}
run();
