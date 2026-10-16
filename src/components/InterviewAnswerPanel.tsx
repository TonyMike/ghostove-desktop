import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Copy,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
  Maximize2,
  Minimize2,
  Trash2,
  MessageCircle,
  Code2,
  Check,
  Move,
} from 'lucide-react';
import { startDragging } from '../utils/windowManager';
import { Tooltip } from './common/Tooltip';

interface InterviewAnswerPanelProps {
  question: string;
  answer: string;
  isGenerating: boolean;
  streamingToken: string | null;
  sourceType?: string;
  pauseStatus?: 'idle' | 'speaking' | 'pausing' | 'triggered';
  onClear: () => void;
  onCopy?: () => void;
  qaHistory?: Array<{ id: string; question: string; answer: string }>;
  currentQAIndex?: number;
  onPrevQA?: () => void;
  onNextQA?: () => void;
  fontSizeLevel?: number;
}

function InterviewAnswerPanelComponent({
  question,
  answer,
  isGenerating,
  streamingToken,
  sourceType = '',
  pauseStatus = 'idle',
  onClear,
  onCopy,
  qaHistory = [],
  currentQAIndex = -1,
  onPrevQA,
  onNextQA,
  fontSizeLevel = 0,
}: InterviewAnswerPanelProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Dynamic typography sizes based on fontSizeLevel (-2 to +4)
  const baseSize = Math.max(10, 13 + (fontSizeLevel || 0) * 1.5);
  const headingSize = Math.max(11, 14 + (fontSizeLevel || 0) * 1.5);
  const codeSize = Math.max(9.5, 12 + (fontSizeLevel || 0) * 1.2);
  const questionSize = Math.max(11, 13.5 + (fontSizeLevel || 0) * 1.5);

  useEffect(() => {
    if (isGenerating && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [answer, streamingToken, isGenerating]);

  const handleCopy = () => {
    const textToCopy = question ? `Question: ${question}\n\nAnswer: ${answer}` : answer;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = (type: 'up' | 'down') => {
    setFeedback((prev) => (prev === type ? null : type));
  };

  // Converts **bold text**, *bold text*, `code`, and eliminates literal asterisks
  const renderFormattedInline = (text: string): React.ReactNode => {
    if (!text) return null;

    // Gracefully trim any hanging unclosed "**" during live streaming
    let cleanText = text;
    if (cleanText.endsWith('**')) {
      cleanText = cleanText.slice(0, -2);
    }

    // Match **bold** or `code` or *italic/bold*
    const tokenRegex = /(\*\*[^*]+?\*\*|`[^`]+?`|\*[^*]+?\*)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(cleanText)) !== null) {
      if (match.index > lastIndex) {
        // Strip any stray single asterisks from plain text
        const plain = cleanText.substring(lastIndex, match.index).replace(/\*/g, '');
        if (plain) parts.push(plain);
      }

      const token = match[0];
      if (token.startsWith('**') && token.endsWith('**')) {
        const boldText = token.slice(2, -2).trim();
        parts.push(
          <strong key={match.index} className="font-bold text-white tracking-tight">
            {boldText}
          </strong>
        );
      } else if (token.startsWith('`') && token.endsWith('`')) {
        const codeText = token.slice(1, -1);
        parts.push(
          <code key={match.index} className="px-1.5 py-0.5 rounded-md bg-white/10 text-emerald-300 font-mono text-[11.5px] border border-white/10">
            {codeText}
          </code>
        );
      } else if (token.startsWith('*') && token.endsWith('*')) {
        const boldText = token.slice(1, -1).trim();
        parts.push(
          <strong key={match.index} className="font-semibold text-slate-100">
            {boldText}
          </strong>
        );
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < cleanText.length) {
      const remaining = cleanText.substring(lastIndex).replace(/\*/g, '');
      if (remaining) parts.push(remaining);
    }

    return parts.length > 0 ? parts : cleanText.replace(/\*/g, '');
  };

function CodeBlockCard({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-white/15 bg-black/60 overflow-hidden my-2.5 shadow-none select-text">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.06] border-b border-white/10 text-[11px] select-none">
        <span className="font-mono uppercase font-bold text-emerald-400 flex items-center gap-1.5 tracking-wider">
          <Code2 className="w-3.5 h-3.5" />
          {language || 'code'}
        </span>
        <Tooltip content={copied ? 'Copied code!' : 'Copy code'} position="left">
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-all text-[10.5px] cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </Tooltip>
      </div>
      <pre
        style={{ fontSize: `${codeSize}px` }}
        className="p-3 font-mono leading-relaxed overflow-x-auto text-emerald-300/90 whitespace-pre"
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

  // Format answer text into clean, structured paragraphs, STAR cards, or styled bullet points
  const renderFormattedAnswer = (text: string) => {
    if (!text) return null;

    // 1. Separate code blocks from regular markdown text
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const segments: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', content: text.substring(lastIndex, match.index) });
      }
      segments.push({
        type: 'code',
        language: match[1] || 'code',
        content: match[2].trimEnd(),
      });
      lastIndex = codeBlockRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      const remaining = text.substring(lastIndex);
      // Check for streaming unclosed code block (e.g. ```python\n...)
      const unclosedMatch = remaining.match(/^([\s\S]*?)```([a-zA-Z0-9_-]*)\n([\s\S]*)$/);
      if (unclosedMatch) {
        if (unclosedMatch[1]) {
          segments.push({ type: 'text', content: unclosedMatch[1] });
        }
        segments.push({
          type: 'code',
          language: unclosedMatch[2] || 'code',
          content: unclosedMatch[3],
        });
      } else {
        segments.push({ type: 'text', content: remaining });
      }
    }

    return (
      <div className="space-y-3">
        {segments.map((seg, segIdx) => {
          if (seg.type === 'code') {
            return (
              <CodeBlockCard
                key={`code-${segIdx}`}
                code={seg.content}
                language={seg.language || 'code'}
              />
            );
          }

          const lines = seg.content.split('\n').filter((l) => l.trim() !== '');

          return (
            <div key={`text-${segIdx}`} className="space-y-2.5">
              {lines.map((line, idx) => {
                const trimmed = line.trim();

                // 1. STAR Structured Sections (Situation, Task, Action, Result)
                const starMatch = trimmed.match(
                  /^(\*{0,2}(Situation|Task|Action|Result|Key Takeaway|Recommendation)\*{0,2}:?\s*)(.*)/i
                );
                if (starMatch) {
                  const rawLabel = starMatch[2];
                  const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1).toLowerCase();
                  const body = starMatch[3];

                  const badgeStyles: Record<string, string> = {
                    Situation: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
                    Task: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
                    Action: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
                    Result: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
                  };
                  const badgeClass = badgeStyles[label] || 'text-amber-400 bg-amber-500/10 border-amber-500/25';

                  return (
                    <div key={idx} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold border tracking-wider uppercase select-none ${badgeClass}`}>
                        {label}
                      </span>
                      <p
                        style={{ fontSize: `${baseSize}px`, lineHeight: 1.6 }}
                        className="text-slate-200"
                      >
                        {renderFormattedInline(body)}
                      </p>
                    </div>
                  );
                }

                // 2. Numbered items (1. 2. 3.)
                const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
                if (numMatch) {
                  const num = numMatch[1];
                  const content = numMatch[2];
                  return (
                    <div key={idx} className="flex items-start gap-2.5 pl-0.5">
                      <span className="w-4 h-4 rounded-full bg-white/10 border border-white/15 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 select-none">
                        {num}
                      </span>
                      <span
                        style={{ fontSize: `${baseSize}px`, lineHeight: 1.6 }}
                        className="text-slate-200 flex-1"
                      >
                        {renderFormattedInline(content)}
                      </span>
                    </div>
                  );
                }

                // 3. Bullet points (•, -, *)
                const isBullet = /^[•\-*]\s+/.test(trimmed);
                if (isBullet) {
                  const cleanContent = trimmed.replace(/^[•\-*]\s+/, '');
                  return (
                    <div key={idx} className="flex items-start gap-2.5 pl-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-2 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
                      <span
                        style={{ fontSize: `${baseSize}px`, lineHeight: 1.6 }}
                        className="text-slate-200 flex-1"
                      >
                        {renderFormattedInline(cleanContent)}
                      </span>
                    </div>
                  );
                }

                // 4. Markdown Headings (###, ##, #)
                if (trimmed.startsWith('#')) {
                  const headingText = trimmed.replace(/^#+\s*/, '');
                  const isSpoken = /spoken|say this/i.test(headingText);
                  return (
                    <h4
                      key={idx}
                      style={{ fontSize: `${headingSize}px` }}
                      className={`font-bold pt-1.5 pb-0.5 flex items-center gap-2 ${
                        isSpoken ? 'text-amber-300' : 'text-white'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-sm ${
                          isSpoken ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-emerald-400'
                        }`}
                      />
                      <span>{renderFormattedInline(headingText)}</span>
                    </h4>
                  );
                }

                // 5. Clean Paragraph (for direct concepts & short narratives)
                return (
                  <p
                    key={idx}
                    style={{ fontSize: `${baseSize}px`, lineHeight: 1.65 }}
                    className="text-slate-100 leading-relaxed tracking-normal"
                  >
                    {renderFormattedInline(trimmed)}
                  </p>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const formattedAnswer = useMemo(() => {
    return renderFormattedAnswer(answer);
  }, [answer, baseSize, headingSize, codeSize]);

  return (
    <div
      className={`bg-slate-950/90 border border-emerald-500/20 rounded-2xl shadow-none backdrop-blur-2xl p-4 flex flex-col justify-between text-white transition-all duration-200 ${
        isExpanded ? 'h-[640px]' : 'min-h-[480px] max-h-[620px]'
      }`}
    >
      {/* Top Mini Header / Controls */}
      <div
        onMouseDown={(e) => {
          if (e.button === 0 && e.target === e.currentTarget) {
            startDragging();
          }
        }}
        className="flex items-center justify-between pb-2 border-b border-white/10 mb-3 select-none"
      >
        {/* Left: Previous / Next Question Navigation matching reference image */}
        <div className="flex items-center gap-2">
          {/* Previous ⌘← */}
          <Tooltip
            content="Previous Question"
            shortcut="⌘←"
            position="top"
            disabled={!((currentQAIndex ?? -1) > 0)}
          >
            <button
              onClick={onPrevQA}
              disabled={!((currentQAIndex ?? -1) > 0)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all border ${
                (currentQAIndex ?? -1) > 0
                  ? 'text-slate-100 hover:text-white hover:bg-white/15 border-white/20 bg-white/5 cursor-pointer shadow-sm active:scale-95'
                  : 'text-slate-500 border-white/5 bg-transparent opacity-30 cursor-not-allowed'
              }`}
            >
              <span>⌘←</span>
            </button>
          </Tooltip>

          {/* Next ⌘→ with count badge */}
          <Tooltip
            content="Next Question"
            shortcut="⌘→"
            position="top"
            disabled={!((currentQAIndex ?? -1) < (qaHistory?.length || 0) - 1 && (qaHistory?.length || 0) > 0)}
          >
            <button
              onClick={onNextQA}
              disabled={!((currentQAIndex ?? -1) < (qaHistory?.length || 0) - 1 && (qaHistory?.length || 0) > 0)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all border ${
                (currentQAIndex ?? -1) < (qaHistory?.length || 0) - 1 && (qaHistory?.length || 0) > 0
                  ? 'text-slate-100 hover:text-white hover:bg-white/15 border-white/20 bg-white/5 cursor-pointer shadow-sm active:scale-95'
                  : 'text-slate-500 border-white/5 bg-transparent opacity-30 cursor-not-allowed'
              }`}
            >
              <span>⌘→</span>
              {(qaHistory?.length || 0) > 1 && (
                <span className="w-4 h-4 rounded-full bg-white/20 text-white font-bold text-[10px] flex items-center justify-center select-none shadow-sm">
                  {qaHistory.length}
                </span>
              )}
            </button>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Clear Button: Clear ⌘⌫ */}
          <Tooltip content="Clear Question & Answer" shortcut="⌘⌫" position="top">
            <button
              onClick={onClear}
              className="px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-300 hover:text-white hover:bg-white/10 flex items-center gap-1 transition-all cursor-pointer"
            >
              <span>Clear</span>
              <span className="text-[10px] font-mono text-slate-400 bg-white/10 px-1 py-0.5 rounded">
                ⌘⌫
              </span>
            </button>
          </Tooltip>

          {/* Drag Handle: Hold down to drag HUD */}
          <Tooltip content="Drag Panel" position="top">
            <div
              role="button"
              tabIndex={0}
              onMouseDown={(e) => {
                if (e.button === 0) {
                  e.preventDefault();
                  startDragging();
                }
              }}
              className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-move select-none active:scale-95 active:text-amber-400"
            >
              <Move className="w-3.5 h-3.5" />
            </div>
          </Tooltip>

          {/* Expand/Contract Toggle */}
          <Tooltip content={isExpanded ? 'Contract panel' : 'Expand panel'} position="top">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </Tooltip>

          {/* Copy Icon */}
          <Tooltip
            content={copied ? 'Copied to clipboard!' : 'Copy question & answer'}
            position="top"
            disabled={!answer && !question}
          >
            <button
              onClick={handleCopy}
              disabled={!answer && !question}
              className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer disabled:opacity-40"
            >
              {copied ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Main Body: Question + Answer */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pr-1 space-y-3.5 scrollbar-thin scrollbar-thumb-white/15 scrollbar-track-transparent"
      >
        {/* Question Header */}
        {question ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider flex items-center gap-1.5">
                <span className="text-base select-none leading-none">
                  {question.includes('Screen') ? '🖼️' : '💬'}
                </span>
                <span>
                  {question.includes('Screen')
                    ? 'Screen Question or Issue'
                    : 'Question'}
                </span>
              </span>
              {!answer && !isGenerating && (
                pauseStatus === 'pausing' ? (
                  <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>Pause detected · answering in 2s...</span>
                  </span>
                ) : pauseStatus === 'speaking' ? (
                  <span className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span>Listening to speech... (pause 2s to answer)</span>
                  </span>
                ) : pauseStatus === 'triggered' ? (
                  <span className="text-[10px] text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span>Generating answer...</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Listening live · pause 2s to answer</span>
                  </span>
                )
              )}
            </div>
            <p
              style={{ fontSize: `${questionSize}px` }}
              className="text-white font-bold leading-snug pl-1"
            >
              {question}
            </p>
          </div>
        ) : (
          <div className="text-slate-400 text-xs italic flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5 text-slate-500" />
            {pauseStatus === 'pausing' ? (
              <span className="text-amber-300 font-medium animate-pulse">
                Pause detected · generating answer in 2s...
              </span>
            ) : pauseStatus === 'speaking' ? (
              <span className="text-cyan-300">
                Listening to speech... (pause 2s to answer)
              </span>
            ) : (
              <span>Listening live for question from interviewer (pause 2s to answer)...</span>
            )}
          </div>
        )}

        {/* Answer Content */}
        {answer ? (
          <div className="pr-1">
            {formattedAnswer}
            {isGenerating && (
              <span className="inline-block w-2 h-4 bg-amber-400 animate-pulse ml-1 align-middle" />
            )}
          </div>
        ) : (
          <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-slate-500 space-y-2 select-none">
            <Sparkles className="w-6 h-6 text-amber-400/40" />
            <p className="text-xs max-w-xs">
              When an interviewer asks a question or you click Screenshot/Chat, a relevant answer will appear here.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Footer Row */}
      <div className="pt-3 mt-2 border-t border-white/10 flex items-center justify-between text-xs select-none">
        {/* Left: Timestamp / Source Badge */}
        <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
          {sourceType ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{sourceType}</span>
            </>
          ) : (
            <span className="text-slate-500 italic">Listening for speech...</span>
          )}
        </div>

        {/* Right: Feedback & Copy Controls */}
        <div className="flex items-center gap-2">
          {/* Thumbs Up */}
          <Tooltip content="Helpful answer" position="top">
            <button
              onClick={() => handleFeedback('up')}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                feedback === 'up'
                  ? 'text-emerald-400 bg-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
          </Tooltip>

          {/* Thumbs Down */}
          <Tooltip content="Not helpful" position="top">
            <button
              onClick={() => handleFeedback('down')}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                feedback === 'down'
                  ? 'text-rose-400 bg-rose-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
          </Tooltip>

          {/* Copy Button */}
          <Tooltip content={copied ? 'Copied to clipboard!' : 'Copy answer'} position="top">
            <button
              onClick={handleCopy}
              className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
            >
              {copied ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export const InterviewAnswerPanel = React.memo(InterviewAnswerPanelComponent);
