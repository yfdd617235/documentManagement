// Central TypeScript interfaces for the entire application
// Grouped by domain: Auth, RAG, LLM, Drive, Mode 1, Mode 2

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AppSession {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  accessToken: string;
  error?: 'RefreshAccessTokenError';
}

// ─── RAG / Corpus ─────────────────────────────────────────────────────────────

export interface CorpusRecord {
  id: string;
  user_id: string;
  corpus_name: string;
  folder_id: string;
  last_sync: string | null;
  file_count: number | null;
}

export interface ImportOperationStatus {
  name: string;          // operation name or full resource name
  status: 'RUNNING' | 'DONE' | 'FAILED';
  progress?: number;     // 0-100
  error?: string;
  failedIds?: string[];
}

// ─── LLM Provider ─────────────────────────────────────────────────────────────

export type LLMProvider = 'openrouter' | 'ollama' | 'backup';

export interface UserSettings {
  user_id: string;
  llm_provider: LLMProvider;
  llm_model: string | null;
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface ProviderModels {
  provider: LLMProvider;
  models: ModelOption[];
}

// ─── MCP Tools ────────────────────────────────────────────────────────────────

export interface CopyFileParams {
  file_id: string;
  destination_folder_id: string;
  new_name?: string;
}

export interface CreateFolderParams {
  name: string;
  parent_id: string;
}

// ─── Mode 1 — Conversational Search ──────────────────────────────────────────

export interface SourceReference {
  file_name: string;
  drive_url: string;
  snippet: string;
  relevance_score: number;
}

export interface SearchResponse {
  answer: string;
  sources: SourceReference[];
}

export interface RetrievedChunk {
  text: string;
  file_name?: string;
  drive_url?: string;
  score?: number;
}

// ─── Mode 2 — Reference-Based Classification ─────────────────────────────────

export interface ReferenceComponent {
  description: string;
  part_number: string;
  serial_number: string;
}

export interface ExtractedEntities {
  components: ReferenceComponent[];
  entity_type: string;
}

export interface FileToCopy {
  file_id: string;
  file_name: string;
  drive_url: string;
  matched_entities: string[];
  match_score: number;
}

export interface ClassificationFolder {
  id: string; // Internal ID for UI keying
  folder_name: string;
  files_to_copy: FileToCopy[];
}

export interface ClassificationPlan {
  master_folder_name: string;
  items: ClassificationFolder[];
}

export interface ExecutionResult {
  file_id: string;
  file_name: string;
  status: 'pending' | 'copying' | 'done' | 'failed';
  error?: string;
  new_file_id?: string;
}

export interface OperationLog {
  user_id: string;
  operation_type: 'approval' | 'create_folder' | 'copy_file';
  payload: Record<string, unknown>;
}
