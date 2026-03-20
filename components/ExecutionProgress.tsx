'use client';

import { CheckCircle, XCircle, Loader2, FolderOpen, ExternalLink } from 'lucide-react';

export interface ProgressItem {
  file_id: string;
  file_name: string;
  status: 'pending' | 'copying' | 'done' | 'failed';
  error?: string;
  link?: string;
}

interface Summary {
  total: number;
  succeeded: number;
  failed: number;
  folderUrl?: string;
  folderName?: string;
}

interface Props {
  items: ProgressItem[];
  summary: Summary | null;
}

export function ExecutionProgress({ items, summary }: Props) {
  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto">
      <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
        Copiando archivos...
      </h3>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {items.map((item, idx) => (
          <div
            key={item.file_id}
            className="flex items-center gap-3 px-4 py-3"
            style={{
              borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
              backgroundColor: 'var(--surface)',
            }}
          >
            {/* Status icon */}
            <div className="shrink-0">
              {item.status === 'pending' && (
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'var(--border)' }} />
              )}
              {item.status === 'copying' && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />}
              {item.status === 'done' && <CheckCircle size={16} style={{ color: '#4ade80' }} />}
              {item.status === 'failed' && <XCircle size={16} style={{ color: '#f87171' }} />}
            </div>

            {/* Name */}
            <span className="flex-1 text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {item.file_name}
            </span>

            {/* Status text */}
            <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
              {item.status === 'pending' && 'En cola'}
              {item.status === 'copying' && 'Copiando...'}
              {item.status === 'done' && (
                item.link ? (
                  <a href={item.link} target="_blank" rel="noreferrer" className="flex items-center gap-1" style={{ color: '#4ade80' }}>
                    Listo <ExternalLink size={10} />
                  </a>
                ) : '✓ Listo'
              )}
              {item.status === 'failed' && <span style={{ color: '#f87171' }} title={item.error}>Error</span>}
            </span>
          </div>
        ))}
      </div>

      {/* Summary card */}
      {summary && (
        <div
          className="rounded-xl p-5 flex flex-col gap-3"
          style={{ backgroundColor: summary.failed === 0 ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${summary.failed === 0 ? '#4ade80' : '#f87171'}` }}
        >
          <div className="flex items-center gap-3">
            {summary.failed === 0
              ? <CheckCircle size={22} style={{ color: '#4ade80' }} />
              : <XCircle size={22} style={{ color: '#f87171' }} />}
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {summary.failed === 0 ? '¡Proceso completado!' : `Completado con ${summary.failed} errores`}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {summary.succeeded} de {summary.total} archivos copiados exitosamente
              </p>
            </div>
          </div>

          {summary.folderUrl && (
            <a
              href={summary.folderUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2 transition-all w-fit"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            >
              <FolderOpen size={14} />
              Ver carpeta en Drive
              <ExternalLink size={12} className="opacity-70" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
