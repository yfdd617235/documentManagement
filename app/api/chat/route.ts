import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { streamText, StreamingTextResponse } from 'ai';

import { retrieveContexts } from '@/lib/rag-engine';
import { getFallbackChain } from '@/lib/llm-provider';
import { getUserSettings, getCorpusForUser } from '@/lib/supabase';
import { MCP_TOOLS } from '@/lib/mcp-tools';

export const maxDuration = 60;

const MODE_1_SYSTEM_PROMPT = `
You are a highly capable Document Intelligence Assistant.
You have access to a secure, private document corpus via RAG (Retrieval-Augmented Generation).

Instructions:
1. Answer the user's question using strictly the information provided in the "CONTEXT" section below.
2. If the answer is not contained in the context, do not guess or hallucinate. Clearly state that the information is not present in the indexed documents.
3. Always cite your sources by mentioning the file name when drawing conclusions.
4. Format your response clearly using Markdown (bullet points, bold text).
5. Respond in the same language the user used for the question.

CONTEXT:
{CONTEXT}
`;

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages, mode = 1, corpusName } = await req.json();
  const latestMessage = messages[messages.length - 1];

  // 1. Get user configuration
  const settings = await getUserSettings(token.sub);
  const provider = settings?.llm_provider ?? 'gemini';
  let modelId = settings?.llm_model ?? 'gemini-2.5-flash';

  // Normalize legacy / deprecated model IDs
  if (modelId === 'gemini-1.5-flash' || modelId === 'gemini-2.0-flash') {
    modelId = 'gemini-2.5-flash';
  }

  const llmChain = getFallbackChain(provider as any, modelId);
  const model = llmChain[0];

  // 2. Get active Corpus — prefer client-supplied value over DB lookup
  const dbCorpus = await getCorpusForUser(token.sub);
  const activeCorpusName = corpusName || dbCorpus?.corpus_name;

  if (!activeCorpusName) {
    return new Response('No matching corpus found. Please index a folder first.', { status: 400 });
  }

  try {
    if (mode === 1) {
      // ── MODE 1: Conversational Search ──────────────────────────────────────
      const query = latestMessage.content;

      const contexts = await retrieveContexts(activeCorpusName, query, 10, 0.7);
      console.log(`[API/CHAT] Retrieved ${contexts.length} contexts for query: ${query}`);

      const formattedContext = contexts.length > 0
        ? contexts.map((c, i) => `[Source ${i + 1}: ${c.file_name}]\n${c.text}\n`).join('\n---\n')
        : 'No relevant documents found in the indexed corpus.';

      const system = MODE_1_SYSTEM_PROMPT.replace('{CONTEXT}', formattedContext);

      const result = await streamText({
        model,
        system,
        messages,
        temperature: 0.1,
      });

      // StreamingTextResponse is the ai@3.x compatible API that useChat expects.
      // Sources are embedded in a custom header decoded on the client side.
      return new StreamingTextResponse(result.toAIStream(), {
        headers: {
          'x-rag-sources': Buffer.from(JSON.stringify(contexts)).toString('base64'),
        },
      });

    } else {
      // ── MODE 2: Placeholder ────────────────────────────────────────────────
      const result = await streamText({
        model,
        system: 'You are an AI assistant orchestrating Drive operations.',
        messages,
        tools: MCP_TOOLS as any,
      });
      return new StreamingTextResponse(result.toAIStream());
    }

  } catch (error: any) {
    console.error('[API/CHAT ERROR]:', error);
    return new Response(error.message || 'Stream failed', { status: 500 });
  }
}
