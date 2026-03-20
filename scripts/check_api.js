const { GoogleAuth } = require('google-auth-library');

async function main() {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = './credentials/service-account.json';
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const project = 'documentmanagement-490723';

  console.log("Checking if Vertex AI API is enabled...");
  const res = await fetch(`https://serviceusage.googleapis.com/v1/projects/${project}/services/aiplatform.googleapis.com`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!res.ok) {
    console.error("Failed to check API status:", await res.text());
    return;
  }
  
  const data = await res.json();
  console.log(`API State for aiplatform.googleapis.com: ${data.state}`);
  
  if (data.state !== 'ENABLED') {
    console.log("CRITICAL ERROR: The Vertex AI API is disabled! This is why IAM permissions are failing with '(or it may not exist)'.");
  } else {
    console.log("API is enabled. The IAM permission is genuinely missing.");
  }
}

main().catch(console.error);
