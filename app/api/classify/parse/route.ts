import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { generateText } from 'ai';
import * as pdf from 'pdf-parse';
import * as XLSX from 'xlsx';
import { downloadFileContent, getFileMetadata } from '@/lib/drive-api';
import { getFallbackChain } from '@/lib/llm-provider';
import { getUserSettings } from '@/lib/supabase';

const ENTITY_EXTRACTION_PROMPT = `You are an expert at identifying key reference codes and entities from technical documents.

Analyze the following document text and extract all meaningful reference entities:
- Part Numbers (PN), Serial Numbers (SN), Order Numbers
- Equipment names, model numbers, descriptions
- Any alphanumeric codes that look like identifiers

TEXT:
{TEXT}

Return ONLY a valid JSON object with this exact structure:
{
  "entities": ["entity1", "entity2", "..."],
  "entity_type": "brief description of what types of entities were found"
}

Rules:
- Extract 5-50 entities maximum — focus on the most specific identifiers
- Do NOT include generic words, dates, or common phrases
- Each entity should be a concrete searchable identifier
`;

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub || !token.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { fileId } = await req.json();
  if (!fileId) {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  }

  try {
    // 1. Get file metadata to determine type
    const meta = await getFileMetadata(fileId, token.accessToken as string);
    const mimeType = meta.mimeType;

    // 2. Download file content
    const buffer = await downloadFileContent(fileId, token.accessToken as string);

    // 3. Parse text from file
    let extractedText = '';

    if (mimeType === 'application/pdf') {
      const pdfData = await pdf.default(buffer);
      extractedText = pdfData.text.slice(0, 12000); // Limit to first ~12k chars
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel'
    ) {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const allText: string[] = [];
      workbook.SheetNames.forEach((name) => {
        const sheet = workbook.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
        rows.forEach((row) => allText.push(row.filter(Boolean).join(' | ')));
      });
      extractedText = allText.join('\n').slice(0, 12000);
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      // Google Sheets — export as xlsx first
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet&supportsAllDrives=true`;
      const res = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      const xlsxBuffer = Buffer.from(await res.arrayBuffer());
      const workbook = XLSX.read(xlsxBuffer, { type: 'buffer' });
      const allText: string[] = [];
      workbook.SheetNames.forEach((name) => {
        const sheet = workbook.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
        rows.forEach((row) => allText.push(row.filter(Boolean).join(' | ')));
      });
      extractedText = allText.join('\n').slice(0, 12000);
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}. Please use PDF or Excel.` },
        { status: 400 },
      );
    }

    if (!extractedText.trim()) {
      return NextResponse.json({ error: 'Could not extract text from file.' }, { status: 422 });
    }

    // 4. Use LLM to extract entities
    const settings = await getUserSettings(token.sub);
    const provider = settings?.llm_provider ?? 'gemini';
    let modelId = settings?.llm_model ?? 'gemini-2.5-flash';
    if (modelId === 'gemini-1.5-flash' || modelId === 'gemini-2.0-flash') {
      modelId = 'gemini-2.5-flash';
    }
    
    const llmChain = getFallbackChain(provider as any, modelId);
    const prompt = ENTITY_EXTRACTION_PROMPT.replace('{TEXT}', extractedText);

    let text = '';
    let lastError;

    // --- RESILIENT GENERATION LOOP ---
    for (const model of llmChain) {
      try {
        const result = await generateText({ model, prompt, temperature: 0 });
        text = result.text;
        break; // Success!
      } catch (e: any) {
        console.warn(`[API/PARSE] Failover triggered. Error: ${e.message}`);
        lastError = e;
        if (e.status === 400) break; // Don't retry on bad prompts
      }
    }

    if (!text && lastError) throw lastError;

    // 5. Parse LLM JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM did not return valid JSON for entity extraction.');
    }
    const extracted = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      entities: extracted.entities ?? [],
      entity_type: extracted.entity_type ?? 'unknown',
      file_name: meta.name,
      file_id: fileId,
      chars_parsed: extractedText.length,
    });
  } catch (err: any) {
    console.error('[classify/parse ERROR]:', err);
    return NextResponse.json({ error: err.message || 'Parse failed' }, { status: 500 });
  }
}
