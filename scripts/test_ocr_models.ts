import { createCorpus } from '../lib/rag-engine';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';

  const models = ['gemini-2.0-flash', 'gemini-1.5-flash-002', 'gemini-1.5-pro-002'];

  for (const model of models) {
    console.log(`\n\n--- TESTING MODEL: ${model} ---`);
    let realCorpusName = await createCorpus('1Z5xPz6p_zRZGikv1z7zmDEu33OIoLZgU', `Test-${model}`);
    
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${realCorpusName}/ragFiles:import`;
    const payload = {
      importRagFilesConfig: {
        googleDriveSource: {
          resourceIds: [{ resourceId: '1Z5xPz6p_zRZGikv1z7zmDEu33OIoLZgU', resourceType: 'RESOURCE_TYPE_FOLDER' }],
        },
        ragFileParsingConfig: {
          llmParser: {
            modelName: model
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
    if (!res.ok) { console.error(`[${model}] ERROR:`, txt); continue; }
    
    const importData = JSON.parse(txt);
    const opName = importData.name;

    let pollData;
    do {
      await new Promise(r => setTimeout(r, 4000));
      const pollRes = await fetch(`https://${location}-aiplatform.googleapis.com/v1/${opName}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      pollData = await pollRes.json();
      process.stdout.write('.');
    } while (!pollData.done);

    console.log(`\n[${model}] DONE:`);
    const imported = pollData.response?.importedRagFilesCount || 0;
    const failed = pollData.response?.failedRagFilesCount || 0;
    console.log(`[${model}] Imported: ${imported}, Failed: ${failed}`);
    
    if (failed > 0) {
      console.log(`[${model}] Failures:`, JSON.stringify(pollData.metadata?.genericMetadata?.partialFailures, null, 2));
    } else if (imported > 0) {
      console.log(`[${model}] SUCCESS!`);
      break;
    }
  }
}
run();
