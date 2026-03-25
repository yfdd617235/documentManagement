import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { listAllGlobalCorpora } from '@/lib/rag-engine';

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const corpora = await listAllGlobalCorpora(token.accessToken as string);
    // Shape it for the UI
    const mapped = corpora.map((c: any) => ({
      name: c.name,
      displayName: c.displayName, // e.g., company-kb-1234
      folderId: c.displayName.replace('company-kb-', ''),
      folderName: c.description || 'Carpeta sin nombre',
      createTime: c.createTime,
    }));
    
    return NextResponse.json({ corpora: mapped });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
