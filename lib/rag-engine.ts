/**
 * lib/rag-engine.ts
 *
 * Supabase + pgvector RAG Engine.
 * Functional replacement for Vertex AI RAG Managed DB (Cloud Spanner).
 *
 * Principle: Keep Vertex AI for Embeddings, use Supabase for storage/search.
 */

import { createClient } from '@supabase/supabase-js';
import { DocumentServiceClient, SearchServiceClient } from '@google-cloud/discoveryengine';
import { Storage } from '@google-cloud/storage';
import type { RetrievedChunk, ImportOperationStatus } from '@/types';

// ─── Constants & Configuration ────────────────────────────────────────────────
const ENGINE_ID = process.env.VERTEX_SEARCH_ENGINE_ID || 'docintel-search-docs_1774558903972';
const DATA_STORE_ID = process.env.VERTEX_SEARCH_DATA_STORE_ID || 'docintel-datastore_1774558753918';
const STAGING_BUCKET = process.env.GCS_STAGING_BUCKET || 'docintel-documents-490723';
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || 'documentmanagement-490723';
const LOCATION = 'global'; 

const storage = new Storage({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
const documentServiceClient = new DocumentServiceClient({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
const searchServiceClient = new SearchServiceClient({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const _supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

function getSupabase() {
  if (!_supabase) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return _supabase;
}

// We'll use the REST API for embeddings to stay consistent with the original Spanner code's style
const EMBEDDING_MODEL = 'text-embedding-004';

// ─── Shared ADC Token Helper (Kept for compatibility/REST) ────────────────────
export async function getAdcToken(): Promise<string> {
  const { GoogleAuth } = await import('google-auth-library');
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  
  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
    ...(credentialsJson ? { credentials: JSON.parse(credentialsJson) } : {
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS
    }),
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token!;
}

/**
 * Robust fetch wrapper with exponential backoff for Google APIs.
 */
export async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3): Promise<any> {
  let lastError: any;
  let delay = 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return await res.json();
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`API Error ${res.status}: ${await res.text()}`);
      }
      lastError = new Error(`API Error ${res.status} after ${maxRetries} retries`);
    } catch (e: any) {
      lastError = e;
      if (e.message.indexOf('API Error 4') === 0) throw e;
    }
    await new Promise(r => setTimeout(r, delay));
    delay *= 2;
  }
  throw lastError;
}

// ─── Corpus Management (Supabase implementation) ─────────────────────────────

/**
 * In Supabase, a "Corpus" is just a logical grouping in the metadata.
 */
export async function createCorpus(folderId: string, folderName: string): Promise<string> {
  // We'll use the folder ID as the "corpus name" since it's unique
  return `supabase-corpus-${folderId}`;
}

export async function listAllGlobalCorpora(accessToken?: string): Promise<any[]> {
  const { data: docs, error } = await getSupabase()
    .from('documents')
    .select('original_path, metadata, created_at');
  
  if (error || !docs) return [];
  
  const uniqueFolders = new Map();
  for (const doc of docs) {
    const folderId = doc.original_path;
    if (!folderId || folderId === 'OPERATION_TRACKER') continue;
    
    if (!uniqueFolders.has(folderId)) {
      let fName = (doc.metadata as any)?.folder_name || 'Carpeta de Drive Indexada';
      
      // AUTO-REPAIR: If generic and we have an access token, fetch real name and update.
      if (accessToken && (fName === 'Carpeta de Drive Indexada' || !fName)) {
        try {
          const folderMeta = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=name&supportsAllDrives=true`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          }).then(r => r.json());
          
          if (folderMeta.name) {
            fName = folderMeta.name;
            // Background update — don't await to keep response fast
            getSupabase().from('documents').update({ 
               metadata: { ...((doc.metadata as any) || {}), folder_name: fName } 
            }).eq('original_path', folderId).then(() => console.log(`Cashed real name for ${folderId}: ${fName}`));
          }
        } catch (e) {
          console.error(`Failed to repair folder name for ${folderId}`, e);
        }
      }

      uniqueFolders.set(folderId, {
        name: `supabase-corpus-${folderId}`,
        displayName: `company-kb-${folderId}`,
        description: fName,
        createTime: doc.created_at
      });
    }
  }

  return Array.from(uniqueFolders.values());
}

export async function listRagFiles(corpusName: string): Promise<any[]> {
  // Extract folderId from corpusName (which is supabase-corpus-FOLDER_ID)
  const folderId = corpusName.replace('supabase-corpus-', '');
  
  const { data: docs, error } = await getSupabase()
    .from('documents')
    .select('id, name, status')
    .eq('original_path', folderId);
  
  if (error || !docs) return [];
  
  return docs.map(doc => ({
    displayName: doc.name,
    name: `documents/${doc.id}`
  }));
}

export async function deleteRagFile(ragFileName: string): Promise<void> {
  const docId = ragFileName.replace('documents/', '');
  // First delete chunks!
  await getSupabase().from('document_chunks').delete().eq('document_id', docId);
  // Then delete document
  await getSupabase().from('documents').delete().eq('id', docId);
}

export async function deleteCorpus(corpusName: string): Promise<void> {
  const folderId = corpusName.replace('supabase-corpus-', '');
  // Get all documents in this folder
  const { data: docs } = await getSupabase().from('documents').select('id').eq('original_path', folderId);
  if (docs && docs.length > 0) {
    const ids = docs.map(d => d.id);
    await getSupabase().from('document_chunks').delete().in('document_id', ids);
    await getSupabase().from('documents').delete().in('id', ids);
  }
}

// ─── Project number (Kept for compatibility) ─────────────────────────────────

let _cachedProjectNumber: string | null = null;
async function getProjectNumber(): Promise<string> {
  if (process.env.GOOGLE_CLOUD_PROJECT_NUMBER) return process.env.GOOGLE_CLOUD_PROJECT_NUMBER;
  if (_cachedProjectNumber) return _cachedProjectNumber;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const token = await getAdcToken();
  const data = await fetchWithRetry(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
  _cachedProjectNumber = String(data.projectNumber);
  return _cachedProjectNumber;
}

export async function grantRagAgentDriveAccess(folderId: string, userAccessToken: string): Promise<{ alreadyGranted: boolean; agentEmail: string }> {
  // No longer strictly needed for Supabase as we fetch files with user token,
  // but kept to avoid breaking types.
  return { alreadyGranted: true, agentEmail: 'supabase-rag-engine@local' };
}

// ─── File Import & Processing ─────────────────────────────────────────────────

export async function importDriveFolder(corpusName: string, folderId: string, accessToken: string): Promise<string> {
  const operationId = `op-${Date.now()}`;
  
  // Track in documents table (DB dependency, avoids serverless memory wipe)
  await getSupabase().from('documents').upsert({
    drive_file_id: operationId,
    name: 'IMPORT_OPERATION',
    original_path: 'OPERATION_TRACKER',
    status: 'indexing',
    metadata: { progress: 0 }
  });

  // Start background process (don't await)
  processImport(operationId, corpusName, folderId, accessToken).catch(console.error);

  return operationId;
}

async function processImport(operationId: string, corpusName: string, folderId: string, accessToken: string) {
  try {
    // 0. Update status to 'Discovering'
    await getSupabase().from('documents').update({ metadata: { progress: 5, status_text: 'Discovering files...' } }).eq('drive_file_id', operationId);

    // 1. Recursive file discovery helper
    const getAllFilesRecursive = async (fid: string): Promise<any[]> => {
      const res = await fetchWithRetry(
        `https://www.googleapis.com/drive/v3/files?q='${fid}' in parents and trashed=false&fields=files(id,name,mimeType)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const items = res.files || [];
      let allFiles: any[] = [];
      for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          const subFiles = await getAllFilesRecursive(item.id);
          allFiles = allFiles.concat(subFiles);
        } else {
          allFiles.push(item);
        }
      }
      return allFiles;
    };

    const files = await getAllFilesRecursive(folderId);
    const filesToProcess = files.filter((f: any) => {
      const isGSuite = f.mimeType.startsWith('application/vnd.google-apps.');
      const isNativePdf = f.mimeType === 'application/pdf';
      return isNativePdf || isGSuite;
    });

    console.log(`[STAGING] Moving ${filesToProcess.length} files to GCS Staging...`);
    await getSupabase().from('documents').update({ metadata: { progress: 15, status_text: `Staging ${filesToProcess.length} files...` } }).eq('drive_file_id', operationId);

    // 2. Parallel Copy to GCS (Fast Path)
    const bucket = storage.bucket(STAGING_BUCKET);
    const pLimit = 15; // Higher concurrency for cloud-to-cloud copy
    let stagedCount = 0;

    for (let i = 0; i < filesToProcess.length; i += pLimit) {
      const batch = filesToProcess.slice(i, i + pLimit);
      await Promise.all(batch.map(async (file: any) => {
        try {
          let downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
          if (file.mimeType.startsWith('application/vnd.google-apps.')) {
            downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=application/pdf`;
          }

          const response = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!response.ok) throw new Error(`Download failed: ${response.status}`);
          
          const gcsPath = `${operationId}/${file.id}.pdf`;
          const gcsFile = bucket.file(gcsPath);
          
          const arrayBuffer = await response.arrayBuffer();
          await gcsFile.save(Buffer.from(arrayBuffer), {
            metadata: { 
              contentType: 'application/pdf', 
              metadata: { original_name: file.name, folder_id: folderId } 
            }
          });
          stagedCount++;
        } catch (e) {
          console.error(`Error staging ${file.name}:`, e);
        }
      }));
      
      const progress = 15 + Math.round((stagedCount / filesToProcess.length) * 40);
      await getSupabase().from('documents').update({ 
        metadata: { progress, status_text: `Staging... (${stagedCount}/${filesToProcess.length})` } 
      }).eq('drive_file_id', operationId);
    }

    // 3. Trigger Discovery Engine Import
    console.log(`[INDEXING] Triggering Vertex Search Import for GCS path: ${operationId}/`);
    await getSupabase().from('documents').update({ 
      metadata: { progress: 65, status_text: 'Vincular con Motor de Búsqueda...' } 
    }).eq('drive_file_id', operationId);

    const parent = `projects/${PROJECT_ID}/locations/${LOCATION}/collections/default_collection/dataStores/${DATA_STORE_ID}`;
    const [operation] = await documentServiceClient.importDocuments({
      parent,
      gcsSource: {
        inputUris: [`gs://${STAGING_BUCKET}/${operationId}/*.pdf`],
        dataSchema: 'document',
      },
      reconciliationMode: 'INCREMENTAL',
    });

    // Fetch meta again to avoid lint error
    const { data: currentDoc } = await getSupabase().from('documents').select('metadata').eq('drive_file_id', operationId).single();
    const meta = currentDoc?.metadata as any;

    console.log(`[INDEXING] Started LRO: ${operation.name}`);
    
    // Save LRO Name for background tracking without breaking the polling ID
    await getSupabase().from('documents').update({ 
      metadata: { 
        ...meta,
        progress: 75, 
        status_text: 'Vertex AI indexando en segundo plano...',
        lro_name: operation.name,
        original_op: operationId 
      } 
    }).eq('drive_file_id', operationId);

    // Update the "Folder" record metadata so it shows as indexed
    await getSupabase().from('documents').upsert({
       drive_file_id: folderId,
       name: corpusName,
       original_path: folderId,
       status: 'indexing'
    }).then(() => console.log(`Linked folder ${folderId} to index workflow.`));

  } catch (error: any) {
    console.error('[IMPORT FLOW ERROR]', error);
    await getSupabase().from('documents').update({
      status: 'error',
      metadata: { progress: 0, error: error.message }
    }).eq('drive_file_id', operationId);
  }
}

export async function pollImportOperation(operationName: string): Promise<ImportOperationStatus> {
  // Fetch metadata from Supabase for all cases
  const { data: op } = await getSupabase()
    .from('documents')
    .select('status, metadata')
    .eq('drive_file_id', operationName)
    .single();

  const meta = op?.metadata as any;

  // If it's a native LRO (starts with projects/...)
  if (operationName.includes('projects/')) {
    // Standard Node.js GCP client way to get LRO status if using the helper
    const operation = await documentServiceClient.checkImportDocumentsProgress(operationName);
    
    // If the helper fails or is missing, we could use the operationsClient, 
    // but checkImportDocumentsProgress is the documented one for this client.
    // If it's not a list, it's the operation object.
    const op: any = Array.isArray(operation) ? operation[0] : operation;

    let status: any = 'RUNNING';
    if (op.done) {
       status = op.error ? 'FAILED' : 'DONE';
    }

    // Keep Supabase in sync
    await getSupabase().from('documents').update({
       status: status === 'DONE' ? 'complete' : (status === 'FAILED' ? 'error' : 'indexing'),
       metadata: { ...meta, progress: op.done ? 100 : 85, status_text: op.done ? 'Indexing complete' : 'Vertex Search is processing...' }
    }).eq('drive_file_id', operationName);

    return {
      name: operationName,
      status,
      progress: op.done ? 100 : 85,
      statusText: meta?.status_text,
      error: op.error?.message
    };
  }

  if (!op) return { name: operationName, status: 'FAILED', error: 'Operation not found' };
  
  let mappedStatus = 'RUNNING';
  if (op.status === 'complete') mappedStatus = 'DONE';
  if (op.status === 'error') mappedStatus = 'FAILED';

  return {
    name: operationName,
    status: mappedStatus as any,
    progress: meta?.progress ?? 0,
    statusText: meta?.status_text,
    error: meta?.error
  };
}

// ─── Context Retrieval (Vertex AI Search) ─────────────────────────────────────

export async function retrieveContexts(
  corpusName: string,
  query: string,
  topK: number = 5,
  distanceThreshold: number = 0.8
): Promise<RetrievedChunk[]> {
  const servingConfig = `projects/${PROJECT_ID}/locations/${LOCATION}/collections/default_collection/engines/${ENGINE_ID}/servingConfigs/default_serving_config`;

  const [response] = await searchServiceClient.search({
    servingConfig,
    query,
    pageSize: topK,
    contentSearchSpec: {
      snippetSpec: { returnSnippet: true },
      summarySpec: { summaryResultCount: 5, includeCitations: true }
    }
  });

  const results = response as any[];

  if (!results || results.length === 0) return [];

  return results.map((res: any) => {
    const doc = res.document;
    const metadata = doc?.structData;
    
    return {
      text: res.snippet || doc?.derivedStructData?.snippets?.[0]?.snippet || 'Sin vista previa disponible.',
      file_name: metadata?.original_name || doc?.id || 'Documento de Google',
      drive_url: metadata?.folder_id ? `https://drive.google.com/drive/folders/${metadata.folder_id}` : '',
      score: res.relevanceScore || 1.0
    };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDriveUrl(fileId: string): string {
  if (!fileId) return '';
  return `https://drive.google.com/file/d/${fileId}/view`;
}
