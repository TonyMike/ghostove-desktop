import { useState, useRef, useCallback, useEffect } from 'react';
import { TopBar } from './TopBar';
import { TranscriptBox } from './TranscriptBox';
import { AISuggestionsPanel } from './AISuggestionsPanel';
import { ControlBar } from './ControlBar';

import { useWebSocketStream } from '../hooks/useWebSocketStream';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { setSelectiveClickThrough, ClickableRect } from '../utils/windowManager';
import { ArrowLeft, Mic, MousePointer } from 'lucide-react';

interface HUDOverlayProps {
  token: string;
  onLogout?: () => void;
  onBackToMenu?: () => void;
  onOpenScreenPosition?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onBuyCredits?: () => void;
}

export function HUDOverlay({
  token,
  onLogout,
  onBackToMenu,
  onOpenScreenPosition,
  isCollapsed = false,
  onToggleCollapse,
  onBuyCredits,
}: HUDOverlayProps) {
  const [opacity, setOpacity] = useState(0.95);
  const [isClickThrough, setIsClickThrough] = useState(false);
  const [snipNotification, setSnipNotification] = useState<string | null>(null);

  const floatingToggleRef = useRef<HTMLButtonElement>(null);
  const controlToggleRef = useRef<HTMLButtonElement>(null);

  const {
    status,
    transcript,
    streamingToken,
    fullAnswer,
    quotaExhausted,
    sendAudio,
    sendJSON,
  } = useWebSocketStream({ token });

  const { isCapturing } = useAudioCapture({
    onAudioData: sendAudio,
    isStreaming: status === 'connected' || status === 'transcribing' || status === 'generating',
  });

  const updateClickThroughRegions = useCallback(async (active: boolean) => {
    if (!active) {
      await setSelectiveClickThrough(false, []);
      return;
    }

    // Small delay to allow elements to be positioned in DOM
    setTimeout(async () => {
      const rects: ClickableRect[] = [];
      const padding = 16; // 16px safe hit margin around the toggle button

      if (floatingToggleRef.current) {
        const r = floatingToggleRef.current.getBoundingClientRect();
        rects.push({
          x: Math.max(0, r.left - padding),
          y: Math.max(0, r.top - padding),
          width: r.width + padding * 2,
          height: r.height + padding * 2,
        });
      }

      if (controlToggleRef.current) {
        const r = controlToggleRef.current.getBoundingClientRect();
        rects.push({
          x: Math.max(0, r.left - padding),
          y: Math.max(0, r.top - padding),
          width: r.width + padding * 2,
          height: r.height + padding * 2,
        });
      }

      await setSelectiveClickThrough(true, rects);
    }, 60);
  }, []);

  const handleToggleClickThrough = async () => {
    const nextState = !isClickThrough;
    setIsClickThrough(nextState);
    await updateClickThroughRegions(nextState);
  };

  // Reset click-through on unmount
  useEffect(() => {
    return () => {
      setSelectiveClickThrough(false, []);
    };
  }, []);

  const handleCodeSnip = () => {
    setSnipNotification('Code Snip rectangle mode activated (⌘K)');
    setTimeout(() => setSnipNotification(null), 3000);

    // Send simulate_transcript event to test LLM generation for coding prompt
    sendJSON({
      type: 'simulate_transcript',
      text: 'How would you optimize an LRU Cache implementation in Rust or C++ for low latency?',
    });
  };

  return (
    <div
      style={{ opacity }}
      className={`relative w-full ${
        isCollapsed ? 'h-auto' : 'h-full'
      } bg-[#f8f9fa] dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col backdrop-blur-md overflow-hidden transition-all duration-200`}
    >
      {/* Click-Through floating toggle button: stays clickable while rest of window passes clicks through */}
      {isClickThrough && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50">
          <button
            ref={floatingToggleRef}
            onClick={handleToggleClickThrough}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 border-2 border-amber-200 cursor-pointer pointer-events-auto transition-transform hover:scale-105 animate-pulse"
            title="Click to turn off click-through"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Click-Through ON — Click to Disable</span>
          </button>
        </div>
      )}

      {/* Top Bar matching reference */}
      <TopBar
        status={status}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        onOpenScreenPosition={onOpenScreenPosition}
        onBuyCredits={onBuyCredits}
        onLogout={onLogout}
        onToggleClickThrough={handleToggleClickThrough}
        isClickThrough={isClickThrough}
      />

      {/* Main HUD Body (hidden if collapsed) */}
      {!isCollapsed && (
        <>
          {/* Subheader bar with session controls */}
          <div className="px-4 py-2 bg-slate-100/70 dark:bg-slate-900/60 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs select-none">
            <div className="flex items-center gap-2">
              {onBackToMenu && (
                <button
                  onClick={onBackToMenu}
                  className="flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-2 py-1 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Real Session</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <Mic className="w-3 h-3 animate-pulse" />
                <span>Live Audio</span>
              </span>
            </div>
          </div>

          <div className="p-3.5 flex-1 flex flex-col space-y-3 overflow-hidden">
            {/* Code Snip Notification Toast */}

            {snipNotification && (
              <div className="bg-purple-950/80 border border-purple-500/30 text-purple-200 text-xs px-3 py-2 rounded-lg text-center animate-fade-in">
                {snipNotification}
              </div>
            )}

            {/* Live Rolling Transcript */}
            <TranscriptBox transcript={transcript} />

            {/* Claude/Gemini STAR Method Answer Panel */}
            <AISuggestionsPanel
              fullAnswer={fullAnswer}
              streamingToken={streamingToken}
              isGenerating={status === 'generating'}
            />
          </div>

          {/* Footer Controls */}
          <ControlBar
            opacity={opacity}
            onOpacityChange={setOpacity}
            isClickThrough={isClickThrough}
            onToggleClickThrough={handleToggleClickThrough}
            onCodeSnip={handleCodeSnip}
            toggleButtonRef={controlToggleRef}
          />
        </>
      )}
    </div>
  );
}
