import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipProps {
  content: string;
  shortcut?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  delayMs?: number;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function Tooltip({
  content,
  shortcut,
  position = 'bottom',
  align = 'center',
  delayMs = 120,
  children,
  className = '',
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const timerRef = useRef<any>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updateCoordinates = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    let top = 0;
    let left = 0;

    switch (position) {
      case 'top':
        top = rect.top - 8;
        left = align === 'start' ? rect.left : align === 'end' ? rect.right : rect.left + rect.width / 2;
        break;
      case 'bottom':
        top = rect.bottom + 8;
        left = align === 'start' ? rect.left : align === 'end' ? rect.right : rect.left + rect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - 8;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + 8;
        break;
      default:
        top = rect.bottom + 8;
        left = rect.left + rect.width / 2;
        break;
    }

    setCoords({ top, left });
  };

  const handleMouseEnter = () => {
    if (disabled || !content) return;
    timerRef.current = setTimeout(() => {
      updateCoordinates();
      setIsVisible(true);
    }, delayMs);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsVisible(false);
  };

  // Keep every tooltip within the WebView, including long messages near an edge.
  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!isVisible || !coords || !tooltip) return;

    const rect = tooltip.getBoundingClientRect();
    const margin = 8;
    const clampOffset = (start: number, size: number, viewportSize: number) => {
      const maxStart = Math.max(margin, viewportSize - margin - size);
      return Math.min(Math.max(start, margin), maxStart) - start;
    };
    const shiftX = clampOffset(rect.left, rect.width, window.innerWidth);
    const shiftY = clampOffset(rect.top, rect.height, window.innerHeight);

    if (Math.abs(shiftX) < 0.5 && Math.abs(shiftY) < 0.5) return;
    setCoords((current) => current
      ? { top: current.top + shiftY, left: current.left + shiftX }
      : current);
  }, [coords, content, isVisible]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const getTransform = () => {
    switch (position) {
      case 'top':
        return align === 'start' ? 'translate(0, -100%)' : align === 'end' ? 'translate(-100%, -100%)' : 'translate(-50%, -100%)';
      case 'bottom':
        return align === 'start' ? 'translate(0, 0)' : align === 'end' ? 'translate(-100%, 0)' : 'translate(-50%, 0)';
      case 'left':
        return 'translate(-100%, -50%)';
      case 'right':
        return 'translate(0, -50%)';
      default:
        return 'translate(-50%, 0)';
    }
  };

  return (
    <div
      ref={triggerRef}
      className={`relative inline-flex items-center justify-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {isVisible && !disabled && content && coords && typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            ref={tooltipRef}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform: getTransform(),
              zIndex: 2147483647,
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: 'calc(100vh - 16px)',
              overflowY: 'auto',
            }}
            className="pointer-events-none select-none flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0e1014]/85 text-slate-100 text-[11px] font-medium shadow-none backdrop-blur-md animate-fade-in"
          >
            <span>{content}</span>
            {shortcut && (
              <span className="font-mono text-[9.5px] font-bold text-slate-300 bg-white/10 px-1 py-0.2 rounded">
                {shortcut}
              </span>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
