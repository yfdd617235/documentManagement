import { useState, useRef, useEffect } from 'react';
import { useChat } from 'ai/react';
import { Send, FileText, ExternalLink, Loader2, Bot } from 'lucide-react';
import type { RetrievedChunk } from '@/types';

interface SearchPanelProps {
  corpusName: string;
}

export function SearchPanel({ corpusName }: SearchPanelProps) {
  const [sourcesLists, setSourcesLists] = useState<RetrievedChunk[][]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    body: { mode: 1, corpusName },
    onResponse: (response: any) => {
      if (!response.ok) {
        console.error('Chat response error:', response.status);
        return;
      }
      // Extract the custom header containing the RAG sources
      const sourcesHeader = response.headers.get('x-rag-sources');
      if (sourcesHeader) {
        try {
          // Decode Base64 JSON payload
          const b64 = sourcesHeader;
          const json = atob(b64);
          const sources: RetrievedChunk[] = JSON.parse(json);
          setSourcesLists((prev) => [...prev, sources]);
        } catch (e) {
          console.error('Failed to parse sources from header', e);
        }
      } else {
        setSourcesLists((prev) => [...prev, []]);
      }
    },
    onError: (error: Error) => {
      console.error('Chat error:', error);
      setErrorMessage(error.message);
    }
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col w-full h-full max-w-4xl mx-auto rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
      {/* Error Banner */}
      {errorMessage && (
        <div className="px-4 py-3 text-sm rounded-lg mx-4 mt-3" style={{ backgroundColor: 'var(--danger)', color: '#fff', opacity: 0.9 }}>
          <strong>Error:</strong> {errorMessage}
          <button onClick={() => setErrorMessage(null)} className="ml-2 underline text-xs">Close</button>
        </div>
      )}
      {/* ── Messages Area ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center fade-in">
            <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Conversational Search</h3>
            <p className="max-w-md text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Ask your document database a question. The AI will analyze the indexed files and respond by rigorously citing its sources.
            </p>
          </div>
        ) : (
          messages.map((m: any, idx: number) => {
            const isUser = m.role === 'user';

            // Calculate which assistant message this is to match with sourcesLists
            const assistantIndex = messages.slice(0, idx + 1).filter((msg: any) => msg.role === 'assistant').length - 1;
            const sources = !isUser ? sourcesLists[assistantIndex] : null;

            return (
              <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} fade-in`}>
                <div
                  className={`max-w-[85%] px-5 py-3 rounded-2xl ${isUser ? 'rounded-br-sm' : 'rounded-tl-sm'}`}
                  style={{
                    backgroundColor: isUser ? 'var(--accent)' : 'var(--bg)',
                    color: isUser ? '#fff' : 'var(--text-primary)',
                    border: isUser ? 'none' : '1px solid var(--border)'
                  }}
                >
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {m.content}
                  </div>
                </div>

                {/* Render Sources for Assistant Messages */}
                {!isUser && sources && sources.length > 0 && (
                  <div className="mt-3 ml-2 flex flex-col gap-2 w-[85%]">
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Extracted Sources</span>
                    <div className="flex flex-wrap gap-2">
                      {sources.map((src, i) => (
                        <a
                          key={i}
                          href={src.drive_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
                          style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        >
                          <FileText size={12} style={{ color: 'var(--accent)' }} />
                          <span className="truncate max-w-[150px] font-medium">{src.file_name}</span>
                          <ExternalLink size={10} className="opacity-50" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Loading Indicator */}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex items-start fade-in">
            <div className="px-5 py-4 rounded-2xl rounded-tl-sm flex gap-2 items-center" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}>
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium animate-pulse" style={{ color: 'var(--text-secondary)' }}>Analyzing documents...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Area ── */}
      <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
        <form
          onSubmit={handleSubmit}
          className="relative flex items-center w-full rounded-xl overflow-hidden shadow-sm"
          style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        >
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask something about your documents..."
            className="w-full py-4 pl-5 pr-14 bg-transparent outline-none text-sm placeholder:opacity-50"
            style={{ color: 'var(--text-primary)' }}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2 p-2 rounded-lg transition-all disabled:opacity-30 disabled:hidden"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </form>
        <p className="text-center mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          The AI will only use information extracted from your documents.
        </p>
      </div>
    </div>
  );
}
