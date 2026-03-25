import { useState, useRef } from 'react';
import { ReferenceComponent } from '@/types';
import { FileText, Loader2, Search, Sparkles, Trash2, Hash, Package, Upload } from 'lucide-react';

interface Props {
  onComponentsConfirmed: (components: ReferenceComponent[]) => void;
  corpusName: string;
}

export function ReferenceDocSelector({ onComponentsConfirmed, corpusName }: Props) {
  const [fileId, setFileId] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ 
    components: ReferenceComponent[]; 
    entity_type: string; 
    file_name: string;
    page_count?: number;
    sheet_count?: number;
  } | null>(null);
  const [editableComponents, setEditableComponents] = useState<ReferenceComponent[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Local state for manually adding a component
  const [newDesc, setNewDesc] = useState('');
  const [newPN, setNewPN] = useState('');
  const [newSN, setNewSN] = useState('');

  async function handleParse(source: 'id' | 'upload', file?: File) {
    if (source === 'id' && !fileId.trim()) return;
    setParsing(true);
    setError(null);
    setParsed(null);

    try {
      let res;
      if (source === 'upload' && file) {
        const formData = new FormData();
        formData.append('file', file);
        res = await fetch('/api/classify/parse', {
          method: 'POST',
          body: formData,
        });
      } else {
        res = await fetch('/api/classify/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: fileId.trim() }),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Parse failed');
      setParsed(data);
      setEditableComponents(data.components || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleParse('upload', file);
    }
  }

  function removeComponent(idx: number) {
    setEditableComponents((prev: ReferenceComponent[]) => prev.filter((_: ReferenceComponent, i: number) => i !== idx));
  }

  function addComponent() {
    if (!newDesc.trim() && !newPN.trim()) return;
    setEditableComponents((prev: ReferenceComponent[]) => [
      ...prev,
      { description: newDesc.trim(), part_number: newPN.trim(), serial_number: newSN.trim() }
    ]);
    setNewDesc('');
    setNewPN('');
    setNewSN('');
  }

  function handleConfirm() {
    onComponentsConfirmed(editableComponents);
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
      {/* File Selection */}
      <div className="card p-6 slide-in">
        <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
          Reference Document
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Upload a file or enter a Drive ID to extract ALL component groups (Item, PN, SN).
        </p>
        
        <div className="flex flex-col md:flex-row gap-4">
          {/* Drive ID */}
          <div className="flex-1 flex gap-2">
            <input
              value={fileId}
              onChange={(e) => setFileId(e.target.value)}
              placeholder="Drive File ID..."
              className="input-field flex-1"
              disabled={parsing}
              onKeyDown={(e) => e.key === 'Enter' && handleParse('id')}
            />
            <button
              onClick={() => handleParse('id')}
              disabled={parsing || !fileId.trim()}
              className="btn-accent"
              title="Parse from Drive"
            >
              {parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              ID
            </button>
          </div>

          <div className="flex items-center text-xs opacity-50 uppercase font-bold">OR</div>

          {/* Local Upload */}
          <div className="flex-1">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".pdf,.xlsx,.xls" 
              onChange={onFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="btn-outline w-full flex items-center justify-center gap-2 py-[11px]"
            >
              <Upload size={14} />
              Upload from Computer
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-4 text-xs" style={{ color: 'var(--danger)' }}>⚠️ {error}</p>
        )}
      </div>

      {/* Structured Content Preview */}
      {parsed && (
        <div className="card p-6 flex flex-col gap-6 slide-in border-l-4 border-[var(--accent)]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                <FileText size={16} className="inline mr-2" style={{ color: 'var(--accent)' }} />
                {parsed.file_name}
              </h3>
              <div className="flex gap-3 mt-1">
                 <p className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 uppercase tracking-tighter" style={{ color: 'var(--text-secondary)' }}>
                    {parsed.entity_type}
                 </p>
                 <p className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 uppercase tracking-tighter">
                    {editableComponents.length} items found
                 </p>
                 {parsed.page_count ? (
                    <p className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-600 uppercase tracking-tighter">
                       {parsed.page_count} Pages
                    </p>
                 ) : parsed.sheet_count ? (
                    <p className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-50 text-green-600 uppercase tracking-tighter">
                       {parsed.sheet_count} Sheets
                    </p>
                 ) : null}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="pb-2 font-bold uppercase tracking-wider px-2 w-8" style={{ color: 'var(--text-secondary)' }}>#</th>
                  <th className="pb-2 font-bold uppercase tracking-wider px-2" style={{ color: 'var(--text-secondary)' }}>Description / Item</th>
                  <th className="pb-2 font-bold uppercase tracking-wider px-2" style={{ color: 'var(--text-secondary)' }}>Part Number</th>
                  <th className="pb-2 font-bold uppercase tracking-wider px-2" style={{ color: 'var(--text-secondary)' }}>Serial Number</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {editableComponents.map((comp: ReferenceComponent, idx: number) => (
                  <tr key={idx} className="group hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-2 opacity-50 font-mono text-[10px]">{idx + 1}</td>
                    <td className="py-2.5 px-2" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center gap-2">
                        <Package size={14} className="shrink-0 opacity-40" />
                        <span className="font-medium">{comp.description}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                       {comp.part_number || '—'}
                    </td>
                    <td className="py-2.5 px-2 font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                       {comp.serial_number || '—'}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <button
                        onClick={() => removeComponent(idx)}
                        className="p-1 rounded hover:bg-red-50 text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="Remove row"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}

                {/* Manual entry row */}
                <tr className="bg-slate-50/50">
                   <td className="py-2 px-2"></td>
                   <td className="py-2 px-2">
                      <input 
                        className="w-full bg-transparent outline-none border-b border-transparent focus:border-[var(--accent)] py-1"
                        placeholder="New component name..."
                        value={newDesc}
                        onChange={e => setNewDesc(e.target.value)}
                      />
                   </td>
                   <td className="py-2 px-2">
                      <input 
                        className="w-full bg-transparent outline-none border-b border-transparent focus:border-[var(--accent)] py-1 font-mono"
                        placeholder="PN..."
                        value={newPN}
                        onChange={e => setNewPN(e.target.value)}
                      />
                   </td>
                   <td className="py-2 px-2">
                      <input 
                        className="w-full bg-transparent outline-none border-b border-transparent focus:border-[var(--accent)] py-1 font-mono"
                        placeholder="SN..."
                        value={newSN}
                        onChange={e => setNewSN(e.target.value)}
                      />
                   </td>
                   <td className="py-2 px-2 text-right">
                      <button 
                         onClick={addComponent}
                         disabled={!newDesc.trim() && !newPN.trim()}
                         className="p-1.5 rounded-full bg-[var(--accent)] text-white hover:scale-110 transition-transform disabled:opacity-30"
                         title="Add manual component"
                      >
                         <Sparkles size={12} />
                      </button>
                   </td>
                </tr>
              </tbody>
            </table>
          </div>

          <button
            onClick={handleConfirm}
            disabled={editableComponents.length === 0}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            <Search size={16} />
            Search Components in Corpus
          </button>
        </div>
      )}
    </div>
  );
}
