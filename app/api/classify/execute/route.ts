import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createFolder, copyFile } from '@/lib/drive-api';
import { isSupabaseConfigured } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import type { FileToCopy } from '@/types';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub || !token.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { plan, selectedFileIds } = await req.json();
  if (!plan || !plan.destination_folder_name || !plan.files_to_copy) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  // Only copy the user-approved files
  const approved: FileToCopy[] = plan.files_to_copy.filter(
    (f: FileToCopy) => !selectedFileIds || selectedFileIds.includes(f.file_id),
  );

  if (approved.length === 0) {
    return NextResponse.json({ error: 'No files selected for copy' }, { status: 400 });
  }

  // Use SSE streaming for real-time progress
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // Step 1: Create destination folder
        send({ type: 'status', message: `Creando carpeta "${plan.destination_folder_name}"...` });
        const { folderId, folderUrl } = await createFolder(
          plan.destination_folder_name,
          token.accessToken as string,
        );
        send({ type: 'folder_created', folderId, folderUrl, folderName: plan.destination_folder_name });

        // Step 2: Copy each approved file
        const results: Array<{ file_id: string; file_name: string; status: string; new_file_id?: string; error?: string }> = [];

        for (const file of approved) {
          send({ type: 'copying', file_id: file.file_id, file_name: file.file_name });
          try {
            const { newFileId, webViewLink } = await copyFile(
              file.file_id,
              folderId,
              token.accessToken as string,
            );
            results.push({ file_id: file.file_id, file_name: file.file_name, status: 'done', new_file_id: newFileId });
            send({ type: 'file_done', file_id: file.file_id, file_name: file.file_name, new_file_id: newFileId, link: webViewLink });
          } catch (err: any) {
            results.push({ file_id: file.file_id, file_name: file.file_name, status: 'failed', error: err.message });
            send({ type: 'file_failed', file_id: file.file_id, file_name: file.file_name, error: err.message });
          }
        }

        // Step 3: Log to Supabase
        if (isSupabaseConfigured()) {
          try {
            const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
            await db.from('operation_logs').insert({
              user_id: token.sub,
              operation_type: 'copy_files',
              payload: {
                destination_folder_id: folderId,
                destination_folder_name: plan.destination_folder_name,
                files: results,
                timestamp: new Date().toISOString(),
              },
            });
          } catch (logErr) {
            console.error('[classify/execute] Supabase log failed:', logErr);
          }
        }

        send({
          type: 'complete',
          total: approved.length,
          succeeded: results.filter((r) => r.status === 'done').length,
          failed: results.filter((r) => r.status === 'failed').length,
          folderUrl,
        });
      } catch (err: any) {
        send({ type: 'error', message: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
