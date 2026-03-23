import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import { config } from 'dotenv';
import FormData from 'form-data';
config({ path: '.env.local' });

async function run() {
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID;

  // Assume standard corpus id for test
  const corpusName = `projects/${project}/locations/${location}/ragCorpora/6986208921958481920`;

  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles:upload`;
  
  const form = new FormData();
  
  // Create ragFile metadata JSON blob
  const ragFileMeta = {
    ragFile: {
      displayName: 'rescued_file.txt',
      description: 'OCR extracted file',
    }
  };
  form.append('rag_file', JSON.stringify(ragFileMeta), { contentType: 'application/json' });
  
  // Provide raw text 
  const textContent = Buffer.from('Este es el contenido rescatado mediante el OCR manual del documento escaneado.', 'utf-8');
  form.append('file', textContent, { 
    filename: 'rescued.txt', 
    contentType: 'text/plain' 
  });

  const uploadRes = await fetch(url, {
    method: 'POST',
    headers: { 
       Authorization: `Bearer ${token}` 
    },
    body: form
  });

  const txt = await uploadRes.text();
  console.log('UPLOAD STATUS:', uploadRes.status);
  console.log('RESPONSE:', txt);
}
run();
