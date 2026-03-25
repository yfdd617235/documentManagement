import { GoogleAuth } from 'google-auth-library';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

async function getAdcToken() {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  let credentials;
  if (credentialsJson) {
    credentials = JSON.parse(credentialsJson);
  }

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
    ...(credentials ? { credentials } : {}),
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token!;
}

async function listCorpora(project: string, location: string) {
  const token = await getAdcToken();
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/ragCorpora?pageSize=100`;

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
        const text = await res.text();
        return { error: `HTTP ${res.status}: ${text}` };
    }
    const data: any = await res.json();
    return data.ragCorpora || [];
  } catch (err: any) {
    return { error: err.message };
  }
}

async function run() {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!project) {
    console.error("Missing GOOGLE_CLOUD_PROJECT_ID in .env.local");
    return;
  }

  const regions = ['us-central1', 'europe-west4', 'us-east1', 'europe-west1'];
  console.log(`Checking project: ${project}`);
  console.log(`Current location in .env.local: ${process.env.VERTEX_AI_LOCATION || 'not set'}`);

  for (const region of regions) {
    console.log(`\n--- Checking region: ${region} ---`);
    const results = await listCorpora(project, region);
    if ('error' in results) {
       console.log(`Error: ${results.error}`);
    } else {
       if (results.length === 0) {
           console.log("No corpora found.");
       } else {
           results.forEach((c: any) => {
               console.log(` - ${c.displayName} (${c.name})`);
               console.log(`   Description: ${c.description || 'N/A'}`);
           });
       }
    }
  }
}

run();
