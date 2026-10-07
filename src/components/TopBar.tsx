import React, { useState } from 'react';
import {
  Ghost,
  Move,
  Minimize2,
  Maximize2,
  MoreVertical,
  X,
  LogOut,
  HelpCircle,
  Eye,
  EyeOff,
  Radio,
  Minus
} from 'lucide-react';
import { closeAppWindow, minimizeAppWindow, startDragging } from '../utils/windowManager';
import { ConnectionStatus } from '../hooks/useWebSocketStream';
import { Tooltip } from './common/Tooltip';
import { WEB_API_URL } from '../utils/config';

interface TopBarProps {
  status?: ConnectionStatus;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenScreenPosition?: () => void;
  onBuyCredits?: () => void;
  onLogout?: () => void;
  onToggleClickThrough?: () => void;
  isClickThrough?: boolean;
}

export function TopBar({
  status,
  isCollapsed,
  onToggleCollapse,
  onOpenScreenPosition,
  onBuyCredits,
  onLogout,
  onToggleClickThrough,
  isClickThrough,
}: TopBarProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const handleClose = async () => {
    await closeAppWindow();
  };

  const handleMinimize = async () => {
    await minimizeAppWindow();
  };

  return (
    <div
      data-tauri-drag-region
      onMouseDown={(e) => {
        if (e.button === 0 && e.target === e.currentTarget) {
          startDragging();
        }
      }}
      className="bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/90 px-3 py-2 flex items-center justify-between select-none cursor-move relative z-50 text-slate-200"
    >
      {/* Brand: Logo + Ghostove Stealth HUD */}
      <div className="flex items-center gap-2 pointer-events-none">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500/25 to-teal-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold shadow-sm shadow-emerald-500/20">
          <Ghost className="w-3.5 h-3.5" />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-xs text-white tracking-tight">
            Ghostove
          </span>
          <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            STEALTH
          </span>
        </div>
      </div>

      {/* Action and Window Controls */}
      <div className="flex items-center gap-1.5">
        {/* Click-Through Quick Indicator/Button */}
        {onToggleClickThrough && (
          <Tooltip content={isClickThrough ? 'Click-Through: Active (clicks pass through)' : 'Enable Click-Through'} position="bottom">
            <button
              onClick={onToggleClickThrough}
              className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 transition-colors border ${
                isClickThrough
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              {isClickThrough ? <EyeOff className="w-3 h-3 text-amber-400" /> : <Eye className="w-3 h-3" />}
              <span>HUD PASS</span>
            </button>
          </Tooltip>
        )}

        {/* Reposition Screen Button */}
        <Tooltip content="Reposition Screen (Cmd+Shift+S)" position="bottom">
          <button
            onClick={onOpenScreenPosition}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors border border-transparent hover:border-slate-700/60"
          >
            <Move className="w-3.5 h-3.5" />
          </button>
        </Tooltip>

        {/* Resize / Collapse Toggle */}
        <Tooltip content={isCollapsed ? 'Expand HUD' : 'Collapse to compact bar'} position="bottom">
          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors border border-transparent hover:border-slate-700/60"
          >
            {isCollapsed ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
        </Tooltip>

        {/* More Menu Dropdown */}
        <div className="relative">
          <Tooltip content="More Options" position="bottom">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors border border-transparent hover:border-slate-700/60"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </Tooltip>

          {showMoreMenu && (
            <div
              className="absolute right-0 top-full mt-1.5 w-48 bg-slate-900 border border-slate-800 rounded-2xl p-1.5 shadow-2xl z-50 text-xs text-slate-300 space-y-0.5 animate-fade-in"
              onClick={() => setShowMoreMenu(false)}
            >
              <button
                onClick={() => window.open(`${WEB_API_URL}/dashboard`, '_blank')}
                className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>Web Dashboard</span>
              </button>

              {onLogout && (
                <button
                  onClick={onLogout}
                  className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 text-rose-400 hover:bg-rose-500/10 transition-colors font-medium border-t border-slate-800 mt-1 pt-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Unpair / Sign Out</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Minimalist Close Action */}
        <Tooltip content="Close HUD" position="bottom">
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/30 cursor-pointer ml-1"
          >
            <X className="w-3.5 h-3.5 stroke-[2.2]" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
