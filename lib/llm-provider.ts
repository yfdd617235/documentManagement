import { createOpenAI } from '@ai-sdk/openai';
import { createVertex } from '@ai-sdk/google-vertex';
import type { LanguageModel } from 'ai';

export type ProviderType = 'openrouter' | 'ollama' | 'gemini';

export interface ModelOption {
  id: string;
  name: string;
  provider: ProviderType;
}

/**
 * Returns the Vercel AI SDK LanguageModel for the requested provider and model.
 */
export function getLLM(provider: ProviderType, modelId: string): any {
  switch (provider) {
    case 'openrouter': {
      const openRouter = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY || '',
      });
      return openRouter(modelId);
    }
    
    case 'ollama': {
      // Ollama has OpenAI compatibility layer
      const ollama = createOpenAI({
        baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
        apiKey: 'ollama', // purely symbolic, but required by OpenAI client
      });
      return ollama(modelId);
    }

    case 'gemini': {
      // Vertex AI SDK on Vercel requires explicit credentials from JSON env var
      const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      let googleAuthOptions = undefined;
      
      if (credentialsJson) {
        try {
          googleAuthOptions = {
            credentials: JSON.parse(credentialsJson),
          };
        } catch (e) {
          console.error('[LLM ERROR] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', e);
        }
      }

      console.log(`[LLM DEBUG] createVertex project=${process.env.GOOGLE_CLOUD_PROJECT_ID} location=${process.env.VERTEX_AI_LOCATION || 'us-central1'}`);
      const vertex = createVertex({
        project: process.env.GOOGLE_CLOUD_PROJECT_ID,
        location: process.env.VERTEX_AI_LOCATION || 'us-central1',
        googleAuthOptions,
      });
      return vertex(modelId);
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Returns an array of LanguageModels for auto-fallback.
 * Tries the chosen model first, then OpenRouter, then Ollama, then Gemini.
 */
export function getFallbackChain(
  primaryProvider: ProviderType,
  primaryModelId: string
): any[] {
  const chain: any[] = [];

  // 1. Always try the requested model first
  try {
    chain.push(getLLM(primaryProvider, primaryModelId));
  } catch {}

  // 2. OpenRouter fallback (generic model like meta-llama/llama-3-8b-instruct)
  if (primaryProvider !== 'openrouter' && process.env.OPENROUTER_API_KEY) {
    try {
      chain.push(getLLM('openrouter', 'meta-llama/llama-3-8b-instruct'));
    } catch {}
  }

  // 3. Ollama fallback (llama3)
  if (primaryProvider !== 'ollama') {
    try {
      chain.push(getLLM('ollama', 'llama3'));
    } catch {}
  }

  // 4. Gemini fallback (always available if deployed on GCP)
  if (primaryProvider !== 'gemini') {
    try {
      chain.push(getLLM('gemini', 'gemini-2.5-flash'));
    } catch {}
  }

  return chain.length > 0 ? chain : [getLLM('gemini', 'gemini-2.5-flash')];
}

/**
 * Fetches available models dynamically from OpenRouter.
 */
export async function getOpenRouterModels(): Promise<ModelOption[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  // Short timeout so UI doesn't hang if OpenRouter is slow
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.name,
      provider: 'openrouter',
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches available local models dynamically from Ollama.
 */
export async function getOllamaModels(): Promise<ModelOption[]> {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500); // Fail fast

  try {
    const res = await fetch(`${baseUrl}/models`, { signal: controller.signal });
    if (!res.ok) return [];
    
    const data = await res.json();
    return (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.id, // Ollama models often use the ID as the name
      provider: 'ollama',
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Returns fixed Gemini backup models.
 */
export function getGeminiBackupModels(): ModelOption[] {
  return [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini' },
    { id: 'gemini-3.1-flash', name: 'Gemini 3.1 Flash (Preview)', provider: 'gemini' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini' },
    { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro (Preview)', provider: 'gemini' },
  ];
}
