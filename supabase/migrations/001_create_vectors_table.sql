-- Enable the pgvector extension to work with embeddings
create extension if not exists vector;

-- Create a table to store document chunks and their embeddings
create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id text not null,        -- Drive File ID or Local Filename
  part_number text,                 -- Associated Part Number
  serial_number text,               -- Associated Serial Number
  content text not null,            -- The text chunk content
  metadata jsonb default '{}'::jsonb, -- Additional metadata (chunk index, etc)
  embedding vector(768)             -- Google text-embedding-004 uses 768 dimensions
);

-- Create an HNSW index for efficient similarity search
-- Using cosine distance as it is the standard for text embeddings
create index if not exists document_chunks_embedding_idx on document_chunks 
using hnsw (embedding vector_cosine_ops);

-- RPC function to perform vector similarity search
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  document_id text,
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
    document_chunks.document_id,
    document_chunks.content,
    document_chunks.metadata,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  where 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
end;
$$;

-- Table to track background import operations (simulating Vertex AI LROs)
create table if not exists import_operations (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,      -- Unique identifier for polling
  status text not null check (status in ('RUNNING', 'DONE', 'FAILED')),
  progress int default 0,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
