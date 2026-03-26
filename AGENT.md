# Role: Principal AI Architect & Senior Fullstack Engineer

## Project Goal
Build a production-grade, highly resilient ("Anti-Fallas") document intelligence application with two independent modes:

1. **Conversational Search** — Users ask natural language questions over indexed Google Drive documents and receive grounded answers with cited sources.
2. **Reference-Based Classification** — Users provide a reference document (PDF or Excel from Drive) containing structured data. The app finds all documents in the indexed corpus that contain related information, shows a preview plan, then copies matching files into a new organized folder in Drive.

---

> **Optimize for Cost & Performance without sacrificing Resilience.**
> Transitioned from Vertex AI Managed RAG (Spanner) to **Supabase + pgvector** for vector storage and retrieval. This eliminates high fixed costs while maintaining state-of-the-art semantic search.
> **Design for Zero Downtime:** Wrap all external interactions in multi-region failovers and robust retry loops.

---

## Definitive Tech Stack & Hardware

### Frontend
- **Next.js 14+ (App Router)**
- **Tailwind CSS** — minimal, functional UI with sticky navbars for 100% visibility.
- **Vercel AI SDK** — streaming via `useChat` / `readStreamableValue`

### Backend & Resilience
- **Vercel Serverless Functions**
- **Google OAuth 2.0** — Drive access via scoped tokens
- **Supabase + pgvector** — Primary RAG Database for metadata and vector embeddings (HNSW index).
- **Vertex AI Embeddings** — uses `text-embedding-004` via REST API for cross-region stability.
- **LLM Provider Layer** — unified OpenAI-compatible interface with Multi-Provider Fallback.
- **RAG Engine (Custom implementation)** — Logic in `lib/rag-engine.ts` using Supabase as the backend.

### LLM Resilient Provider Layer (priority order)
To guarantee 100% uptime, the LLM layer iterates through an array of models. If one fails or times out, the next is immediately tested transparently in the background:
```
1. **Primary User Choice** (e.g. Gemini 1.5 Flash in Primary Region)
2. **Gemini Multi-Region Fallbacks** (Europe, US East, US Central, Asia, Australia)
3. **OpenRouter** (Claude/Llama models as backup)
4. **Local Ollama Fallback** (optional development)
5. **Default Hardcoded Gemini Backup** (Gemini 1.5 Flash in us-central1)
```

---

## Architecture Overview

```
[Mode 1 — Conversational Search]
User query (natural language)
      ↓
lib/rag-engine: retrieveContexts API → Vector Search in Supabase (pgvector)
      ↓
LLM Resilient Pipeline (attempts N providers/regions on failure) → stream
      ↓
Answer + Sources displayed in UI

[Mode 2 — Reference-Based Classification]
Reference document ingestion (OCR: pdf-parse / xlsx)
      ↓
App extracts entities: PN, SN, materials, codes (Resilient LLM call)
      ↓
retrieveContexts per entity → scored matches across Supabase corpus
      ↓
Drive API: copy_file() + create_folder() → new organized folder (Originals untouched)
```

---

## Critical Implementation Notes

### Supabase Integration
1. **Tables:** `documents` (metadata), `document_chunks` (vector embeddings + content).
2. **Vector Search:** Uses `match_documents` RPC with HNSW index for high-speed retrieval.
3. **Migration:** Moved from Google Cloud Spanner to Supabase to reduce monthly infrastructure costs while maintaining 100% functionality.

### Google Drive Ingestion (Custom Pipeline)
1. **Discovery:** Recursive file scan using user's OAuth token.
2. **Parsing:** Real-time PDF parsing (`pdf-parse`) and Excel parsing (`xlsx`).
3. **Exporting:** Automatic export of Google GSuite files (Docs, Sheets) to PDF for indexing.
4. **Chunking:** Semantic chunking (approx 2000 chars) with 200 char overlap for better context preservation.

### Google Cloud Authentication on Vercel
Standard Google SDKs read a JSON file path. **In serverless environments (Vercel), this fails.**
*Fix:* We inject the raw service account JSON string into a Vercel Environment Variable (`GOOGLE_APPLICATION_CREDENTIALS_JSON`) and parse it in memory.

---

## Security & Privacy
- Never store raw file content in your own DB (only chunks for search).
- Drive scopes: `drive.readonly` for reading, `drive.file` for writing.
- Service account credentials in strict server-side memory only.
- One RAG corpus per folder — logical isolation via `original_path` filtering.

---

## Phase Roadmap Completion

### Phase 1 — Interactive Chat and Core RAG (Completed)
- Google OAuth + Drive connection
- RAG Corpus indexing (Recursive) + Conversational search
- Reference-based classification and Drive routing

### Phase 2 — Resilience and Cost Optimization (Completed)
- **Supabase Migration:** Eliminated high Spanner costs by using pgvector ($0/mo base vs $60+/mo).
- **Multi-region Failover:** Gemini failover chains in `lib/llm-provider.ts` for 100% uptime.
- **Robust Indexing:** Recursive Drive navigation with real PDF and GSuite export parsing.
- **Standardized Skills:** Follows industry-standard patterns seen in `skills.sh`.
