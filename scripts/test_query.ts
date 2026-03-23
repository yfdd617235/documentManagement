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
    console.log("Corpora:", JSON.stringify(listData.ragCorpora?.map(c => ({name: c.name, displayName: c.displayName})), null, 2));
    
    // Find corpus matching folder
    const corpus = listData.ragCorpora?.find(c => c.displayName.includes('1Z5xPz6p_zRZGikv1z7zmDEu33OIoLZgU') || c.displayName === "Carpeta 1Z5x..."); // We don't know exact name, but let's list them
    
    if (listData.ragCorpora && listData.ragCorpora.length > 0) {
      const targetCorpus = listData.ragCorpora[0]; // Let's just query the first one or we query all
      console.log(`\nQuerying corpus: ${targetCorpus.name} (${targetCorpus.displayName})`);
      
      const queryUrl = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}:retrieveContexts`;
      console.log('Query URL:', queryUrl);
      
      const queryBody = {
        query: { text: "Que informacion tienes sobre el archivo ejemplo?" },
        vertexRagStore: {
          ragCorpora: [targetCorpus.name],
          vectorDistanceThreshold: 0.5,
        }
      };
      
      const queryRes = await fetch(queryUrl, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(queryBody)
      });
      
      const text = await queryRes.text();
      try {
        const queryData = JSON.parse(text);
        console.log("Query Results:", JSON.stringify(queryData, null, 2));
      } catch (e) {
        console.log("Query Status:", queryRes.status, queryRes.statusText);
        console.log("Raw Response:", text);
      }
    }

  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

main();
