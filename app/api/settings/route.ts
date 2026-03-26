import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getUserSettings, upsertUserSettings, isSupabaseConfigured } from '@/lib/supabase';
import type { LLMProvider } from '@/types';

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      provider: 'gemini',
      model: 'gemini-1.5-flash',
    });
  }

  try {
    const settings = await getUserSettings(token.sub);
    return NextResponse.json({
      provider: settings?.llm_provider ?? 'gemini',
      model: settings?.llm_model ?? 'gemini-1.5-flash',
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { provider, model } = await req.json().catch(() => ({}));
  
  if (!provider || !['openrouter', 'ollama', 'gemini'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ 
      success: true, 
      warning: 'Supabase not configured, settings will not persist across reloads.' 
    });
  }

  try {
    await upsertUserSettings(token.sub, provider as LLMProvider, model || null);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
