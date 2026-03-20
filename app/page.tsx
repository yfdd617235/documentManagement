'use client';

/**
 * app/page.tsx — Main application shell.
 *
 * Auth gate: unauthenticated → ConnectPage, authenticated → full app.
 * State: corpusName flows from IndexingPanel → Mode 1 / Mode 2 views.
 */

import { useState } from 'react';
import { useSession } from 'next-auth/react';

import { ConnectPage } from '@/components/ConnectPage';
import { Header } from '@/components/Header';
import { IndexingPanel } from '@/components/IndexingPanel';

// ── Placeholder for Mode 1 view (built in PASO 4) ────────────────────────────
function SearchView({ corpusName }: { corpusName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
      <div className="card px-5 py-3 text-sm" style={{ borderColor: 'var(--success)' }}>
        <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Corpus ready</span>
        <span style={{ color: 'var(--text-secondary)', marginLeft: 8, fontSize: '0.75rem' }}>
          {corpusName.split('/').pop()}
        </span>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', maxWidth: 400 }}>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>PASO 4</span> — Conversational search UI coming next.
      </p>
    </div>
  );
}

// ── Placeholder for Mode 2 view (built in PASO 5) ────────────────────────────
function ClassifyView({ corpusName }: { corpusName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', maxWidth: 400 }}>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>PASO 5</span> — Reference-based classification UI coming next.
      </p>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
        Corpus: {corpusName.split('/').pop()}
      </p>
    </div>
  );
}

type AppMode = 'search' | 'classify';

export default function Home() {
  const { status } = useSession();
  const [mode, setMode] = useState<AppMode>('search');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // corpusName is null until indexing completes (or is restored from session storage)
  const [corpusName, setCorpusName] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('corpusName') ?? null;
    }
    return null;
  });

  function handleIndexingComplete(name: string) {
    setCorpusName(name);
    // Cache in sessionStorage so it survives page refreshes within the tab
    sessionStorage.setItem('corpusName', name);
  }

  // ── Loading spinner ──────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div
          className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
          aria-label="Loading"
        />
      </div>
    );
  }

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (status === 'unauthenticated') {
    return <ConnectPage />;
  }

  // ── Authenticated app shell ───────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      <Header onSettingsOpen={() => setSettingsOpen(true)} />

      {/* Mode toggle — only shown when corpus is ready */}
      {corpusName && (
        <div
          className="flex items-center justify-center px-6 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div
            className="flex rounded-lg p-1 gap-1"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            role="tablist"
            aria-label="Application mode"
          >
            {(
              [
                { id: 'search', label: 'Buscar documentos' },
                { id: 'classify', label: 'Clasificar por referencia' },
              ] as { id: AppMode; label: string }[]
            ).map(({ id, label }) => (
              <button
                key={id}
                id={`mode-tab-${id}`}
                role="tab"
                aria-selected={mode === id}
                onClick={() => setMode(id as AppMode)}
                className="px-4 py-2 rounded-md text-sm font-medium transition-all duration-150"
                style={{
                  backgroundColor: mode === id ? 'var(--accent)' : 'transparent',
                  color: mode === id ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center p-8">
        {!corpusName ? (
          /* No corpus yet → show indexing panel */
          <IndexingPanel onIndexingComplete={handleIndexingComplete} />
        ) : mode === 'search' ? (
          <SearchView corpusName={corpusName} />
        ) : (
          <ClassifyView corpusName={corpusName} />
        )}
      </main>

      {/* Settings slide-over — wired fully in PASO 3 */}
      {settingsOpen && (
        <>
          <div className="slide-over-overlay" onClick={() => setSettingsOpen(false)} aria-hidden="true" />
          <aside className="slide-over-panel p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                Settings
              </h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="btn-ghost"
                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                aria-label="Close settings"
              >
                Close
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              LLM provider and model selection —{' '}
              <span style={{ color: 'var(--accent)' }}>PASO 3</span>.
            </p>
          </aside>
        </>
      )}
    </div>
  );
}
