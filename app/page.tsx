'use client';

/**
 * app/page.tsx — Main application shell.
 *
 * Auth gate: unauthenticated → ConnectPage, authenticated → full app.
 * State: corpusName flows from IndexingPanel → Mode 1 / Mode 2 views.
 */

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

import { ConnectPage } from '@/components/ConnectPage';
import { Header } from '@/components/Header';
import { IndexingPanel } from '@/components/IndexingPanel';

import { SearchPanel } from '@/components/SearchPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ClassifyView } from '@/components/ClassifyView';
import { ManageCorpusPanel } from '@/components/ManageCorpusPanel';

type AppMode = 'search' | 'classify';

export default function Home() {
  const { status } = useSession();
  const [mode, setMode] = useState<AppMode>('search');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [corpusName, setCorpusName] = useState<string | null>(null);

  // Hydrate from sessionStorage after mount — prevents SSR mismatch
  useEffect(() => {
    const saved = sessionStorage.getItem('corpusName');
    if (saved) setCorpusName(saved);
  }, []);

  function handleIndexingComplete(name: string) {
    setCorpusName(name);
    // Cache in sessionStorage so it survives page refreshes within the tab
    sessionStorage.setItem('corpusName', name);
  }

  function handleClearCorpus() {
    setCorpusName(null);
    sessionStorage.removeItem('corpusName');
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
          className="flex flex-col sm:flex-row items-center justify-between px-6 py-3 gap-3"
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => setManageOpen(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
              title="Ver y gestionar archivos indexados"
            >
              Administrar Índice
            </button>
            <button
              onClick={handleClearCorpus}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
              title="Indexar otra carpeta de Drive sin borrar la actual"
            >
              Cambiar carpeta indexada
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center p-8">
        {!corpusName ? (
          /* No corpus yet → show indexing panel */
          <IndexingPanel onIndexingComplete={handleIndexingComplete} />
        ) : mode === 'search' ? (
          <SearchPanel corpusName={corpusName} />
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
            <SettingsPanel />
          </aside>
        </>
      )}

      {/* Manage Corpus slide-over */}
      {manageOpen && (
        <>
          <div className="slide-over-overlay" onClick={() => setManageOpen(false)} aria-hidden="true" />
          <aside className="slide-over-panel p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6 shrink-0">
              <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                Administrar Índice
              </h2>
              <button
                onClick={() => setManageOpen(false)}
                className="btn-ghost"
                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                aria-label="Close manage panel"
              >
                Cerrar
              </button>
            </div>
            
            <div className="flex-1 overflow-hidden">
              <ManageCorpusPanel
                onClose={() => setManageOpen(false)}
                onCorpusDeleted={() => {
                  setManageOpen(false);
                  handleClearCorpus();
                }}
              />
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
