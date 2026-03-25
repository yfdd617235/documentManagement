import { useState } from 'react';
import { ExternalLink, CheckSquare, Square, FolderPlus, Star, Folder, File, ChevronRight, ChevronDown } from 'lucide-react';
import type { ClassificationPlan, FileToCopy, ClassificationFolder } from '@/types';

interface Props {
  plan: ClassificationPlan;
  onFolderNameChange: (name: string) => void;
  onConfirm: (selectedFileIds: string[]) => void;
}

export function ClassificationPlanUI({ plan, onFolderNameChange, onConfirm }: Props) {
  const [folderName, setFolderName] = useState(plan.master_folder_name);
  
  // Get all unique file IDs from the plan
  const allFileIds = Array.from(new Set(
    plan.items.flatMap(item => item.files_to_copy.map(f => f.file_id))
  ));
  
  const [selected, setSelected] = useState<Set<string>>(new Set(allFileIds));
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(plan.items.map(i => i.id)));

  const totalFiles = allFileIds.length;

  function toggleFile(fileId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  function toggleItem(item: ClassificationFolder) {
    const itemFileIds = item.files_to_copy.map(f => f.file_id);
    const allSelected = itemFileIds.every(id => selected.has(id));
    
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) itemFileIds.forEach(id => next.delete(id));
      else itemFileIds.forEach(id => next.add(id));
      return next;
    });
  }

  function toggleExpand(itemId: string) {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === totalFiles) setSelected(new Set());
    else setSelected(new Set(allFileIds));
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            Plan de Clasificación Estructurado — {plan.items.length} ítems
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Se crearán subcarpetas para cada ítem. Los archivos originales no se mueven, se copian.
          </p>
        </div>
        <button onClick={toggleAll} className="text-xs underline font-medium" style={{ color: 'var(--accent)' }}>
          {selected.size === totalFiles ? 'Deseleccionar todo' : 'Seleccionar todo'}
        </button>
      </div>

      {/* Destination master folder */}
      <div className="card p-4 flex flex-col gap-3 slide-in">
        <div className="flex items-center gap-3">
           <FolderPlus size={18} style={{ color: 'var(--accent)' }} className="shrink-0" />
           <div className="flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-secondary)' }}>Carpeta Maestra en Drive</label>
              <input
                value={folderName}
                onChange={(e) => { setFolderName(e.target.value); onFolderNameChange(e.target.value); }}
                className="w-full bg-transparent text-sm outline-none font-semibold border-b border-[var(--border)] focus:border-[var(--accent)] pb-1"
                style={{ color: 'var(--text-primary)' }}
                placeholder="Nombre de la carpeta principal..."
              />
           </div>
        </div>
      </div>

      {/* Item Groups */}
      <div className="flex flex-col gap-3">
        {plan.items.map((item) => {
          const itemFileIds = item.files_to_copy.map(f => f.file_id);
          const allSelected = itemFileIds.every(id => selected.has(id));
          const someSelected = itemFileIds.some(id => selected.has(id));
          const isExpanded = expandedItems.has(item.id);

          return (
            <div key={item.id} className="card overflow-hidden slide-in">
              {/* Item Header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/50 hover:bg-slate-50 transition-colors border-b" style={{ borderColor: 'var(--border)' }}>
                 <button onClick={() => toggleExpand(item.id)} className="p-1 hover:bg-slate-200 rounded">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                 </button>
                 
                 <div onClick={() => toggleItem(item)} className="cursor-pointer">
                    {allSelected ? (
                       <CheckSquare size={16} className="text-[var(--accent)]" />
                    ) : someSelected ? (
                       <div className="w-4 h-4 rounded-sm bg-[var(--accent)] opacity-50 relative flex items-center justify-center">
                          <div className="w-2.5 h-0.5 bg-white rounded-full"></div>
                       </div>
                    ) : (
                       <Square size={16} className="text-[var(--border)]" />
                    )}
                 </div>

                 <div className="flex-1 flex items-center gap-3 cursor-pointer" onClick={() => toggleExpand(item.id)}>
                    <Folder size={16} className="text-amber-500" />
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                       {item.folder_name}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-[var(--border)] font-bold text-[var(--text-secondary)]">
                       {item.files_to_copy.length} Archivos
                    </span>
                 </div>
              </div>

              {/* Files in Item */}
              {isExpanded && (
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {item.files_to_copy.map((file) => (
                    <div
                      key={file.file_id}
                      className="flex items-center gap-3 px-10 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer group"
                      onClick={() => toggleFile(file.file_id)}
                    >
                      <div className="shrink-0" style={{ color: selected.has(file.file_id) ? 'var(--accent)' : 'var(--border)' }}>
                         {selected.has(file.file_id) ? <CheckSquare size={14} /> : <Square size={14} />}
                      </div>
                      <File size={14} className="opacity-30 group-hover:opacity-60" />
                      <div className="flex-1 min-w-0">
                         <p className="text-xs truncate font-medium" style={{ color: 'var(--text-primary)' }}>{file.file_name}</p>
                      </div>
                      {file.drive_url && (
                        <a
                          href={file.drive_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-slate-200 rounded text-[var(--accent)]"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirm button */}
      <div className="card p-6 flex flex-col items-center gap-4 border-t-4 border-[var(--accent)] slide-in" style={{ backgroundColor: 'rgba(99,102,241,0.02)' }}>
         <div className="text-center">
            <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>¿Autorizar Generación?</h4>
            <p className="text-xs max-w-md mx-auto mt-2" style={{ color: 'var(--text-secondary)' }}>
               Al confirmar, la IA creará la carpeta maestra y las subcarpetas organizadas en Drive. 
               Se copiarán <strong>{selected.size}</strong> archivos en total.
            </p>
         </div>
         
         <button
           onClick={() => onConfirm(Array.from(selected))}
           disabled={selected.size === 0}
           className="btn-primary w-full max-w-sm flex items-center justify-center gap-3 py-3"
         >
           <Star size={18} fill="currentColor" />
           <span className="uppercase tracking-widest text-xs font-black">Autorizar y Organizar</span>
         </button>
      </div>
    </div>
  );
}
