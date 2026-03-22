import { createCorpus, importDriveFolder } from '../lib/rag-engine';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  try {
    console.log("Creating Corpus...");
    // Pass a dummy string and the user's test folder ID
    const corpusName = await createCorpus('1PnbPT8ExANIfLOLz8pF0AoS9Q8QMaGCo', 'Test-API-Pipeline-1');
    console.log("CREATED CORPUS REAL NAME:", corpusName);
    
    console.log("Starting Import with LLM Parser...");
    const operation = await importDriveFolder(corpusName, '1PnbPT8ExANIfLOLz8pF0AoS9Q8QMaGCo');
    console.log("IMPORT OPERATION:", operation);
    console.log("SUCCESS!");
  } catch (error) {
    console.error("TEST FAILED:", error);
  }
}
run();
