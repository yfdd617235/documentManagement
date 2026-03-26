
const { google } = require('googleapis');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: '.env.local' });

async function listFolder() {
  const folderId = '1exMfHkzOP1zwF4nwwvjNk0AiObmnat0v'; // From user request
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './gcp_keys.json';
  
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  const drive = google.drive({ version: 'v3', auth });

  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (res.data.files && res.data.files.length > 0) {
      console.log(`Found ${res.data.files.length} items in folder ${folderId}:`);
      res.data.files.forEach(f => {
        console.log(`- ${f.name} (${f.mimeType}) [ID: ${f.id}]`);
      });
    } else {
      console.log(`Folder is empty or no direct children found.`);
    }
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}
async function checkFolderMeta() {
  const folderId = '1exMfHkzOP1zwF4nwwvjNk0AiObmnat0v';
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './gcp_keys.json';
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });
  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, parents',
      supportsAllDrives: true,
    });
    console.log(`Folder Meta: name=${res.data.name}, type=${res.data.mimeType}, parents=${res.data.parents}`);
  } catch (e) {
    console.log(`Error getting folder meta: ${e.message}`);
  }
}

async function main() {
  await checkFolderMeta();
  await listFolder();
}
main();
