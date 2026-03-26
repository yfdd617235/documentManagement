import { createOpenAI } from '@ai-sdk/openai';
import { createVertex } from '@ai-sdk/google-vertex';
import type { LanguageModel } from 'ai';

export const HEALTHY_GCP_REGIONS = ['europe-west4', 'us-central1', 'us-east1', 'us-east4', 'asia-northeast1', 'australia-southeast1'];

export type ProviderType = 'openrouter' | 'ollama' | 'gemini';

export interface ModelOption {
  id: string;
  name: string;
  provider: ProviderType;
}

/**
 * Returns the Vercel AI SDK LanguageModel for the requested provider and model.
 * locationOverride allows trying different GCP regions for Gemini.
 */
export function getLLM(provider: ProviderType, modelId: string, locationOverride?: string): any {
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
      const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      let googleAuthOptions = undefined;
      
      if (credentialsJson) {
        try {
          googleAuthOptions = {
            credentials: JSON.parse(credentialsJson),
          };
        } catch (e) {
          console.error('[LLM ERROR] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', e);
        }
      } else if (keyFile) {
        googleAuthOptions = { keyFile };
      }

      const location = locationOverride || process.env.VERTEX_AI_LOCATION || 'us-central1';
      console.log(`[LLM/GCP] createVertex project=${process.env.GOOGLE_CLOUD_PROJECT_ID} location=${location}`);
      
      const vertex = createVertex({
        project: process.env.GOOGLE_CLOUD_PROJECT_ID as string,
        location,
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
  const primaryLocation = process.env.VERTEX_AI_LOCATION || 'us-central1';

  // 1. Primary choice
  try {
    chain.push(getLLM(primaryProvider, primaryModelId));
  } catch (e) {
    console.error('[LLM/CHAIN] Primary provider init failed:', e);
  }

  // 2. If provider is Gemini and model is PRO, add FLASH in same region as immediate backup
  if (primaryProvider === 'gemini' && primaryModelId.includes('pro')) {
    chain.push(getLLM('gemini', 'gemini-1.5-flash', primaryLocation));
  }

  // 3. Fallback to other healthy regions (Flash only for best chance of success)
  if (primaryProvider === 'gemini') {
    for (const loc of HEALTHY_GCP_REGIONS) {
      if (loc !== primaryLocation) {
        try {
          // Always use Flash for fallback regions to minimize 404s
          chain.push(getLLM('gemini', 'gemini-1.5-flash', loc));
        } catch {}
      }
    }
  }

  // 4. OpenRouter fallback (generic model)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      chain.push(getLLM('openrouter', 'meta-llama/llama-3.1-8b-instruct'));
    } catch {}
  }

  // 5. Hardcoded safety net: Gemini Flash in us-central1
  try {
    chain.push(getLLM('gemini', 'gemini-1.5-flash', 'us-central1'));
  } catch {}

  return chain;
}

/**
 * Fetches available models dynamically from OpenRouter.
 */
export async function getOpenRouterModels(): Promise<ModelOption[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

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
  const timeoutId = setTimeout(() => controller.abort(), 1500);

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
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini' },
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', provider: 'gemini' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini' },
  ];
}
