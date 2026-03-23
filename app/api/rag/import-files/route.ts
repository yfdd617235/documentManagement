/**
 * POST /api/rag/import-files
 *
 * Starts a Vertex AI RAG import operation for an entire Drive folder.
 * Returns the operation name for polling via /api/rag/status.
 *
 * If called again (Sync button), simply starts a new import —
 * the RAG Engine automatically skips files that haven't changed.
 *
 * Body: { corpusName: string, folderId: string }
 *
 * Returns:
 *   200 { operationName: string }
 *   400 Missing params
 *   401 Not authenticated
 *   500 Import failed to start
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { importDriveFolder } from '@/lib/rag-engine';
import { updateCorpusSyncTime } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json(
      { error: 'Not authenticated. Please sign in with Google.' },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { corpusName, folderId } = body;

  if (!corpusName || !folderId) {
    return NextResponse.json(
      { error: 'Both corpusName and folderId are required.' },
      { status: 400 }
    );
  }

  try {
    // --- DEBUG METADATA LOGGER ---
    try {
      const driveUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,mimeType,size)`;
      const resDrive = await fetch(driveUrl, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      const dataDrive = await resDrive.json();
      
      const fs = require('fs');
      fs.writeFileSync('C:/Users/ydgs9/Documents/Antigravity/documentManagement/test_drive_meta_dump.json', JSON.stringify(dataDrive.files, null, 2));
      
      console.log('--- DRIVE FOLDER CONTENTS ---');
      console.log(JSON.stringify(dataDrive.files, null, 2));
      console.log('-----------------------------');
    } catch (e) {
      console.error('Failed to peek drive folder', e);
    }
    // -----------------------------

    // 2) Trigger the long-running import in Vertex AI
    const operationName = await importDriveFolder(corpusName, folderId);

    // Record sync time immediately (operation started)
    await updateCorpusSyncTime(token.sub);

    return NextResponse.json({ operationName });
  } catch (err: any) {
    const message = err?.message ?? 'Unknown error';
    return NextResponse.json(
      {
        error: 'import_failed',
        message,
        hint: 'Ensure GOOGLE_APPLICATION_CREDENTIALS is valid and the RAG service agent has Viewer access to the folder.',
      },
      { status: 500 }
    );
  }
}
