'use client';

/**
 * IndexingPanel — PASO 2 UI (B2B Dashboard)
 *
 * Shows a list of existing Shared Company Knowledge Bases.
 * Allows selecting one to consult immediately.
 * Provide a toggle to index a new folder.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  FolderOpen,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Database,
  Plus,
  Search,
  ExternalLink,
  Trash2,
  FileText,
  Loader2,
  Check
} from 'lucide-react';

type IndexingStep =
  | 'idle'
  | 'granting'
  | 'creating_corpus'
  | 'importing'
  | 'polling'
  | 'done'
  | 'error'
  | 'rescuing';

interface IndexingState {
  step: IndexingStep;
  progress: number;           // 0-100
  corpusName: string | null;
  operationName: string | null;
  error: string | null;
  errorInstructions?: string[];
  failedIds?: string[];
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
  rescuing: 'Rescuing files via Manual OCR (Gemini)…',
};

interface CorpusObj {
  name: string;
  displayName: string;
  folderId: string;
  folderName: string;
  createTime: string;
}

interface IndexingPanelProps {
  /** Called when indexing completes so the parent can enable search */
  onIndexingComplete?: (corpusName: string) => void;
}

export function IndexingPanel({ onIndexingComplete }: IndexingPanelProps) {
  const [corpora, setCorpora] = useState<CorpusObj[]>([]);
  const [loadingCorpora, setLoadingCorpora] = useState(true);
  const [files, setFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  const [folderId, setFolderId] = useState('');
  const [state, setState] = useState<IndexingState>({
    step: 'idle',
    progress: 0,
    corpusName: null,
    operationName: null,
    error: null,
    failedIds: [],
  });

  // Deletion modal state
  const [corpusToDelete, setCorpusToDelete] = useState<CorpusObj | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch Existing Global Corpora on mount
  useEffect(() => {
    async function fetchCorpora() {
      try {
        const res = await fetch('/api/rag/corpora');
        const data = await res.json();
        if (data.corpora) {
          setCorpora(data.corpora);
          if (data.corpora.length === 0) {
            setShowNewForm(true); // Auto-show form if company has zero KBs
          }
        }
      } catch (err) {
        console.error('Failed to fetch global corpora', err);
      } finally {
        setLoadingCorpora(false);
      }
    }
    fetchCorpora();
  }, []);

  const handleSelectCorpus = (corpusName: string) => {
    setState((prev) => ({ ...prev, corpusName, step: 'done', progress: 100 }));
    fetchFiles(corpusName);
    if (onIndexingComplete) onIndexingComplete(corpusName);
  };

  const handleDeleteCorpus = async () => {
    if (!corpusToDelete) return;
    if (deleteInput !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch('/api/rag/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corpusName: corpusToDelete.name, all: true }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Got error deleting corpus');

      // Refresh list
      setCorpora((prev) => prev.filter((c) => c.name !== corpusToDelete.name));
      setCorpusToDelete(null);
      setDeleteInput('');
    } catch (err: any) {
      setDeleteError(err.message ?? 'Unknown error occurred while deleting.');
    } finally {
      setIsDeleting(false);
    }
  };

  const fetchFiles = useCallback(async (cName: string) => {
    if (!cName) return;
    setLoadingFiles(true);
    try {
      const res = await fetch(`/api/rag/files?corpusName=${encodeURIComponent(cName)}`);
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err) {
      console.error('Failed to fetch files:', err);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  // Poll for status
  useEffect(() => {
    if (state.step !== 'polling' || !state.operationName) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/rag/status?operation=${encodeURIComponent(state.operationName!)}`);
        const data = await res.json();

        if (data.status === 'DONE') {
          clearInterval(interval);
          setState((prev) => ({
            ...prev,
            step: 'done',
            progress: 100,
            lastSync: new Date().toLocaleString(),
          }));
          if (state.corpusName) {
            onIndexingComplete?.(state.corpusName);
            fetchFiles(state.corpusName);
          }
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          setState((prev) => ({
            ...prev,
            step: 'error',
            error: data.error ?? 'Import operation failed.',
            failedIds: data.failedIds || [],
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
    const maxTimeout = setTimeout(() => clearInterval(interval), 30 * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(maxTimeout);
    };
  }, [state.step, state.operationName, state.corpusName, fetchFiles, onIndexingComplete]);

  // ── Rescue Manual OCR Loop ───────────────────────────────────────────────
  const handleRescueFiles = async () => {
    if (!state.corpusName || !state.failedIds || state.failedIds.length === 0) return;

    setState((prev) => ({ ...prev, step: 'rescuing', progress: 50, error: null }));
    try {
      const res = await fetch('/api/rag/rescue-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corpusName: state.corpusName, failedIds: state.failedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Got error rescuing files');

      if (data.rescuedCount > 0 && data.errors.length === 0) {
        if (data.operationName) {
          setState((prev) => ({
            ...prev,
            step: 'polling',
            operationName: data.operationName,
            progress: 95,
            error: null,
            failedIds: []
          }));
        } else {
          setState((prev) => ({ ...prev, step: 'done', progress: 100, failedIds: [] }));
          onIndexingComplete?.(state.corpusName);
          fetchFiles(state.corpusName);
        }
      } else if (data.rescuedCount > 0) {
        setState((prev) => ({
          ...prev, step: 'error',
          error: `Rescued ${data.rescuedCount} files, but ${data.errors.length} still have issues.`,
          failedIds: data.errors.map((e: any) => e.id)
        }));
      } else {
        setState((prev) => ({
          ...prev, step: 'error',
          error: `Manual OCR Extraction failed. Please check the console for logs.`,
        }));
      }
    } catch (err: any) {
      setState((prev) => ({ ...prev, step: 'error', error: err.message }));
    }
  };

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
      // Step 1 — Create or reuse corpus (provisions the Vertex AI service agent)
      setState((prev) => ({ ...prev, step: 'creating_corpus', progress: 5 }));

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
      setState((prev) => ({ ...prev, corpusName, progress: 20 }));

      // Instantly synchronize the background Dashboard cards with the newly registered Corpus
      fetch('/api/rag/corpora')
        .then((r) => r.json())
        .then((data) => setCorpora(data.corpora ?? []));

      // Step 2 — Grant access to the now-provisioned service agent
      setState((prev) => ({ ...prev, step: 'granting', progress: 35 }));

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
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        step: 'error',
        error: err?.message ?? 'An unexpected error occurred.',
      }));
    }
  }, [folderId, state.corpusName, fetchFiles]);

  const isRunning = ['granting', 'creating_corpus', 'importing', 'polling'].includes(state.step);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 slide-in" style={{ animationDelay: '0.1s' }}>
      {/* ── Indexing New Folder Form ── */}
      <div className="card p-6 flex flex-col gap-4 slide-in" style={{ animationDelay: '0s' }}>
        <div>
          <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Index New Shared Folder
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Paste the folder ID from the Google Drive URL. It will be available for the entire company:{' '}
            <code
              className="px-1 py-0.5 rounded text-xs"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
            >
              drive.google.com/drive/folders/<strong>[FOLDER_ID]</strong>
            </code>
          </p>
        </div>

        <div className="flex gap-2">
          <input
            id="folder-id-input"
            type="text"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            placeholder="Ex: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs"
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
            <FolderOpen size={15} className="inline mr-2" aria-hidden="true" />
            {isRunning ? 'Indexing...' : 'Create Shared Index'}
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

            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{
                  width: state.step === 'done' ? '100%' : `${state.progress}%`,
                  animation:
                    state.step === 'polling' && !state.progress
                      ? 'pulse 2s ease-in-out infinite'
                      : undefined,
                }}
              />
            </div>

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
                  title="Check for new files in Drive"
                >
                  <RefreshCw size={12} className="inline mr-1" aria-hidden="true" />
                  Refresh Files
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
              <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <div className="text-sm flex-1" style={{ color: 'var(--danger)' }}>
                <p className="font-semibold mb-1">Indexing Error</p>
                <p>{state.error}</p>

                {state.failedIds && state.failedIds.length > 0 && (
                  <div className="mt-4 border-t border-red-900/20 pt-3">
                    <p className="text-xs mb-2 text-[var(--danger)]/80">
                      Google Cloud API natively rejected these files (Possibly Scanned PDFs without Text Layer).
                      You can force ingestion by using Gemini Vision to optically extract the content.
                    </p>
                    <button
                      onClick={handleRescueFiles}
                      className="btn-accent text-xs px-3 py-1.5"
                      style={{ backgroundColor: 'var(--danger)' }}
                    >
                      Force Remaining OCR Ingestion
                    </button>
                  </div>
                )}
              </div>
            </div>
            {state.errorInstructions && (
              <div className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <ol className="list-decimal list-inside space-y-1">
                  {state.errorInstructions.map((instruction, idx) => (
                    <li key={idx} dangerouslySetInnerHTML={{ __html: instruction }} />
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Document List (Grounding Documents) */}
        {(files.length > 0 || loadingFiles) && state.corpusName && (
          <div className="mt-2 border-t pt-4" style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                Indexed Documents in Database
              </h3>
              {loadingFiles ? (
                <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent)' }} />
              ) : (
                <button
                  onClick={() => fetchFiles(state.corpusName!)}
                  className="hover:scale-110 mb-1 transition-transform opacity-70 hover:opacity-100"
                  title="Refresh file list"
                >
                  <RefreshCw size={13} style={{ color: 'var(--text-secondary)' }} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
              {files.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center gap-2 p-2 rounded-lg text-xs transition-colors"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                >
                  <div className="w-8 h-8 rounded bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                    <FileText size={16} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }} title={file.displayName}>
                      {file.displayName}
                    </p>
                    <p className="text-[10px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                      Ready for retrieval
                    </p>
                  </div>
                  <div className="flex items-center self-start mt-1">
                    <Check size={14} style={{ color: 'var(--success)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Dashboard of Global Corpora ── */}
      <div className="mt-2">
        <h1 className="text-2xl font-bold mb-4 text-center" style={{ color: 'var(--text-primary)' }}>
          Document Databases
        </h1>

        {loadingCorpora ? (
          <div className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading company databases...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {corpora.map((corpus) => (
              <div
                key={corpus.name}
                className="card p-5 flex flex-col items-center justify-center gap-3 cursor-pointer transition-transform hover:scale-105"
                onClick={() => handleSelectCorpus(corpus.name)}
                style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', position: 'relative' }}
              >
                <button
                  className="btn-ghost absolute top-2 right-2 text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white"
                  style={{ padding: '6px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCorpusToDelete(corpus);
                    setDeleteInput('');
                    setDeleteError(null);
                  }}
                  aria-label="Delete shared database"
                >
                  <Trash2 size={16} />
                </button>

                <Database size={32} style={{ color: 'var(--accent)' }} />
                <h3 className="font-semibold text-center text-sm" style={{ color: 'var(--text-primary)' }}>
                  {corpus.folderName}
                </h3>
                <p className="text-xs text-center line-clamp-1" style={{ color: 'var(--text-secondary)' }}>
                  {corpus.displayName}
                </p>
                <button className="btn-accent text-xs mt-2 px-3 py-1 flex items-center gap-1">
                  <Search size={12} />
                  Consult
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal de Confirmación de Borrado ── */}
      {corpusToDelete && (
        <div className="modal-backdrop">
          <div className="modal-panel flex flex-col gap-4">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Delete Shared Database?
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              You are about to delete <strong>{corpusToDelete.folderName}</strong>.
              This will affect <strong>the entire company</strong> and all collaborators will lose access to this graphical info immediately.
            </p>

            <div className="flex flex-col gap-1 mt-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>
                Type DELETE to confirm:
              </label>
              <input
                type="text"
                className="input-field"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder="DELETE"
                autoFocus
              />
            </div>

            {deleteError && (
              <p className="text-xs" style={{ color: 'var(--danger)' }}>{deleteError}</p>
            )}

            <div className="flex justify-end gap-2 mt-2">
              <button
                className="btn-ghost"
                onClick={() => setCorpusToDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="btn-primary flex items-center gap-1 p-2"
                style={{ backgroundColor: 'var(--danger)', color: 'white', borderColor: 'var(--danger)' }}
                onClick={handleDeleteCorpus}
                disabled={isDeleting || deleteInput !== 'DELETE'}
              >
                {isDeleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
