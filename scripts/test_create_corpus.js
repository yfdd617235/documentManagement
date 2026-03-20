const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');

async function main() {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = './credentials/service-account.json';
  
  // Read actual project ID from the service account
  const sa = JSON.parse(fs.readFileSync('./credentials/service-account.json', 'utf8'));
  const project = sa.project_id;
  console.log("Real Project ID from Service Account:", project);

  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  const location = 'europe-west4';
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/ragCorpora`;
  
  const embeddingModel = `projects/${project}/locations/${location}/publishers/google/models/text-embedding-005`;

  // Try endpoint payload
  const bodyEndpoint = JSON.stringify({
    displayName: 'test-corpus-endpoint',
    ragEmbeddingModelConfig: {
      vertexPredictionEndpoint: {
        endpoint: embeddingModel
      }
    }
  });

  console.log("\nTesting with endpoint...");
  let res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: bodyEndpoint
  });
  console.log("endpoint response:", res.status, await res.text());

  // Try publisherModel (the one that caused 400 in UI)
  const bodyPublisher = JSON.stringify({
    displayName: 'test-corpus-publisher',
    ragEmbeddingModelConfig: {
      vertexPredictionEndpoint: {
        publisherModel: embeddingModel
      }
    }
  });

  console.log("\nTesting with publisherModel...");
  res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: bodyPublisher
  });
  console.log("publisherModel response:", res.status, await res.text());
}

main().catch(console.error);
