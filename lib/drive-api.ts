/**
 * lib/drive-api.ts
 * Low-level Google Drive helpers used by PASO 5 (Mode 2).
 * - Download file content as Buffer
 * - Create a folder
 * - Copy a file (never moves/modifies originals)
 */

// ─── Download ─────────────────────────────────────────────────────────────────

export async function downloadFileContent(
  fileId: string,
  accessToken: string,
): Promise<Buffer> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive download failed (${res.status}): ${err}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── File metadata ─────────────────────────────────────────────────────────────

export async function getFileMetadata(
  fileId: string,
  accessToken: string,
): Promise<{ name: string; mimeType: string }> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive metadata failed (${res.status})`);
  return res.json();
}

// ─── Create folder ─────────────────────────────────────────────────────────────

export async function createFolder(
  name: string,
  accessToken: string,
  parentFolderId?: string,
): Promise<{ folderId: string; folderUrl: string }> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create folder failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return { folderId: data.id, folderUrl: data.webViewLink };
}

// ─── Copy file ─────────────────────────────────────────────────────────────────

export async function copyFile(
  fileId: string,
  destinationFolderId: string,
  accessToken: string,
  newName?: string,
): Promise<{ newFileId: string; webViewLink: string }> {
  const body: Record<string, unknown> = {
    parents: [destinationFolderId],
  };
  if (newName) body.name = newName;

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Copy file failed for ${fileId} (${res.status}): ${err}`);
  }

  const data = await res.json();
  return { newFileId: data.id, webViewLink: data.webViewLink };
}
