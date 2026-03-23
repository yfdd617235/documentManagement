import { GoogleAuth } from 'google-auth-library';
import { execSync } from 'child_process';
import { config } from 'dotenv';
import * as fs from 'fs';
config({ path: '.env.local' });

async function run() {
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
  const client = await auth.getClient();
  const saToken = (await client.getAccessToken()).token;

  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID;
  
  // Use the specific corpus
  const corpusName = `projects/documentmanagement-490723/locations/europe-west4/ragCorpora/6478428063972458496`;

  const extractedText = "Resultados del texto de prueba rescatado: Esto es un ejemplo de texto extraido por OCR. Serial Number: 12345.";
  fs.writeFileSync('rescued_ocr.txt', extractedText);

  const ragMeta = {
    rag_file: {
      displayName: "ejemplo.pdf",
      description: "Test OCR Rescued via curl"
    }
  };
  fs.writeFileSync('rag_meta.json', JSON.stringify(ragMeta));

  const uploadUrl = `https://${location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles:upload?uploadType=multipart`;
  console.log(`POST ${uploadUrl}`);
  
  const cmd = `curl -X POST "${uploadUrl}" -H "Authorization: Bearer ${saToken}" -F "rag_file=@rag_meta.json;type=application/json" -F "file=@rescued_ocr.txt;type=text/plain"`;

  try {
    const output = execSync(cmd, { stdio: 'pipe' });
    console.log("CURL Output:\n", output.toString());
  } catch (e: any) {
    console.error("CURL Error:\n", e.stderr ? e.stderr.toString() : e);
  }
}
run();
