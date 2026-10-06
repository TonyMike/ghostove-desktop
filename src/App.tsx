import { useState, useEffect, useCallback } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { TopBar } from './components/TopBar';
import { SessionSelectScreen, SessionItem } from './components/SessionSelectScreen';
import { ConnectSessionScreen } from './components/ConnectSessionScreen';
import { HUDOverlay } from './components/HUDOverlay';
import { InterviewHUD } from './components/InterviewHUD';
import { MockInterviewHUD } from './components/MockInterviewHUD';
import { PlanRequiredScreen } from './components/PlanRequiredScreen';
import { ScreenPositionPopover } from './components/ScreenPositionPopover';
import { getStoredToken, setStoredToken, clearStoredToken } from './utils/store';
import { moveToCursorScreen, resizeWindow } from './utils/windowManager';
import { useDeepLink, DeepLinkPayload } from './hooks/useDeepLink';
import { openBrowserUrl } from './utils/browser';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'session-select' | 'connect-session' | 'plan-required' | 'active-session'>('session-select');
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);
  const [sharedAudioStream, setSharedAudioStream] = useState<MediaStream | null>(null);
  const [showScreenPosition, setShowScreenPosition] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isPaid, setIsPaid] = useState(true);
  const [hudMode, setHudMode] = useState<'live' | 'mock'>('live');
  const [sessionRefreshTrigger, setSessionRefreshTrigger] = useState(0);

  const triggerSessionRefresh = useCallback(() => {
    setSessionRefreshTrigger((prev) => prev + 1);
  }, []);

  // Enforce screen-share invisibility on launch
  useEffect(() => {
    async function applyInvisibility() {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('enforce_screenshare_invisibility');
        console.log('[Ghostove Desktop] Enforced OS screen-share invisibility.');
      } catch (e) {
        console.warn('[Ghostove Desktop] Enforce invisibility stub:', e);
      }
    }
    applyInvisibility();
  }, []);

  // Global hotkey: Cmd+Shift+S (or Ctrl+Shift+S) to instantly switch panel to cursor screen
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (view === 'active-session') return; // In interview session, ⌘⇧S captures screen for Vision AI
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        await moveToCursorScreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view]);

  const checkUserAccess = useCallback(async (userToken: string | null): Promise<boolean> => {
    if (!userToken) return false;
    try {
      const res = await fetch('http://localhost:8000/api/credits', {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const hasAccess = !!(
          data.is_paid ||
          (data.total_seconds_remaining > 0) ||
          (data.free_demo_seconds_remaining > 0)
        );
        setIsPaid(hasAccess);
        return hasAccess;
      }
    } catch {
      try {
        const resWeb = await fetch('http://localhost:3000/api/auth/me', {
          headers: { Authorization: `Bearer ${userToken}` },
        });
        if (resWeb.ok) {
          const data = await resWeb.json();
          const hasAccess = !!(
            data.credits?.is_paid ||
            (data.credits?.free_demo_seconds_remaining > 0) ||
            (data.credits?.paid_seconds_balance > 0)
          );
          setIsPaid(hasAccess);
          return hasAccess;
        }
      } catch {}
    }
    return true; // Default fallback if servers are in startup
  }, []);

  const verifyToken = useCallback(async (tokenToVerify: string): Promise<boolean> => {
    try {
      const res = await fetch(`http://localhost:8000/api/session/verify-token?token=${tokenToVerify}`);
      if (res.ok) {
        const data = await res.json();
        return data.valid === true;
      }
    } catch (e) {
      console.warn('[Ghostove Desktop] Token verification network check offline, trusting local token.');
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    async function loadToken() {
      const stored = await getStoredToken();
      if (stored) {
        const isValid = await verifyToken(stored);
        if (isValid) {
          setToken(stored);
          checkUserAccess(stored);
        } else {
          await clearStoredToken();
          setToken(null);
        }
      }
      setLoading(false);
    }
    loadToken();
  }, [verifyToken, checkUserAccess]);

  const handleTokenReceived = useCallback(async (newToken: string) => {
    await setStoredToken(newToken);
    setToken(newToken);
    setView('session-select');
  }, []);

  const handleDeepLink = useCallback(async (payload: DeepLinkPayload) => {
    console.log('[Ghostove Desktop] Deep link received:', payload);

    if (payload.token) {
      await setStoredToken(payload.token);
      setToken(payload.token);
    }

    // Bring desktop app window to foreground, unminimize, and focus
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.show();
      await win.unminimize();
      await win.setFocus();
    } catch (err) {
      console.warn('[Ghostove Desktop] Could not focus window:', err);
    }

    // Always trigger session refresh whenever any deep link arrives
    triggerSessionRefresh();

    // If starting a session or specified a session id, check access first
    if (
      payload.action === 'start-session' ||
      payload.action === 'session' ||
      payload.sessionId
    ) {
      setIsCollapsed(false);
      let sessionData: SessionItem = {
        id: payload.sessionId || 'session-1',
        title: 'Interview Session',
        company_name: 'Interview',
        mode: 'Interview',
        duration_seconds: 0,
        created_at: new Date().toISOString(),
      };
      if (payload.sessionId) {
        // Try to fetch session details from backend
        try {
          const res = await fetch(`http://localhost:8000/api/sessions/${payload.sessionId}`);
          if (res.ok) {
            const data = await res.json();
            sessionData = data.session || data;
          }
        } catch {}
      }
      setSelectedSession(sessionData);

      const hasAccess = await checkUserAccess(payload.token || token);
      if (!hasAccess) {
        setView('plan-required');
        return;
      }

      setView('connect-session');
    } else if (payload.action === 'open' || payload.action === 'refresh') {
      setView('session-select');
    }
  }, [checkUserAccess, token, triggerSessionRefresh]);

  // Listen for ghostove:// protocol deep link
  useDeepLink({
    onTokenReceived: handleTokenReceived,
    onDeepLink: handleDeepLink,
  });

  const handleLogout = async () => {
    await clearStoredToken();
    setToken(null);
    setView('session-select');
  };

  const handleBuyCredits = () => {
    openBrowserUrl('http://localhost:3000/#pricing');
  };

  const handleSelectSession = async (sessionId: string, session?: SessionItem) => {
    const isMock = ((session?.mode || '') as string).toLowerCase().includes('mock');
    setHudMode(isMock ? 'mock' : 'live');
    const currentSession = session || {
      id: sessionId,
      title: 'Interview Session',
      company_name: 'Interview',
      mode: isMock ? 'mock' : 'interview',
      duration_seconds: 0,
      created_at: new Date().toISOString(),
    };
    setSelectedSession(currentSession);

    const hasAccess = await checkUserAccess(token);
    if (!hasAccess) {
      setView('plan-required');
      return;
    }

    setView('connect-session');
  };

  // Keep native Tauri window appropriately sized (440x600 outside active session, or 440x48 when collapsed)
  useEffect(() => {
    if (view !== 'active-session') {
      if (isCollapsed) {
        resizeWindow(440, 48);
      } else {
        resizeWindow(440, 600);
      }
    }
  }, [view, isCollapsed]);

  if (loading) {
    return (
      <div className="w-full h-full bg-[#f8f9fa] dark:bg-slate-950 text-slate-500 flex items-center justify-center text-xs select-none">
        Initializing Ghostove Stealth Engine...
      </div>
    );
  }

  // Screen 1: Unauthenticated
  if (!token) {
    return (
      <div className="w-full h-full select-none relative bg-[#f8f9fa] dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col overflow-hidden">
        <AuthScreen
          onOpenScreenPosition={() => setShowScreenPosition(true)}
        />
        <ScreenPositionPopover
          isOpen={showScreenPosition}
          onClose={() => setShowScreenPosition(false)}
        />
      </div>
    );
  }

  if (view === 'active-session') {
    return (
      <div className="w-full h-full relative overflow-x-hidden">
        {hudMode === 'mock' ? (
          <MockInterviewHUD
            token={token}
            sessionId={selectedSession?.id}
            jobTitle={selectedSession?.title || selectedSession?.company_name || 'Senior Software Engineer'}
            onBackToMenu={() => {
              setSharedAudioStream(null);
              triggerSessionRefresh();
              setView('session-select');
            }}
            onSwitchToLive={() => setHudMode('live')}
            onLogout={handleLogout}
          />
        ) : (
          <InterviewHUD
            token={token}
            sessionId={selectedSession?.id}
            initialSharedStream={sharedAudioStream}
            onLogout={handleLogout}
            onBackToMenu={() => {
              setSharedAudioStream(null);
              triggerSessionRefresh();
              setView('session-select');
            }}
            onOpenScreenPosition={() => setShowScreenPosition(true)}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
            onBuyCredits={handleBuyCredits}
          />
        )}
        {showScreenPosition && (
          <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center">
            <div className="relative w-[440px] h-[600px] bg-[#f8f9fa] dark:bg-slate-900 overflow-hidden">
              <ScreenPositionPopover
                isOpen={showScreenPosition}
                onClose={() => setShowScreenPosition(false)}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Screen 3 & 4: Session List View or Connect Call Session View (Main setup panel)
  return (
    <div className="w-full h-full relative select-none bg-[#f8f9fa] dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col overflow-hidden">
      {/* TopBar */}
      <TopBar
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        onOpenScreenPosition={() => {
          setIsCollapsed(false);
          setShowScreenPosition(true);
        }}
        onBuyCredits={handleBuyCredits}
        onLogout={handleLogout}
      />

      {/* View Switcher: Plan Required, Connect Session, or Session Select */}
      {!isCollapsed && view === 'plan-required' && (
        <PlanRequiredScreen
          session={selectedSession}
          onBack={() => {
            triggerSessionRefresh();
            setView('session-select');
          }}
          onRefreshCredits={async () => {
            const hasAccess = await checkUserAccess(token);
            return hasAccess;
          }}
          onContinueSession={() => setView('connect-session')}
        />
      )}

      {!isCollapsed && view === 'connect-session' && (
        <ConnectSessionScreen
          session={selectedSession}
          hasAccess={isPaid}
          onUpgradeRequired={() => setView('plan-required')}
          onConnect={(stream) => {
            console.log('[Ghostove Desktop] Connecting call session with stream:', stream);
            setSharedAudioStream(stream || null);
            setView('active-session');
          }}
          onBack={() => {
            triggerSessionRefresh();
            setView('session-select');
          }}
        />
      )}

      {!isCollapsed && view === 'session-select' && (
        <SessionSelectScreen
          token={token}
          refreshTrigger={sessionRefreshTrigger}
          onStartSession={handleSelectSession}
          onBuyCredits={handleBuyCredits}
        />
      )}

      {/* Screen & Position Popover Modal */}
      <ScreenPositionPopover
        isOpen={showScreenPosition}
        onClose={() => setShowScreenPosition(false)}
      />
    </div>
  );
}
