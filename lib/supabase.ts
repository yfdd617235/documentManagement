/**
 * Supabase client — optional.
 * If SUPABASE_URL and SUPABASE_ANON_KEY are not set, all methods return
 * safe no-op defaults so the app still works without persistence.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { CorpusRecord, UserSettings, OperationLog, LLMProvider } from '@/types';

// ─── Client ──────────────────────────────────────────────────────────────────

function getClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── Corpus (PASO 2) ─────────────────────────────────────────────────────────

export async function getCorpusForUser(userId: string): Promise<CorpusRecord | null> {
  const db = getClient();
  if (!db) return null;

  const { data, error } = await db
    .from('rag_corpora')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data as CorpusRecord;
}

export async function upsertCorpus(record: Omit<CorpusRecord, 'id'>): Promise<void> {
  const db = getClient();
  if (!db) return;

  await db.from('rag_corpora').upsert(
    { ...record, last_sync: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

export async function updateCorpusSyncTime(userId: string): Promise<void> {
  const db = getClient();
  if (!db) return;

  await db
    .from('rag_corpora')
    .update({ last_sync: new Date().toISOString() })
    .eq('user_id', userId);
}

// ─── User Settings (PASO 3) ──────────────────────────────────────────────────

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const db = getClient();
  if (!db) return null;

  const { data } = await db
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  return data as UserSettings | null;
}

export async function upsertUserSettings(
  userId: string,
  provider: LLMProvider,
  model: string | null
): Promise<void> {
  const db = getClient();
  if (!db) return;

  await db.from('user_settings').upsert(
    { user_id: userId, llm_provider: provider, llm_model: model, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

// ─── Operation Logs (PASO 5) ─────────────────────────────────────────────────

export async function logOperation(log: OperationLog): Promise<void> {
  const db = getClient();
  if (!db) {
    // If Supabase not configured, log to console as fallback (never skip logging silently)
    console.log('[OPERATION LOG]', JSON.stringify(log));
    return;
  }

  const { error } = await db.from('operation_logs').insert({
    ...log,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[Supabase] Failed to log operation:', error.message);
    // Do not throw — logging failure should not block Drive operations
  }
}

export function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}
