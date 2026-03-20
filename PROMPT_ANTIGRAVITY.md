# Prompt de Ejecución — Document Intelligence App

> **Instrucción inicial:** Lee el archivo `AGENT.md` completo antes de escribir cualquier línea de código.
> Actúa como Principal AI Architect y Senior Fullstack Engineer.
> Valida cada decisión contra el principio rector: **"Usa lo que Google ya gestiona. No lo compitas."**

---

## Reglas de Oro (aplican en TODOS los pasos)

- **NO** construyas OCR custom
- **NO** generes embeddings manualmente
- **NO** uses Supabase como vector DB
- **NO** uses Vertex AI Search (Agent Builder) — usa Vertex AI RAG Engine
- **NO** uses modelos hardcodeados — la capa LLM es dinámica (OpenRouter → Ollama → backup)
- **NO** ejecutes ninguna operación de escritura en Drive sin aprobación explícita del usuario
- **NO** modifiques, muevas ni renombres los archivos originales — solo copia
- **SÍ** implementa tool calling (MCP) desde el primer paso, aunque Mode 1 no las use
- **SÍ** maneja errores reales con mensajes accionables
- **SÍ** consulta la documentación oficial antes de asumir cómo funciona una API

Si en algún paso creés que hay una mejor alternativa a lo especificado:
**DETENTE. Presentá la comparación técnica con pros/contras antes de codificar.**

---

## PASO 1 — Autenticación Google OAuth 2.0

**Objetivo:** El usuario conecta su Google Drive de forma segura con los permisos correctos para ambos modos.

Implementa:
1. OAuth 2.0 con Next.js App Router
2. Scopes exactos — ni más ni menos:
   - `https://www.googleapis.com/auth/drive.readonly` — indexación y lectura
   - `https://www.googleapis.com/auth/drive.file` — creación de carpetas y copia de archivos (Mode 2)
   - `https://www.googleapis.com/auth/cloud-platform` — Vertex AI RAG Engine
3. Token storage server-side únicamente — nunca expuesto al cliente
4. Refresh token handling automático
5. Estado visual claro: conectado / desconectado / error de permisos

**Output esperado:**
- `/api/auth/google` funcional
- Session management correcto
- Pantalla de conexión con botón "Conectar Google Drive"
- Detección temprana de Shared Drive → mensaje claro + instrucciones

---

## PASO 2 — Indexación con Vertex AI RAG Engine

**Objetivo:** El contenido del folder de Drive queda indexado en un RAG Corpus listo para consulta.

**Flujo exacto:**
```
Usuario ingresa Folder ID
      ↓
Backend: otorgar acceso "Viewer" al RAG Data Service Agent
(service-{PROJECT_NUMBER}@gcp-sa-vertex-rag.iam.gserviceaccount.com)
      ↓
Verificar si ya existe corpus en Supabase → si existe, reusar
Si no existe: vertexai.rag.create_corpus() con text-embedding-005
      ↓
rag.import_files() con google_drive_source + RESOURCE_TYPE_FOLDER
chunk_size=512, chunk_overlap=100, max_embedding_requests_per_min=900
      ↓
Polling de status → progress bar en UI
      ↓
Corpus listo → guardar corpus_name en Supabase
```

Implementa:
1. Formulario para ingresar Folder ID
2. Lógica de permisos al service account vía Drive API
3. Creación de corpus (con check de existencia previa)
4. Import con configuración de chunks
5. Polling con feedback visual al usuario
6. Botón "Sincronizar" que re-corre import (el engine skipea archivos sin cambios)
7. Manejo explícito de Shared Drive con mensaje claro

---

## PASO 3 — Capa LLM Unificada (OpenRouter + Ollama + Backup)

**Objetivo:** Una sola interfaz LLM con tres fuentes intercambiables, configurable desde Settings.

