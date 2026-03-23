/**
 * lib/rag-engine.ts
 *
 * Vertex AI RAG Engine wrappers.
 * Principle: use what Google already manages.
 * No custom OCR, no custom embeddings, no custom vector DB.
 *
 * SDK: @google-cloud/vertexai
 * Embedding model: text-embedding-005
 * Chunking: size=512, overlap=100
 */

import type { RetrievedChunk, ImportOperationStatus } from '@/types';

// ─── Shared ADC Token Helper ──────────────────────────────────────────────────
// Used to get the Application Default Credentials token for REST API calls
export async function getAdcToken(): Promise<string> {
  const { GoogleAuth } = await import('google-auth-library');
  
  // Vercel/Production: We often store the JSON as a secret environment variable
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  
  if (!credentialsJson) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable is missing.');
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch (e: any) {
    throw new Error(`Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON: ${e.message}`);
  }

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
    credentials,
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token!;
}

/**
 * Robust fetch wrapper with exponential backoff for Google APIs.
 * Transparently handles 429 (Rate Limit) and 503 (Service Unavailable).
 * Returns the parsed JSON body.
 */
export async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3): Promise<any> {
  let lastError: any;
  let delay = 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      
      // Success? Parse and return
      if (res.ok) {
        return await res.json();
      }

      // Client errors (4xx) except 429 are usually not retryable
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`API Error ${res.status}: ${await res.text()}`);
      }

      // Status 429 or 5xx → retry with backoff
      console.warn(`[RAG/FETCH] Retry ${i + 1}/${maxRetries} for ${url} (status ${res.status})`);
      lastError = new Error(`API Error ${res.status} after ${maxRetries} retries`);
      
    } catch (e: any) {
      lastError = e;
      if (e.message.includes('API Error 4')) { // Non-retryable client error
         throw e;
      }
    }

    await new Promise(r => setTimeout(r, delay));
    delay *= 2; // Exponential backoff
  }

  throw lastError;
}

// ─── Corpus management ────────────────────────────────────────────────────────

/**
 * Creates a new global shared RAG corpus for the company.
 * Embedding model: text-embedding-005.
 * Returns the corpus resource name (e.g. "projects/.../corpora/...")
 */
