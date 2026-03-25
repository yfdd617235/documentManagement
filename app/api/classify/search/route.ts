import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { retrieveContexts } from '@/lib/rag-engine';
import { getCorpusForUser } from '@/lib/supabase';
import type { FileToCopy, ClassificationPlan, ReferenceComponent, ClassificationFolder } from '@/types';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { components, corpusName: clientCorpusName } = await req.json();
  if (!components || !Array.isArray(components) || components.length === 0) {
    return NextResponse.json({ error: 'components array is required' }, { status: 400 });
  }

  const dbCorpus = await getCorpusForUser(token.sub);
  const corpusName = clientCorpusName || dbCorpus?.corpus_name;
  if (!corpusName) {
    return NextResponse.json({ error: 'No corpus found. Please index a folder first.' }, { status: 400 });
  }

  const items: ClassificationFolder[] = [];

  // Process each component independently to group matches
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    const idx = i;
    const pn = comp.part_number?.trim();
    const sn = comp.serial_number?.trim();
    if (!pn && !sn) continue;

    // Helper to check if text contains identifier (with prefix/suffix flexibility)
    const flexibleMatch = (text: string, id: string) => {
      const cleanText = text.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanId = id.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanText.includes(cleanId) || cleanId.includes(cleanText) && cleanText.length > 4;
    };

    // Attempt 1: PN + SN (Strongest)
    const query1 = `${pn ? `"${pn}"` : ''} ${sn ? `"${sn}"` : ''}`.trim();
    
    try {
      let results = await retrieveContexts(corpusName, query1, 5, 0.4);
      
      // Attempt 2: Just SN (often more unique if PN is missed in OCR)
      if (results.length === 0 && sn) {
        results = await retrieveContexts(corpusName, `"${sn}"`, 3, 0.45);
      }

      const files: FileToCopy[] = [];
      const seenFiles = new Set<string>();

      for (const chunk of results) {
        if (!chunk.file_name || seenFiles.has(chunk.file_name)) continue;
        
        const text = chunk.text.toLowerCase();
        let matches = false;

        // If we have both, we prefer both, but if we only have one, we check that one
        if (pn && sn) {
           // Heuristic: Must match SN exactly, and PN should be nearby or at least present
           // (Aviation SNs are usually long enough to be unique)
           if (flexibleMatch(text, sn)) {
              matches = true;
           }
        } else if (sn) {
           if (flexibleMatch(text, sn)) matches = true;
        } else if (pn) {
           if (flexibleMatch(text, pn)) matches = true;
        }

        if (matches) {
          seenFiles.add(chunk.file_name);
          files.push({
            file_id: extractFileId(chunk.drive_url ?? ''),
            file_name: chunk.file_name,
            drive_url: chunk.drive_url ?? '',
            matched_entities: [pn, sn].filter(Boolean) as string[],
            match_score: chunk.score ?? 0.5,
          });
        }
      }

      if (files.length > 0) {
        items.push({
          id: `item-${idx}`,
          folder_name: `PN ${pn || 'NULL'} - SN ${sn || 'NULL'}`,
          files_to_copy: files
        });
      }
    } catch (err) {
      console.error(`[classify/search] Error searching item ${idx}:`, err);
    }
  }

  const today = new Date().toISOString().split('T')[0];
  const plan: ClassificationPlan = {
    master_folder_name: `Clasificados_${today}`,
    items,
  };

  console.log(`[classify/search] components=${components.length} items_with_matches=${items.length}`);
  return NextResponse.json(plan);
}

/** Extracts a Drive file ID from a Google Drive URL or source URI */
function extractFileId(uri: string): string {
  if (!uri) return '';
  const match = uri.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (match) return match[1];
  const parts = uri.split('/');
  return parts[parts.length - 1] || uri;
}