**Arquitectura:**
```typescript
// Todos usan el mismo schema OpenAI-compatible
// Solo cambia baseURL y apiKey

const providers = {
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    getModels: () => fetch("https://openrouter.ai/api/v1/models") // lista dinámica
  },
  ollama: {
    baseURL: process.env.OLLAMA_BASE_URL, // http://localhost:11434/v1
    apiKey: "ollama",
    getModels: () => fetch(`${OLLAMA_BASE_URL}/models`) // lo que esté instalado
  },
  backup: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash", // hardcoded solo en este caso
  }
}
```

Implementa:
1. Módulo `lib/llm-provider.ts` con la abstracción unificada
2. Endpoint `/api/settings/models` que devuelve modelos disponibles según el provider activo
3. Fallback automático: si OpenRouter falla → Ollama → backup
4. Persistencia del provider y modelo seleccionado en Supabase (user config)

**Tool calling preparado desde aquí:**
- Todo request al LLM incluye el schema de tools definidas en AGENT.md
- En Mode 1 el LLM simplemente no las llamará
- En Mode 2 las llamará según necesidad

---

## PASO 4 — Mode 1: Búsqueda Conversacional

**Objetivo:** El usuario hace preguntas en lenguaje natural y recibe respuestas fundamentadas con fuentes.

**Flujo:**
```
Query del usuario
      ↓
retrieveContexts API (similarity_top_k=5, vector_distance_threshold=0.5)
      ↓
Chunks recuperados con metadata (file_name, drive_url, snippet, score)
      ↓
Prompt estructurado → LLM Provider Layer (streaming)
      ↓
Respuesta streameada + sources estructuradas al frontend
```

**Prompt template:**
```
You are a helpful assistant answering questions based exclusively on the documents provided.

DOCUMENTS:
{retrieved_chunks_with_metadata}

QUESTION: {user_query}

Instructions:
- Answer only based on the documents above
- If the answer is not in the documents, say so clearly
- Be concise and precise
- Always reference which document(s) support your answer
- Respond in the same language as the question
```

**Output formato obligatorio:**
```json
{
  "answer": "respuesta en lenguaje natural",
  "sources": [
    {
      "file_name": "nombre_archivo.pdf",
      "drive_url": "https://drive.google.com/...",
      "snippet": "fragmento relevante",
      "relevance_score": 0.91
    }
  ]
}
```

---

## PASO 5 — Mode 2: Clasificación por Referencia

**Objetivo:** El usuario trae un documento de referencia (PDF o Excel desde Drive) y la app encuentra, muestra y — tras aprobación — copia los documentos relacionados a una carpeta nueva.

### Sub-paso 5A — Ingesta del documento de referencia
1. Selector de archivo desde Drive (PDF o Excel)
2. App descarga y parsea:
   - **PDF** → extrae texto, identifica listas, tablas, códigos alfanuméricos
   - **Excel** → parsea filas/columnas, identifica columnas de entidades (PN, SN, descripción, etc.)
3. LLM extrae lista estructurada de entidades:
```json
{
  "entities": ["PN-4821", "SN-00392", "Turbina X200", "válvula 3/4\""],
  "entity_type": "part_numbers_and_descriptions"
}
```
4. Mostrar preview de entidades extraídas — el usuario puede corregir antes de buscar

### Sub-paso 5B — Búsqueda en corpus
1. Para cada entidad: `retrieveContexts` con `similarity_top_k=3`
2. Agregar resultados: deduplicar por file_id, sumar scores, listar matched_entities por archivo
3. Construir plan estructurado:
```json
{
  "destination_folder_name": "Clasificados_2026-03-19",
  "files_to_copy": [
    {
      "file_id": "1abc...",
      "file_name": "Manual_Turbina_X200.pdf",
      "drive_url": "https://drive.google.com/...",
      "matched_entities": ["PN-4821", "Turbina X200"],
      "match_score": 0.94
    }
  ]
}
```

### Sub-paso 5C — Aprobación del usuario
1. Mostrar plan completo en UI como lista con checkboxes
2. Cada item muestra: nombre de archivo, entidades encontradas, score, link a Drive
3. Usuario puede deseleccionar archivos individualmente
4. Botón "Confirmar y copiar" — **nunca auto-ejecutar**
5. Registrar evento de aprobación en Supabase antes de ejecutar

