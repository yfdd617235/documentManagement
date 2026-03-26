/**
 * test_drive_native.js
 *
 * Verifies if the Discovery Engine API accepts googleDriveSource in importDocuments.
 */

const { DocumentServiceClient } = require('@google-cloud/discoveryengine');
const path = require('path');

const PROJECT_ID = 'documentmanagement-490723';
const LOCATION = 'global';
const DATA_STORE_ID = 'docintel-datastore_1774558753918';
const KEY_FILE = path.join(process.cwd(), 'gcp_keys.json');

const folderId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs'; // Random test folder or user's folder if known

async function testNativeImport() {
  const client = new DocumentServiceClient({ keyFilename: KEY_FILE });
  const parent = `projects/${PROJECT_ID}/locations/${LOCATION}/collections/default_collection/dataStores/${DATA_STORE_ID}/branches/0`;

  console.log(`Testing native import for folder: ${folderId}`);
  
  try {
    const [operation] = await client.importDocuments({
      parent,
      googleDriveSource: {
        uri: folderId,
        uri_type: 'FOLDER', 
      },
      reconciliationMode: 'INCREMENTAL',
    });

    console.log('SUCCESS: Operation started:', operation.name);
  } catch (err) {
    console.error('FAILED: API rejected native Drive source.');
    console.error('Error Details:', err.message);
    
    if (err.message.includes('googleDriveSource') || err.message.includes('unknown field')) {
      console.log('HYPOTHESIS CONFIRMED: Mapping to GCS is required for this Data Store type.');
    }
  }
}

testNativeImport();
