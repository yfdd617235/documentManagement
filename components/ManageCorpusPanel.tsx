'use client';

import { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, FileText, Loader2, RefreshCw } from 'lucide-react';

interface RagFile {
  name: string; // projects/.../ragCorpora/.../ragFiles/...
  displayName: string;
  description: string;
}

interface Props {
  corpusName: string;
  onClose: () => void;
  onCorpusDeleted: () => void;
}

export function ManageCorpusPanel({ corpusName, onClose, onCorpusDeleted }: Props) {
  const [files, setFiles] = useState<RagFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchFiles() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rag/files?corpusName=${encodeURIComponent(corpusName)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Got error fetching files');
      setFiles(data.files || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFiles();
  }, []);

  async function handleDeleteFile(ragFileName: string) {
    if (!confirm('Are you sure you want to remove this document from the index?')) return;
    
    setDeletingId(ragFileName);
    setError(null);
    try {
      const res = await fetch('/api/rag/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corpusName, ragFileName }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete file');
      }
      setFiles((prev) => prev.filter((f) => f.name !== ragFileName));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteCorpus() {
    if (!confirm('⚠️ Are you COMPLETELY SURE you want to delete the entire index? You will have to re-index from scratch.')) return;
    
    setDeletingAll(true);
    setError(null);
    try {
      const res = await fetch('/api/rag/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corpusName, all: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete corpus');
      }
      
      // Notify parent to clean up state
      onCorpusDeleted();
    } catch (err: any) {
      setError(err.message);
      setDeletingAll(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto p-5 pb-24">
        {error && (
          <div className="mb-4 p-3 rounded-lg flex items-start gap-2 text-sm" style={{ backgroundColor: 'rgba(248,113,113,0.1)', color: '#b91c1c' }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mb-5 rounded-lg p-3 text-xs" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>How to rename a document?</p>
          Google Cloud reads the name directly from your Drive. To change the name here, you must <strong>rename it in Google Drive</strong> and use the <RefreshCw size={10} className="inline mx-0.5" /> Sync button on the main screen.
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--text-secondary)' }}>
            There are no indexed documents at this time.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
              {files.length} Indexed Document{files.length !== 1 ? 's' : ''}
            </h4>
            
            {files.map((file) => (
              <div 
                key={file.name} 
                className="flex items-center justify-between gap-3 p-3 rounded-lg border transition-all"
                style={{ 
                  backgroundColor: 'var(--bg)', 
                  borderColor: 'var(--border)',
                  opacity: deletingId === file.name ? 0.5 : 1
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <FileText size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }} title={file.displayName}>
                    {file.displayName}
                  </span>
                </div>
                
                <button
                  onClick={() => handleDeleteFile(file.name)}
                  disabled={deletingId === file.name}
                  className="p-1.5 rounded-md hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors disabled:opacity-50 shrink-0"
                  title="Remove from index"
                >
                  {deletingId === file.name ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky footer with destructive global action */}
      <div className="p-5 border-t" style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}>
        <button
          onClick={handleDeleteCorpus}
          disabled={deletingAll || loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}
        >
          {deletingAll ? (
            <><Loader2 size={16} className="animate-spin" /> Emptying entire index...</>
          ) : (
            <><Trash2 size={16} /> Delete entire index</>
          )}
        </button>
      </div>
    </div>
  );
}
