import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function diagnose() {
  const auth = new GoogleAuth({ 
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/cloud-platform'],
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ? JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) : undefined
  });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  const folderId = '1ZQmWVUCJwfQlelurzZ3YxnKt8hS-GLdO';
  
  console.log(`Diagnosing folder: ${folderId}`);
  
  const url = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,driveId,mimeType,capabilities&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!res.ok) {
    console.error(`Error fetching metadata: ${res.status}`);
    console.error(await res.text());
    return;
  }
  
  const data = await res.json();
  console.log("METADATA:", JSON.stringify(data, null, 2));
  
  if (data.driveId) {
    console.log("!!! DRIVE_ID DETECTED: This is definitely a Shared Drive folder.");
  } else {
    console.log("No driveId detected. This is a regular folder (My Drive or Shared with me).");
  }
}

diagnose().catch(console.error);
