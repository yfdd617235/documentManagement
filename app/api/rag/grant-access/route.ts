/**
 * POST /api/rag/grant-access
 *
 * Grants the Vertex AI RAG Data Service Agent "Viewer" access
 * to the specified Drive folder, using the current user's access token.
 *
 * Body: { folderId: string }
 *
 * Returns:
 *   200 { granted: boolean, alreadyGranted: boolean, agentEmail: string }
 *   400 If folderId is missing
 *   403 If folder is a Shared Drive (with clear instructions)
 *   500 On unexpected errors
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { grantRagAgentDriveAccess } from '@/lib/rag-engine';

export async function POST(req: NextRequest) {
  // Auth check — get access token from server-side JWT
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.accessToken) {
    return NextResponse.json(
      { error: 'Not authenticated. Please sign in with Google.' },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { folderId } = body;

  if (!folderId || typeof folderId !== 'string') {
    return NextResponse.json(
      { error: 'Missing folderId. Provide the Google Drive Folder ID.' },
      { status: 400 }
    );
  }

  const projectNumber = process.env.GOOGLE_CLOUD_PROJECT_NUMBER;
  const agentEmail = projectNumber
    ? `service-${projectNumber}@gcp-sa-vertex-rag.iam.gserviceaccount.com`
    : '(project number not configured)';

  try {
    const result = await grantRagAgentDriveAccess(
      folderId,
      token.accessToken as string
    );

    return NextResponse.json({
      granted: true,
      alreadyGranted: result.alreadyGranted,
      agentEmail,
    });
  } catch (err: any) {
    const message = err?.message ?? 'Unknown error';

    // Shared Drive detection (DEPRECATED - Now allowed)

    return NextResponse.json(
      {
        error: 'grant_failed',
        message,
        agentEmail,
      },
      { status: 500 }
    );
  }
}
