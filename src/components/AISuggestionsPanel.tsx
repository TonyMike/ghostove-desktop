import { useEffect, useRef } from 'react';
import { Sparkles, Copy, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

interface AISuggestionsPanelProps {
  fullAnswer: string;
  streamingToken: string | null;
  isGenerating: boolean;
}

export function AISuggestionsPanel({ fullAnswer, streamingToken, isGenerating }: AISuggestionsPanelProps) {
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [fullAnswer, streamingToken]);

  const handleCopy = () => {
    if (!fullAnswer) return;
    navigator.clipboard.writeText(fullAnswer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-xs space-y-2 shadow-xl flex-1 flex flex-col min-h-[180px]">
      <div className="flex items-center justify-between text-slate-300 border-b border-slate-800/80 pb-2">
        <span className="flex items-center gap-1.5 font-bold text-white text-xs">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>Claude 3.5 STAR Bullet Points</span>
        </span>

        <button
          onClick={handleCopy}
          disabled={!fullAnswer}
          className="text-[11px] text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors flex items-center gap-1 disabled:opacity-40"
        >
          {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-sans text-slate-200 leading-relaxed max-h-[260px] scrollbar-thin scrollbar-thumb-slate-800">
        {fullAnswer ? (
          <div className="whitespace-pre-wrap space-y-1 text-[12.5px] font-normal">
            {fullAnswer}
            {isGenerating && <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-0.5" />}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500 space-y-2">
            <Sparkles className="w-6 h-6 text-purple-400/40" />
            <p className="text-xs">
              Waiting for interviewer questions... STAR talking points grounded in your resume will stream here instantly.
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
