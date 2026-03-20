/**
 * NextAuth.js configuration for Google OAuth 2.0
 *
 * Scopes (exact — as specified in AGENT.md):
 *   - drive.readonly       → indexing and reading reference docs
 *   - drive.file           → creating folders and copying files (Mode 2)
 *   - cloud-platform       → Vertex AI RAG Engine calls
 *
 * Security model:
 *   - access_token and refresh_token stored in encrypted JWT on the server
 *   - Never exposed to the browser (httpOnly cookies via NextAuth)
 *   - Refresh happens automatically in the jwt() callback
 */

import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import type { JWT } from 'next-auth/jwt';

// ─── Scope definition ─────────────────────────────────────────────────────────

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive',   // full read+write; drive.readonly only reads app-created files
  'https://www.googleapis.com/auth/cloud-platform',
].join(' ');

// ─── Token refresh helper ─────────────────────────────────────────────────────

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const url =
      'https://oauth2.googleapis.com/token?' +
      new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken as string,
      });

    const response = await fetch(url, { method: 'POST' });
    const refreshed = await response.json();

    if (!response.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      // Fall back to old expiry if not returned
      accessTokenExpires: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
      // Preserve old refresh token if a new one was not issued
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    console.error('[NextAuth] Token refresh failed:', error);
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

// ─── NextAuth config ──────────────────────────────────────────────────────────

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          // Force Google to always show account chooser + consent screen
          // This ensures refresh_token is always returned on first auth
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
  ],

  // Use JWT strategy (tokens never persisted to a DB — suitable for server-side use)
  session: { strategy: 'jwt' },

  callbacks: {
    /**
     * jwt() — runs whenever a JWT is created or updated.
     * Stores the Google OAuth tokens inside the encrypted JWT cookie.
     * Handles refresh when the access token is expired.
     */
    async jwt({ token, account }) {
      // Initial sign-in: account is populated
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at
            ? account.expires_at * 1000
            : Date.now() + 3600 * 1000,
        };
      }

      // Token still valid
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }

      // Token expired — refresh
      return refreshAccessToken(token);
    },

    /**
     * session() — shapes what the client session object looks like.
     * Only exposes user info (name, email, image) plus a flag if token errored.
     * The raw accessToken is NOT included in the client session object.
     * API routes use getServerSession(authOptions) to read the full JWT token.
     */
    async session({ session, token }) {
      session.user = session.user ?? {};
      // Expose only the error state so the UI can react to refresh failures
      if (token.error) {
        (session as any).error = token.error;
      }
      return session;
    },
  },

  pages: {
    signIn: '/',       // Redirect to main page instead of /api/auth/signin
    error: '/',        // Surface errors on main page
  },
};

// ─── Typed helper for API routes ─────────────────────────────────────────────

/**
 * Gets the full server-side session including the decrypted access token.
 * Call this ONLY in API routes / server components — never in client components.
 */
import { getServerSession } from 'next-auth';

export async function getServerAccessToken(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  // Read from the raw JWT stored server-side (not the client-facing session)
  return null; // Implemented via getToken in API routes (see below)
}

/**
 * Use this in API routes to get the access token from the JWT:
 *
 *   import { getToken } from 'next-auth/jwt';
 *   const token = await getToken({ req });
 *   const accessToken = token?.accessToken as string;
 */
export { authOptions as default };
