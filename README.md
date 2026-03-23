# Document Intelligence Platform

A high-availability ("Anti-Fallas") document intelligence platform tailored for commercial SaaS distribution. Built with Next.js 14, Vertex AI RAG Engine, and Google OAuth 2.0.

---

## 🚀 Client Installation & API Connection Guide

This step-by-step guide is designed for new clients (e.g., `client_email@customdomain.com`) deploying this application on their own infrastructure. Follow these instructions exactly to wire the application to your own Google Cloud and AI providers.

### Step 1: Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top and click **New Project**.
3. Name it (e.g., `Doc-Intel-App`) and click **Create**.
4. Important: Note your **Project ID** (e.g., `doc-intel-app-12345`).

### Step 2: Enable Required APIs
In your Google Cloud Console, navigate to **APIs & Services > Library** and enable the following exactly:
- **Vertex AI API**
- **Google Drive API**
- **Cloud Resource Manager API**

### Step 3: Configure the OAuth Consent Screen (Google Login)
1. Go to **APIs & Services > OAuth consent screen**.
2. Select **External** (or Internal if using Google Workspace) and click **Create**.
3. Fill in the App Name, Support Email, and Developer Contact Info. 
4. **Scopes:** You must add these scopes manually:
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/cloud-platform`
5. **Test Users:** If your app is in "Testing" mode, add the client's email here (e.g., `client_email@customdomain.com`) so they can log in.

### Step 4: Create OAuth Web Credentials (CLIENT_ID & SECRET)
1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Application Type: **Web application**.
4. **Authorized JavaScript origins**: 
   - Local: `http://localhost:3000`
   - Production: `https://your-vercel-app-domain.com`
5. **Authorized redirect URIs**: 
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://your-vercel-app-domain.com/api/auth/callback/google`
6. Click Create. Save the **Client ID** and **Client Secret**.

### Step 5: Create a Service Account (Vertex AI Agent)
The application needs backend credentials to run the Vector Database and perform heavy AI tasks.
1. Go to **IAM & Admin > Service Accounts**.
2. Click **Create Service Account**. Give it a name (e.g., `vertex-rag-agent`).
3. Click Continue and grant it the following roles:
   - **Vertex AI Administrator** (To manage the RAG database)
   - **Vertex AI User** (To run the models)
4. Click Done.
5. Click on the newly created Service Account email in the list.
6. Go to the **Keys** tab > **Add Key** > **Create new key**.
7. Choose **JSON** and create. The file will download to your computer.

### Step 6: Configure Vercel Environment Variables
Whether running locally in `.env.local` or on Vercel's Environment Variables panel, you must provide the following:

#### General Auth
```bash
# Generate a random 32-character string (e.g. using opening terminal and running: openssl rand -base64 32)
NEXTAUTH_SECRET="your_random_string_here"

# The base URL of your application
NEXTAUTH_URL="https://your-vercel-app-domain.com" # or http://localhost:3000 locally
```

#### Google Client Auth (From Step 4)
```bash
GOOGLE_CLIENT_ID="your_client_id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your_client_secret_string"
```

#### Google Cloud Server Backend (From Step 1 & 5)
```bash
GOOGLE_CLOUD_PROJECT_ID="your_project_id"
VERTEX_AI_LOCATION="us-central1" # Recommended: us-central1 or europe-west4
```

**CRITICAL: Service Account Configuration**
Open the downloaded JSON file from Step 5 in a text editor. 
- **In Vercel:** Create a variable called `GOOGLE_APPLICATION_CREDENTIALS_JSON`. Paste the *entire raw contents* of the JSON file directly into the value field. Vercel automatically escapes it.
- **Locally in `.env.local`:** You must collapse the JSON into a single line without newlines, like this:
```bash
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvgIB...\n-----END PRIVATE KEY-----\n","client_email":"..."}'
```

#### Optional LLMs & DB
```bash
# If you want seamless backup for Gemini using Llama 3 or Claude
OPENROUTER_API_KEY="sk-or-v1-..."

# If deploying Supabase for Analytics tracking
SUPABASE_URL="https://xxx.supabase.co"
SUPABASE_ANON_KEY="eyJ..."
```

---

## 🛠️ Running the Application

### Local Development
```bash
npm install
npm run dev
```

### Production Deployment (Vercel)
The app is fully optimized for Vercel. 
1. Link your Github repository to Vercel.
2. Under "Build & Development Settings", the defaults (`npm run build`) are correct.
3. Paste all environments variables from Step 6.
4. Deploy!

*Note for Vercel Hobby accounts: large OCR tasks might hit the 10-second timeout. For commercial instances, a Vercel Pro account (allows 5+ minute functions) is recommended.*
