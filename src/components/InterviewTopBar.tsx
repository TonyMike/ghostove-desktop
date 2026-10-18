import React, { useState, useRef, useEffect } from 'react';
import {
  Move,
  Maximize2,
  Minimize2,
  Camera,
  MessageSquare,
  Sparkles,
  Eye,
  EyeOff,
  Sliders,
  HelpCircle,
  LogOut,
  SlidersHorizontal,
  Volume2,
  Mic,
  MicOff,
  User,
  LayoutGrid,
  ArrowUpRight,
  Info,
  Plus,
  Minus,
  RotateCcw,
  Globe,
  Pencil,
} from 'lucide-react';
import { startDragging } from '../utils/windowManager';
import { openBrowserUrl } from '../utils/browser';
import { Tooltip } from './common/Tooltip';
import { WEB_API_URL } from '../utils/config';

interface InterviewTopBarProps {
  showAnswer: boolean;
  onToggleAnswer: () => void;
  showChat: boolean;
  onToggleChat: () => void;
  onScreenshot: () => void;
  onEndSession: () => void;
  isSpeaking?: boolean;
  isMicActive?: boolean;
  onToggleMic?: () => void;
  isSharedAudioActive?: boolean;
  sharedAudioError?: string | null;
  onToggleSharedAudio?: () => void;
  micError?: string | null;
  onEnableMic?: () => void;
  timerSeconds?: number;
  remainingSeconds?: number | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenScreenPosition?: () => void;
  onToggleClickThrough?: () => void;
  isClickThrough?: boolean;
  opacity: number;
  onOpacityChange: (val: number) => void;
  onLogout?: () => void;
  userEmail?: string;
  zoomLevel?: number;
  onZoomChange?: (z: number) => void;
  fontSizeLevel?: number;
  onFontSizeChange?: (f: number) => void;
  selectedLanguage?: string;
  autoAnswer?: boolean;
  onAutoAnswerChange?: (val: boolean) => void;
  onEdit?: () => void;
}

