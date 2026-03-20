import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { copyFile } from '@/lib/drive-api';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub || !token.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { fileId, destinationFolderId, newName } = await req.json();
  if (!fileId || !destinationFolderId) {
    return NextResponse.json({ error: 'fileId and destinationFolderId are required' }, { status: 400 });
  }

  try {
    const result = await copyFile(
      fileId,
      destinationFolderId,
      token.accessToken as string,
      newName,
    );
    console.log(`[drive/copy-file] Copied ${fileId} → ${result.newFileId}`);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[drive/copy-file ERROR]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
