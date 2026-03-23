import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  const folderId = '1Z5xPz6p_zRZGikv1z7zmDEu33OIoLZgU';
  
  // Get folder metadata
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&fields=files(id,name,mimeType,size)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log("FILES IN FOLDER:", JSON.stringify(data, null, 2));
}
run();
