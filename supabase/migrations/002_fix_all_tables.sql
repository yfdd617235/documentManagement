
-- SUPABASE SCHEMA FOR DOCUMENT INTELLIGENCE
-- Includes Vector RAG (pgvector) and Metadata Management

-- Enable extension
create extension if not exists vector;

-- 1. Table for Corpora (logical groupings)
create table if not exists rag_corpora (
  id uuid primary key default gen_random_uuid(),
  user_id text unique not null,
  corpus_name text,
  folder_id text,
  last_sync timestamptz,
  file_count int,
  created_at timestamptz default now()
);

-- 2. User Settings
create table if not exists user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id text unique not null,
  llm_provider text,
  llm_model text,
  updated_at timestamptz default now()
);

-- 3. Operation Logs (for Audit/History)
create table if not exists operation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  operation_type text not null,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 4. Documents Table (Parent)
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text unique not null,
  name text not null,
  original_path text, -- Folder ID
  status text check (status in ('indexing', 'complete', 'error')),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 5. Document Chunks (Child)
create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  content text not null,
  metadata jsonb default '{}'::jsonb,
  embedding vector(768), -- text-embedding-004
  created_at timestamptz default now()
);

-- Index for vector search
create index if not exists document_chunks_embedding_idx on document_chunks 
using hnsw (embedding vector_cosine_ops);

-- 6. Import Operations (Job Tracking)
create table if not exists import_operations (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  status text not null check (status in ('RUNNING', 'DONE', 'FAILED')),
  progress int default 0,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 7. RPC for Search
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    document_chunks.id,
    document_chunks.content,
    document_chunks.metadata,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  where 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
end;
$$;
