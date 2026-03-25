# Guía de Restauración: Infraestructura Spanner (Google Cloud)

Este documento contiene la información necesaria para revertir el motor RAG de Supabase a la infraestructura original de **Google Cloud Spanner** y **Vertex AI RAG Engine**.

> [!WARNING]
> Si has borrado la instancia de Spanner en la consola de Google para ahorrar costos, deberás seguir los pasos de "Re-creación" antes de activar este código.

## 🛠 Variables de Entorno (Legacy)
Para reactivar Spanner, restaura estos valores en tu `.env.local`:

```env
# Google Cloud Platform Configuration
GOOGLE_CLOUD_PROJECT=documentmanagement-490723
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_CLOUD_API_ENDPOINT=us-central1-aiplatform.googleapis.com
GOOGLE_APPLICATION_CREDENTIALS=c:\Users\ydgs9\Documents\Antigravity\documentManagement\gcp_keys.json
```

## 🔄 Flujo de Código Original
El sistema utilizaba el archivo `lib/rag-engine.spanner.ts`. Para volver atrás:
1. Renombra `lib/rag-engine.ts` a `lib/rag-engine.supabase.ts` (para no perderlo).
2. Renombra `lib/rag-engine.spanner.ts` a `lib/rag-engine.ts`.
3. Reinicia el servidor con `npm run dev`.

## 🏗️ Cómo Re-crear la Infraestructura (Si fue borrada)
Si eliminaste los recursos para ahorrar dinero y decides volver, sigue estos pasos:
1. **Crear Instancia de Spanner**: Desde la consola de GCP, crea una instancia llamada `vertex-ai-rag` (o similar) con configuración regional.
2. **Crear Corpus en Vertex AI**: La aplicación intentará crear uno nuevo automáticamente al indexar la primera carpeta usando el código de `rag-engine.spanner.ts`.
3. **Re-indexar**: Deberás volver a pasar las carpetas de Drive por el proceso de indexación, ya que al borrar Spanner se pierde el índice de vectores anterior.

---
*Estado: Desactivado. Actualmente usando Supabase (Ahorro proyectado: >$400 USD/mes).*
