# Document Intelligence by YOSEF GIRALDO

A production-grade document intelligence app with two modes:

1. **Conversational Search** — Ask natural language questions over your Google Drive documents
2. **Reference-Based Classification** — Upload a reference doc, find matching files, copy them to an organized folder

Built with: Next.js 14 · Vertex AI RAG Engine · Google OAuth 2.0 · OpenRouter/Ollama/Gemini LLM layer

---

## Required Environment Variables

Create a `.env.local` file in the project root with the following variables:

```
# Google OAuth 2.0
# Get from: https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# NextAuth
# Generate: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# Google Cloud / Vertex AI
GOOGLE_CLOUD_PROJECT_ID=
VERTEX_AI_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account.json

# Optional: set manually or auto-fetched from Cloud Resource Manager
GOOGLE_CLOUD_PROJECT_NUMBER=

# LLM Providers (all optional — app falls back to Gemini backup)
OPENROUTER_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434/v1

# Supabase (fully optional — app works without persistence)
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

## Getting Started

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` and click **Connect Google Drive**.

## Supabase Schema

Run `docs/supabase-schema.sql` in your Supabase SQL Editor to create the required tables.
