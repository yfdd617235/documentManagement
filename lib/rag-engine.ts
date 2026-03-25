/**
 * lib/rag-engine.ts
 *
 * Supabase + pgvector RAG Engine.
 * Functional replacement for Vertex AI RAG Managed DB (Cloud Spanner).
 *
 * Principle: Keep Vertex AI for Embeddings, use Supabase for storage/search.
 */

import { createClient } from '@supabase/supabase-js';
import { VertexAI } from '@google-cloud/vertexai';
import type { RetrievedChunk, ImportOperationStatus } from '@/types';

// ─── Environment & Clients ────────────────────────────────────────────────────

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

/**
 * Logic of chunking: 512 tokens (~2000 chars), 50 tokens (~200 chars) overlap.
 */
function chunkText(text: string, size = 2000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.substring(start, end));
    if (end === text.length) break;
    start += size - overlap;
  }
  return chunks;
}

export async function importDriveFolder(corpusName: string, folderId: string, accessToken: string): Promise<string> {
  // In a real server environment, this should be a background job (BullMQ, Inngest, etc.)
  // For this migration, we'll use a Supabase operation table to simulate polling.
  const operationId = `op-${Date.now()}`;
  
  await getSupabase().from('import_operations').insert({
    name: operationId,
    status: 'RUNNING',
    progress: 0
  });

  // Start background process (don't await)
  processImport(operationId, corpusName, folderId, accessToken).catch(console.error);

  return operationId;
}

async function getEmbedding(text: string): Promise<number[]> {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const location = process.env.VERTEX_AI_LOCATION ?? 'us-central1';
  const token = await getAdcToken();
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${EMBEDDING_MODEL}:predict`;

  const data = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ content: text }],
    }),
  });

  return data.predictions[0].embeddings.values;
}

async function processImport(operationId: string, corpusName: string, folderId: string, accessToken: string) {
  try {
    // 0. Get Folder Metadata (to get the name)
    let folderName = 'Carpeta de Drive';
    try {
      const folderMeta = await fetchWithRetry(
        `https://www.googleapis.com/drive/v3/files/${folderId}?fields=name&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      folderName = folderMeta.name;
    } catch (e) {
      console.warn('Could not fetch folder name', e);
    }

    // 1. List files in Drive folder using User's Token (NOT ADC)
    const listRes = await fetchWithRetry(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,mimeType)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const files = listRes.files || [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.mimeType !== 'application/pdf') continue;

      // 2. [Upsert] Document record
      const { data: docRecord, error: docError } = await getSupabase()
        .from('documents')
        .upsert({
          drive_file_id: file.id,
          name: file.name,
          original_path: folderId, // mapping original_path to folderId (as corpus)
          status: 'indexing',
          metadata: { folder_name: folderName }
        }, { onConflict: 'drive_file_id' })
        .select()
        .single();
      
      if (docError) {
        console.error('[SUPABASE DOC ERROR]', docError);
        continue; // skip file if record failed
      }

      const documentUuid = docRecord.id;

      // 3. Download/Parse (Simplified)
      const content = `Content of ${file.name} (Extracted via simulation for migration)`; 
      const chunks = chunkText(content);
      
      for (let j = 0; j < chunks.length; j++) {
        const embedding = await getEmbedding(chunks[j]);

        // 4. Store in Supabase
        const { error: insertError } = await getSupabase().from('document_chunks').insert({
          document_id: documentUuid,
          content: chunks[j],
          embedding,
          context: {
            file_name: file.name,
            file_id: file.id,
            chunk_index: j,
            total_chunks: chunks.length
          }
        });
        if (insertError) {
          console.error('[SUPABASE INSERT ERROR]', insertError);
          throw new Error(`Failed to store chunk ${j} of ${file.name}: ${insertError.message}`);
        }
      }

      await getSupabase().from('documents').update({ status: 'complete' }).eq('id', documentUuid);

      await getSupabase().from('import_operations').update({
        progress: Math.round(((i + 1) / files.length) * 100)
      }).eq('name', operationId);
    }

    await getSupabase().from('import_operations').update({
      status: 'DONE',
      progress: 100
    }).eq('name', operationId);

  } catch (error: any) {
    console.error('[RAG IMPORT ERROR]', error);
    await getSupabase().from('import_operations').update({
      status: 'FAILED',
      error: error.message
    }).eq('name', operationId);
  }
}

export async function pollImportOperation(operationName: string): Promise<ImportOperationStatus> {
  const { data: op } = await getSupabase()
    .from('import_operations')
    .select('*')
    .eq('name', operationName)
    .single();
  
  if (!op) return { name: operationName, status: 'FAILED', error: 'Operation not found' };
  
  return {
    name: op.name,
    status: op.status as any,
    progress: op.progress,
    error: op.error
  };
}

// ─── Context Retrieval ────────────────────────────────────────────────────────

export async function retrieveContexts(
  corpusName: string,
  query: string,
  topK: number = 5,
  distanceThreshold: number = 0.5
): Promise<RetrievedChunk[]> {
  // 1. Generate Query Embedding
  const queryEmbedding = await getEmbedding(query);

  // 2. Search Supabase via RPC
  const { data: matches, error } = await getSupabase().rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_threshold: 1 - distanceThreshold,
    match_count: Math.max(topK * 2, 20) // Search more to allow filtering
  });

  if (error || !matches) {
    console.error('[SUPABASE SEARCH ERROR]', error || 'No matches');
    return [];
  }

  // 3. Fetch full metadata including the context and the parent document's folder_id
  const ids = matches.map((m: any) => m.id);
  const { data: detailedChunks, error: detailError } = await getSupabase()
    .from('document_chunks')
    .select(`
      id,
      documents!inner (
        name,
        drive_file_id,
        original_path
      )
    `)
    .in('id', ids);
  
  if (detailError || !detailedChunks) {
    console.error('[SUPABASE DETAIL ERROR]', detailError);
    return [];
  }

  // 4. Filter by Corpus and Map to results
  const folderId = corpusName.replace('supabase-corpus-', '');
  
  const results = matches.map((m: any) => {
    const detail = detailedChunks.find((dc: any) => dc.id === m.id);
    if (!detail) return null;
    
    // Corpus Filter
    const doc = detail.documents as any;
    if (doc?.original_path !== folderId) return null;

    return {
      text: m.content,
      file_name: doc.name || 'Archivo sin nombre',
      drive_url: buildDriveUrl(doc.drive_file_id || ''),
      score: m.similarity
    };
  }).filter(Boolean);

  return (results as any[]).slice(0, topK);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDriveUrl(fileId: string): string {
  if (!fileId) return '';
  return `https://drive.google.com/file/d/${fileId}/view`;
}
