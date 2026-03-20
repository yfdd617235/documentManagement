import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { retrieveContexts } from '@/lib/rag-engine';
import { getCorpusForUser } from '@/lib/supabase';
import type { FileToCopy, ClassificationPlan } from '@/types';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { entities, corpusName: clientCorpusName } = await req.json();
  if (!entities || !Array.isArray(entities) || entities.length === 0) {
    return NextResponse.json({ error: 'entities array is required' }, { status: 400 });
  }

  const dbCorpus = await getCorpusForUser(token.sub);
  const corpusName = clientCorpusName || dbCorpus?.corpus_name;
  if (!corpusName) {
    return NextResponse.json({ error: 'No corpus found. Please index a folder first.' }, { status: 400 });
  }

  // Run all entity searches in parallel (batch)
  const searchResults = await Promise.allSettled(
    entities.map((entity: string) =>
      retrieveContexts(corpusName, entity, 3, 0.6)
    )
  );

  // Aggregate results: dedup by file_name, accumulate score + matched entities
  const fileMap = new Map<string, {
    file_name: string;
    drive_url: string;
    matched_entities: string[];
    total_score: number;
    count: number;
  }>();

  searchResults.forEach((result, idx) => {
    if (result.status !== 'fulfilled') return;
    const entity = entities[idx];
    result.value.forEach((chunk) => {
      const key = chunk.file_name ?? 'unknown';
      if (!fileMap.has(key)) {
        fileMap.set(key, {
          file_name: chunk.file_name ?? 'Unknown',
          drive_url: chunk.drive_url ?? '',
          matched_entities: [],
          total_score: 0,
          count: 0,
        });
      }
      const entry = fileMap.get(key)!;
      if (!entry.matched_entities.includes(entity)) {
        entry.matched_entities.push(entity);
      }
      entry.total_score += chunk.score ?? 0.5;
      entry.count += 1;
    });
  });

  // Convert map to sorted list
  const files_to_copy: FileToCopy[] = Array.from(fileMap.values())
    .map((entry) => ({
      file_id: extractFileId(entry.drive_url),
      file_name: entry.file_name,
      drive_url: entry.drive_url,
      matched_entities: entry.matched_entities,
      match_score: parseFloat((entry.total_score / Math.max(entry.count, 1)).toFixed(3)),
    }))
    .filter((f) => f.matched_entities.length > 0)
    .sort((a, b) => b.match_score - a.match_score);

  const today = new Date().toISOString().split('T')[0];
  const plan: ClassificationPlan = {
    destination_folder_name: `Clasificados_${today}`,
    files_to_copy,
  };

  console.log(`[classify/search] entities=${entities.length} files_found=${files_to_copy.length}`);
  return NextResponse.json(plan);
}

/** Extracts a Drive file ID from a Google Drive URL or source URI */
function extractFileId(uri: string): string {
  // Handle drive.google.com/file/d/FILE_ID/... 
  const match = uri.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (match) return match[1];
  // Handle RAG sourceUri: eg. drive.google.com/file/FILE_ID
  const parts = uri.split('/');
  return parts[parts.length - 1] || uri;
}
