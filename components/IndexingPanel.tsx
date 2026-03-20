'use client';

/**
 * IndexingPanel — PASO 2 UI
 *
 * Orchestrates the full RAG indexing flow:
 *   1. User enters a Drive Folder ID
 *   2. Grant access to RAG service agent
 *   3. Create or reuse corpus
 *   4. Start import operation
 *   5. Poll status + show progress bar
 *   6. Done → show corpus info + Sync button
 *
 * All Drive write operations use the server — tokens never touch client.
 */

import { useState, useCallback } from 'react';
import { FolderOpen, RefreshCw, CheckCircle, XCircle, AlertTriangle, ExternalLink } from 'lucide-react';

type IndexingStep =
  | 'idle'
  | 'granting'
  | 'creating_corpus'
  | 'importing'
  | 'polling'
  | 'done'
  | 'error';

interface IndexingState {
  step: IndexingStep;
  progress: number;           // 0-100
  corpusName: string | null;
  operationName: string | null;
  error: string | null;
  errorInstructions?: string[];
  lastSync?: string;
}

const STEP_LABELS: Record<IndexingStep, string> = {
  idle: '',
  granting: 'Granting access to Vertex AI service agent…',
  creating_corpus: 'Creating RAG corpus…',
  importing: 'Starting import…',
  polling: 'Indexing documents…',
  done: 'Corpus ready',
  error: 'Indexing failed',
};

interface IndexingPanelProps {
  /** Called when indexing completes so the parent can enable search */
  onIndexingComplete?: (corpusName: string) => void;
}