### Sub-paso 5D — Ejecución vía MCP tools
```
LLM llama: create_folder({ name: "Clasificados_2026-03-19", parent_id: root })
      ↓ recibe nuevo folder_id
LLM llama: copy_file({ file_id, destination_folder_id }) × N archivos aprobados
      ↓ progreso en tiempo real
Resumen final + link a nueva carpeta en Drive
      ↓
Log en Supabase: user_id, timestamp, files_copied[], destination_folder_id
```

**Regla de oro del Mode 2:**
- Los archivos originales **nunca** se tocan — solo `copy`, nunca `move` ni `rename`
- Si una copia falla, reportar el error sin interrumpir las demás copias

---

## PASO 6 — Frontend UI

**Objetivo:** Interfaz clara con los dos modos bien diferenciados y Settings accesible.

**Layout:**
```
[Header: logo | Drive status badge | ⚙ Settings]

[Toggle: "Buscar documentos" | "Clasificar por referencia"]

--- Mode 1 ---
[Search bar centrado]
[Respuesta streaming]
[Cards de fuentes — siempre visibles, expandibles]

--- Mode 2 ---
[Selector de documento de referencia desde Drive]
[Preview de entidades extraídas]
[Plan de clasificación — lista con checkboxes y scores]
[Botón "Confirmar y copiar"]
[Progress + resumen de ejecución]
```

**Settings Panel (slide-over o modal):**
```
Sección: LLM Provider
  ○ OpenRouter  ○ Ollama  ○ Backup (Gemini 2.0 Flash)
  [Selector de modelo — lista dinámica según provider]

Sección: RAG Corpus
  [Estado: N archivos indexados | Última sync: fecha]
  [Botón "Sincronizar ahora"]
```

**Componentes a construir:**
- `ModeToggle` — switch entre Mode 1 y Mode 2
- `SearchBar` — input con submit, estado loading
- `AnswerStream` — renderiza respuesta token por token
- `SourceCard` — file_name, snippet, drive_url, score; expandible
- `ReferenceDocSelector` — picker de archivo desde Drive
- `EntityPreview` — lista editable de entidades extraídas
- `ClassificationPlan` — lista con checkboxes, scores, links
- `ExecutionProgress` — progreso por archivo + resumen final
- `SettingsPanel` — provider selector + model picker dinámico
- `IndexingStatus` — progress durante importación

**Design tokens:**
```css
--bg: #FFFFFF;
--text: #000000;
--accent: #1A365D;
--surface: #F8FAFC;
--border: #E2E8F0;
```

---

## PASO 7 — Optimización y producción

1. Streaming en Mode 1 con Vercel AI SDK
2. Caché de corpus_name — nunca recrear si existe en Supabase
3. Batching de entity lookups en Mode 2 — evitar N+1 llamadas secuenciales
4. Error boundaries en cada capa con mensajes accionables
5. `.env.example` completo y documentado
6. Logs de todas las operaciones de escritura en Drive

---

## Checklist final antes de marcar cada paso como completo

- [ ] ¿La capa LLM es dinámica? (no hay modelo hardcodeado salvo el backup)
- [ ] ¿Tool calling está incluido en todos los requests al LLM?
- [ ] ¿Las fuentes son siempre visibles en Mode 1?
- [ ] ¿Ninguna operación de escritura en Drive se ejecuta sin aprobación?
- [ ] ¿Los archivos originales nunca se modifican?
- [ ] ¿Los tokens de OAuth nunca se exponen al cliente?
- [ ] ¿El corpus está aislado por usuario?
- [ ] ¿Shared Drive tiene manejo explícito con mensaje claro?
- [ ] ¿Todos los errores tienen mensajes accionables?
- [ ] ¿El `.env.example` está actualizado?
- [ ] ¿Las operaciones de Drive están logueadas en Supabase?

---

## Formato de output por paso

1. **Decisión de arquitectura** — qué hiciste y por qué (2-3 líneas)
2. **Código** — modular, TypeScript tipado, comentado donde no es obvio
3. **Qué testear** — casos límite a verificar manualmente antes de avanzar
