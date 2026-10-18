import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { InterviewTopBar } from "./InterviewTopBar";
import { EndSessionDialog } from "./common/EndSessionDialog";
import { InterviewAnswerPanel } from "./InterviewAnswerPanel";
import { InterviewTranscriptPanel } from "./InterviewTranscriptPanel";
import { InterviewChatInput } from "./InterviewChatInput";
import { useRealAudioListener } from "../hooks/useRealAudioListener";

import {
  setSelectiveClickThrough,
  resizeWindow,
  openPrivacySettings,
  ClickableRect,
} from "../utils/windowManager";
import { openBrowserUrl } from "../utils/browser";
import { WEB_API_URL, BACKEND_API_URL, WS_URL } from "../utils/config";
import {
  MousePointer,
  CheckCircle2,
  ShieldAlert,
  Zap,
  ExternalLink,
} from "lucide-react";

interface InterviewHUDProps {
  token: string;
  sessionId?: string | null;
  language?: string;
  initialSharedStream?: MediaStream | null;
  onLogout?: () => void;
  onBackToMenu?: () => void;
  onOpenScreenPosition?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onGetMoreTimeOrPlan?: () => void;
}

export function InterviewHUD({
  token,
  sessionId,
  language = "English",
  initialSharedStream,
  onLogout,
  onBackToMenu,
  onOpenScreenPosition,
  isCollapsed: externalIsCollapsed = false,
  onToggleCollapse: externalToggleCollapse,
  onGetMoreTimeOrPlan,
}: InterviewHUDProps) {
  const [showAnswer, setShowAnswer] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const selectedLanguage = language;
  const [opacity, setOpacity] = useState(0.95);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [fontSizeLevel, setFontSizeLevel] = useState(0);
  const [autoAnswer, setAutoAnswer] = useState(true);
  const [isClickThrough, setIsClickThrough] = useState(false);
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showEndSessionDialog, setShowEndSessionDialog] = useState(false);
  const [quotaRefreshFeedback, setQuotaRefreshFeedback] = useState<string | null>(null);

  // Decode authenticated user email from JWT token payload
  const userEmail = useMemo(() => {
    if (!token) return null;
    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join(""),
        );
        const data = JSON.parse(jsonPayload);
        return data.email || data.user_email || "";
      }
    } catch (_) {}
    return null;
  }, [token]);

  const isCollapsed = externalToggleCollapse
    ? externalIsCollapsed
    : localCollapsed;
  const toggleCollapse =
    externalToggleCollapse || (() => setLocalCollapsed(!localCollapsed));

  const floatingToggleRef = useRef<HTMLButtonElement>(null);

  // Resize window to generous dimensions (1080 x 740) so the interview panel is large with zero horizontal scroll
  useEffect(() => {
    resizeWindow(1080, 740);
    return () => {
      resizeWindow(440, 600);
    };
  }, []);

  useEffect(() => {
    if (isCollapsed) {
      resizeWindow(1080, 60);
    } else {
      resizeWindow(1080, 740);
    }
  }, [isCollapsed]);

  // Real-time audio listener, native speech recognition, and instant answer streaming
  const {
    isMicActive,
    isSharedAudioActive,
    isBackendConnected,
    toggleMic,
    toggleSharedAudio,
    isSpeaking,
    volumeLevel,
    micError,
    quotaExhausted,
    remainingSeconds,
    refreshQuota,
    startRealAudio,
    transcriptList,
    interimText,
    currentQuestion,
    fullAnswer,
    isGenerating,
    streamingToken,
    sourceType,
    askQuestion,
    analyzeScreenshot,
    clearAnswer,
    clearTranscripts,
    qaHistory,
    currentQAIndex,
    goToPrevQA,
    goToNextQA,
    pauseStatus,
  } = useRealAudioListener({
    token,
    selectedLanguage,
    wsUrl: WS_URL,
    sessionId,
    initialSharedStream,
    autoAnswer,
  });

  useEffect(() => {
    const refreshWhenAppReturns = () => {
      if (document.visibilityState === 'visible') void refreshQuota();
    };
    window.addEventListener('focus', refreshWhenAppReturns);
    document.addEventListener('visibilitychange', refreshWhenAppReturns);
    return () => {
      window.removeEventListener('focus', refreshWhenAppReturns);
      document.removeEventListener('visibilitychange', refreshWhenAppReturns);
    };
  }, [refreshQuota]);

  const handleRefreshQuota = async () => {
    setQuotaRefreshFeedback(null);
    const refreshedSeconds = await refreshQuota();
    if (refreshedSeconds === null) {
      setQuotaRefreshFeedback('Could not check your balance. Check your connection and try again.');
    } else if (refreshedSeconds <= 0) {
      setQuotaRefreshFeedback('No additional time is available yet. Complete a time purchase or choose a plan, then check again.');
    }
  };

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const handleToggleAnswer = useCallback(
    () => setShowAnswer((prev) => !prev),
    [],
  );
  const handleToggleChat = useCallback(() => setShowChat((prev) => !prev), []);
  const handleCloseChat = useCallback(() => setShowChat(false), []);

  const handleChatSubmit = useCallback(
    (text: string) => {
      if (!isBackendConnected) {
        showToast("Reconnect to ask Ghostove");
        return;
      }
      setShowAnswer(true);
      askQuestion(text, "Chat");
    },
    [askQuestion, isBackendConnected, showToast],
  );

  const handleScreenshot = useCallback(async () => {
    setShowAnswer(true);
    showToast("📸 Capturing screen and checking for a question or issue...");
    const ok = await analyzeScreenshot("Python");
    if (!ok) {
      showToast("⚠️ Screenshot could not be analyzed. See the answer panel for details.");
    }
  }, [analyzeScreenshot, showToast]);

  const sessionStartTimeRef = useRef<number>(Date.now());

  const handleEndSession = useCallback(async () => {
    // 1. Calculate duration in seconds
    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - sessionStartTimeRef.current) / 1000),
    );

    // 2. Format transcript text
    let formattedTranscript = "";
    if (transcriptList && transcriptList.length > 0) {
      formattedTranscript = transcriptList
        .filter((t) => t.text && t.text.trim())
        .map((t) => {
          const speaker =
            t.speaker === "You" ? "Candidate" : t.speaker || "Interviewer";
          const time = t.timestamp ? `[${t.timestamp}] ` : "";
          return `${time}${speaker}: ${t.text.trim()}`;
        })
        .join("\n");
    } else if (qaHistory && qaHistory.length > 0) {
      formattedTranscript = qaHistory
        .map((qa) => `Interviewer: ${qa.question}\nCandidate: ${qa.answer}`)
        .join("\n\n");
    } else if (currentQuestion || fullAnswer) {
      formattedTranscript = `Interviewer: ${currentQuestion || "Interview Question"}\nCandidate: ${fullAnswer || ""}`;
    }

    // 3. Format AI suggestions from QA history
    const aiSuggestions = (qaHistory || []).map((qa) => ({
      question: qa.question,
      answer: qa.answer,
      timestamp: qa.timestamp,
      source: qa.sourceType,
    }));

    // 4. Persist to Cloud Web API (Supabase)
    if (sessionId) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        // Persist session state through the backend data API.
        fetch(`${BACKEND_API_URL}/api/sessions/save`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            session_id: sessionId,
            status: "completed",
            duration_seconds: durationSeconds,
            transcript: formattedTranscript,
            ai_suggestions: aiSuggestions,
            mode: "interview",
          }),
        }).catch((err) =>
          console.warn("[InterviewHUD] Web session save error:", err),
        );

        // Auto trigger AI note generation through the backend data API.
        fetch(`${BACKEND_API_URL}/api/sessions/${sessionId}/ai`, {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "generate_notes" }),
        }).catch((err) =>
          console.warn(
            "[InterviewHUD] AI notes generation trigger error:",
            err,
          ),
        );
      } catch (err) {
        console.error("[InterviewHUD] Error saving session on end:", err);
      }
    }

    resizeWindow(440, 640);
    if (onBackToMenu) {
      onBackToMenu();
    }
  }, [
    sessionId,
    token,
    transcriptList,
    qaHistory,
    currentQuestion,
    fullAnswer,
    onBackToMenu,
  ]);

  const requestEndSession = useCallback(() => setShowEndSessionDialog(true), []);
  const cancelEndSession = useCallback(() => setShowEndSessionDialog(false), []);
  const confirmEndSession = useCallback(() => {
    setShowEndSessionDialog(false);
    void handleEndSession();
  }, [handleEndSession]);

  const handleEnableMic = useCallback(() => {
    startRealAudio();
    openPrivacySettings("microphone");
  }, [startRealAudio]);

  // Keyboard shortcut listener matching the interface
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘M or Ctrl+M: Toggle microphone mute
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "m"
      ) {
        if (e.repeat) return;
        e.preventDefault();
        if (micError) {
          handleEnableMic();
          showToast("Opening microphone settings");
        } else {
          void toggleMic();
          showToast(isMicActive ? "Microphone muted" : "Microphone unmuted");
        }
        return;
      }

      // ⌘↵ or ⌘J: Toggle Answer panel
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === "Enter" || e.key.toLowerCase() === "j")
      ) {
        e.preventDefault();
        setShowAnswer((prev) => !prev);
      }
      // ⌘⇧S: Trigger Screenshot
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "s"
      ) {
        e.preventDefault();
        handleScreenshot();
      }
      // ⌘K: Toggle Chat
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowChat((prev) => !prev);
      }
      // ⌘⇧⌫: Clear Transcripts
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Backspace") {
        e.preventDefault();
        clearTranscripts();
        showToast("Transcript cleared");
      }
      // ⌘⌫: Clear Answer
      else if ((e.metaKey || e.ctrlKey) && e.key === "Backspace") {
        e.preventDefault();
        clearAnswer();
        showToast("Answer cleared");
      }
      // ⌘←: Previous Answered Question
      else if ((e.metaKey || e.ctrlKey) && e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrevQA();
      }
      // ⌘→: Next Answered Question
      else if ((e.metaKey || e.ctrlKey) && e.key === "ArrowRight") {
        e.preventDefault();
        goToNextQA();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    askQuestion,
    clearAnswer,
    clearTranscripts,
    goToNextQA,
    goToPrevQA,
    handleEnableMic,
    handleScreenshot,
    isMicActive,
    micError,
    showToast,
    toggleMic,
  ]);

  // Click-through helper
  const handleToggleClickThrough = async () => {
    const nextState = !isClickThrough;
    setIsClickThrough(nextState);

    if (!nextState) {
      await setSelectiveClickThrough(false, []);
      return;
    }

    setTimeout(async () => {
      const rects: ClickableRect[] = [];
      const padding = 16;
      if (floatingToggleRef.current) {
        const r = floatingToggleRef.current.getBoundingClientRect();
        rects.push({
          x: Math.max(0, r.left - padding),
          y: Math.max(0, r.top - padding),
          width: r.width + padding * 2,
          height: r.height + padding * 2,
        });
      }
      await setSelectiveClickThrough(true, rects);
    }, 60);
  };

  // Reset click-through on unmount
  useEffect(() => {
    return () => {
      setSelectiveClickThrough(false, []);
    };
  }, []);

  return (
    <div
      style={{
        opacity,
        zoom: `${zoomLevel}%`,
        fontSize: `${Math.max(10, 13 + fontSizeLevel * 1.5)}px`,
      }}
      className="w-full h-full p-3 flex flex-col items-center justify-start select-none relative font-sans transition-all duration-200 overflow-x-hidden overflow-y-auto"
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-14 z-50 bg-[#1e2029]/95 border border-white/20 text-white text-xs px-3.5 py-1.5 rounded-full shadow-2xl flex items-center gap-2 animate-fade-in backdrop-blur-md">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Floating Click-Through Override Button */}
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

      {/* Quota Exhausted Modal Alert */}
      {quotaExhausted && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in pointer-events-auto">
          <div className="bg-slate-950/95 border border-rose-500/30 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-[0_25px_60px_-15px_rgba(0,0,0,0.98),0_0_30px_rgba(244,63,94,0.15)] text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto shadow-md">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white tracking-tight">
                {quotaExhausted.reason === 'daily_cap_reached' ? 'Today’s Time Limit Reached' : 'You’re Out of Session Time'}
              </h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                {quotaExhausted.message || 'Your session time is used. Add more time to continue receiving real-time answers.'}
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  setQuotaRefreshFeedback(null);
                  if (quotaExhausted.reason === 'daily_cap_reached') {
                    void openBrowserUrl(`${WEB_API_URL}/dashboard`);
                  } else if (onGetMoreTimeOrPlan) {
                    onGetMoreTimeOrPlan();
                  } else {
                    void openBrowserUrl(`${WEB_API_URL}/dashboard`);
                  }
                }}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95 transition-all"
              >
                <Zap className="w-4 h-4 fill-slate-950" />
                <span>{quotaExhausted.reason === 'daily_cap_reached' ? 'View Dashboard' : 'Add time or choose a plan'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              {quotaExhausted.reason !== 'daily_cap_reached' && (
                <button
                  onClick={() => void handleRefreshQuota()}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold py-2.5 px-4 rounded-xl text-xs cursor-pointer border border-slate-700 transition-colors"
                >
                  I’ve purchased time — check again
                </button>
              )}
              {quotaRefreshFeedback && (
                <p role="status" className="px-2 text-xs text-amber-200">{quotaRefreshFeedback}</p>
              )}
              <button
                onClick={requestEndSession}
                className="w-full bg-transparent hover:bg-slate-900 text-slate-400 hover:text-slate-200 font-medium py-2 px-4 rounded-xl text-xs cursor-pointer transition-colors"
              >
                <span>End session and return to menu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Floating Top Bar Matching Reference Photo */}
      <EndSessionDialog
        isOpen={showEndSessionDialog}
        onCancel={cancelEndSession}
        onConfirm={confirmEndSession}
      />
      <div className="w-full max-w-[1040px] mb-3 shrink-0 relative z-50">
        <InterviewTopBar
          showAnswer={showAnswer}
          onToggleAnswer={handleToggleAnswer}
          showChat={showChat}
          onToggleChat={handleToggleChat}
          onScreenshot={handleScreenshot}
          onEndSession={requestEndSession}
          isSpeaking={isSpeaking}
          isMicActive={isMicActive}
          onToggleMic={toggleMic}
          isSharedAudioActive={isSharedAudioActive}
          onToggleSharedAudio={toggleSharedAudio}
          micError={micError}
          onEnableMic={handleEnableMic}
          remainingSeconds={remainingSeconds}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          onOpenScreenPosition={onOpenScreenPosition}
          onToggleClickThrough={handleToggleClickThrough}
          isClickThrough={isClickThrough}
          opacity={opacity}
          onOpacityChange={setOpacity}
          onLogout={onLogout}
          zoomLevel={zoomLevel}
          onZoomChange={setZoomLevel}
          fontSizeLevel={fontSizeLevel}
          onFontSizeChange={setFontSizeLevel}
          userEmail={userEmail}
          selectedLanguage={selectedLanguage}
          autoAnswer={autoAnswer}
          onAutoAnswerChange={setAutoAnswer}
          onEdit={() => showToast("Session context & prompt settings")}
        />
      </div>

      {!isCollapsed && remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= 300 && (
        <div className={`w-full max-w-[1040px] mb-3 shrink-0 rounded-xl border px-4 py-2.5 flex items-center justify-between gap-3 ${
          remainingSeconds <= 60
            ? 'border-rose-400/30 bg-rose-950/70 text-rose-100'
            : 'border-amber-400/30 bg-amber-950/60 text-amber-100'
        }`} role="status" aria-live="polite">
          <p className="text-xs leading-relaxed">
            {remainingSeconds < 60
              ? 'Less than a minute of session time remains.'
              : remainingSeconds <= 120
                ? 'About two minutes of session time remain.'
                : 'Five minutes or less of session time remain.'}
            {' '}Your balance is shown in the top bar.
          </p>
          <button
            type="button"
            onClick={onGetMoreTimeOrPlan || (() => void openBrowserUrl(`${WEB_API_URL}/#pricing`))}
            className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Add time or choose a plan
          </button>
        </div>
      )}

      {/* 2. Main Content Panels Container (Side-by-Side) */}
      {!isCollapsed && (
        <div className="w-full max-w-[1040px] flex items-start justify-center gap-4 flex-1 overflow-x-hidden relative z-10">
          {/* Left Column: Chat input (if open) + Answer Panel (if open) */}
          <div className="flex-1 flex flex-col min-w-0 max-w-[680px]">
            {/* Chat Drawer for typing manually */}
            <InterviewChatInput
              isOpen={showChat}
              onClose={handleCloseChat}
              onSubmit={handleChatSubmit}
            />

            {/* Answer Panel: brought down when Answer is toggled on */}
            {showAnswer && (
              <InterviewAnswerPanel
                question={currentQuestion}
                answer={fullAnswer}
                isGenerating={isGenerating}
                streamingToken={streamingToken}
                sourceType={sourceType}
                pauseStatus={pauseStatus}
                onClear={clearAnswer}
                qaHistory={qaHistory}
                currentQAIndex={currentQAIndex}
                onPrevQA={goToPrevQA}
                onNextQA={goToNextQA}
                fontSizeLevel={fontSizeLevel}
              />
            )}
          </div>

          {/* Right Column: Transcript Panel */}
          <div className="w-[360px] shrink-0">
            <InterviewTranscriptPanel
              transcriptList={transcriptList}
              interimText={interimText}
              isSpeaking={isSpeaking}
              volumeLevel={volumeLevel}
              onClear={clearTranscripts}
              selectedLanguage={selectedLanguage}
              fontSizeLevel={fontSizeLevel}
            />
          </div>
        </div>
      )}
    </div>
  );
}
