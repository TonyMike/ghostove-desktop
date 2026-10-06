import { useState, useEffect } from 'react';
import { Eye, MousePointer, Camera, Sliders } from 'lucide-react';

interface ControlBarProps {
  opacity: number;
  onOpacityChange: (newOpacity: number) => void;
  isClickThrough: boolean;
  onToggleClickThrough: () => void;
  onCodeSnip: () => void;
  toggleButtonRef?: React.RefObject<HTMLButtonElement>;
}

export function ControlBar({
  opacity,
  onOpacityChange,
  isClickThrough,
  onToggleClickThrough,
  onCodeSnip,
  toggleButtonRef,
}: ControlBarProps) {
  const [showSlider, setShowSlider] = useState(false);

  // Register hotkeys Cmd+Shift+T / Ctrl+Shift+T and Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+T or Ctrl+Shift+T for click-through
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        onToggleClickThrough();
      }
      // Cmd+K or Ctrl+K for Code Snip
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onCodeSnip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleClickThrough, onCodeSnip]);

  return (
    <div className="bg-slate-950/90 border-t border-slate-800 p-2 flex items-center justify-between gap-2 rounded-b-2xl select-none">
      {/* Click-Through Toggle */}
      <button
        ref={toggleButtonRef}
        onClick={onToggleClickThrough}
        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
          isClickThrough
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
        }`}
        title="Toggle Click-Through (Cmd+Shift+T)"
      >
        <MousePointer className="w-3.5 h-3.5" />
        <span>{isClickThrough ? 'Click-Through ON' : 'Pass-Through'}</span>
      </button>

      {/* Code Snip Hotkey Button */}
      <button
        onClick={onCodeSnip}
        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-900 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition-all flex items-center gap-1.5"
        title="Snip Code Challenge (Cmd+K)"
      >
        <Camera className="w-3.5 h-3.5 text-purple-400" />
        <span>Snip Code (⌘K)</span>
      </button>

      {/* Opacity Control */}
      <div className="relative">
        <button
          onClick={() => setShowSlider(!showSlider)}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
          title="Adjust Opacity"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>

        {showSlider && (
          <div className="absolute bottom-9 right-0 bg-slate-900 border border-slate-800 p-3 rounded-xl shadow-2xl space-y-2 w-40 z-50">
            <div className="flex justify-between text-[10px] text-slate-400 font-medium">
              <span>Opacity</span>
              <span>{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
          </div>
        )}
      </div>
    </div>
  );
}
