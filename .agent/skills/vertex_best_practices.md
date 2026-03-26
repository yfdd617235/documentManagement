# Vertex AI Development Skills

This document "installs" the knowledge and best practices for Vertex AI development as found in the [skills.sh](https://skills.sh/?q=vertex) directory.

## 🛠️ Unified SDK Directive
- **Package:** Use `@google/genai` (Gen AI SDK) for all high-level model and RAG interactions.
- **Legacy avoidance:** Do not use legacy SDKs (`google-cloud-aiplatform`, `@google-cloud/vertexai`) for new generative features unless a specific low-level discovery service is required.

## 🔍 Search & RAG Best Practices
- **Embeddings Task Types:**
    - Use `RETRIEVAL_QUERY` for user questions.
    - Use `RETRIEVAL_DOCUMENT` for document ingestion.
- **Dimensions:** Prefer 3072 dimensions for pre-normalized vectors.
- **Rate Limits:** Respect 100 RPM for the free tier.

## 📂 Google Drive Integration
- **Direct Sync:** Use native `driveSource` in Vertex AI Search (`importDocuments`) to achieve maximum transfer speed.
- **Service Agent Permission:** Grant "Viewer" access to the Google Cloud Service Agent:
  `service-250935347147@gcp-sa-enterpriseknowledge.iam.gserviceaccount.com`
- **Automation:** Use specialized OAuth patterns if managing multi-user Drive access.

## 💰 Cost Optimization
- **Zero Base Cost:** Avoid "Managed RAG" if it forces the use of Google Cloud Spanner ($400/mo). Use Vertex AI Search (Agent Builder) for a pure pay-per-query model.