const InterviewSessionTimer = React.memo(function InterviewSessionTimer({
  initialSeconds = 0,
}: {
  initialSeconds?: number;
}) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  const formatted = `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;

  return (
    <Tooltip content="Elapsed Session Time" position="bottom">
      <div className="font-mono text-xs font-semibold text-slate-200 tracking-wider bg-white/5 border border-white/10 px-2 py-0.5 rounded-md select-none">
        {formatted}
      </div>
    </Tooltip>
  );
});

function formatRemainingTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function InterviewTopBarComponent({
  showAnswer,
  onToggleAnswer,
  showChat,
  onToggleChat,
  onScreenshot,
  onEndSession,
  isSpeaking = false,
  isMicActive = true,
  onToggleMic,
  isSharedAudioActive = false,
  sharedAudioError,
  onToggleSharedAudio,
  micError,
  onEnableMic,
  timerSeconds,
  remainingSeconds,
  isCollapsed,
  onToggleCollapse,
  onOpenScreenPosition,
  onToggleClickThrough,
  isClickThrough = false,
  opacity,
  onOpacityChange,
  onLogout,
  userEmail = 'tee.jhay1@gmail.com',
  zoomLevel = 100,
  onZoomChange,
  fontSizeLevel = 0,
  onFontSizeChange,
  selectedLanguage = 'English',
  autoAnswer = true,
  onAutoAnswerChange,
  onEdit,
}: InterviewTopBarProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isPrivate, setIsPrivate] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreMenu]);

  // Format seconds to MM:SS
  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  return (
    <div
      data-tauri-drag-region
      onMouseDown={(e) => {
        if (e.button === 0 && e.target === e.currentTarget) {
          startDragging();
        }
      }}
      className="bg-slate-950/90 border border-emerald-500/20 shadow-none rounded-full px-3 py-1.5 flex items-center justify-between gap-2.5 select-none backdrop-blur-2xl text-white max-w-full relative z-50"
    >
      {/* Left: Audio Controls (Shared Audio & Microphone) & Action buttons */}
      <div className="flex items-center gap-1.5">
        {/* 1. Shared Audio Button: Start/Stop listening to shared computer/meeting audio */}
        <Tooltip
          content={
            sharedAudioError
              ? `Computer audio issue: ${sharedAudioError}`
              : isSharedAudioActive
              ? 'Interviewer audio is active. Your microphone is controlled separately. Click to stop.'
              : 'Start computer audio capture so interviewer speech is transcribed, even with your microphone muted.'
          }
          position="bottom"
        >
          <button
            onClick={onToggleSharedAudio}
            aria-label={isSharedAudioActive ? 'Stop computer audio capture' : 'Start computer audio capture'}
            className={`relative p-1.5 rounded-full transition-all cursor-pointer flex items-center justify-center ${
              isSharedAudioActive
                ? 'bg-rose-500/20 text-white border border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {isSharedAudioActive && (
              <span className="absolute -top-0.5 -left-0.5 w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse" />
            )}
            <Volume2 className="w-4 h-4" />
          </button>
        </Tooltip>

        {/* 2. Microphone Button: Stop and continue (Mute/Unmute) Microphone */}
        <Tooltip
          content={
            micError
              ? `Microphone error: ${micError}`
              : isMicActive
              ? 'Microphone: Active (Click to mute)'
              : 'Microphone: Muted (Click to unmute)'
          }
          shortcut="⌘M"
          position="bottom"
        >
          <button
            onClick={micError ? onEnableMic : onToggleMic}
            className={`relative p-1.5 rounded-full transition-all cursor-pointer flex items-center justify-center ${
              micError
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : !isMicActive
                ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border border-rose-500/30'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            {isMicActive ? (
              <div className="relative flex items-center justify-center">
                <Mic
                  className={`w-4 h-4 transition-transform ${
                    isSpeaking ? 'text-emerald-400 scale-110' : 'text-slate-200'
                  }`}
                />
                {isSpeaking && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                )}
              </div>
            ) : (
              <MicOff className="w-4 h-4 text-rose-400" />
            )}
          </button>
        </Tooltip>

        {/* Separator */}
        <div className="h-4 w-px bg-white/10 mx-0.5" />

        {/* Answer Button */}
        <Tooltip content="Toggle Answer Panel" shortcut="⌘↵" position="bottom">
          <button
            onClick={onToggleAnswer}
            className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              showAnswer
                ? 'bg-white/20 text-white border border-white/25 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Answer</span>
            <span className="text-[10px] font-mono text-slate-300 bg-white/10 px-1 py-0.5 rounded ml-0.5">
              ⌘↵
            </span>
          </button>
        </Tooltip>

        {/* Screenshot Button */}
        <Tooltip content="Capture Screen / Snip" shortcut="⌘⇧S" position="bottom">
          <button
            onClick={onScreenshot}
            className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-purple-400" />
            <span>Screenshot</span>
            <span className="text-[10px] font-mono text-slate-300 bg-white/10 px-1 py-0.5 rounded ml-0.5">
              ⌘⇧S
            </span>
          </button>
        </Tooltip>

        {/* Chat Button */}
        <Tooltip content="Manual Chat / Question Input" shortcut="⌘K" position="bottom">
          <button
            onClick={onToggleChat}
            className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              showChat
                ? 'bg-white/20 text-white border border-white/25 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
            <span>Chat</span>
            <span className="text-[10px] font-mono text-slate-300 bg-white/10 px-1 py-0.5 rounded ml-0.5">
              ⌘K
            </span>
          </button>
        </Tooltip>
      </div>

      {/* Right: Drag handle, Collapse, Timer, More, End button */}
      <div className="flex items-center gap-2">
        {/* Move / Drag Icon: Hold down to drag HUD anywhere */}
        <Tooltip content="Drag HUD" position="bottom">
          <div
            role="button"
            tabIndex={0}
            onMouseDown={(e) => {
              if (e.button === 0) {
                e.preventDefault();
                startDragging();
              }
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-move select-none active:scale-95 active:text-amber-400"
          >
            <Move className="w-3.5 h-3.5" />
          </div>
        </Tooltip>

        {/* Collapse / Expand Toggle */}
        <Tooltip content={isCollapsed ? 'Expand panels' : 'Minimize panels'} position="bottom">
          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            {isCollapsed ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
        </Tooltip>

        {/* Dynamic Interview Elapsed Timer */}
        <InterviewSessionTimer initialSeconds={timerSeconds ?? 0} />

        {remainingSeconds !== null && remainingSeconds !== undefined && remainingSeconds <= 60 && (
          <Tooltip content="Available interview time" position="bottom">
            <div
              aria-label={`${Math.floor(remainingSeconds / 60)} minutes and ${remainingSeconds % 60} seconds remaining`}
              className="flex items-center gap-1.5 rounded-md border border-rose-400/30 bg-rose-500/15 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-rose-200 select-none"
            >
              <span className="font-sans text-[10px] font-medium opacity-80">Left</span>
              <span>{formatRemainingTime(remainingSeconds)}</span>
            </div>
          </Tooltip>
        )}

        {/* Options / Settings Trigger Button & Popover (Matching Reference Image) */}
        <div className="relative z-50" ref={menuRef}>
          <Tooltip content="Options & Settings" position="bottom">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer select-none flex items-center justify-center ${
                showMoreMenu
                  ? 'bg-white/20 border-white/30 text-white shadow-sm'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/15'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </Tooltip>

          {showMoreMenu && (
            <div
              data-tauri-drag-region="false"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-full mt-2 w-64 bg-slate-950/95 border border-emerald-500/20 rounded-2xl p-2.5 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.98),0_0_25px_rgba(16,185,129,0.08)] backdrop-blur-2xl z-[9999] text-xs text-white max-h-[85vh] overflow-y-auto animate-fade-in space-y-1 select-none pointer-events-auto"
            >
              {/* 1. User Header */}
              <div className="flex items-center gap-2 px-2.5 py-2 text-slate-200 text-xs font-medium border-b border-white/10 mb-1 bg-white/[0.04] rounded-t-xl select-text">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <User className="w-3 h-3 text-emerald-400" />
                </div>
                <span className="truncate font-mono text-[11px] text-slate-200 font-semibold" title={userEmail || 'tee.jhay1@gmail.com'}>
                  {userEmail || 'tee.jhay1@gmail.com'}
                </span>
              </div>

              {/* 2. Dashboard Link */}
              <button
                onClick={() => {
                  setShowMoreMenu(false);
                  openBrowserUrl(`${WEB_API_URL}/dashboard`);
                }}
                className="w-full text-left px-2.5 py-2 rounded-xl flex items-center justify-between hover:bg-white/10 transition-colors cursor-pointer text-slate-200 hover:text-white font-medium"
              >
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-3.5 h-3.5 text-slate-300" />
                  <span>Dashboard</span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* 3. Private Toggle */}
              <div className="flex items-center justify-between px-2.5 py-1.5 text-slate-200">
                <div className="flex items-center gap-1.5">
                  <span>Private</span>
                  <div className="relative group cursor-pointer" title="Stealth mode hides HUD from screen shares">
                    <Info className="w-3 h-3 text-slate-400" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsPrivate((prev) => !prev);
                    if (onToggleClickThrough) onToggleClickThrough();
                  }}
                  className={`w-9 h-5 rounded-full p-0.5 cursor-pointer transition-colors duration-200 flex items-center ${
                    isPrivate ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-white/15'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      isPrivate ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 4. Zoom Controls */}
              <div className="flex items-center justify-between px-2.5 py-1.5 text-slate-200">
                <span>Zoom</span>
                <div className="flex items-center gap-1.5">
                  <Tooltip content="Zoom In (+5%)" position="top">
                    <button
                      onClick={() => onZoomChange && onZoomChange(Math.min(130, (zoomLevel || 100) + 5))}
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Zoom Out (-5%)" position="top">
                    <button
                      onClick={() => onZoomChange && onZoomChange(Math.max(75, (zoomLevel || 100) - 5))}
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Reset Zoom (100%)" position="top">
                    <button
                      onClick={() => onZoomChange && onZoomChange(100)}
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* 5. Opacity Controls */}
              <div className="flex items-center justify-between px-2.5 py-1.5 text-slate-200">
                <span>Opacity</span>
                <div className="flex items-center gap-1.5">
                  <Tooltip content="Increase Opacity (+5%)" position="top">
                    <button
                      onClick={() => onOpacityChange(Math.min(1.0, Number((opacity + 0.05).toFixed(2))))}
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Decrease Opacity (-5%)" position="top">
                    <button
                      onClick={() => onOpacityChange(Math.max(0.3, Number((opacity - 0.05).toFixed(2))))}
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Reset Opacity (95%)" position="top">
                    <button
                      onClick={() => onOpacityChange(0.95)}
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* 6. Font Size Controls */}
              <div className="flex items-center justify-between px-2.5 py-1.5 text-slate-200">
                <div className="flex items-center gap-1.5">
                  <span>Font size</span>
                  <span className="text-[10px] font-mono text-slate-300 bg-white/10 border border-white/10 px-1.5 py-0.2 rounded select-none">
                    {fontSizeLevel === 0 ? 'Normal' : fontSizeLevel > 0 ? `+${fontSizeLevel}` : `${fontSizeLevel}`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Tooltip content="Increase Font Size" position="top">
                    <button
                      onClick={() => onFontSizeChange && onFontSizeChange(Math.min(4, (fontSizeLevel || 0) + 1))}
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Decrease Font Size" position="top">
                    <button
                      onClick={() => onFontSizeChange && onFontSizeChange(Math.max(-2, (fontSizeLevel || 0) - 1))}
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Reset Font Size" position="top">
                    <button
                      onClick={() => onFontSizeChange && onFontSizeChange(0)}
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* Session language is fixed by the choice made during setup. */}
              <div className="w-full px-2.5 py-2 rounded-xl flex items-center gap-2 text-slate-200 select-none">
                <Globe className="w-3.5 h-3.5 text-slate-300" />
                <span>{selectedLanguage || 'English'}</span>
              </div>

              {/* 8. Auto Answer Toggle */}
              <div className="flex items-center justify-between px-2.5 py-1.5 text-slate-200">
                <span>Auto Answer</span>
                <button
                  type="button"
                  onClick={() => onAutoAnswerChange && onAutoAnswerChange(!autoAnswer)}
                  className={`w-9 h-5 rounded-full p-0.5 cursor-pointer transition-colors duration-200 flex items-center ${
                    autoAnswer ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-white/15'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      autoAnswer ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 9. Edit Action */}
              <button
                onClick={() => {
                  setShowMoreMenu(false);
                  if (onEdit) onEdit();
                }}
                className="w-full text-left px-2.5 py-2 rounded-xl flex items-center justify-between hover:bg-white/10 transition-colors cursor-pointer text-slate-200 hover:text-white"
              >
                <div className="flex items-center gap-2">
                  <Pencil className="w-3.5 h-3.5 text-slate-300" />
                  <span>Edit</span>
                </div>
                <Info className="w-3 h-3 text-slate-400" />
              </button>

              {/* Optional Screen Reposition button if handler provided */}
              {onOpenScreenPosition && (
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    onOpenScreenPosition();
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl flex items-center gap-2 text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-[11px] border-t border-white/5 pt-1.5"
                >
                  <SlidersHorizontal className="w-3 h-3 text-slate-400" />
                  <span>Reposition Screen</span>
                </button>
              )}

              {/* Optional Sign Out if handler provided */}
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl flex items-center gap-2 text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer text-[11px] border-t border-white/5 pt-1.5 font-medium"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* End Button: Sleek Tactical Exit */}
        <Tooltip content="End Interview Session" position="bottom">
          <button
            onClick={onEndSession}
            className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-semibold px-3 py-1 rounded-full shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            End
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

export const InterviewTopBar = React.memo(InterviewTopBarComponent);