export async function createCorpus(folderId: string, folderName: string): Promise<string> {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const location = process.env.VERTEX_AI_LOCATION ?? 'us-central1';
  const token = await getAdcToken();

  const displayName = `company-kb-${folderId}`;
  const embeddingModel = `projects/${project}/locations/${location}/publishers/google/models/text-embedding-005`;

  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/ragCorpora`;
  
  const data = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      displayName,
      description: folderName, // Store the human-readable string here
      ragEmbeddingModelConfig: {
        vertexPredictionEndpoint: {
          endpoint: embeddingModel,
        },
      },
    }),
  });

  const operationName = data.name;
  
  // The API returns a Long Running Operation. We must poll it to get the actual Corpus Name.
  const pollUrl = `https://${location}-aiplatform.googleapis.com/v1beta1/${operationName}`;
  let retries = 10;
  while (retries > 0) {
    try {
      const pollData = await fetchWithRetry(pollUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (pollData.done) {
        if (pollData.error) throw new Error(`Corpus creation failed: ${pollData.error.message}`);
        return pollData.response.name; // This is the real corpus name: projects/.../ragCorpora/...
      }
    } catch (e) {
      console.warn("[RAG] Polling corpus creation failed, retrying...", e);
    }
    
    await new Promise(r => setTimeout(r, 2000));
    retries--;
  }

  throw new Error("Corpus creation timed out.");
}

/**
 * Lists all global shared corpora for the company.
 * Filters by the 'company-kb-' prefix.
 */
export async function listAllGlobalCorpora(): Promise<any[]> {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const location = process.env.VERTEX_AI_LOCATION ?? 'us-central1';
  const token = await getAdcToken();

  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/ragCorpora?pageSize=100`;

  const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
  const corpora = res.ragCorpora ?? [];
  return corpora.filter((c: any) => c.displayName?.startsWith('company-kb-'));
}

// ─── Corpus Management ────────────────────────────────────────────────────────

/**
 * Lists all files inside a specific RAG corpus.
 */
export async function listRagFiles(corpusName: string): Promise<any[]> {
  const token = await getAdcToken();
  const url = `https://${process.env.VERTEX_AI_LOCATION ?? 'us-central1'}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles?pageSize=100`;

  const data = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
  return data.ragFiles ?? [];
}

/**
 * Deletes a single file from the RAG corpus.
 * @param ragFileName The full resource name: projects/.../ragCorpora/.../ragFiles/...
 */
export async function deleteRagFile(ragFileName: string): Promise<void> {
  const token = await getAdcToken();
  const url = `https://${process.env.VERTEX_AI_LOCATION ?? 'us-central1'}-aiplatform.googleapis.com/v1beta1/${ragFileName}`;

  await fetchWithRetry(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

/**
 * Deletes the entire RAG corpus.
 */
export async function deleteCorpus(corpusName: string): Promise<void> {
  const token = await getAdcToken();
  const url = `https://${process.env.VERTEX_AI_LOCATION ?? 'us-central1'}-aiplatform.googleapis.com/v1beta1/${corpusName}`;

  await fetchWithRetry(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

// ─── Project number (auto-fetched from GCP if not in env) ────────────────────

let _cachedProjectNumber: string | null = null;

/**
 * Returns the GCP project number.
 *   1. Uses GOOGLE_CLOUD_PROJECT_NUMBER env var if set (fastest path, optional)
 *   2. Auto-fetches from Cloud Resource Manager API using project ID + ADC
 *
 * Result is cached in-process — only one API call per server lifetime.
 * This makes GOOGLE_CLOUD_PROJECT_NUMBER optional in .env.local.
 */
async function getProjectNumber(): Promise<string> {
  if (process.env.GOOGLE_CLOUD_PROJECT_NUMBER) {
    return process.env.GOOGLE_CLOUD_PROJECT_NUMBER;
  }
  if (_cachedProjectNumber) return _cachedProjectNumber;

  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      'GOOGLE_CLOUD_PROJECT_ID is not set. Check your .env.local file.'
    );
  }

  // Call Cloud Resource Manager with Application Default Credentials
  const token = await getAdcToken();

  const data = await fetchWithRetry(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
 
  if (!data.projectNumber) {
    throw new Error(
      `GCP returned no projectNumber for "${projectId}". ` +
      'Set GOOGLE_CLOUD_PROJECT_NUMBER manually in .env.local.'
    );
  }
 
  _cachedProjectNumber = String(data.projectNumber);
  return _cachedProjectNumber;
}

// ─── Drive permission grant ───────────────────────────────────────────────────

/**
 * Grants the Vertex AI RAG Data Service Agent "reader" access to a Drive folder.
 *
 * Service agent email: service-{PROJECT_NUMBER}@gcp-sa-vertex-rag.iam.gserviceaccount.com
 *
 * Project number is auto-fetched from Cloud Resource Manager if not in env.
 * Uses the user's OAuth access token — not a service account.
 */
export async function grantRagAgentDriveAccess(
  folderId: string,
  userAccessToken: string
): Promise<{ alreadyGranted: boolean; agentEmail: string }> {
  const projectNumber = await getProjectNumber();
  const ragServiceAgent = `service-${projectNumber}@gcp-sa-vertex-rag.iam.gserviceaccount.com`;

  // ── Step 1: Verify the folder exists and check if it's a Shared Drive ───────
  // We use supportsAllDrives=true so we CAN see Shared Drive files (to detect them)
  const meta = await fetchWithRetry(
    `https://www.googleapis.com/drive/v3/files/${folderId}` +
    `?fields=id,name,driveId,mimeType&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${userAccessToken}` } }
  );

  // ── Step 2: Reject Shared Drives (not supported by Vertex AI RAG Engine) ────
  const isSharedDrive = !!meta.driveId || meta.mimeType === 'application/vnd.google-apps.folder' && !!meta.driveId;
  if (isSharedDrive) {
    throw new Error(
      'SHARED_DRIVE_DETECTED: This folder is in a Shared Drive. ' +
      'Vertex AI RAG Engine does not support Shared Drives — only personal My Drive folders. ' +
      'Workaround: copy the folder contents to a folder in My Drive, then index that.'
    );
  }

  // ── Step 3: Check existing permissions and grant if needed ──────────────────
  const listData = await fetchWithRetry(
    `https://www.googleapis.com/drive/v3/files/${folderId}/permissions` +
    `?fields=permissions(emailAddress,role)&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${userAccessToken}` } }
  );

  const permissions = listData.permissions || [];
  const alreadyGranted = permissions?.some(
    (p: any) =>
      p.emailAddress?.toLowerCase() === ragServiceAgent.toLowerCase() &&
      ['reader', 'writer', 'owner'].includes(p.role)
  );

  if (alreadyGranted) return { alreadyGranted: true, agentEmail: ragServiceAgent };

  // Grant Viewer access to RAG service agent
  await fetchWithRetry(
    `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?supportsAllDrives=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'user',
        emailAddress: ragServiceAgent,
      }),
    }
  );

  return { alreadyGranted: false, agentEmail: ragServiceAgent };
}


// ─── File import ──────────────────────────────────────────────────────────────

/**
 * Starts an import operation for an entire Drive folder.
 * Returns the long-running operation name for polling.
 *
 * Chunk config as specified in AGENT.md:
 *   chunk_size=512, chunk_overlap=100, max_embedding_requests_per_min=900
 */
export async function importDriveFolder(
  corpusName: string,
  folderId: string
): Promise<string> {
  const location = process.env.VERTEX_AI_LOCATION ?? 'us-central1';
  const token = await getAdcToken();

  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles:import`;

  const payload = JSON.stringify({
    importRagFilesConfig: {
      googleDriveSource: {
        resourceIds: [
          {
            resourceId: folderId,
            resourceType: 'RESOURCE_TYPE_FOLDER',
          },
        ],
      },
      ragFileChunkingConfig: {
        chunkSize: 512,
        chunkOverlap: 100,
      },
      ragFileParsingConfig: {
        layoutParser: {
          maxParsingRequestsPerMin: 120, // Uses Google Document AI natively for OCR and layout parsing safely
        },
      },
      maxEmbeddingRequestsPerMin: 900,
    },
  });

  let data;
  let retries = 5;
  let delayMs = 3000;
 
  while (retries > 0) {
    try {
      data = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: payload,
      });
      break; 
    } catch (e: any) {
      // 404 or 500 are common when IAM permissions haven't finished propagating in Google's globally distributed systems.
      if (e.message.includes('404') || e.message.includes('500')) {
        retries--;
        if (retries === 0) throw e;
        await new Promise((r) => setTimeout(r, delayMs));
        delayMs += 2000;
      } else {
        throw e;
      }
    }
  }
 
  const operationName = data.name || data.operation?.name;
  if (!operationName) throw new Error('Started import but no operation name returned.');
  
  return operationName;
}

