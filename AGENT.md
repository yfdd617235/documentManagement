# Role: Principal AI Architect & Senior Fullstack Engineer

## Project Goal
Build a production-grade, highly resilient ("Anti-Fallas") document intelligence application with two independent modes:

1. **Conversational Search** — Users ask natural language questions over indexed Google Drive documents and receive grounded answers with cited sources.
2. **Reference-Based Classification** — Users provide a reference document (PDF or Excel from Drive) containing structured data. The app finds all documents in the indexed corpus that contain related information, shows a preview plan, then copies matching files into a new organized folder in Drive.

---

## Core Architecture Principle
> **DO NOT build what Google already manages.**
> Prefer Vertex AI RAG Engine + managed services over any custom OCR, embedding, or vector pipeline.
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
- **Vertex AI RAG Engine** — primary engine: ingestion, OCR, embeddings, retrieval
- **LLM Provider Layer** — unified OpenAI-compatible interface with Multi-Provider Fallback.
- **RAG Engine Anti-Fallas Wrapper** — A centralized `fetchWithRetry` utility with exponential backoff handling Google API rate limits (429) and transient errors (500, 503).

### LLM Resilient Provider Layer (priority order)
To guarantee 100% uptime, the LLM layer iterates through an array of models. If one fails or times out, the next is immediately tested transparently in the background:
```
1. Primary User Choice (e.g. Gemini 2.5 Flash in Primary Region)
2. Gemini Multi-Region Fallbacks (Europe, US East, US Central, Asia, Australia)
3. OpenRouter (Cloud models, dynamic lists)
4. Local Ollama Fallback
5. Default Hardcoded Gemini Backup
```

---

## Architecture Overview

```
[Mode 1 — Conversational Search]
User query (natural language)
      ↓
retrieveContexts API (wrapped in fetchWithRetry) → Top K chunks + metadata
      ↓
LLM Resilient Pipeline (attempts N providers/regions on failure) → stream
      ↓
Answer + Sources displayed in UI

[Mode 2 — Reference-Based Classification]
Reference document ingestion (OCR wrapped in fetchWithRetry)
      ↓
App extracts entities: PN, SN, materials, codes (Resilient LLM call)
      ↓
retrieveContexts per entity → scored matches across corpus
      ↓
Drive API: copy_file() + create_folder() → new organized folder (Originals untouched)
```

---

## Critical Implementation Notes

### Google Cloud Authentication on Vercel
Standard Google SDKs read a JSON file path. **In serverless environments (Vercel), this fails.**
*Fix:* We inject the raw service account JSON string into a Vercel Environment Variable (`GOOGLE_APPLICATION_CREDENTIALS_JSON`) and parse it in memory using `google-auth-library` to generate Google Application Default Credentials (ADC) tokens dynamically for REST API calls.

### Google Drive → Vertex AI RAG Engine
1. Embedding model: `text-embedding-005`
2. Grant the Vertex AI RAG Data Service Agent `Viewer` access to the Drive folder dynamically.
3. Import via `rag.import_files()` using `google_drive_source` + `RESOURCE_TYPE_FOLDER` (wrapped in exponential backoff).
4. Chunking: `chunk_size=512`, `chunk_overlap=100`, `max_embedding_requests_per_min=900`
5. **Rescue Files API**: Automatically catches PDFs that failed standard Vertex parsing, runs them through Gemini Vision OCR (with retries), and imports the transcription text files to the corpus automatically.

---

## Security & Privacy
- Never store raw file content in your own DB.
- Drive scopes: `drive.readonly` for reading, `drive.file` for writing (scoped to app-created files only).
- Service account credentials in strict server-side memory only (`GOOGLE_APPLICATION_CREDENTIALS_JSON`).
- One RAG corpus per user — strict isolation.

---

## Phase Roadmap Completion

### Phase 1 — Interactive Chat and Core RAG (Completed)
- Google OAuth + Drive connection
- RAG Corpus indexing + Conversational search
- Reference-based classification and Drive routing

### Phase 2 — Resilience and Armoring "Anti-Fallas" (Completed)
- Implemented `fetchWithRetry` with exponential backoff for complete RAG engine protection.
- Built multi-region Gemini failover chains in `lib/llm-provider.ts`.
- Hardened all core APIs (`chat`, `parse`, `rescue-files`) with zero-downtime retry loops. 
- Integrated sticky-nav UI for uninterrupted access.
