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

  let realCorpusName = await createCorpus('1Z5xPz6p_zRZGikv1z7zmDEu33OIoLZgU', `Test-AdvancedParser`);
  
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${realCorpusName}/ragFiles:import`;
  const payload = {
    importRagFilesConfig: {
      googleDriveSource: {
        resourceIds: [{ resourceId: '1Z5xPz6p_zRZGikv1z7zmDEu33OIoLZgU', resourceType: 'RESOURCE_TYPE_FOLDER' }],
      },
      ragFileParsingConfig: {
        advancedParser: {
          useAdvancedPdfParsing: true
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
  console.log('IMPORT STATUS:', res.status);
  
  if (!res.ok) { console.error('ERROR:', txt); return; }
  
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

  console.log(`\nDONE:`);
  const imported = pollData.response?.importedRagFilesCount || 0;
  const failed = pollData.response?.failedRagFilesCount || 0;
  console.log(`Imported: ${imported}, Failed: ${failed}`);
  
  if (failed > 0) {
    console.log(`Failures:`, JSON.stringify(pollData.metadata?.genericMetadata?.partialFailures, null, 2));
  } else if (imported > 0) {
    console.log(`SUCCESS!`);
  }
}
run();