// ─── Operation status polling ─────────────────────────────────────────────────

/**
 * Polls a long-running operation (LRO) for import status.
 * Uses Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS).
 */
export async function pollImportOperation(
  operationName: string
): Promise<ImportOperationStatus> {
  const location = process.env.VERTEX_AI_LOCATION ?? 'us-central1';

  const url = `https://${location}-aiplatform.googleapis.com/v1/${operationName}`;

  const token = await getAdcToken();

  const data = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (data.error) {
    return {
      name: operationName,
      status: 'FAILED',
      error: data.error.message ?? 'Import failed with unknown error.',
    };
  }

  if (data.done) {
    const response = data.response || {};
    const imported = parseInt(response.importedRagFilesCount || '0', 10);
    const failed = parseInt(response.failedRagFilesCount || '0', 10);
    
    // Catch silent Vertex AI backend crashes (0 files succeeded, but job marked as DONE)
    if (imported === 0 && failed > 0) {
      const partials = data.metadata?.genericMetadata?.partialFailures || [];
      const failedIds = partials.map((f: any) => {
        // extract the ID if it matches the standard error pattern
        const match = f.message?.match(/processing ([\w-]+)/);
        return match ? match[1] : f.message;
      }).filter(Boolean);
      
      const failedListStr = failedIds.length > 0 
        ? ` Archivos de Drive con falla (IDs): ${failedIds.slice(0, 5).join(', ')}${failedIds.length > 5 ? ' y más...' : ''}` 
        : '';
        
      return {
        name: operationName,
        status: 'FAILED',
        error: `Import failed: All ${failed} Google Drive files experienced an internal parsing error in Google Cloud.${failedListStr}`,
        failedIds
      };
    }
    
    return { name: operationName, status: 'DONE', progress: 100 };
  }

  const progress =
    data.metadata?.progressPercentage ??
    data.metadata?.genericMetadata?.progressPercentage ??
    undefined;

  return {
    name: operationName,
    status: 'RUNNING',
    progress: typeof progress === 'number' ? Math.round(progress) : undefined,
  };
}

// ─── Context retrieval ────────────────────────────────────────────────────────

/**
 * Retrieves relevant chunks from the RAG corpus for a given query.
 *
 * topK=5 for Mode 1, topK=3 for Mode 2 per-entity search.
 * distanceThreshold=0.5 as specified in AGENT.md.
 */
export async function retrieveContexts(
  corpusName: string,
  query: string,
  topK: number = 5,
  distanceThreshold: number = 0.5
): Promise<RetrievedChunk[]> {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const location = process.env.VERTEX_AI_LOCATION ?? 'us-central1';
  const token = await getAdcToken();

  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}:retrieveContexts`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const data = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        vertexRagStore: {
          ragCorpora: [corpusName],
          vectorDistanceThreshold: distanceThreshold, // Flat field in vertexRagStore
        },
        query: { text: query },
      }),
    });
 
    console.log(`[RAG DEBUG] corpus=${corpusName} query="${query}"`);
 
    const contexts = data?.contexts?.contexts ?? [];

    return contexts.map((ctx: any) => ({
      text: ctx.text ?? '',
      file_name:
        ctx.sourceUri?.split('/').pop() ??
        ctx.sourceDisplayName ??
        'Unknown file',
      drive_url: buildDriveUrl(ctx.sourceUri ?? ''),
      score: ctx.score ?? ctx.distance ?? undefined,
    }));
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a Vertex AI source URI to a public Google Drive URL.
 */
function buildDriveUrl(sourceUri: string): string {
  if (sourceUri.startsWith('https://drive.google.com')) return sourceUri;

  const driveMatch = sourceUri.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/view`;

  if (sourceUri.startsWith('gs://')) return '';

  if (/^[a-zA-Z0-9_-]{25,}$/.test(sourceUri)) {
    return `https://drive.google.com/file/d/${sourceUri}/view`;
  }

  return '';
}
