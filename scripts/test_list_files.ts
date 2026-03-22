import { listAllGlobalCorpora, listRagFiles } from '../lib/rag-engine';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  try {
    const corpora = await listAllGlobalCorpora();
    console.log("Found Corpora:");
    for (const c of corpora) {
       console.log(`- ${c.displayName}: ${c.name}`);
       const files = await listRagFiles(c.name);
       console.log(`  -> Files indexed: ${files.length}`);
       if (files.length > 0) {
         console.log(`     File 1: ${files[0].displayName}`);
       }
    }
  } catch(e) {
    console.error(e);
  }
}
run();
