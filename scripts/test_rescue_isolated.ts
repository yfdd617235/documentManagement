import { GoogleAuth } from 'google-auth-library';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';
import * as fs from 'fs';
config({ path: '.env.local' });

async function run() {
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
  const client = await auth.getClient();
  const saToken = (await client.getAccessToken()).token;

  const extractedText = "Resultados del texto de prueba rescatado: Esto es un ejemplo de texto extraido por OCR. Serial Number: 12345.";
  console.log("OCR Result length:", extractedText.length);

  // Upload to Vertex
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID || 'documentmanagement-490723';
  
  // First list corpora to find the one for our folder 1Z5xPz6p_zRZGikv1z7zmDEu33OIoLZgU
  const listUrl = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/ragCorpora`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${saToken}` } });
  const listData = await listRes.json();
  const targetCorpus = listData.ragCorpora?.find((c: any) => c.displayName.includes('1Z5xPz6p_zRZGikv1z7zmDEu33OIoLZgU'));

  if (!targetCorpus) {
      console.log("Target corpus not found!");
      return;
  }

  // 3. UPLOAD TO VERTEX
  console.log(`\nUploading to Vertex AI corpus ${targetCorpus.name}...`);
  
  const form = new FormData();
  const failedFileName = 'ejemplo.pdf'; 

  form.append('rag_file', JSON.stringify({
    ragFile: { displayName: failedFileName, description: 'Test OCR Rescued' }
  }));
  
  form.append('file', new Blob([extractedText], { type: 'text/plain' }), `${failedFileName}.txt`);

  const uploadUrl = `https://${location}-aiplatform.googleapis.com/v1beta1/${targetCorpus.name}/ragFiles:upload`;
  console.log(`POST ${uploadUrl}`);
  
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${saToken}` }, // No Content-Type header needed for native FormData
    body: form
  });

  console.log("Upload Status:", uploadRes.status);
  const responseData = await uploadRes.json();
  console.log(JSON.stringify(responseData, null, 2));
}
run();
