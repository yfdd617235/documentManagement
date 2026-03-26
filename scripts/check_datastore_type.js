/**
 * check_datastore_type.js
 */

const { DataStoreServiceClient } = require('@google-cloud/discoveryengine');
const path = require('path');

const PROJECT_ID = 'documentmanagement-490723';
const LOCATION = 'global';
const DATA_STORE_ID = 'docintel-datastore_1774558753918';
const KEY_FILE = path.join(process.cwd(), 'gcp_keys.json');

async function checkType() {
  const client = new DataStoreServiceClient({ keyFilename: KEY_FILE });
  const name = `projects/${PROJECT_ID}/locations/${LOCATION}/collections/default_collection/dataStores/${DATA_STORE_ID}`;

  try {
    const [ds] = await client.getDataStore({ name });
    console.log('DATA STORE INFO:');
    console.log('- Type:', ds.contentConfig); // Should be CONTENT_CONFIG_UNSPECIFIED, PUBLIC_WEBSITE, GOOGLE_DRIVE, etc.
    console.log('- Industry:', ds.industryVertical);
  } catch (err) {
    console.error('FAILED to get data store info:', err.message);
  }
}

checkType();
