import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  ArrowUpDown,
  Briefcase,
  FileText,
  MoreVertical,
  Play,
  Trash2,
  ExternalLink,
  Plus,
  Loader2,
  Sparkles,
  RotateCw
} from 'lucide-react';
import { openBrowserUrl } from '../utils/browser';
import { CreateSessionModal } from './CreateSessionModal';

export interface SessionItem {
  id: string;
  title: string;
  company_name?: string;
  job_description?: string;
  role?: string;
  status?: string;
  mode: string;
  duration_seconds: number;
  save_transcript?: boolean;
  transcript?: string;
  created_at: string;
}

interface SessionSelectScreenProps {
  token?: string | null;
  refreshTrigger?: number;
  onStartSession: (sessionId: string, session?: SessionItem) => void;
  onBuyCredits?: () => void;
}

export function SessionSelectScreen({
  token,
  refreshTrigger,
  onStartSession,
}: SessionSelectScreenProps) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef(0);
  const mouseStartY = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setIsRefreshing(true);
      }
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      let rawSessions: any[] = [];
      try {
        const res = await fetch('http://localhost:8000/api/sessions?uncompleted_only=true', { headers });
        if (res.ok) {
          const data = await res.json();
          rawSessions = data.sessions || [];
        }
      } catch {
        // Fallback to web Next.js API
      }

      if (rawSessions.length === 0) {
        try {
          const resWeb = await fetch('http://localhost:3000/api/sessions', { headers });
          if (resWeb.ok) {
            const dataWeb = await resWeb.json();
            rawSessions = dataWeb.sessions || [];
          }
        } catch {}
      }

      // Filter out completed sessions - completed sessions cannot be retaken in desktop HUD
      const isCompleted = (s: any) =>
        s.status === 'completed' ||
        (typeof s.duration_seconds === 'number' && s.duration_seconds > 0) ||
        (typeof s.transcript === 'string' && s.transcript.trim().length > 0) ||
        (typeof s.transcript_snippet === 'string' && s.transcript_snippet.trim().length > 0);

      const apiSessions: SessionItem[] = rawSessions
        .filter((s: any) => !isCompleted(s))
        .map((s: any) => ({
          id: s.id,
          title: s.title || s.company_name || 'Interview Session',
          company_name: s.company_name || s.title || 'Company',
          job_description: s.job_description || s.transcript_snippet || '',
          role: s.role || '',
          status: s.status || 'not_started',
          mode: s.mode || 'Interview',
          duration_seconds: s.duration_seconds || 0,
          save_transcript: s.save_transcript !== false,
          created_at: s.created_at || new Date().toISOString(),
        }));

      setSessions(apiSessions);
    } catch {
      if (!silent) setSessions([]);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [token]);

  // Initial load
  useEffect(() => {
    loadSessions(false);
  }, [token, loadSessions]);

  // Trigger from parent when deep links arrive or when navigating back
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      loadSessions(true);
    }
  }, [refreshTrigger, loadSessions]);

  // Smart Sync: Window focus, Visibility change, Tauri native window focus, and Heartbeat
  useEffect(() => {
    let isMounted = true;
    let lastFocusFetch = 0;

    const handleFocusSync = () => {
      const now = Date.now();
      // Debounce focus sync to at most once every 2.5 seconds
      if (now - lastFocusFetch > 2500) {
        lastFocusFetch = now;
        loadSessions(true);
      }
    };

    window.addEventListener('focus', handleFocusSync);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleFocusSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Tauri window focus listener
    let unlistenTauriFocus: (() => void) | undefined;
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => {
        getCurrentWindow()
          .onFocusChanged(({ payload: focused }) => {
            if (focused && isMounted) {
              handleFocusSync();
            }
          })
          .then((unlisten) => {
            if (isMounted) unlistenTauriFocus = unlisten;
            else unlisten();
          })
          .catch(() => {});
      })
      .catch(() => {});

    // Keyboard shortcut: Cmd+R / Ctrl+R / F5
    const handleKeyDown = (e: KeyboardEvent) => {
      if (((e.metaKey || e.ctrlKey) && (e.key === 'r' || e.key === 'R')) || e.key === 'F5') {
        e.preventDefault();
        loadSessions(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Background polling heartbeat (every 10 seconds while tab/window is visible)
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && isMounted) {
        loadSessions(true);
      }
    }, 10000);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown);
      if (unlistenTauriFocus) unlistenTauriFocus();
      clearInterval(pollInterval);
    };
  }, [loadSessions]);

  // Pull-to-refresh event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (scrollContainerRef.current && scrollContainerRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0 && scrollContainerRef.current?.scrollTop === 0) {
      setPullDistance(Math.min(diff * 0.45, 65));
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isPulling) return;
    setIsPulling(false);
    if (pullDistance >= 40 && !isRefreshing) {
      loadSessions(false);
    }
    setPullDistance(0);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scrollContainerRef.current && scrollContainerRef.current.scrollTop === 0) {
      mouseStartY.current = e.clientY;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (mouseStartY.current === null || isRefreshing) return;
    const diff = e.clientY - mouseStartY.current;
    if (diff > 8 && scrollContainerRef.current?.scrollTop === 0) {
      setPullDistance(Math.min((diff - 8) * 0.45, 65));
    } else {
      setPullDistance(0);
    }
  };

  const handleMouseUp = () => {
    if (mouseStartY.current !== null) {
      if (pullDistance >= 40 && !isRefreshing) {
        loadSessions(false);
      }
      mouseStartY.current = null;
      setPullDistance(0);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      // Delete on backend
      await fetch(`http://localhost:8000/api/sessions/${sessionId}`, { method: 'DELETE', headers }).catch(() => {});
      // Also sync delete on web if reachable
      await fetch(`http://localhost:3000/api/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => {});
    } catch {
      // ignore
    }
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    setActiveMenuSessionId(null);
  };

  const handleOpenDashboard = () => openBrowserUrl('http://localhost:3000/dashboard/sessions');
  const handleCreateSession = () => setIsCreateModalOpen(true);

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
    } catch {
      return '2 OCT 2026';
    }
  };

  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchCompany = (s.company_name || '').toLowerCase().includes(q);
    const matchTitle = (s.title || '').toLowerCase().includes(q);
    const matchDesc = (s.job_description || '').toLowerCase().includes(q);
    return matchCompany || matchTitle || matchDesc;
  });

  const sortedSessions = [...filteredSessions].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
  });

  return (
    <div className="p-3.5 flex flex-col h-[calc(100%-44px)] overflow-hidden space-y-3 select-none bg-slate-950 text-slate-100">
      {/* 1. Search Bar & Action Controls Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search company or role..."
            className="w-full bg-slate-900/90 border border-slate-800/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 transition-colors shadow-sm"
          />
        </div>

        {/* Manual Refresh Button */}
        <button
          onClick={() => loadSessions(false)}
          disabled={isRefreshing}
          className="p-1.5 bg-slate-900/90 border border-slate-800/80 hover:border-slate-700/80 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0 disabled:opacity-60"
          title="Check for updates (⌘R)"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
        </button>

        {/* Sort Button */}
        <button
          onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
          className="p-1.5 bg-slate-900/90 border border-slate-800/80 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
          title={`Sort ${sortOrder === 'desc' ? 'oldest first' : 'newest first'}`}
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Sessions List with Pull-to-Refresh */}
      <div
        ref={scrollContainerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="flex-1 overflow-y-auto space-y-2.5 pr-0.5 relative"
      >
        {/* Pull-down indicator */}
        {(pullDistance > 0 || (isRefreshing && !loading)) && (
          <div
            style={{ height: isRefreshing ? '34px' : `${pullDistance}px` }}
            className="overflow-hidden transition-all duration-150 flex items-center justify-center shrink-0"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full shadow-sm">
              <RotateCw
                className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`}
                style={!isRefreshing ? { transform: `rotate(${pullDistance * 6}deg)` } : undefined}
              />
              <span>
                {isRefreshing
                  ? 'Checking for updates...'
                  : pullDistance >= 40
                  ? 'Release to refresh'
                  : 'Pull down to refresh'}
              </span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            <span>Loading dossiers...</span>
          </div>
        ) : sortedSessions.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs space-y-2 border border-dashed border-slate-800 rounded-2xl p-6 bg-slate-900/20">
            <p className="text-slate-300 font-medium">No pending interview dossiers found.</p>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
              Completed sessions can be reviewed with transcripts and AI notes on your Web Dashboard.
            </p>
          </div>
        ) : (
          sortedSessions.map((sess) => (
            <div
              key={sess.id}
              onClick={() => onStartSession(sess.id, sess)}
              className="bg-slate-900/80 border border-slate-800/80 hover:border-emerald-500/40 rounded-2xl p-3.5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3 relative cursor-pointer group"
            >
              {/* Header: Date + 3-Dot Options */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                  {formatDate(sess.created_at)}
                </span>

                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() =>
                      setActiveMenuSessionId(activeMenuSessionId === sess.id ? null : sess.id)
                    }
                    className="p-1 text-slate-500 hover:text-white transition-colors rounded cursor-pointer"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {/* 3-Dot Dropdown Menu */}
                  {activeMenuSessionId === sess.id && (
                    <div className="absolute right-0 mt-1 w-36 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1 z-50 text-xs">
                      <button
                        onClick={() => {
                          setActiveMenuSessionId(null);
                          onStartSession(sess.id, sess);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200 flex items-center gap-2 cursor-pointer font-medium"
                      >
                        <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                        <span>Launch HUD</span>
                      </button>
                      <button
                        onClick={() => handleDeleteSession(sess.id)}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-rose-400 flex items-center gap-2 cursor-pointer font-medium border-t border-slate-800 mt-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Company Info */}
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-slate-800 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 shadow-sm shadow-emerald-500/10">
                    {sess.company_name ? sess.company_name.substring(0, 2).toUpperCase() : 'CO'}
                  </div>
                  <div className="overflow-hidden min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-bold text-white truncate leading-tight group-hover:text-emerald-400 transition-colors">
                        {sess.company_name || sess.title}
                      </h3>
                      {sess.role && (
                        <span className="text-[10px] bg-slate-800/90 border border-slate-700/60 text-emerald-400 px-1.5 py-0.5 rounded-md font-medium truncate shrink-0 max-w-[130px]">
                          {sess.role}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {sess.job_description || 'Interview preparation dossier'}
                    </p>
                  </div>
                </div>

                {/* Tags Row */}
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      (sess.mode || '').toLowerCase().includes('mock')
                        ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {(sess.mode || '').toLowerCase().includes('mock') ? 'Mock Practice' : 'Live Co-pilot'}
                  </span>

                  {sess.save_transcript && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-400 text-[10px] font-medium flex items-center gap-1">
                      <FileText className="w-2.5 h-2.5 text-slate-400" />
                      <span>Encrypted Log</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Card Footer: Ready Status & Start Button */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <div className="text-[10px] text-slate-500 font-mono">
                  {sess.duration_seconds > 0
                    ? `${Math.floor(sess.duration_seconds / 60)}m used`
                    : 'Ready to launch'}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartSession(sess.id, sess);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-3 py-1 rounded-xl transition-all shadow-sm shadow-emerald-500/20 cursor-pointer flex items-center gap-1 group-hover:scale-105"
                >
                  <Play className="w-2.5 h-2.5 fill-slate-950" />
                  <span>Launch HUD</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 3. Bottom Footer Navigation Action Bar */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2.5">
        <button
          onClick={handleOpenDashboard}
          className="flex-1 bg-slate-900/90 border border-slate-800/80 hover:bg-slate-800 text-slate-300 font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <span>Web Dashboard</span>
          <ExternalLink className="w-3 h-3 text-slate-400" />
        </button>

        <button
          onClick={handleCreateSession}
          className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-500/20"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Session</span>
        </button>
      </div>

      <CreateSessionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        token={token}
        onSessionCreated={(newId, newSession) => {
          loadSessions();
          if (newId) {
            onStartSession(newId, newSession);
          }
        }}
      />
    </div>
  );
}
