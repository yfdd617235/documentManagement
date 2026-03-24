import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCorpusForUser } from '@/lib/supabase';
import { fetchWithRetry, getAdcToken } from '@/lib/rag-engine';

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { corpusName, failedIds } = await req.json();
  if (!corpusName || !failedIds || !Array.isArray(failedIds)) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const ai = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');
  const model = ai.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const dbCorpus = await getCorpusForUser(token.sub as string);
  const folderId = dbCorpus?.folder_id;

  let rescuedCount = 0;
  let errors: any[] = [];

  for (const fileId of failedIds) {
    try {
      // 1) Download from user's Drive
      const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
      const driveMetaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType&supportsAllDrives=true`;
      
      const meta = await fetchWithRetry(driveMetaUrl, { headers: { Authorization: `Bearer ${token.accessToken as string}` } });
      const fileName = meta.name || 'documento_escaneado.pdf';
      const mimeType = meta.mimeType || 'application/pdf';

      const resDrive = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&supportsAllDrives=true', { // fetch handles the stream better for arrayBuffer
        headers: { Authorization: `Bearer ${token.accessToken as string}` }
      });
      const buffer = await resDrive.arrayBuffer();

      // 2) OCR with standard Gemini Vision API (Manual Retry for non-fetch SDK)
      let extractedText = '';
      let ocrError;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await model.generateContent([
            'Extrae absolutamente todo el texto y datos legibles de este documento. Si es un formulario, respeta su estructura.',
            { inlineData: { data: Buffer.from(buffer).toString('base64'), mimeType } }
          ]);
          extractedText = result.response.text();
          if (extractedText) break;
        } catch (e) {
          console.warn(`[RESCUE/OCR] Attempt ${attempt} failed for ${fileId}:`, e);
          ocrError = e;
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
      
      if (!extractedText) throw ocrError || new Error('OCR failed after 3 attempts');

      // 3. Upload extracted text to User's Google Drive using drive.file scope
      // Place it in the SAME folder that is being indexed so Vertex sees it!
      const driveMetadata: any = {
        name: `[RESCUED OCR] ${fileName}.txt`,
        mimeType: 'text/plain',
        description: `Automatic OCR Transcription for ${fileName}`
      };
      
      if (folderId) {
        driveMetadata.parents = [folderId];
      }

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(driveMetadata) +
        delimiter +
        'Content-Type: text/plain\r\n\r\n' +
        extractedText +
        close_delim;

      const uploadedDriveFile = await fetchWithRetry('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.accessToken as string}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
      });

      const newDriveUri = `https://drive.google.com/file/d/${uploadedDriveFile.id}`;

      // 4. Import the new Google Drive Text File into Vertex AI Corpus using standard import API
      const saToken = await getAdcToken();
      
      const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
      const importUrl = `https://${location}-aiplatform.googleapis.com/v1beta1/${corpusName}:importRagFiles`;
      
      // NOTE: Endpoint fix. Must use :importRagFiles (the LRO) for Drive uris.
      const importData = await fetchWithRetry(importUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${saToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          importRagFilesConfig: {
            gdriveSource: {
              uris: [newDriveUri]
            },
            ragFileChunkingConfig: {
              chunkSize: 512,
              chunkOverlap: 100
            }
          }
        })
      });

      const operationName = importData.name;
      rescuedCount++;

      // If we finished the last (or only) file, we return this operationName for tracking
      if (fileId === failedIds[failedIds.length - 1]) {
        return NextResponse.json({ rescuedCount, errors, operationName });
      }

    } catch (e: any) {
      console.error(`Failed to rescue file ${fileId}:`, e);
      errors.push({ id: fileId, error: e.message });
    }
  }

  return NextResponse.json({ rescuedCount, errors });
}
