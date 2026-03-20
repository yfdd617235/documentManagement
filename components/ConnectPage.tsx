'use client';

/**
 * ConnectPage — shown when the user is not authenticated.
 * Explains what the app does and provides the "Connect Google Drive" button.
 */

import { signIn } from 'next-auth/react';
import { FileSearch, FolderSync, ShieldCheck } from 'lucide-react';

export function ConnectPage() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      {/* Logo */}
      <div className="flex flex-col items-center gap-6 max-w-md w-full text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          DI
        </div>

        <div>
          <h1
            className="text-3xl font-bold tracking-tight mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            Document Intelligence by YOSEF GIRALDO
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Search your Google Drive documents with AI — or classify files by reference.
          </p>
        </div>

        {/* Feature list */}
        <div className="w-full flex flex-col gap-3 text-left">
          {[
            {
              icon: <FileSearch size={18} />,
              title: 'Conversational Search',
              desc: 'Ask natural language questions. Get grounded answers with cited sources.',
            },
            {
              icon: <FolderSync size={18} />,
              title: 'Reference-Based Classification',
              desc: 'Upload a reference doc. Find and organize related files automatically.',
            },
            {
              icon: <ShieldCheck size={18} />,
              title: 'Safe by design',
              desc: 'Original files are never modified. Every Drive action requires your approval.',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="card flex items-start gap-3 p-4"
            >
              <span style={{ color: 'var(--accent)', marginTop: 1 }}>
                {feature.icon}
              </span>
              <div>
                <div
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {feature.title}
                </div>
                <div
                  className="text-xs mt-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {feature.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Connect button */}
        <button
          id="connect-google-drive"
          onClick={() => signIn('google')}
          className="btn-accent w-full flex items-center justify-center gap-2 py-3"
          style={{ fontSize: '0.9375rem' }}
        >
          {/* Google G logo (inline SVG) */}
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              fill="#fff"
              d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z"
            />
            <path
              fill="#fff"
              d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.65 2.08-1.88 2.92l2.84 2.2c1.7-1.57 2.72-3.88 2.72-6.62z"
            />
            <path
              fill="#fff"
              d="M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z"
            />
            <path
              fill="#fff"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.88 13.04C2.36 15.98 5.48 18 9 18z"
            />
          </svg>
          Connect Google Drive
        </button>

        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Requires read access · Folder creation · Vertex AI (cloud-platform)
        </p>
      </div>
    </main>
  );
}
