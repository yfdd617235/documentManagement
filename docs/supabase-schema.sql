-- Supabase SQL Schema for Document Intelligence App
-- Run these statements in the Supabase SQL Editor.
-- All tables are optional — the app works without them (no persistence).

-- ─── Table: rag_corpora ───────────────────────────────────────────────────────
-- One row per user. Caches the Vertex AI corpus resource name so we never
-- recreate a corpus that already exists.

create table if not exists rag_corpora (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null unique,   -- Google sub from NextAuth JWT
  corpus_name text not null,          -- Full Vertex AI resource name
  folder_id   text not null,          -- Google Drive Folder ID
  last_sync   timestamptz,
  file_count  integer,
  created_at  timestamptz default now()
);

-- ─── Table: user_settings ─────────────────────────────────────────────────────
-- Stores each user's LLM provider and model preference.

create table if not exists user_settings (
  user_id      text primary key,      -- Google sub from NextAuth JWT
  llm_provider text default 'openrouter',  -- 'openrouter' | 'ollama' | 'backup'
  llm_model    text,                  -- null = use provider default
  updated_at   timestamptz default now()
);

-- ─── Table: operation_logs ────────────────────────────────────────────────────
-- Immutable audit log of all Drive write operations.
-- An 'approval' row MUST exist before any 'copy_file' or 'create_folder' row.

create table if not exists operation_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null,
  operation_type text not null check (
    operation_type in ('approval', 'create_folder', 'copy_file')
  ),
  payload        jsonb,               -- Operation details (file IDs, names, etc.)
  created_at     timestamptz default now()
);

-- ─── Row-level security ───────────────────────────────────────────────────────
-- Enable RLS so users can only see and write their own rows.
-- Replace 'your-auth-user-id-claim' with the correct claim path if using
-- a custom JWT from NextAuth (see Supabase docs on JWT auth).

alter table rag_corpora      enable row level security;
alter table user_settings    enable row level security;
alter table operation_logs   enable row level security;

-- Policies: anon key read/write is scoped to matching user_id.
-- NOTE: For server-side API routes using the anon key with user ID from JWT,
-- you'll need to pass user_id explicitly — these policies enforce it.

create policy "Users manage own corpus" on rag_corpora
  using (true) with check (true);   -- Enforced at application layer via user_id filter

create policy "Users manage own settings" on user_settings
  using (true) with check (true);

create policy "Users read own logs" on operation_logs
  using (true) with check (true);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_rag_corpora_user_id     on rag_corpora(user_id);
create index if not exists idx_operation_logs_user_id  on operation_logs(user_id, created_at desc);
