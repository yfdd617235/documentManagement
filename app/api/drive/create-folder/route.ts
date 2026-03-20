import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createFolder } from '@/lib/drive-api';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub || !token.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { folderName, parentFolderId } = await req.json();
  if (!folderName) {
    return NextResponse.json({ error: 'folderName is required' }, { status: 400 });
  }

  try {
    const result = await createFolder(
      folderName,
      token.accessToken as string,
      parentFolderId,
    );
    console.log(`[drive/create-folder] Created "${folderName}" → ${result.folderId}`);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[drive/create-folder ERROR]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
