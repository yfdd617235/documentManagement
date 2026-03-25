'use client';

import { useState } from 'react';
import { ReferenceDocSelector } from './ReferenceDocSelector';
import { ClassificationPlanUI } from './ClassificationPlanUI';
import { ExecutionProgress, ProgressItem } from './ExecutionProgress';
import type { ClassificationPlan } from '@/types';
import { Loader2 } from 'lucide-react';

type Step = 'select_doc' | 'searching' | 'review_plan' | 'executing';

export function ClassifyView({ corpusName }: { corpusName: string }) {
  const [step, setStep] = useState<Step>('select_doc');
  const [plan, setPlan] = useState<ClassificationPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Execution state
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [summary, setSummary] = useState<any>(null);

  async function handleComponentsConfirmed(components: any[]) {
    setStep('searching');
    setError(null);
    try {
      const res = await fetch('/api/classify/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ components, corpusName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setPlan(data);
      setStep('review_plan');
    } catch (err: any) {
      setError(err.message);
      setStep('select_doc');
    }
  }

  async function handleConfirmPlan(selectedFileIds: string[]) {
    if (!plan) return;
    setStep('executing');
    setError(null);

    // Flatten all files from all items to initialize progress
    const allApprovedFiles: ProgressItem[] = [];
    plan.items.forEach(item => {
      item.files_to_copy.forEach(f => {
        if (!selectedFileIds || selectedFileIds.includes(f.file_id)) {
          allApprovedFiles.push({ file_id: f.file_id, file_name: f.file_name, status: 'pending' });
        }
      });
    });
    
    setProgressItems(allApprovedFiles);

    try {
      const res = await fetch('/api/classify/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, selectedFileIds }),
      });

      if (!res.body) throw new Error('No stream received');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunks = decoder.decode(value).split('\n\n');
        for (const chunk of chunks) {
          if (!chunk.startsWith('data: ')) continue;
          const data = JSON.parse(chunk.slice(6));

          if (data.type === 'copying' || data.type === 'file_done' || data.type === 'file_failed') {
            setProgressItems((prev) =>
              prev.map((item) => {
                if (item.file_id !== data.file_id) return item;
                return {
                  ...item,
                  status: data.type === 'copying' ? 'copying' : data.type === 'file_done' ? 'done' : 'failed',
                  link: data.link,
                  error: data.error,
                };
              })
            );
          }

          if (data.type === 'complete') {
            setSummary({
              total: data.total,
              succeeded: data.succeeded,
              failed: data.failed,
              folderUrl: data.folderUrl,
            });
          }

          if (data.type === 'error') {
            setError(data.message);
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="flex-1 p-6 md:p-10 flex flex-col items-center">
      {error && (
        <div className="w-full max-w-2xl mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          ⚠️ {error}
        </div>
      )}

      {step === 'select_doc' && (
        <ReferenceDocSelector onComponentsConfirmed={handleComponentsConfirmed} corpusName={corpusName} />
      )}

      {step === 'searching' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4" style={{ color: 'var(--text-secondary)' }}>
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <p className="text-sm font-medium">Searching for documents in the corpus...</p>
        </div>
      )}

      {step === 'review_plan' && plan && (
        <ClassificationPlanUI
          plan={plan}
          onFolderNameChange={(name) => setPlan({ ...plan, master_folder_name: name })}
          onConfirm={handleConfirmPlan}
        />
      )}

      {step === 'executing' && (
        <ExecutionProgress items={progressItems} summary={summary} />
      )}
    </div>
  );
}
