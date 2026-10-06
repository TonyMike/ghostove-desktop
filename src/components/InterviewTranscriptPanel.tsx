import React, { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check, Trash2, Volume2 } from 'lucide-react';
import { TranscriptItem } from '../hooks/useWebSocketStream';
import { Tooltip } from './common/Tooltip';

interface InterviewTranscriptPanelProps {
  transcriptList: TranscriptItem[];
  interimText?: string;
  isSpeaking: boolean;
  volumeLevel: number;
  onClear: () => void;
  selectedLanguage: string;
  onSelectLanguage: (lang: string) => void;
  fontSizeLevel?: number;
}

const LANGUAGES = [
  'English',
  'Spanish (Español)',
  'French (Français)',
  'German (Deutsch)',
  'Mandarin (中文)',
  'Portuguese (Português)',
  'Japanese (日本語)',
  'Hindi (हिन्दी)',
];

function InterviewTranscriptPanelComponent({
  transcriptList,
  interimText,
  isSpeaking,
  volumeLevel,
  onClear,
  selectedLanguage,
  onSelectLanguage,
  fontSizeLevel = 0,
}: InterviewTranscriptPanelProps) {
  const [showLangMenu, setShowLangMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Dynamic font size scaling based on fontSizeLevel (-2 to +4)
  const transcriptSize = Math.max(10, 12.5 + (fontSizeLevel || 0) * 1.5);

  // Auto-scroll to bottom on new transcripts
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptList, interimText]);

  return (
    <div className="bg-slate-950/90 border border-emerald-500/20 rounded-2xl shadow-[0_16px_50px_rgba(0,0,0,0.85),0_0_20px_rgba(16,185,129,0.05)] backdrop-blur-2xl p-3.5 flex flex-col justify-between text-white w-full min-h-[480px] max-h-[620px]">
      {/* Header: Equalizer + Language Selector + Clear */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2 select-none">
        {/* Left: Animated Audio Equalizer Bars + Language Selector */}
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

          {/* Language Selector Dropdown */}
          <div className="relative">
            <Tooltip content="Select Speech Language" position="bottom">
              <button
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Globe className="w-3 h-3 text-slate-400" />
                <span>{selectedLanguage.split(' ')[0]}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
              </button>
            </Tooltip>

            {showLangMenu && (
              <div
                className="absolute left-0 top-full mt-1.5 w-44 bg-slate-950/95 border border-emerald-500/20 rounded-xl p-1 shadow-2xl backdrop-blur-2xl z-50 text-xs text-slate-200 space-y-0.5 animate-fade-in"
                onClick={() => setShowLangMenu(false)}
              >
                {LANGUAGES.map((lang) => {
                  const isSelected = selectedLanguage.startsWith(lang.split(' ')[0]);
                  return (
                    <button
                      key={lang}
                      onClick={() => onSelectLanguage(lang)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-[11px] transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-white/15 text-white font-semibold'
                          : 'hover:bg-white/10 text-slate-300'
                      }`}
                    >
                      <span>{lang}</span>
                      {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Clear ⌘⇧⌫ */}
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
      </div>

      {/* Main Transcript Stream Body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pr-1 space-y-3 font-sans text-xs scrollbar-thin scrollbar-thumb-white/15 scrollbar-track-transparent"
      >
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
        {transcriptList.length === 0 && !interimText && (
          <div className="h-44 flex flex-col items-center justify-center text-center p-3 text-slate-500 space-y-1.5 select-none">
            <Volume2 className="w-5 h-5 text-slate-600 animate-pulse" />
            <p className="text-[11px] italic">
              Listening to audio... Spoken questions and answers will transcribe here in real-time.
            </p>
          </div>
        )}

        {/* Interim / In-flight live text streamed in real-time */}
        {interimText && (
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
    </div>
  );
}

export const InterviewTranscriptPanel = React.memo(InterviewTranscriptPanelComponent);

