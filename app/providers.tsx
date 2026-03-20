'use client';

/**
 * SessionProvider wrapper for client-side session context.
 * Must be a client component to use React context.
 */

import { SessionProvider } from 'next-auth/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
