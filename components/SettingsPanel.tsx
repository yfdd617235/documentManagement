'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, AlertCircle, Loader2, Cpu, Globe, Server } from 'lucide-react';

type Provider = 'gemini' | 'openrouter' | 'ollama';

interface ModelOption {
  id: string;
  name: string;
  provider: Provider;
}

interface AllModels {
  gemini: ModelOption[];
  openRouter: ModelOption[];
  ollama: ModelOption[];
}

const PROVIDER_LABELS: Record<Provider, { label: string; icon: React.ReactNode; hint: string }> = {
  gemini: {
    label: 'Gemini',
    icon: <Cpu size={14} />,
    hint: 'Google Cloud Vertex AI',
  },
  openrouter: {
    label: 'OpenRouter',
    icon: <Globe size={14} />,
    hint: 'Requiere OPENROUTER_API_KEY',
  },
  ollama: {
    label: 'Ollama (local)',
    icon: <Server size={14} />,
    hint: 'Modelos locales sin costo',
  },
};

export function SettingsPanel() {
  const [provider, setProvider] = useState<Provider>('gemini');
  const [modelId, setModelId] = useState('gemini-2.5-flash');
  const [allModels, setAllModels] = useState<AllModels>({ gemini: [], openRouter: [], ollama: [] });
  const [loadingModels, setLoadingModels] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  // Load current settings + available models on mount
  useEffect(() => {
    async function init() {
      try {
        const [settingsRes, modelsRes] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/settings/models'),
        ]);
        const settings = await settingsRes.json();
        const models: AllModels = await modelsRes.json();

        setAllModels(models);

        // Normalize provider key (openRouter → openrouter)
        const savedProvider = (settings.provider ?? 'gemini') as Provider;
        setProvider(savedProvider);
        setModelId(settings.model ?? 'gemini-2.5-flash');
      } catch {
        // Use defaults silently
      } finally {
        setLoadingModels(false);
      }
    }
    init();
  }, []);

  // When provider changes, auto-select the first available model
  const handleProviderChange = useCallback((p: Provider) => {
    setProvider(p);
    setStatus('idle');
    const models = getModelsForProvider(p, allModels);
    if (models.length > 0) {
      setModelId(models[0].id);
    }
  }, [allModels]);

  function getModelsForProvider(p: Provider, m: AllModels): ModelOption[] {
    if (p === 'gemini') return m.gemini ?? [];
    if (p === 'openrouter') return m.openRouter ?? [];
    if (p === 'ollama') return m.ollama ?? [];
    return [];
  }

  async function handleSave() {
    setSaving(true);
    setStatus('idle');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model: modelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');

      // Also save to localStorage as an offline fallback
      localStorage.setItem('llm_provider', provider);
      localStorage.setItem('llm_model', modelId);

      setStatus('saved');
      setStatusMsg(data.warning ?? '');
    } catch (err: any) {
      setStatus('error');
      setStatusMsg(err.message);
    } finally {
      setSaving(false);
      // Auto-reset status icon after 4s
      setTimeout(() => setStatus('idle'), 4000);
    }
  }

  const currentModels = getModelsForProvider(provider, allModels);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Active model summary ── */}
      <div
        className="rounded-lg px-4 py-3 text-sm flex items-center gap-2"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
      >
        <Cpu size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Modelo activo
          </span>
          <p className="font-semibold truncate" style={{ color: 'var(--text-primary)', fontSize: '0.8rem', maxWidth: 220 }}>
            {modelId}
          </p>
        </div>
      </div>

      {/* ── Provider toggle ── */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
          Proveedor LLM
        </label>
        <div className="flex flex-col gap-2">
          {(Object.entries(PROVIDER_LABELS) as [Provider, typeof PROVIDER_LABELS[Provider]][]).map(([p, meta]) => (
            <button
              key={p}
              onClick={() => handleProviderChange(p)}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all text-sm"
              style={{
                backgroundColor: provider === p ? 'var(--accent)' : 'var(--bg)',
                border: `1px solid ${provider === p ? 'var(--accent)' : 'var(--border)'}`,
                color: provider === p ? '#fff' : 'var(--text-primary)',
              }}
            >
              <span className="mt-0.5 opacity-80">{meta.icon}</span>
              <div>
                <span className="font-medium">{meta.label}</span>
                <p className="text-xs opacity-70 mt-0.5">{meta.hint}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Model picker ── */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
          Modelo
        </label>
        {loadingModels ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 size={14} className="animate-spin" />
            <span>Cargando modelos...</span>
          </div>
        ) : currentModels.length === 0 ? (
          <div className="rounded-lg px-3 py-2.5 text-sm" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            {provider === 'ollama'
              ? '⚠️ Ollama no está corriendo en localhost:11434'
              : provider === 'openrouter'
              ? '⚠️ Configura OPENROUTER_API_KEY en .env.local'
              : 'Sin modelos disponibles'}
          </div>
        ) : (
          <select
            value={modelId}
            onChange={(e) => { setModelId(e.target.value); setStatus('idle'); }}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            {currentModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name || m.id}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Save button + status ── */}
      <div className="flex flex-col gap-2">
        <button
          onClick={handleSave}
          disabled={saving || currentModels.length === 0}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          {saving ? (
            <><Loader2 size={14} className="animate-spin" /> Guardando...</>
          ) : (
            'Guardar configuración'
          )}
        </button>

        {status === 'saved' && (
          <div className="flex items-center gap-2 text-xs" style={{ color: '#4ade80' }}>
            <CheckCircle size={13} />
            <span>{statusMsg || 'Guardado correctamente. El próximo chat usará este modelo.'}</span>
          </div>
        )}
        {status === 'error' && (
          <div className="flex items-center gap-2 text-xs" style={{ color: '#f87171' }}>
            <AlertCircle size={13} />
            <span>{statusMsg}</span>
          </div>
        )}
      </div>

      {/* ── Info footer ── */}
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
        Si un modelo deja de estar disponible, simplemente selecciona otro y guarda.
        La app tiene un sistema de <strong style={{ color: 'var(--text-primary)' }}>fallback automático</strong>: si el modelo principal falla, intenta con los demás proveedores configurados.
      </p>
    </div>
  );
}
