# Role: Principal AI Architect & Senior Fullstack Engineer

## Project Goal

Build a production-grade document intelligence application with two independent modes:

1. **Conversational Search** — Users ask natural language questions over indexed Google Drive documents and receive grounded answers with cited sources.
2. **Reference-Based Classification** — Users provide a reference document (PDF or Excel from Drive) containing a list of parts, materials, PN/SN codes, or any structured data. The app finds all documents in the indexed corpus that contain related information, shows a preview plan, waits for user approval, then copies matching files into a new organized folder in Drive. Originals are never modified.

Both modes operate over the same RAG Corpus. The difference is what the app does with retrieval results: answer or act.

---

## Core Architecture Principle

> **DO NOT build what Google already manages.**
> Prefer Vertex AI RAG Engine + managed services over any custom OCR, embedding, or vector pipeline.
> Only deviate when there is a concrete, documented limitation that cannot be worked around.

---

## Definitive Tech Stack

### Frontend
- **Next.js 14+ (App Router)**
- **Tailwind CSS** — minimal, functional UI
- **Vercel AI SDK** — streaming via `useChat` / `readStreamableValue`

### Backend
- **Next.js API Routes** — no separate backend unless strictly necessary
- **Google OAuth 2.0** — Drive access via scoped tokens
- **Google Drive API** — for copy and folder creation operations (Mode 2)
- **Vertex AI RAG Engine** — primary engine: ingestion, OCR, embeddings, retrieval
- **LLM Provider Layer** — unified OpenAI-compatible interface (see below)

### LLM Provider Layer (priority order)
```
1. OpenRouter       → cloud models, dynamic list from API, automatic fallback
2. Ollama           → local models installed on user's machine, same interface
3. Gemini 2.0 Flash → hardcoded backup if both above fail
```
All three use the same OpenAI-compatible schema. Switching between them requires only changing `baseURL` and `apiKey`. Model selector lives in **Settings panel**, not in the main flow.

### Storage (optional)
- **Supabase** — user configs, corpus metadata, search history, operation logs
- **NOT for vector storage** — RAG Engine manages vectors natively

---

## Architecture Overview

```
[Mode 1 — Conversational Search]
User query (natural language)
      ↓
retrieveContexts API → Top K chunks with metadata
      ↓
LLM Provider Layer → streaming response
      ↓
Answer + Sources displayed in UI

[Mode 2 — Reference-Based Classification]
User selects reference document (PDF or Excel from Drive)
      ↓
App extracts entities: PN, SN, materials, keywords, codes
      ↓
retrieveContexts per entity → scored matches across corpus
      ↓
App builds plan: file list with match reasons and scores
      ↓
User reviews and approves plan in UI
      ↓
Drive API: copy_file() + create_folder() → new organized folder
Originals untouched always.

[Shared Infrastructure]
Google Drive Folder
      ↓
Vertex AI RAG Engine
(google_drive_source → RAG Corpus → managed vector DB)
```

---

## MCP — Model Context Protocol

### Status: Architecture prepared now. Drive tools implemented in Phase 1. Extended tools in Phase 2.

MCP enables the LLM to execute actions, not just answer questions. This is required for Mode 2.

### Phase 1 — Implement now
| Tool | Description |
|------|-------------|
| `copy_file` | Copy a file to a destination folder in Drive |
| `create_folder` | Create a new folder inside a given parent folder |

### Phase 2 — Future
| Tool | Description |
|------|-------------|
| `rename_file` | Rename a file based on its content |
| `move_file` | Move file to a different folder |
| `batch_copy` | Copy multiple files in a single operation |
| `list_folder` | List contents of a Drive folder |

