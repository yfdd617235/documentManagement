/**
 * POST /api/rag/create-corpus
 *
 * Creates a new Vertex AI RAG corpus for the current user,
 * OR returns the existing corpus_name if one already exists in Supabase.
 *
 * Body: { folderId: string }
 *
 * Returns:
 *   200 { corpusName: string, isNew: boolean }
 *   401 Not authenticated
 *   500 Creation failed
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createCorpus, findCorpusByDisplayName } from '@/lib/rag-engine';
import { getCorpusForUser, upsertCorpus } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json(
      { error: 'Not authenticated. Please sign in with Google.' },
      { status: 401 }
    );
  }

  const userId = token.sub;
  const body = await req.json().catch(() => ({}));
  const { folderId } = body;

  if (!folderId || typeof folderId !== 'string') {
    return NextResponse.json(
      { error: 'Missing folderId.' },
      { status: 400 }
    );
  }

  try {
    // 1. Check Supabase cache first (fastest path)
    const existing = await getCorpusForUser(userId);
    if (existing?.corpus_name) {
      return NextResponse.json({
        corpusName: existing.corpus_name,
        isNew: false,
        source: 'cache',
      });
    }

    // 2. Supabase not configured or no record — check Vertex AI directly
    const foundInVertex = await findCorpusByDisplayName(userId);
    if (foundInVertex) {
      // Save to Supabase for future fast lookups
      await upsertCorpus({
        user_id: userId,
        corpus_name: foundInVertex,
        folder_id: folderId,
        last_sync: null,
        file_count: null,
      });
      return NextResponse.json({
        corpusName: foundInVertex,
        isNew: false,
        source: 'vertex',
      });
    }

    // 3. Create new corpus
    const corpusName = await createCorpus(userId);

    // Save to Supabase
    await upsertCorpus({
      user_id: userId,
      corpus_name: corpusName,
      folder_id: folderId,
      last_sync: null,
      file_count: null,
    });

    return NextResponse.json({ corpusName, isNew: true, source: 'created' });
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