export function IndexingPanel({ onIndexingComplete }: IndexingPanelProps) {
  const [folderId, setFolderId] = useState('');
  const [state, setState] = useState<IndexingState>({
    step: 'idle',
    progress: 0,
    corpusName: null,
    operationName: null,
    error: null,
  });

  // ── Helper: poll operation status every 3 seconds ────────────────────────
  const pollStatus = useCallback(async (operationName: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/rag/status?operation=${encodeURIComponent(operationName)}`
        );
        const data = await res.json();

        if (data.status === 'DONE') {
          clearInterval(interval);
          setState((prev) => ({
            ...prev,
            step: 'done',
            progress: 100,
            lastSync: new Date().toLocaleString(),
          }));
          if (state.corpusName) onIndexingComplete?.(state.corpusName);
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          setState((prev) => ({
            ...prev,
            step: 'error',
            error: data.error ?? 'Import operation failed.',
          }));
        } else {
          // RUNNING — update progress
          setState((prev) => ({
            ...prev,
            step: 'polling',
            progress: data.progress ?? prev.progress,
          }));
        }
      } catch {
        clearInterval(interval);
        setState((prev) => ({
          ...prev,
          step: 'error',
          error: 'Lost connection while polling import status. Check your network.',
        }));
      }
    }, 3000);

    // Safety: stop polling after 30 minutes
    setTimeout(() => clearInterval(interval), 30 * 60 * 1000);
  }, [state.corpusName, onIndexingComplete]);

  // ── Main indexing flow ───────────────────────────────────────────────────
  const startIndexing = useCallback(async (isSync = false) => {
    const trimmedId = folderId.trim();
    if (!trimmedId) return;

    setState({
      step: 'granting',
      progress: 5,
      corpusName: isSync ? state.corpusName : null,
      operationName: null,
      error: null,
    });

    try {
      // Step 1 — Grant access
      const grantRes = await fetch('/api/rag/grant-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: trimmedId }),
      });
      const grantData = await grantRes.json();

      if (!grantRes.ok) {
        if (grantData.error === 'shared_drive') {
          setState((prev) => ({
            ...prev,
            step: 'error',
            error: grantData.message,
            errorInstructions: grantData.instructions,
          }));
          return;
        }
        throw new Error(grantData.message ?? 'Failed to grant folder access.');
      }

      // Step 2 — Create or reuse corpus
      setState((prev) => ({ ...prev, step: 'creating_corpus', progress: 20 }));

      const corpusRes = await fetch('/api/rag/create-corpus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: trimmedId }),
      });
      const corpusData = await corpusRes.json();

      if (!corpusRes.ok) {
        throw new Error(corpusData.message ?? 'Failed to create RAG corpus.');
      }

      const { corpusName } = corpusData;
      setState((prev) => ({ ...prev, corpusName, progress: 35 }));

      // Step 3 — Start import
      setState((prev) => ({ ...prev, step: 'importing', progress: 40 }));

      const importRes = await fetch('/api/rag/import-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corpusName, folderId: trimmedId }),
      });
      const importData = await importRes.json();

      if (!importRes.ok) {
        throw new Error(importData.message ?? 'Failed to start import.');
      }

      // Step 4 — Poll
      setState((prev) => ({
        ...prev,
        step: 'polling',
        progress: 50,
        operationName: importData.operationName,
      }));

      pollStatus(importData.operationName);
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        step: 'error',
        error: err?.message ?? 'An unexpected error occurred.',
      }));
    }
  }, [folderId, state.corpusName, pollStatus]);

  const isRunning = ['granting', 'creating_corpus', 'importing', 'polling'].includes(state.step);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2
          className="text-base font-semibold mb-1"
          style={{ color: 'var(--text-primary)' }}
        >
          Index a Google Drive Folder
        </h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Paste the folder ID from the Drive URL:{' '}
          <code
            className="px-1 py-0.5 rounded text-xs"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          >
            drive.google.com/drive/folders/<strong>[FOLDER_ID]</strong>
          </code>
        </p>
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <input
          id="folder-id-input"
          type="text"
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs"
          className="input-field flex-1"
          disabled={isRunning}
          aria-label="Google Drive Folder ID"
        />
        <button
          id="start-indexing-btn"
          onClick={() => startIndexing(false)}
          disabled={isRunning || !folderId.trim()}
          className="btn-accent whitespace-nowrap"
        >
          <FolderOpen size={15} className="inline mr-1" aria-hidden="true" />
          {isRunning ? 'Indexing…' : 'Indexar'}
        </button>
      </div>

      {/* Progress + Status */}
      {state.step !== 'idle' && state.step !== 'error' && (
        <div className="card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>{STEP_LABELS[state.step]}</span>
            {state.step === 'polling' && state.progress > 0 && (
              <span>{state.progress}%</span>
            )}
          </div>

          {/* Progress bar */}
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{
                width: state.step === 'done' ? '100%' : `${state.progress}%`,
                // Pulse animation while polling with no progress data
                animation:
                  state.step === 'polling' && !state.progress
                    ? 'pulse 2s ease-in-out infinite'
                    : undefined,
              }}
            />
          </div>

          {/* Done state */}
          {state.step === 'done' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--success)' }}>
                <CheckCircle size={14} aria-hidden="true" />
                <span>Corpus ready{state.lastSync ? ` · Synced ${state.lastSync}` : ''}</span>
              </div>
              <button
                id="sync-corpus-btn"
                onClick={() => startIndexing(true)}
                disabled={isRunning}
                className="btn-ghost text-xs"
                style={{ padding: '4px 10px' }}
                title="Re-sync (skips unchanged files)"
              >
                <RefreshCw size={12} className="inline mr-1" aria-hidden="true" />
                Sincronizar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {state.step === 'error' && (
        <div
          className="card p-4 flex flex-col gap-3"
          style={{ borderColor: 'var(--danger)' }}
        >
          <div className="flex items-start gap-2">
            {state.errorInstructions ? (
              <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            ) : (
              <XCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            )}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
                {state.errorInstructions ? 'Shared Drive is not supported' : 'Indexing failed'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {state.error}
              </p>

              {/* Shared Drive step-by-step instructions */}
              {state.errorInstructions && (
                <ol className="flex flex-col gap-1 mt-1">
                  {state.errorInstructions.map((step) => (
                    <li key={step} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {step}
                    </li>
                  ))}
                </ol>
              )}

              <a
                href="https://cloud.google.com/vertex-ai/generative-ai/docs/rag-overview"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs flex items-center gap-1"
                style={{ color: 'var(--accent)' }}
              >
                Vertex AI RAG docs
                <ExternalLink size={11} aria-hidden="true" />
              </a>
            </div>
          </div>

          <button
            onClick={() => setState((prev) => ({ ...prev, step: 'idle', error: null }))}
            className="btn-ghost text-xs"
            style={{ padding: '4px 10px', alignSelf: 'flex-start' }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
