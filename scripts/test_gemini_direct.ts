import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import { config } from 'dotenv';
import * as fs from 'fs';
config({ path: '.env.local' });

async function run() {
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  const fileId = '1i6G6RTpTq2a-YazInHjGTbx2XzDv-TXi';
  
  // Need to get User OAuth token from environment or DB? 
  // Wait, I can't easily get the user's token here.
  // Actually, I can just use Vertex AI service account to download it directly using Drive API 
  // IF the user granted reader access to the folder for the service account email.
  // The UI DID grant access in step 2! So the service account CAN read it.
  
  const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const resDrive = await fetch(driveUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resDrive.ok) {
     console.error("Download failed:", await resDrive.text());
     return;
  }
  
  const buffer = await resDrive.arrayBuffer();
  fs.writeFileSync('ejemplo.pdf', Buffer.from(buffer));
  console.log("Downloaded ejemplo.pdf successfully, size:", buffer.byteLength);

  // Now let's try calling Gemini Vision model directly using standard Google Cloud AI Platform endpoint
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID;

  const geminiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/gemini-1.5-flash-002:generateContent`;
  
  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { text: 'Extrae todo el texto de este documento.' },
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: Buffer.from(buffer).toString('base64')
          }
        }
      ]
    }]
  };

  const resGemini = await fetch(geminiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const txt = await resGemini.text();
  console.log("Gemini response status:", resGemini.status);
  fs.writeFileSync('gemini_out.json', txt);
  console.log("Done");
}
run();
