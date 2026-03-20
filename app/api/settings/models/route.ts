import { NextResponse } from 'next/server';
import {
  getOpenRouterModels,
  getOllamaModels,
  getGeminiBackupModels,
} from '@/lib/llm-provider';

export async function GET() {
  try {
    const [openRouter, ollama, gemini] = await Promise.allSettled([
      getOpenRouterModels(),
      getOllamaModels(),
      getGeminiBackupModels(), // this is synchronous but we wrap it in Promise for consistency
    ]);

    // Extract successful results, ignoring failures (e.g. Ollama offline)
    const openRouterModels = openRouter.status === 'fulfilled' ? openRouter.value : [];
    const ollamaModels = ollama.status === 'fulfilled' ? ollama.value : [];
    const geminiModels = gemini.status === 'fulfilled' ? gemini.value : [];

    return NextResponse.json({
      openRouter: openRouterModels,
      ollama: ollamaModels,
      gemini: geminiModels,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to fetch models', message: err?.message },
      { status: 500 }
    );
  }
}
