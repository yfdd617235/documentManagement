'use client';

import { useState } from 'react';
import { ExternalLink, CheckSquare, Square, FolderPlus, Star } from 'lucide-react';
import type { ClassificationPlan, FileToCopy } from '@/types';

interface Props {
  plan: ClassificationPlan;
  onFolderNameChange: (name: string) => void;
  onConfirm: (selectedFileIds: string[]) => void;
}

export function ClassificationPlanUI({ plan, onFolderNameChange, onConfirm }: Props) {
  const [folderName, setFolderName] = useState(plan.destination_folder_name);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(plan.files_to_copy.map((f) => f.file_id))
  );

  function toggle(fileId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === plan.files_to_copy.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(plan.files_to_copy.map((f) => f.file_id)));
    }
  }

  function scoreBar(score: number) {
    const pct = Math.min(100, Math.round(score * 100));
    const color = pct > 70 ? '#4ade80' : pct > 40 ? '#facc15' : '#94a3b8';
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 rounded-full flex-1 overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
        <span className="text-xs font-mono tabular-nums" style={{ color, minWidth: 36 }}>{pct}%</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            Plan de clasificación — {plan.files_to_copy.length} archivos
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Selecciona los archivos a copiar. Los originales nunca se modifican.
          </p>
        </div>
        <button onClick={toggleAll} className="text-xs underline" style={{ color: 'var(--accent)' }}>
          {selected.size === plan.files_to_copy.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
        </button>
      </div>

      {/* Destination folder name */}
      <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
        <FolderPlus size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <label className="text-xs font-medium shrink-0" style={{ color: 'var(--text-secondary)' }}>Carpeta destino:</label>
        <input
          value={folderName}
          onChange={(e) => { setFolderName(e.target.value); onFolderNameChange(e.target.value); }}
          className="flex-1 bg-transparent text-sm outline-none font-medium"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>

      {/* File list */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {plan.files_to_copy.map((file: FileToCopy, idx: number) => (
          <div
            key={file.file_id}
            onClick={() => toggle(file.file_id)}
            className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors"
            style={{
              backgroundColor: selected.has(file.file_id) ? 'rgba(99,102,241,0.06)' : 'var(--surface)',
              borderBottom: idx < plan.files_to_copy.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            {/* Checkbox */}
            <div className="mt-0.5 shrink-0" style={{ color: selected.has(file.file_id) ? 'var(--accent)' : 'var(--border)' }}>
              {selected.has(file.file_id) ? <CheckSquare size={16} /> : <Square size={16} />}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {file.file_name}
                </span>
                {file.drive_url && (
                  <a
                    href={file.drive_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>

              {/* Matched entities */}
              <div className="flex flex-wrap gap-1 mt-1">
                {file.matched_entities.map((e, i) => (
                  <span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                    {e}
                  </span>
                ))}
              </div>

              {/* Score bar */}
              <div className="mt-2 max-w-[200px]">
                {scoreBar(file.match_score)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Confirm button */}
      <button
        onClick={() => onConfirm(Array.from(selected))}
        disabled={selected.size === 0}
        className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
        style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
      >
        <Star size={15} />
        Confirmar y copiar {selected.size} archivo{selected.size !== 1 ? 's' : ''} →
      </button>
    </div>
  );
}
