import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { generateText } from 'ai';
import * as pdf from 'pdf-parse';
import * as XLSX from 'xlsx';
import { downloadFileContent, getFileMetadata } from '@/lib/drive-api';
import { getFallbackChain } from '@/lib/llm-provider';
import { getUserSettings } from '@/lib/supabase';

const ENTITY_EXTRACTION_PROMPT = `You are an aviation maintenance expert. Your task is to extract a list of components from a "Certified Status" or "LDND" document.
 
Analyze the following document text and extract all installed components listed. 
For each component, identify:
1. Description: The name of the part (e.g. Engine, Landing Gear, Actuator)
2. Part Number (PN): The OEM identifier
3. Serial Number (SN): The unique serial identifier

TEXT:
{TEXT}

Return ONLY a valid JSON object with this exact structure:
{
  "components": [
    { "description": "Part Name", "part_number": "PN123", "serial_number": "SN456" },
    ...
  ],
  "entity_type": "brief description of document type found",
  "total_items_found": 0
}

Rules:
- Extract ALL identifiable components. Do NOT limit to 50.
- If the document is very long, focus on maintaining high accuracy for each item.
- Ensure every component has at least a Description or a Part Number.
- If a Serial Number is not found for a part, leave it as an empty string.
- Do NOT include headers or generic text.
`;

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let buffer: Buffer;
    let mimeType: string;
    let fileName: string;
    let fileId: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
      
      buffer = Buffer.from(await file.arrayBuffer());
      mimeType = file.type;
      fileName = file.name;
    } else {
      // Handle the existing JSON fileId approach
      const body = await req.json();
      fileId = body.fileId;
      if (!fileId) return NextResponse.json({ error: 'fileId or file is required' }, { status: 400 });
      if (!token.accessToken) return NextResponse.json({ error: 'No Drive access token' }, { status: 401 });

      const meta = await getFileMetadata(fileId, token.accessToken as string);
      mimeType = meta.mimeType;
      fileName = meta.name;
      buffer = await downloadFileContent(fileId, token.accessToken as string);
    }

    // 3. Parse text from buffer
    let extractedText = '';

    if (mimeType === 'application/pdf') {
      const pdfData = await pdf.default(buffer);
      // Increased buffer to handle much larger documents (full exhaustive search)
      extractedText = pdfData.text; 
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
      extractedText = allText.join('\n');
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet' && fileId) {
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
      extractedText = allText.join('\n');
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
    let modelId = settings?.llm_model ?? 'gemini-2.5-flash'; // High capacity for large docs
    
    const llmChain = getFallbackChain(provider as any, modelId);
    
    // For very large documents, we might need to chunk the extraction, but 
    // Gemini 2.5 Flash has a very large context window.
    const prompt = ENTITY_EXTRACTION_PROMPT.replace('{TEXT}', extractedText.slice(0, 500000)); // Up to 500k chars

    let text = '';
    let lastError;

    for (const model of llmChain) {
      try {
        const result = await generateText({ model, prompt, temperature: 0 });
        text = result.text;
        break; 
      } catch (e: any) {
        console.warn(`[API/PARSE] Failover triggered. Error: ${e.message}`);
        lastError = e;
      }
    }

    if (!text && lastError) throw lastError;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM did not return valid JSON for entity extraction.');
    }
    const extracted = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      components: extracted.components ?? [],
      entity_type: extracted.entity_type ?? 'unknown',
      file_name: fileName,
      file_id: fileId,
      chars_parsed: extractedText.length,
      page_count: mimeType === 'application/pdf' ? (extractedText.split('\f').length) : 0,
      sheet_count: (mimeType.includes('spreadsheet') || mimeType.includes('excel')) ? XLSX.read(buffer, { type: 'buffer' }).SheetNames.length : 0,
    });
  } catch (err: any) {
    console.error('[classify/parse ERROR]:', err);
    return NextResponse.json({ error: err.message || 'Parse failed' }, { status: 500 });
  }
}
