# Configuración de Variables de Entorno Supabase

Para que el nuevo motor RAG funcione, debes configurar las siguientes variables en tu archivo `.env` o en el panel de Vercel.

### Pasos para obtener los valores:

1. **SUPABASE_URL**:
   - Ve a tu proyecto en el [Dashboard de Supabase](https://app.supabase.com/).
   - Navega a **Project Settings** > **API**.
   - Copia el valor de `Project URL`.

2. **SUPABASE_SERVICE_ROLE_KEY**:
   - En la misma página (**Project Settings** > **API**).
   - Busca la sección de `Project API keys`.
   - Copia la clave `service_role` (haz clic en "reveal" para verla).
   - **IMPORTANTE**: Esta clave tiene permisos de bypass de RLS. No la expongas en el frontend.

3. **Ejecutar la Migración**:
   - Ve a la sección **SQL Editor** en Supabase.
   - Copia el contenido de `supabase/migrations/001_create_vectors_table.sql`.
   - Pégalo y haz clic en **Run**.

### Variables de GCP (Pendientes de Re-uso)
El sistema sigue utilizando las credenciales de Google Cloud (`GOOGLE_APPLICATION_CREDENTIALS` o `GOOGLE_APPLICATION_CREDENTIALS_JSON`) únicamente para generar los embeddings con el modelo `text-embedding-004`. Asegúrate de que la Service Account tenga el rol `Vertex AI User`.

---
*Si necesitas volver a Spanner, consulta `INFRA_SPANNER_RESTORE.md`.*
