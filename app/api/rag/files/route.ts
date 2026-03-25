import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { listRagFiles, deleteRagFile, deleteCorpus } from '@/lib/rag-engine';

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const corpusName = req.nextUrl.searchParams.get('corpusName');
  if (!corpusName) {
    return NextResponse.json({ error: 'Missing corpusName query parameter' }, { status: 400 });
  }

  try {
    const files = await listRagFiles(corpusName);
    return NextResponse.json({ files });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { corpusName, all, ragFileName } = body;

    if (!corpusName) {
      return NextResponse.json({ error: 'Missing corpusName in body' }, { status: 400 });
    }

    if (all) {
      await deleteCorpus(corpusName);
      return NextResponse.json({ success: true, message: 'Corpus deleted' });
    }

    if (ragFileName) {
      await deleteRagFile(ragFileName);
      return NextResponse.json({ success: true, message: 'File deleted' });
    }

    return NextResponse.json({ error: 'Must provide all:true or ragFileName' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
