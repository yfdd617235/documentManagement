# Guía de Restauración: Infraestructura Spanner (Google Cloud)

Este documento contiene toda la información necesaria para revertir el motor RAG de Supabase a la infraestructura original de **Google Cloud Spanner** y **Vertex AI RAG Engine**.

## 🛠 Variables de Entorno (Legacy)
Para reactivar Spanner, se deben restaurar los siguientes valores en el archivo `.env`:

```env
# Google Cloud Platform Configuration
GOOGLE_CLOUD_PROJECT=document-intelligence-452302
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_CLOUD_API_ENDPOINT=us-central1-discoveryengine.googleapis.com
GOOGLE_APPLICATION_CREDENTIALS=c:\Users\ydgs9\Documents\Antigravity\documentManagement\gcp_keys.json

# Vertex AI RAG Specifics (If applicable)
# RAG_CORPUS_ID=[ID del corpus original si aún existe]
```

## 📦 SDKs y Dependencias
El código original de Spanner depende de los siguientes paquetes (ver `package.json`):
- `@google-cloud/discoveryengine`: Para la gestión de corpus y búsqueda gestionada.
- `@google-cloud/vertexai`: Para orquestación de modelos de lenguaje.
- `@ai-sdk/google-vertex`: Integración con Vercel AI SDK.

## 🔄 Flujo de Código Original
El sistema utilizaba el archivo `lib/rag-engine.spanner.ts`. El flujo era:
1. **Indexación**: `createRagCorpus` -> `importRagFiles`. Google gestionaba automáticamente el chunking y el almacenamiento en una instancia de Spanner Enterprise.
2. **Búsqueda**: `retrieveContexts` llamaba directamente a la API de Discovery Engine, que retornaba chunks ya procesados con sus scores de relevancia.

## 🚀 Cómo Revertir
Para restaurar la infraestructura original de forma automática, proporcione la siguiente instrucción a su editor de código IA:

> "Activa el modo de restauración Spanner (Legacy):
> 1. Elimina el archivo `lib/rag-engine.ts`.
> 2. Renombra `lib/rag-engine.spanner.ts` a `lib/rag-engine.ts`.
> 3. En `.env`, comenta las variables de `SUPABASE_` y des-comenta las variables de `GCP/Spanner` (Legacy).
> 4. Verifica que `lib/rag-engine.ts` use `DiscoveryEngineServiceClient` de `@google-cloud/discoveryengine`."

---
*Ultima actualización: 2026-03-25*
*Estado: Desactivado (Migración a Supabase en curso)*
