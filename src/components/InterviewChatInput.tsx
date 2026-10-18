import React, { useState, useRef, useEffect } from 'react';
import { Send, X, CornerDownLeft } from 'lucide-react';
import { Tooltip } from './common/Tooltip';

interface InterviewChatInputProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (questionText: string) => void;
}

export function InterviewChatInput({ isOpen, onClose, onSubmit }: InterviewChatInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSubmit(text);
    setText('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div data-hud-hit-region className="bg-[#1a1b20]/95 border border-white/15 rounded-2xl p-2.5 shadow-none backdrop-blur-xl animate-fade-in text-white mb-2">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type interview question or paste code prompt..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-400/80 transition-colors"
        />

        <Tooltip content="Submit question" shortcut="Enter" position="top">
          <button
            type="submit"
            disabled={!text.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Ask</span>
            <CornerDownLeft className="w-3 h-3 opacity-60" />
          </button>
        </Tooltip>

        <Tooltip content="Close chat input" shortcut="Esc" position="top">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </Tooltip>
      </form>
    </div>
  );
}
