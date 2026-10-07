import { useEffect, useRef } from 'react';
import { Mic, Volume2 } from 'lucide-react';

interface TranscriptBoxProps {
  transcript: { text: string; isFinal: boolean } | null;
}

export function TranscriptBox({ transcript }: TranscriptBoxProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [transcript]);

  return (
    <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-xs space-y-1.5 shadow-inner">
      <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
        <span className="flex items-center gap-1.5">
          <Mic className="w-3.5 h-3.5 text-emerald-400" />
          <span>Live Conversation Stream</span>
        </span>
        <span className="text-[10px] text-slate-500 font-mono">Real-Time Audio</span>
      </div>

      <div
        ref={containerRef}
        className="min-h-[50px] max-h-[75px] overflow-y-auto font-sans text-slate-200 leading-relaxed scrollbar-thin scrollbar-thumb-slate-800"
      >
        {transcript?.text ? (
          <p className={transcript.isFinal ? 'text-slate-100 font-medium' : 'text-slate-400 italic'}>
            "{transcript.text}"
          </p>
        ) : (
          <p className="text-slate-600 italic text-[11px]">
            Listening for interviewer questions or candidate audio...
          </p>
        )}
      </div>
    </div>
  );
}
