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

async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
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
      instances: texts.map(t => ({ content: t })),
    }),
  });

  return data.predictions.map((p: any) => p.embeddings.values);
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
    
    // Recursive file discovery helper
    const getAllFilesRecursive = async (fid: string): Promise<any[]> => {
      const res = await fetchWithRetry(
        `https://www.googleapis.com/drive/v3/files?q='${fid}' in parents and trashed=false&fields=files(id,name,mimeType)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const items = res.files || [];
      let allFiles: any[] = [];
      for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          console.log(`Found subfolder: ${item.name} (ID: ${item.id}). Scanning...`);
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
      if (!isNativePdf && !isGSuite) {
        console.log(`Skipping non-compatible file: ${f.name} (${f.mimeType})`);
        return false;
      }
      return true;
    });

    console.log(`Discovery complete. Found ${filesToProcess.length} valid items in tree.`);
    let completedCount = 0;

    // Helper for parallel mapping with concurrency limit
    const pLimit = 5; // Process 5 PDFs entirely in parallel
    for (let i = 0; i < filesToProcess.length; i += pLimit) {
      const batch = filesToProcess.slice(i, i + pLimit);
      
      await Promise.all(batch.map(async (file: any) => {
        try {
          console.log(`Processing file: ${file.name} (ID: ${file.id})`);

          // 2. [Upsert] Document record
          const { data: docRecord, error: docError } = await getSupabase()
            .from('documents')
            .upsert({
              drive_file_id: file.id,
              name: file.name,
              original_path: folderId,
              status: 'indexing',
              metadata: { folder_name: folderName }
            }, { onConflict: 'drive_file_id' })
            .select()
            .single();
          
          if (docError) {
            console.error('[SUPABASE DOC ERROR]', docError);
            return; // skip file if record failed
          }

          const documentUuid = docRecord.id;

          // 3. Download/Parse
          let content = '';
          try {
            let downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
            if (file.mimeType.startsWith('application/vnd.google-apps.')) {
              downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=application/pdf`;
            }

            const downloadRes = await fetch(downloadUrl, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (!downloadRes.ok) throw new Error(`Failed download: ${downloadRes.status}`);
            
            const buffer = Buffer.from(await downloadRes.arrayBuffer());
            const pdf = (await import('pdf-parse')).default;
            const parsed = await pdf(buffer);
            content = parsed.text;
            
            if (!content || content.trim().length === 0) {
              throw new Error('PDF yielded no text content');
            }
          } catch (e: any) {
            console.error(`[PDF PARSE ERROR] ${file.name}:`, e.message);
            await getSupabase().from('documents').update({ 
              status: 'error', 
              metadata: { ...((docRecord?.metadata as any) || {}), error: e.message } 
            }).eq('id', documentUuid);
            return;
          }

          const chunks = chunkText(content);
          console.log(`Splitting ${file.name} into ${chunks.length} chunks...`);
          
          const BATCH_SIZE = 15;
          for (let j = 0; j < chunks.length; j += BATCH_SIZE) {
            const chunkBatch = chunks.slice(j, j + BATCH_SIZE);
            const embeddings = await getEmbeddingsBatch(chunkBatch);

            const rows = chunkBatch.map((text, idx) => ({
              document_id: documentUuid,
              content: text,
              embedding: embeddings[idx],
              metadata: {
                file_name: file.name,
                file_id: file.id,
                chunk_index: j + idx,
                total_chunks: chunks.length
              }
            }));

            const { error: insertError } = await getSupabase()
              .from('document_chunks')
              .insert(rows);

            if (insertError) {
               throw new Error(`Failed to store chunks: ${insertError.message}`);
            }
          }

          await getSupabase().from('documents').update({ status: 'complete' }).eq('id', documentUuid);
        } catch (e: any) {
          console.error(`[FILE PROCESS ERR] ${file.name}:`, e);
        } finally {
          completedCount++;
          await getSupabase().from('documents').update({
            metadata: { progress: Math.min(99, Math.round((completedCount / filesToProcess.length) * 100)) }
          }).eq('drive_file_id', operationId);
        }
      }));
    }

    await getSupabase().from('documents').update({
      status: 'complete',
      metadata: { progress: 100 }
    }).eq('drive_file_id', operationId);
    console.log(`[RAG IMPORT] Operation ${operationId} completed successfully.`);

  } catch (error: any) {
    console.error('[RAG IMPORT ERROR]', error);
    await getSupabase().from('documents').update({
      status: 'error',
      metadata: { progress: 0, error: error.message }
    }).eq('drive_file_id', operationId);
  }
}

export async function pollImportOperation(operationName: string): Promise<ImportOperationStatus> {
  const { data: op } = await getSupabase()
    .from('documents')
    .select('status, metadata')
    .eq('drive_file_id', operationName)
    .single();
  
  if (!op) return { name: operationName, status: 'FAILED', error: 'Operation not found' };
  
  let mappedStatus = 'RUNNING';
  if (op.status === 'complete') mappedStatus = 'DONE';
  if (op.status === 'error') mappedStatus = 'FAILED';

  const meta = op.metadata as any;

  return {
    name: operationName,
    status: mappedStatus as any,
    progress: meta?.progress ?? 0,
    error: meta?.error
  };
}

// ─── Context Retrieval ────────────────────────────────────────────────────────

export async function retrieveContexts(
  corpusName: string,
  query: string,
  topK: number = 5,
  distanceThreshold: number = 0.8
): Promise<RetrievedChunk[]> {
  // 1. Generate Query Embedding
  const queryEmbeddings = await getEmbeddingsBatch([query]);
  const queryEmbedding = queryEmbeddings[0];

  // 2. Search Supabase via RPC
  const { data: matches, error } = await getSupabase().rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_threshold: Math.max(0.2, 1 - distanceThreshold),
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
