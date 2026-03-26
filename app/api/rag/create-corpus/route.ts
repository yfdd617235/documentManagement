/**
 * POST /api/rag/create-corpus
 *
 * Creates a new Vertex AI RAG corpus globally for the company,
 * OR returns the existing corpus_name if this folder was already indexed.
 *
 * Body: { folderId: string }
 *
 * Returns:
 *   200 { corpusName: string, isNew: boolean, folderName: string }
 *   401 Not authenticated
 *   500 Creation failed
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createCorpus, listAllGlobalCorpora } from '@/lib/rag-engine';
import { getFileMetadata } from '@/lib/drive-api';
import { upsertCorpus } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub || !token?.accessToken) {
    return NextResponse.json(
      { error: 'Not authenticated. Please sign in with Google.' },
      { status: 401 }
    );
  }

  const userId = token.sub;
  const accessToken = token.accessToken as string;
  const body = await req.json().catch(() => ({}));
  const { folderId } = body;

  if (!folderId || typeof folderId !== 'string') {
    return NextResponse.json(
      { error: 'Missing folderId.' },
      { status: 400 }
    );
  }

  try {
    // 1. Check if this folder has already been indexed globally by ANY user in the company
    const corpora = await listAllGlobalCorpora(accessToken);
    const existing = corpora.find((c) => c.displayName === `company-kb-${folderId}`);
    
    if (existing) {
      // Save as recent in Supabase just for compatibility with older components
      await upsertCorpus({
        user_id: userId,
        corpus_name: existing.name,
        folder_id: folderId,
        last_sync: null,
        file_count: null,
      });

      return NextResponse.json({
        corpusName: existing.name,
        folderName: existing.description || 'Carpeta Compartida',
        isNew: false,
        source: 'existing_global',
      });
    }

    // 2. Fetch the human-readable folder name from Google Drive
    let folderName = 'Carpeta Compartida';
    try {
      const meta = await getFileMetadata(folderId, accessToken);
      if (meta.name) folderName = meta.name;
    } catch (e) {
      console.warn('[Create Corpus] Could not fetch folder metadata, falling back to default', e);
    }

    // 3. Create new global corpus
    const corpusName = await createCorpus(folderId, folderName);

    // Save as recent in Supabase
    await upsertCorpus({
      user_id: userId,
      corpus_name: corpusName,
      folder_id: folderId,
      last_sync: null,
      file_count: null,
    });

    return NextResponse.json({ corpusName, folderName, isNew: true, source: 'created' });
  } catch (err: any) {
    const message = err?.message ?? 'Unknown error';

    // Surface auth errors specifically
    if (message.includes('GOOGLE_CLOUD_PROJECT_ID') || message.includes('credentials')) {
      return NextResponse.json(
        {
          error: 'configuration_error',
          message,
          fix: 'Check that GOOGLE_CLOUD_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS are set in .env.local',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'corpus_creation_failed', message },
      { status: 500 }
    );
  }
}
