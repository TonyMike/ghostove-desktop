import { useState, useEffect } from 'react';
import {
  Monitor,
  Move,
  ArrowRight,
  Check,
  X,
  LayoutGrid,
  Sparkles,
  MousePointer,
  Compass
} from 'lucide-react';
import {
  getAvailableMonitors,
  cycleScreen,
  moveToMonitor,
  moveToCursorScreen,
  setScreenPosition,
  setAutoFollowScreen,
  getAutoFollowScreen,
  MonitorInfo,
  ScreenPosition,
} from '../utils/windowManager';

interface ScreenPositionPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScreenPositionPopover({ isOpen, onClose }: ScreenPositionPopoverProps) {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [activePosition, setActivePosition] = useState<ScreenPosition>('center');
  const [autoFollow, setAutoFollow] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      getAvailableMonitors().then(setMonitors);
      getAutoFollowScreen().then(setAutoFollow);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCycle = async () => {
    const msg = await cycleScreen();
    setFeedback(msg);
    const updated = await getAvailableMonitors();
    setMonitors(updated);
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleSelectMonitor = async (idx: number) => {
    await moveToMonitor(idx, activePosition);
    setFeedback(`Moved to Screen ${idx + 1}`);
    const updated = await getAvailableMonitors();
    setMonitors(updated);
    setTimeout(() => setFeedback(null), 2000);
  };

  const handleMoveToCursor = async () => {
    const msg = await moveToCursorScreen();
    setFeedback(msg);
    const updated = await getAvailableMonitors();
    setMonitors(updated);
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleToggleAutoFollow = async () => {
    const next = !autoFollow;
    setAutoFollow(next);
    await setAutoFollowScreen(next);
    setFeedback(next ? 'Auto-follow display enabled' : 'Auto-follow display disabled');
    setTimeout(() => setFeedback(null), 2000);
  };

  const handleSelectPosition = async (pos: ScreenPosition) => {
    setActivePosition(pos);
    await setScreenPosition(pos);
    setFeedback(`Positioned at ${pos.replace('-', ' ')}`);
    setTimeout(() => setFeedback(null), 1800);
  };

  return (
    <div data-hud-hit-region className="absolute inset-0 bg-[#f8f9fa] dark:bg-slate-900 z-50 flex flex-col p-5 select-none animate-fade-in overflow-y-auto rounded-none text-slate-800 dark:text-slate-100 space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Move className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-tight">Screen & Position</h3>
            <p className="text-[10px] text-slate-500">Choose display and auto-follow mode</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Feedback Alert Toast */}
      {feedback && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 animate-fade-in font-medium">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Auto-Follow Screen Switch */}
      <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-white">Auto-Follow Display</div>
            <div className="text-[10px] text-slate-500">Automatically switch when cursor changes screen</div>
          </div>
        </div>

        <button
          onClick={handleToggleAutoFollow}
          className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
            autoFollow ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <div
            className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${
              autoFollow ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Instant Jump to Cursor Screen Button */}
      <button
        onClick={handleMoveToCursor}
        className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center justify-between transition-colors shadow-sm"
      >
        <span className="flex items-center gap-2">
          <MousePointer className="w-3.5 h-3.5 text-emerald-400" />
          <span>Bring to Cursor Screen</span>
        </span>
        <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-slate-300">
          ⌘+Shift+S
        </span>
      </button>

      {/* Screen / Monitor Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Monitor className="w-3.5 h-3.5" />
            <span>Target Screen</span>
          </span>

          {monitors.length > 1 && (
            <button
              onClick={handleCycle}
              className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              <span>Cycle Screen</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {monitors.map((m, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectMonitor(idx)}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between border transition-all ${
                m.is_current
                  ? 'bg-slate-900 text-white dark:bg-emerald-500/10 dark:text-emerald-300 border-slate-900 dark:border-emerald-500/40 font-bold shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Monitor className={`w-4 h-4 ${m.is_current ? 'text-emerald-400' : 'text-slate-400'}`} />
                <div>
                  <div className="font-semibold">{m.name || `Screen ${idx + 1}`}</div>
                  <div className="text-[10px] opacity-70">
                    {m.width} × {m.height}
                  </div>
                </div>
              </div>

              {m.is_current && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Active
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Screen Position Snapping Grid */}
      <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800">
        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <LayoutGrid className="w-3.5 h-3.5" />
          <span>Position on Screen</span>
        </span>

        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'top-left', label: 'Top Left' },
            { id: 'top-center', label: 'Top Center' },
            { id: 'top-right', label: 'Top Right' },
            { id: 'bottom-left', label: 'Bottom Left' },
            { id: 'center', label: 'Center' },
            { id: 'bottom-right', label: 'Bottom Right' },
          ].map((p) => {
            const isSelected = activePosition === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handleSelectPosition(p.id as ScreenPosition)}
                className={`py-2 px-2 text-[11px] rounded-xl font-semibold border transition-all text-center ${
                  isSelected
                    ? 'bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 border-slate-900 dark:border-emerald-400 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Free Dragging Note */}
      <div className="pt-2 text-[10px] text-slate-400 text-center leading-relaxed">
        Tip: Works across all Spaces & Full-Screen apps. You can also drag the window by its top bar.
      </div>
    </div>
  );
}
