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

  // 1. Create a dummy corpus
  const createUrl = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/ragCorpora`;
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'test-flash-corpus' })
  });
  const corpusData = await createRes.json();
  const corpusName = corpusData.name || corpusData.response?.name;
  console.log("CREATED CORPUS OPERATION/NAME:", corpusName);
  
  // Actually wait, create res returns an operation, I need to get the real corpus!
  let realCorpusName = '';
  // Let's just use the previous corpus 6397268897594966016
  realCorpusName = `projects/${project}/locations/${location}/ragCorpora/6986208921958481920`;

  // 2. Try import with llm parser Flash
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${realCorpusName}/ragFiles:import`;
  const payload = {
    importRagFilesConfig: {
      googleDriveSource: {
        resourceIds: [{ resourceId: '1PnbPT8ExANIfLOLz8pF0AoS9Q8QMaGCo', resourceType: 'RESOURCE_TYPE_FOLDER' }],
      },
      ragFileParsingConfig: {
        llmParser: {
          modelName: 'gemini-1.5-flash-002'
        }
      }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const importData = await res.json();
  const opName = importData.name;
  console.log("IMPORT OP:", opName);

  // 3. Poll
  let pollData;
  do {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes = await fetch(`https://${location}-aiplatform.googleapis.com/v1/${opName}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    pollData = await pollRes.json();
    console.log("polling...", pollData.done);
  } while (!pollData.done);

  fs.writeFileSync('test_poll_flash.json', JSON.stringify(pollData, null, 2), 'utf-8');
  console.log("Done!");
}
run();
