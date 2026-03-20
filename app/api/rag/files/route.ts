import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { listRagFiles, deleteRagFile, deleteCorpus } from '@/lib/rag-engine';
import { getCorpusForUser } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const corpus = await getCorpusForUser(token.sub);
  if (!corpus?.corpus_name) {
    return NextResponse.json({ files: [] });
  }

  try {
    const files = await listRagFiles(corpus.corpus_name);
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

  const corpus = await getCorpusForUser(token.sub);
  if (!corpus?.corpus_name) {
    return NextResponse.json({ error: 'No corpus found' }, { status: 400 });
  }

  try {
    const body = await req.json();

    if (body.all) {
      await deleteCorpus(corpus.corpus_name);
      return NextResponse.json({ success: true, message: 'Corpus deleted' });
    }

    if (body.ragFileName) {
      // ragFileName must be just the ID part, or the full path. Let's make sure it's the full path
      const fullPath = body.ragFileName.includes('projects/')
        ? body.ragFileName
        : `${corpus.corpus_name}/ragFiles/${body.ragFileName}`;
      
      await deleteRagFile(fullPath);
      return NextResponse.json({ success: true, message: 'File deleted' });
    }

    return NextResponse.json({ error: 'Must provide all:true or ragFileName' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
