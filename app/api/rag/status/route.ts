/**
 * GET /api/rag/status?operation=<operationName>
 *
 * Polls a Vertex AI long-running operation (LRO) for import status.
 * The UI polls this every 3 seconds while status === 'RUNNING'.
 *
 * Returns:
 *   200 { status: 'RUNNING'|'DONE'|'FAILED', progress?: number, error?: string }
 *   400 Missing operation parameter
 *   401 Not authenticated
 *   500 Polling error
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { pollImportOperation } from '@/lib/rag-engine';

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json(
      { error: 'Not authenticated.' },
      { status: 401 }
    );
  }

  const { searchParams } = req.nextUrl;
  const operationName = searchParams.get('operation');

  if (!operationName) {
    return NextResponse.json(
      { error: 'Missing operation parameter. Pass the operationName from /api/rag/import-files.' },
      { status: 400 }
    );
  }

  try {
    const status = await pollImportOperation(operationName);
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'FAILED',
        error: err?.message ?? 'Failed to poll operation status.',
      },
      { status: 500 }
    );
  }
}
