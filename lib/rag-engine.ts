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

import { VertexAI } from '@google-cloud/vertexai';
import type { RetrievedChunk, ImportOperationStatus } from '@/types';

// ─── SDK initialization ───────────────────────────────────────────────────────

function getVertexClient() {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION ?? 'us-central1';
  if (!project) {
    throw new Error(
      'GOOGLE_CLOUD_PROJECT_ID is not set. Check your .env.local file.'
    );
  }
  return new VertexAI({ project, location });
}

// The RAG service uses a sub-client under vertexai.preview
function getRagClient() {
  const vertexai = getVertexClient();
  return (vertexai as any).preview?.rag ?? (vertexai as any).rag;
}

// ─── Corpus management ────────────────────────────────────────────────────────

/**
 * Creates a new RAG corpus for a user.
 * Embedding model: text-embedding-005.
 * Returns the corpus resource name (e.g. "projects/.../corpora/...")
 */
export async function createCorpus(userId: string): Promise<string> {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const location = process.env.VERTEX_AI_LOCATION ?? 'us-central1';
  const rag = getRagClient();

  const displayName = `doc-intelligence-${userId.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
  const embeddingModel = `projects/${project}/locations/${location}/publishers/google/models/text-embedding-005`;

  const corpus = await rag.createCorpus({
    displayName,
    ragEmbeddingModelConfig: {
      vertexPredictionEndpoint: {
        publisherModel: embeddingModel,
      },
    },
  });

  return corpus.name as string;
}

/**
 * Lists all corpora and finds one whose display name matches the user.
 * Used as fallback when Supabase is not configured.
 */
export async function findCorpusByDisplayName(
  userId: string
): Promise<string | null> {
  const rag = getRagClient();
  const safeName = `doc-intelligence-${userId.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

  try {
    const corpora = await rag.listCorpora();
    if (!corpora || !Array.isArray(corpora)) return null;
    const match = corpora.find((c: any) => c.displayName === safeName);
    return match?.name ?? null;
  } catch {
    return null;
  }
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
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  const res = await fetch(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Could not auto-fetch project number for "${projectId}": ` +
      `${err?.error?.message ?? res.statusText}. ` +
      'Fix: set GOOGLE_CLOUD_PROJECT_NUMBER manually in .env.local ' +
      '(find it at https://console.cloud.google.com/home/dashboard).'
    );
  }

  const data = await res.json();
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

  // Check if permission already exists
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?fields=permissions(emailAddress,role)`,
    { headers: { Authorization: `Bearer ${userAccessToken}` } }
  );

  if (!listRes.ok) {
    const err = await listRes.json();
    const msg = err?.error?.message ?? listRes.statusText;

    // Detect Shared Drive
    if (
      msg.toLowerCase().includes('teamdrive') ||
      msg.toLowerCase().includes('shared drive')
    ) {
      throw new Error(
        'SHARED_DRIVE_DETECTED: Vertex AI RAG Engine does not support Shared Drives. ' +
        'Please use a folder in your personal My Drive. ' +
        'Workaround: copy the folder to My Drive, then index the copy.'
      );
    }
    throw new Error(`Failed to check folder permissions: ${msg}`);
  }

  const { permissions } = await listRes.json();
  const alreadyGranted = permissions?.some(
    (p: any) =>
      p.emailAddress?.toLowerCase() === ragServiceAgent.toLowerCase() &&
      ['reader', 'writer', 'owner'].includes(p.role)
  );

  if (alreadyGranted) return { alreadyGranted: true, agentEmail: ragServiceAgent };

  // Grant Viewer access
  const createRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}/permissions`,
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

  if (!createRes.ok) {
    const err = await createRes.json();
    const msg = err?.error?.message ?? createRes.statusText;
    throw new Error(
      `Failed to grant Viewer access to RAG service agent (${ragServiceAgent}): ${msg}. ` +
      'Ensure the folder is in My Drive (not Shared Drive) and you have sharing permissions.'
    );
  }

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
  const rag = getRagClient();

  const operation = await rag.importRagFiles({
    parent: corpusName,
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
      maxEmbeddingRequestsPerMin: 900,
    },
  });

  return operation.name as string;
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

  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to poll import status: ${err?.error?.message ?? res.statusText}. ` +
      'Check that GOOGLE_APPLICATION_CREDENTIALS is set correctly.'
    );
  }

  const data = await res.json();

  if (data.error) {
    return {
      name: operationName,
      status: 'FAILED',
      error: data.error.message ?? 'Import failed with unknown error.',
    };
  }

  if (data.done) {
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
  const rag = getRagClient();

  const response = await rag.retrieveContexts({
    vertex_rag_store: {
      rag_corpora: [corpusName],
      rag_retrieval_config: {
        top_k: topK,
        vector_distance_threshold: distanceThreshold,
      },
    },
    query: { text: query },
  });

  const contexts = response?.contexts?.contexts ?? [];

  return contexts.map((ctx: any) => ({
    text: ctx.text ?? '',
    file_name:
      ctx.sourceUri?.split('/').pop() ??
      ctx.sourceDisplayName ??
      'Unknown file',
    drive_url: buildDriveUrl(ctx.sourceUri ?? ''),
    score: ctx.score ?? ctx.distance ?? undefined,
  }));
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
