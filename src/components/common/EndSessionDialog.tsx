import React, { useEffect, useRef } from 'react';
import { Clock3, X } from 'lucide-react';

interface EndSessionDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function EndSessionDialog({ isOpen, onCancel, onConfirm }: EndSessionDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      data-hud-hit-region
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="end-session-title"
        aria-describedby="end-session-description"
        className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#111512] p-5 text-white shadow-[0_28px_90px_rgba(0,0,0,0.65)] sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10 text-rose-300">
              <Clock3 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 id="end-session-title" className="text-lg font-semibold tracking-tight sm:text-xl">
                End this session?
              </h2>
              <p id="end-session-description" className="text-sm leading-6 text-white/65">
                Your timer will stop and you’ll return to your session list. This session will not continue in the background.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close confirmation"
            className="rounded-full p-2 text-white/55 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-500 active:scale-[0.99]"
          >
            End session
          </button>
        </div>
      </section>
    </div>
  );
}
