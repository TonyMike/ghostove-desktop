import React, { useRef, useEffect } from 'react';
import { Check, ChevronDown, Headphones, Maximize2, Minimize2, Play, Square, Trash2, Volume2, Zap } from 'lucide-react';
import { TranscriptItem } from '../hooks/useWebSocketStream';
import { Tooltip } from './common/Tooltip';

interface InterviewTranscriptPanelProps {
  transcriptList: TranscriptItem[];
  interimText?: string;
  isSpeaking: boolean;
  volumeLevel: number;
  onClear: () => void;
  isMinimized: boolean;
  onToggleMinimized: () => void;
  audioTaskMode: boolean;
  onAudioTaskModeChange: (enabled: boolean) => void;
  audioTaskTranscriptText: string;
  audioTaskListening: boolean;
  audioTaskFinalizing: boolean;
  hasAudioTaskTranscript: boolean;
  audioTaskError: string;
  isSharedAudioActive: boolean;
  isBackendConnected: boolean;
  isGenerating: boolean;
  onStartAudioTaskClip: () => void;
  onFinishAudioTaskClip: () => void;
  onPrepareAudioTaskResponse: () => void;
  fontSizeLevel?: number;
}

function InterviewTranscriptPanelComponent({
  transcriptList,
  interimText,
  isSpeaking,
  volumeLevel,
  onClear,
  isMinimized,
  onToggleMinimized,
  audioTaskMode,
  onAudioTaskModeChange,
  audioTaskTranscriptText,
  audioTaskListening,
  audioTaskFinalizing,
  hasAudioTaskTranscript,
  audioTaskError,
  isSharedAudioActive,
  isBackendConnected,
  isGenerating,
  onStartAudioTaskClip,
  onFinishAudioTaskClip,
  onPrepareAudioTaskResponse,
  fontSizeLevel = 0,
}: InterviewTranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Dynamic font size scaling based on fontSizeLevel (-2 to +4)
  const transcriptSize = Math.max(10, 12.5 + (fontSizeLevel || 0) * 1.5);

  // Auto-scroll to bottom on new transcripts
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptList, interimText]);

  if (isMinimized) {
    const recentSegments = audioTaskMode
      ? [audioTaskTranscriptText || (audioTaskListening ? 'Listening to clip…' : '')]
      : [...transcriptList.slice(-3).map((item) => item.text), interimText || ''];
    const visibleSegments = recentSegments.map((text) => text.trim()).filter(Boolean);

    return (
      <div
        data-hud-hit-region
        className="relative z-50 flex h-12 min-w-0 items-center gap-2 rounded-2xl border border-emerald-500/20 bg-slate-950/90 px-3 text-white backdrop-blur-2xl"
        aria-label="Minimized transcription panel"
        role="status"
        aria-live="polite"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
          <Volume2 className={`h-3.5 w-3.5 ${isSpeaking ? 'text-emerald-300' : 'text-slate-400'}`} />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {visibleSegments.length > 0 ? (
            visibleSegments.map((text, index) => (
              <span
                key={`${index}-${text}`}
                className={`max-w-[34%] shrink rounded-full px-2.5 py-1 text-[11px] leading-none ${index === visibleSegments.length - 1 && interimText ? 'bg-emerald-500/20 text-emerald-100' : 'bg-white/10 text-slate-200'}`}
                title={text}
              >
                <span className="block truncate">{text}</span>
              </span>
            ))
          ) : (
            <span className="truncate text-[11px] text-slate-400">
              {audioTaskMode ? 'Audio task transcript will appear here.' : 'Listening for interview questions…'}
            </span>
          )}
        </div>
        <details className="relative shrink-0">
          <summary
            aria-label={`Mode: ${audioTaskMode ? 'Audio task' : 'Interview'}`}
            className="flex list-none cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-medium text-slate-200 marker:hidden transition-colors hover:border-emerald-400/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <span>{audioTaskMode ? 'Audio task' : 'Interview'}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
          </summary>
          <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-xl" role="group" aria-label="Choose interview mode">
            <button
              type="button"
              aria-pressed={!audioTaskMode}
              onClick={(event) => {
                onAudioTaskModeChange(false);
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <span className="flex-1">Interview mode</span>
              {!audioTaskMode && <Check className="h-3.5 w-3.5 text-emerald-300" />}
            </button>
            <button
              type="button"
              aria-pressed={audioTaskMode}
              onClick={(event) => {
                onAudioTaskModeChange(true);
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <Headphones className="h-3.5 w-3.5 text-emerald-300" />
              <span className="flex-1">Audio task mode</span>
              {audioTaskMode && <Check className="h-3.5 w-3.5 text-emerald-300" />}
            </button>
          </div>
        </details>
        <Tooltip content="Clear Transcript History" shortcut="⌘⇧⌫" position="top">
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            Clear
          </button>
        </Tooltip>
        <Tooltip content="Restore transcription panel" position="top">
          <button
            type="button"
            aria-label="Restore transcription panel"
            onClick={onToggleMinimized}
            className="shrink-0 rounded-md p-1 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div data-hud-hit-region className="bg-slate-950/90 border border-emerald-500/20 rounded-2xl shadow-none backdrop-blur-2xl p-3.5 flex h-[420px] min-h-0 flex-col text-white w-full overflow-hidden">
      {/* Header: Equalizer + Mode Selector + Clear */}
      <div className="mb-2 flex shrink-0 items-center justify-between border-b border-white/10 pb-2 select-none">
        {/* Left: Animated Audio Equalizer Bars + Mode Selector */}
        <div className="flex items-center gap-2">
          {/* Animated 3-Bar Green Equalizer */}
          <Tooltip
            content={isSpeaking ? 'Listening to audio...' : 'Audio live'}
            position="bottom"
          >
            <div className="flex items-end gap-0.5 h-4 px-1 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              <span
                style={{
                  height: isSpeaking ? `${Math.max(4, Math.min(14, volumeLevel * 18 + 4))}px` : '6px',
                }}
                className="w-1 bg-emerald-400 rounded-full transition-all duration-100"
              />
              <span
                style={{
                  height: isSpeaking ? `${Math.max(6, Math.min(16, volumeLevel * 24 + 6))}px` : '10px',
                }}
                className="w-1 bg-emerald-400 rounded-full transition-all duration-75"
              />
              <span
                style={{
                  height: isSpeaking ? `${Math.max(4, Math.min(12, volumeLevel * 14 + 4))}px` : '5px',
                }}
                className="w-1 bg-emerald-400 rounded-full transition-all duration-100"
              />
            </div>
          </Tooltip>

          <details className="relative">
            <summary
              aria-label={`Mode: ${audioTaskMode ? 'Audio task' : 'Interview'}`}
              className="flex list-none cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] font-medium text-slate-200 marker:hidden hover:border-emerald-400/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <span>{audioTaskMode ? 'Audio task' : 'Interview'}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
            </summary>
            <div className="absolute left-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-xl" role="group" aria-label="Choose interview mode">
              <button
                type="button"
                aria-pressed={!audioTaskMode}
                onClick={(event) => {
                  onAudioTaskModeChange(false);
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <span className="flex-1">Interview mode</span>
                {!audioTaskMode && <Check className="h-3.5 w-3.5 text-emerald-300" />}
              </button>
              <button
                type="button"
                aria-pressed={audioTaskMode}
                onClick={(event) => {
                  onAudioTaskModeChange(true);
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <Headphones className="h-3.5 w-3.5 text-emerald-300" />
                <span className="flex-1">Audio task mode</span>
                {audioTaskMode && <Check className="h-3.5 w-3.5 text-emerald-300" />}
              </button>
            </div>
          </details>
        </div>

        {/* Right: Clear ⌘⇧⌫ */}
        <div className="flex items-center gap-1">
          <Tooltip content="Clear Transcript History" shortcut="⌘⇧⌫" position="bottom">
            <button
              onClick={onClear}
              className="px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-300 hover:text-white hover:bg-white/10 flex items-center gap-1 transition-all cursor-pointer"
            >
              <span>Clear</span>
              <span className="text-[10px] font-mono text-slate-400 bg-white/10 px-1 py-0.5 rounded ml-0.5">
                ⌘⇧⌫
              </span>
            </button>
          </Tooltip>
          <Tooltip content="Minimize transcription panel" position="bottom">
            <button
              type="button"
              aria-label="Minimize transcription panel"
              onClick={onToggleMinimized}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Main Transcript Stream Body */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 font-sans text-xs scrollbar-thin scrollbar-thumb-white/15 scrollbar-track-transparent"
      >
        {audioTaskMode ? (
          audioTaskTranscriptText ? (
            <div className="flex flex-col items-start">
              <span className="mb-1 text-[10px] font-medium uppercase tracking-wide text-emerald-300">Audio clip</span>
              <p style={{ fontSize: `${transcriptSize}px` }} className="max-w-full whitespace-pre-wrap break-words text-left font-medium leading-relaxed text-slate-100">
                {audioTaskTranscriptText}
              </p>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-[11px] text-slate-500">
              {audioTaskListening ? 'Listening…' : 'The audio clip transcript will appear here.'}
            </div>
          )
        ) : (
          <>
            {transcriptList.map((item) => (
              <div key={item.id} className="text-right flex flex-col items-end">
                <p
                  style={{ fontSize: `${transcriptSize}px` }}
                  className="text-slate-100 font-medium leading-relaxed max-w-[95%]"
                >
                  {item.text}
                </p>
                <span className="text-[10px] text-slate-400/80 mt-0.5 font-sans">
                  {item.speaker} · {item.timestamp}
                </span>
              </div>
            ))}
          </>
        )}
        {!audioTaskMode && transcriptList.length === 0 && !interimText && (
          <div className="h-44 flex flex-col items-center justify-center text-center p-3 text-slate-500 space-y-1.5 select-none">
            <Volume2 className="w-5 h-5 text-slate-600 animate-pulse" />
            <p className="text-[11px] italic">
              Listening to audio... Spoken questions and answers will transcribe here in real-time.
            </p>
          </div>
        )}

        {/* Interim / In-flight live text streamed in real-time */}
        {!audioTaskMode && interimText && (
          <div className="text-right flex flex-col items-end p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 transition-all">
            <p
              style={{ fontSize: `${transcriptSize}px` }}
              className="text-emerald-200 font-medium max-w-[95%] leading-relaxed"
            >
              {interimText}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[10px] text-emerald-400 font-sans">
                Transcribing live...
              </span>
            </div>
          </div>
        )}
      </div>

      {audioTaskMode && (
        <footer className="mt-2 shrink-0 border-t border-white/10 pt-2" aria-label="Audio task controls">
          {audioTaskError && <p role="alert" className="mb-2 rounded-lg border border-rose-400/30 bg-rose-950/40 px-2.5 py-1.5 text-[10px] leading-relaxed text-rose-200">{audioTaskError}</p>}
          {audioTaskListening ? (
            <div className="flex items-center justify-between gap-2">
              <p role="status" className="flex items-center gap-2 text-[10px] font-medium text-emerald-200"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Listening</p>
              <button type="button" onClick={onFinishAudioTaskClip} className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[10px] font-semibold text-slate-200 hover:bg-white/5"><Square className="h-3 w-3 fill-current" /> Done</button>
            </div>
          ) : audioTaskFinalizing ? (
            <p role="status" className="text-[10px] text-slate-400">Preparing audio…</p>
          ) : hasAudioTaskTranscript ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              <button type="button" onClick={onStartAudioTaskClip} disabled={!isSharedAudioActive || !isBackendConnected} className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 text-[10px] font-semibold text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"><Play className="h-3 w-3" /> Another clip</button>
              <button type="button" onClick={onPrepareAudioTaskResponse} disabled={!isBackendConnected || isGenerating} className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 text-[10px] font-bold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"><Zap className="h-3 w-3" /> {isGenerating ? "Preparing…" : "Prepare response"}</button>
            </div>
          ) : (
            <div className="flex justify-end">
              <button type="button" onClick={onStartAudioTaskClip} disabled={!isSharedAudioActive || !isBackendConnected} title={!isSharedAudioActive ? "Turn on system audio from the top bar first" : undefined} className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 text-[10px] font-bold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"><Play className="h-3 w-3" /> Listen to clip</button>
            </div>
          )}
        </footer>
      )}
    </div>
  );
}

export const InterviewTranscriptPanel = React.memo(InterviewTranscriptPanelComponent);

