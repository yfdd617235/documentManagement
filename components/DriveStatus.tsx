'use client';

/**
 * DriveStatus — badge showing the state of the Google Drive connection.
 *
 * States:
 *   connected        → green badge (session valid, no errors)
 *   permission_error → red badge (session exists but token refresh failed)
 *   disconnected     → grey badge (no session)
 *
 * Never reads raw tokens — only reads the sanitized session object.
 */

import { useSession } from 'next-auth/react';

type DriveState = 'connected' | 'permission_error' | 'disconnected' | 'loading';

function getDriveState(
  status: string,
  sessionError?: string
): DriveState {
  if (status === 'loading') return 'loading';
  if (status === 'unauthenticated') return 'disconnected';
  if (sessionError === 'RefreshAccessTokenError') return 'permission_error';
  return 'connected';
}

const STATE_CONFIG: Record<DriveState, { label: string; color: string; dot: string }> = {
  connected: {
    label: 'Drive connected',
    color: 'text-success',
    dot: 'bg-[var(--success)]',
  },
  permission_error: {
    label: 'Permission error',
    color: 'text-danger',
    dot: 'bg-[var(--danger)]',
  },
  disconnected: {
    label: 'Not connected',
    color: 'text-secondary',
    dot: 'bg-[var(--border)]',
  },
  loading: {
    label: 'Checking…',
    color: 'text-secondary',
    dot: 'bg-[var(--border)] animate-pulse',
  },
};

export function DriveStatus() {
  const { data: session, status } = useSession();
  const sessionError = (session as any)?.error as string | undefined;
  const state = getDriveState(status, sessionError);
  const config = STATE_CONFIG[state];

  // Show tooltip with instructions on permission error
  const tooltip =
    state === 'permission_error'
      ? 'Your Google session has expired or is missing required permissions. Sign out and reconnect.'
      : undefined;

  return (
    <div
      className={`flex items-center gap-2 text-sm ${config.color}`}
      title={tooltip}
      aria-label={`Drive status: ${config.label}`}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${config.dot}`}
        aria-hidden="true"
      />
      <span>{config.label}</span>
    </div>
  );
}
