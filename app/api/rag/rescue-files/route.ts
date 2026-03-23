import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCorpusForUser } from '@/lib/supabase';

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
      const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      const driveMetaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`;
      
      const metaRes = await fetch(driveMetaUrl, { headers: { Authorization: `Bearer ${token.accessToken as string}` } });
      const meta = await metaRes.json();
      const fileName = meta.name || 'documento_escaneado.pdf';
      const mimeType = meta.mimeType || 'application/pdf';

      const resDrive = await fetch(driveUrl, { headers: { Authorization: `Bearer ${token.accessToken as string}` } });
      const buffer = await resDrive.arrayBuffer();

      // 2) OCR with standard Gemini Vision API
      const result = await model.generateContent([
        'Extrae absolutamente todo el texto y datos legibles de este documento. Si es un formulario, respeta su estructura.',
        { inlineData: { data: Buffer.from(buffer).toString('base64'), mimeType } }
      ]);
      const extractedText = result.response.text();

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

      const driveUploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.accessToken as string}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
      });

      if (!driveUploadRes.ok) throw new Error(`Drive upload failed: ${await driveUploadRes.text()}`);
      const uploadedDriveFile = await driveUploadRes.json();
      const newDriveUri = `https://drive.google.com/file/d/${uploadedDriveFile.id}`;

      // 4. Import the new Google Drive Text File into Vertex AI Corpus using standard import API
      const { getAdcToken } = await import('@/lib/rag-engine');
      const saToken = await getAdcToken();
      
      const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
      const importUrl = `https://${location}-aiplatform.googleapis.com/v1beta1/${corpusName}:importRagFiles`;
      
      // NOTE: Endpoint fix. Must use :importRagFiles (the LRO) for Drive uris.
      const importRes = await fetch(importUrl, {
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

      if (!importRes.ok) throw new Error(`Vertex RAG import failed: ${await importRes.text()}`);
      const importData = await importRes.json();
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
