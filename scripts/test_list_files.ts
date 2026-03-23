import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  try {
    const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
    const client = await auth.getClient();
    const token = (await client.getAccessToken()).token;

    const project = process.env.GOOGLE_CLOUD_PROJECT_ID || 'documentmanagement-490723';
    const location = process.env.VERTEX_AI_LOCATION || 'europe-west4';
    
    // First list corpora to find the one for our folder
    const listUrl = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/ragCorpora`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    const listData = await listRes.json();
    
    // Find corpus matching folder
    const corpus = listData.ragCorpora?.find((c: any) => c.displayName.includes('1Z5xPz6p_zRZGikv1z7zmDEu33OIoLZgU'));
    
    if (corpus) {
      console.log(`\Found corpus: ${corpus.name} (${corpus.displayName})`);
      
      const filesUrl = `https://${location}-aiplatform.googleapis.com/v1beta1/${corpus.name}/ragFiles`;
      const filesRes = await fetch(filesUrl, { headers: { Authorization: `Bearer ${token}` } });
      const filesData = await filesRes.json();
      console.log("Files in corpus:", JSON.stringify(filesData, null, 2));
    } else {
        console.log("Could not find corpus");
    }

  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

main();