### Architecture Rules for MCP
- LLM receives tools in every request from day one — even in Mode 1 (it just won't call them)
- All tool calls require explicit user approval before execution
- Tool results are returned to the LLM to confirm success or handle errors
- Never execute Drive write operations without a logged user approval event

### Tool Call Format
```json
{
  "name": "copy_file",
  "parameters": {
    "file_id": "1abc...",
    "destination_folder_id": "1xyz...",
    "new_name": "optional_rename"
  }
}
```

---

## Critical Implementation Notes

### Google Drive → Vertex AI RAG Engine

1. Create RAG Corpus via `vertexai.rag.create_corpus()` — one corpus per user
2. Embedding model: `text-embedding-005`
3. Grant the Vertex AI RAG Data Service Agent `Viewer` access to the Drive folder
   - Format: `service-{PROJECT_NUMBER}@gcp-sa-vertex-rag.iam.gserviceaccount.com`
   - Find in IAM → "Include Google-provided role grants" → search "Vertex RAG Data Service Agent"
4. Import via `rag.import_files()` using `google_drive_source` + `RESOURCE_TYPE_FOLDER`
5. Chunking: `chunk_size=512`, `chunk_overlap=100`, `max_embedding_requests_per_min=900`
6. Poll operation status → show progress in UI
7. Store `corpus_name` in Supabase per user — never recreate if it exists

**⚠️ Known Limitation:** Vertex AI RAG Engine does NOT support Google Shared Drives (personal My Drive only). If Shared Drive is detected, show a clear error with instructions.

**Supported file formats:** TXT, PDF (native + scanned via built-in OCR), HTML, DOCX, PPTX, XLSX

---

## Functional Requirements

### Authentication
- Google OAuth 2.0 scopes:
  - `https://www.googleapis.com/auth/drive.readonly` — for indexing and reading reference docs
  - `https://www.googleapis.com/auth/drive.file` — for creating folders and copying files (Mode 2)
  - `https://www.googleapis.com/auth/cloud-platform` — for Vertex AI RAG Engine
- Tokens server-side only — never exposed to client
- Service account credentials in env vars only

### Mode 1 — Conversational Search
- User submits natural language query
- Backend calls `retrieveContexts` with `similarity_top_k=5`, `vector_distance_threshold=0.5`
- Retrieved chunks passed to LLM with grounding prompt
- Response streamed token by token to UI
- Sources always visible — never hidden behind a modal

**Response format:**
```json
{
  "answer": "natural language response",
  "sources": [
    {
      "file_name": "Q3_Report.pdf",
      "drive_url": "https://drive.google.com/...",
      "snippet": "matched text fragment",
      "relevance_score": 0.91
    }
  ]
}
```

### Mode 2 — Reference-Based Classification

**Step 1 — Reference document ingestion**
- User selects a PDF or Excel file from their Google Drive
- App fetches and parses the file:
  - PDF → extract text, identify lists, tables, codes
  - Excel → parse rows/columns, identify entity columns (PN, SN, description, etc.)
- LLM extracts structured entity list from the parsed content

**Step 2 — Corpus search**
- For each extracted entity, call `retrieveContexts`
- Aggregate results: deduplicate files, score by number of entity matches
- Build structured plan:
```json
{
  "destination_folder_name": "Clasificados_[date]",
  "files_to_copy": [
    {
      "file_id": "1abc...",
      "file_name": "Manual_Turbina_X200.pdf",
      "drive_url": "https://drive.google.com/...",
      "matched_entities": ["PN-4821", "SN-00392"],
      "match_score": 0.94
    }
  ]
}
```

**Step 3 — User approval**
- Show plan in UI: list of files with match reasons and scores
- User can deselect individual files before confirming
- Explicit "Confirmar y copiar" button — no auto-execution ever

**Step 4 — Execution**
- LLM calls `create_folder` tool → get new folder ID
- LLM calls `copy_file` for each approved file
- Progress shown in real time
- On completion: show summary + link to new Drive folder
- Log operation in Supabase (user_id, timestamp, files_copied, destination_folder)

---

## UI Structure

### Two distinct modes — clear navigation
```
[Header: logo + Drive connection status + Settings icon]

[Mode Toggle: "Buscar documentos"  |  "Clasificar por referencia"]

--- Mode 1 ---
[Centered search bar]
[Streaming answer]
[Sources — always visible, expandable cards]

--- Mode 2 ---
[Reference document selector (from Drive)]
[Entity extraction preview]
[Approval plan — file list with checkboxes and match scores]
[Confirm button]
[Execution progress + result summary]
```

### Settings Panel (not in main flow)
```
[LLM Provider: ○ OpenRouter  ○ Ollama  ○ Backup (Gemini 2.0 Flash)]
[If OpenRouter: model selector — fetched dynamically from OpenRouter API]
[If Ollama: model selector — fetched from localhost:11434/v1/models]
[RAG Corpus status + Sync button]
[Search history toggle]
```

### Design Tokens
```css
--bg: #FFFFFF;
--text-primary: #000000;
--accent: #1A365D;
--accent-light: #2A4A7F;
--border: #E2E8F0;
--surface: #F8FAFC;
```

### UX Rules
- Max 2 clicks from Drive connection to first search
- Sources always visible — never behind a modal
- User approval required before any Drive write operation
- All errors actionable — no generic "something went wrong"
- Streaming visible from first token in Mode 1

---

## Performance & Cost Guidelines
- Cache `corpus_name` in Supabase — never recreate existing corpus
- RAG Engine skips unchanged files on re-sync (version_id hash) — expose "Sync" button
- Use streaming for all LLM responses
- Batch entity lookups in Mode 2 where possible — avoid N+1 retrieve calls
- OpenRouter fallback chain handles model unavailability transparently

---

## Security & Privacy
- Never store raw file content in your own DB
- Drive scopes: `drive.readonly` for reading, `drive.file` for writing (scoped to app-created files only)
- Service account credentials server-side only (env vars, never client)
- One RAG corpus per user — strict isolation
- Log all Drive write operations with user_id and timestamp
- Approval event must be logged before any `copy_file` or `create_folder` call

---

## Deviation Protocol

Only introduce a custom pipeline if:
1. You hit a **documented** Vertex AI RAG Engine limitation
2. You need a file format RAG Engine doesn't support
3. You can demonstrate measurable latency or cost improvement with data

**If deviating:** Stop. Present limitation + alternative with concrete comparison before writing any code.

---

## Environment Variables
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=   # path to service account JSON
VERTEX_AI_LOCATION=us-central1
OPENROUTER_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434/v1
SUPABASE_URL=                      # optional
SUPABASE_ANON_KEY=                 # optional
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Drive connection to indexed | < 5 min for < 50 docs |
| Mode 1 search response | < 3 seconds |
| Mode 2 entity extraction | < 10 seconds for typical Excel/PDF |
| Sources always shown | 100% of Mode 1 responses |
| Originals never modified | Always — enforced at code level |
| User approval before write | Always — no exceptions |
| LLM fallback on model failure | Automatic via OpenRouter chain |

---

## Phase Roadmap

### Phase 1 — Current Scope
- Google OAuth + Drive connection
- RAG Corpus indexing
- Mode 1: Conversational search with sources
- Mode 2: Reference-based classification with approval flow
- MCP tools: `copy_file`, `create_folder`
- LLM Provider Layer: OpenRouter + Ollama + backup
- Settings panel with dynamic model selector

### Phase 2 — Future
- MCP tools: `rename_file`, `move_file`, `batch_copy`, `list_folder`
- Shared Drive support (via Cloud Storage intermediary)
- Search history dashboard
- Multi-corpus support (one per folder)
- Batch processing for large folders (100+ files)
