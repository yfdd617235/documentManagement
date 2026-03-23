'use client';

import { useState } from 'react';
import { FileText, Hash, Loader2, Search, Sparkles } from 'lucide-react';

interface Props {
  onEntitiesConfirmed: (entities: string[]) => void;
  corpusName: string;
}

export function ReferenceDocSelector({ onEntitiesConfirmed, corpusName }: Props) {
  const [fileId, setFileId] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ entities: string[]; entity_type: string; file_name: string } | null>(null);
  const [editableEntities, setEditableEntities] = useState<string[]>([]);
  const [newEntity, setNewEntity] = useState('');

  async function handleParse() {
    if (!fileId.trim()) return;
    setParsing(true);
    setError(null);
    setParsed(null);

    try {
      const res = await fetch('/api/classify/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: fileId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Parse failed');
      setParsed(data);
      setEditableEntities(data.entities);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  }

  function removeEntity(idx: number) {
    setEditableEntities((prev) => prev.filter((_, i) => i !== idx));
  }

  function addEntity() {
    if (!newEntity.trim()) return;
    setEditableEntities((prev) => [...prev, newEntity.trim()]);
    setNewEntity('');
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-2xl mx-auto">
      {/* File ID input */}
      <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
          Reference Document
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Enter the ID of a Google Drive PDF or Excel file. The AI will extract key entities (part numbers, serials, etc.)
        </p>
        <div className="flex gap-2">
          <input
            value={fileId}
            onChange={(e) => setFileId(e.target.value)}
            placeholder="Drive File ID (e.g., 1abc...xyz)"
            className="flex-1 rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            disabled={parsing}
            onKeyDown={(e) => e.key === 'Enter' && handleParse()}
          />
          <button
            onClick={handleParse}
            disabled={parsing || !fileId.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          >
            {parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {parsing ? 'Parsing...' : 'Parse'}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs" style={{ color: '#f87171' }}>⚠️ {error}</p>
        )}
      </div>

      {/* Entity preview + editing */}
      {parsed && (
        <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                <FileText size={14} className="inline mr-1.5" style={{ color: 'var(--accent)' }} />
                {parsed.file_name}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {editableEntities.length} entities · {parsed.entity_type}
              </p>
            </div>
          </div>

          {/* Entity chips */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {editableEntities.map((entity, idx) => (
              <span
                key={idx}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >
                <Hash size={10} style={{ color: 'var(--accent)' }} />
                {entity}
                <button
                  onClick={() => removeEntity(idx)}
                  className="ml-0.5 opacity-50 hover:opacity-100 text-xs leading-none"
                  style={{ color: '#f87171' }}
                  title="Remove"
                >×</button>
              </span>
            ))}
          </div>

          {/* Add entity */}
          <div className="flex gap-2 mb-4">
            <input
              value={newEntity}
              onChange={(e) => setNewEntity(e.target.value)}
              placeholder="Add entity manually..."
              className="flex-1 rounded-lg px-3 py-2 text-xs outline-none"
              style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              onKeyDown={(e) => e.key === 'Enter' && addEntity()}
            />
            <button
              onClick={addEntity}
              disabled={!newEntity.trim()}
              className="px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            >Add</button>
          </div>

          <button
            onClick={() => onEntitiesConfirmed(editableEntities)}
            disabled={editableEntities.length === 0}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          >
            <Search size={14} />
            Search {editableEntities.length} entities in documents
          </button>
        </div>
      )}
    </div>
  );
}
