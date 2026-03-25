import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createFolder, copyFile } from '@/lib/drive-api';
import { isSupabaseConfigured } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import type { FileToCopy, ClassificationPlan, ClassificationFolder } from '@/types';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub || !token.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { plan, selectedFileIds } = await req.json() as { plan: ClassificationPlan, selectedFileIds: string[] };
  if (!plan || !plan.master_folder_name || !plan.items) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  // Count total files to be processed
  let totalApproved = 0;
  plan.items.forEach(item => {
    item.files_to_copy.forEach(f => {
      if (!selectedFileIds || selectedFileIds.includes(f.file_id)) totalApproved++;
    });
  });

  if (totalApproved === 0) {
    return NextResponse.json({ error: 'No files selected for copy' }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // Step 1: Create MASTER folder
        send({ type: 'status', message: `Creando carpeta principal "${plan.master_folder_name}"...` });
        const { folderId: masterFolderId, folderUrl: masterFolderUrl } = await createFolder(
          plan.master_folder_name,
          token.accessToken as string,
        );
        
        const overallResults: any[] = [];
        let succeededCount = 0;
        let failedCount = 0;

        // Step 2: Iterate through each ITEM (Subfolder)
        for (const item of plan.items) {
          const approvedInItem = item.files_to_copy.filter(f => !selectedFileIds || selectedFileIds.includes(f.file_id));
          if (approvedInItem.length === 0) continue;

          send({ type: 'status', message: `Creando subcarpeta "${item.folder_name}"...` });
          const { folderId: subFolderId } = await createFolder(
            item.folder_name,
            token.accessToken as string,
            masterFolderId // Parent ID
          );

          for (const file of approvedInItem) {
            send({ type: 'copying', file_id: file.file_id, file_name: file.file_name });
            try {
              const { newFileId, webViewLink } = await copyFile(
                file.file_id,
                subFolderId,
                token.accessToken as string,
              );
              succeededCount++;
              overallResults.push({ file_id: file.file_id, item_folder: item.folder_name, status: 'done' });
              send({ type: 'file_done', file_id: file.file_id, file_name: file.file_name, new_file_id: newFileId, link: webViewLink });
            } catch (err: any) {
              failedCount++;
              overallResults.push({ file_id: file.file_id, item_folder: item.folder_name, status: 'failed', error: err.message });
              send({ type: 'file_failed', file_id: file.file_id, file_name: file.file_name, error: err.message });
            }
          }
        }

        // Step 3: Log to Supabase
        if (isSupabaseConfigured()) {
          try {
            const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
            await db.from('operation_logs').insert({
              user_id: token.sub,
              operation_type: 'copy_files_organized',
              payload: {
                master_folder_id: masterFolderId,
                master_folder_name: plan.master_folder_name,
                results: overallResults,
                timestamp: new Date().toISOString(),
              },
            });
          } catch (logErr) {
            console.error('[classify/execute] Supabase log failed:', logErr);
          }
        }

        send({
          type: 'complete',
          total: totalApproved,
          succeeded: succeededCount,
          failed: failedCount,
          folderUrl: masterFolderUrl,
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
