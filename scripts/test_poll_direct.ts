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
  
  const operationName = 'projects/250935347147/locations/europe-west4/operations/5107371011557294080';
  const url = `https://${location}-aiplatform.googleapis.com/v1/${operationName}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  
  const data = await res.json();
  fs.writeFileSync('test_poll_out.json', JSON.stringify(data, null, 2), 'utf-8');
}
run();
