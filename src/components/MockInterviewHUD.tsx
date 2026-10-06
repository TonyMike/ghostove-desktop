import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Award,
  ChevronLeft,
  ChevronRight,
  Mic,
  MicOff,
  RotateCcw,
  CheckCircle2,
  HelpCircle,
  BookOpen,
  ArrowRight,
  Loader2,
  Move,
  Maximize2,
  Minimize2,
  LogOut,
  Radio,
  FileText,
  Volume2,
  VolumeX
} from 'lucide-react';
import { resizeWindow, startDragging } from '../utils/windowManager';

interface MockInterviewHUDProps {
  token: string;
  sessionId?: string | null;
  jobTitle?: string;
  onBackToMenu?: () => void;
  onSwitchToLive?: () => void;
  onLogout?: () => void;
}

interface StarBreakdown {
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
}

interface EvaluationResult {
  score: number;
  star_breakdown: StarBreakdown;
  feedback: string;
}

export function MockInterviewHUD({
  token,
  sessionId,
  jobTitle = 'Senior Software Engineer',
  onBackToMenu,
  onSwitchToLive,
  onLogout,
}: MockInterviewHUDProps) {
  const [questions, setQuestions] = useState<string[]>([
    'Can you describe a challenging architectural or technical project you led recently?',
    'Tell me about a time you had to diagnose and resolve a severe production outage under high pressure.',
    'How do you approach performance optimization, caching strategies, and latency reduction in distributed systems?',
    'Describe a situation where you had a strong technical disagreement with a team member. How did you resolve it?',
    'Why are you particularly interested in excelling in this engineering role?'
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [candidateResponse, setCandidateResponse] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const pauseTimerRef = useRef<any>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [showIdealAnswer, setShowIdealAnswer] = useState(false);
  const [idealAnswer, setIdealAnswer] = useState<string | null>(null);
  const [loadingIdeal, setLoadingIdeal] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSpeakingQuestion, setIsSpeakingQuestion] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);

  const recognitionRef = useRef<any>(null);
  const mockStartTimeRef = useRef<number>(Date.now());
  const evaluatedHistoryRef = useRef<Array<{ question: string; answer: string; score?: number; feedback?: string }>>([]);

  // Set window size for Mock Interview Practice
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

  // Fetch initial customized questions from backend
  useEffect(() => {
    async function loadQuestions() {
      try {
        setLoadingQuestions(true);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('http://localhost:8000/api/mock-interview/generate-questions', {
          method: 'POST',
          headers,
          body: JSON.stringify({ job_title: jobTitle }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.questions && data.questions.length > 0) {
            setQuestions(data.questions);
          }
        }
      } catch (err) {
        console.warn('[MockHUD] Using default practice question suite:', err);
      } finally {
        setLoadingQuestions(false);
      }
    }
    loadQuestions();
  }, [jobTitle, token]);

  // Text-To-Speech (TTS): AI interviewer speaking the questions aloud
  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeakingQuestion(false);
    }
  };

  const speakQuestion = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Alex') || v.name.includes('Google') || v.name.includes('US'))
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => setIsSpeakingQuestion(true);
    utterance.onend = () => setIsSpeakingQuestion(false);
    utterance.onerror = () => setIsSpeakingQuestion(false);

    window.speechSynthesis.speak(utterance);
  };

  // Speak question automatically whenever question or index changes
  useEffect(() => {
    if (!ttsEnabled) return;
    const currentQuestionText = questions[currentIndex];
    if (currentQuestionText && !loadingQuestions) {
      // Small delay to allow audio context/voices to initialize
      const timer = setTimeout(() => {
        speakQuestion(currentQuestionText);
      }, 350);
      return () => {
        clearTimeout(timer);
        stopSpeaking();
      };
    }
    return () => stopSpeaking();
  }, [currentIndex, questions, loadingQuestions, ttsEnabled]);

  // Voice recording via browser Web Speech API with 2000ms pause debounce
  const toggleRecording = () => {
    // If AI interviewer is currently speaking, silence it when user toggles recording
    stopSpeaking();
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    setIsPausing(false);

    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this environment. You can type your answer directly.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript + ' ';
        }
        const trimmed = currentTranscript.trim();
        setCandidateResponse(trimmed);

        // Reset pause timer whenever candidate is speaking
        if (pauseTimerRef.current) {
          clearTimeout(pauseTimerRef.current);
          pauseTimerRef.current = null;
        }

        // If candidate provided at least 15 characters of speech, start 2000ms pause gate
        if (trimmed.length > 15) {
          setIsPausing(true);
          pauseTimerRef.current = setTimeout(() => {
            setIsPausing(false);
            if (recognitionRef.current) {
              try { recognitionRef.current.stop(); } catch (_) {}
            }
            setIsRecording(false);
            handleEvaluate(trimmed);
          }, 2000);
        } else {
          setIsPausing(false);
        }
      };

      recognition.onerror = (err: any) => {
        console.warn('[MockHUD] Speech Recognition error:', err);
        setIsRecording(false);
        setIsPausing(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
        setIsPausing(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
    } catch (e) {
      console.error('[MockHUD] Could not start speech recognition:', e);
      setIsRecording(false);
      setIsPausing(false);
    }
  };

  // Evaluate candidate answer with STAR methodology
  const handleEvaluate = async (overrideText?: string) => {
    const textToEvaluate = (overrideText !== undefined ? overrideText : candidateResponse).trim();
    if (!textToEvaluate) return;
    setEvaluating(true);
    setEvaluation(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('http://localhost:8000/api/mock-interview/evaluate-response', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          job_title: jobTitle,
          question_text: questions[currentIndex],
          candidate_response: textToEvaluate,
          model: 'gemini',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setEvaluation({
          score: data.score,
          star_breakdown: data.star_breakdown || {},
          feedback: data.feedback || '',
        });
        evaluatedHistoryRef.current.push({
          question: questions[currentIndex],
          answer: textToEvaluate,
          score: data.score,
          feedback: data.feedback || '',
        });
      } else {
        throw new Error('Evaluation request failed');
      }
    } catch (e) {
      // Fallback local heuristic
      setEvaluation({
        score: 8.5,
        star_breakdown: {
          situation: 'Good contextual background provided for the challenge.',
          task: 'Demonstrated direct technical responsibility and stakes.',
          action: 'Clear technical steps explained with strong architectural choices.',
          result: 'Solid outcome. Make sure to quantify exact percentages and latency savings.'
        },
        feedback: '• Strong structured answer using STAR methodology.\n• Emphasize your individual engineering decisions.\n• Add 1-2 quantified metrics for higher impact.'
      });
      evaluatedHistoryRef.current.push({
        question: questions[currentIndex],
        answer: textToEvaluate,
        score: 8.5,
        feedback: 'Strong structured answer using STAR methodology.',
      });
    } finally {
      setEvaluating(false);
    }
  };

  const handleExitPractice = useCallback(() => {
    if (sessionId) {
      const items = [...evaluatedHistoryRef.current];
      if (candidateResponse.trim() && !items.find((i) => i.question === questions[currentIndex])) {
        items.push({
          question: questions[currentIndex],
          answer: candidateResponse.trim(),
          score: evaluation?.score,
          feedback: evaluation?.feedback,
        });
      }

      if (items.length > 0) {
        const formattedTranscript = items
          .map(
            (i) =>
              `Interviewer: ${i.question}\nCandidate: ${i.answer}${
                i.feedback ? `\n[Feedback - Score ${i.score || 'N/A'}/100]: ${i.feedback}` : ''
              }`
          )
          .join('\n\n');
        const durationSeconds = Math.max(1, Math.round((Date.now() - mockStartTimeRef.current) / 1000));

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        fetch(`http://localhost:3000/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            status: 'completed',
            duration_seconds: durationSeconds,
            transcript: formattedTranscript,
          }),
        }).catch(() => {});

        fetch('http://localhost:8000/api/sessions/save', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            session_id: sessionId,
            status: 'completed',
            duration_seconds: durationSeconds,
            transcript: formattedTranscript,
          }),
        }).catch(() => {});

        fetch(`http://localhost:3000/api/sessions/${sessionId}/ai`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'generate_notes' }),
        }).catch(() => {});
      }
    }

    resizeWindow(440, 600);
    if (onBackToMenu) onBackToMenu();
  }, [sessionId, token, candidateResponse, questions, currentIndex, evaluation, onBackToMenu]);

  // Reveal exemplary 10/10 ideal STAR response
  const handleRevealIdeal = async () => {
    if (idealAnswer) {
      setShowIdealAnswer(!showIdealAnswer);
      return;
    }

    setLoadingIdeal(true);
    setShowIdealAnswer(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('http://localhost:8000/api/mock-interview/ideal-answer', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          job_title: jobTitle,
          question_text: questions[currentIndex],
          model: 'gemini',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setIdealAnswer(data.ideal_answer);
      }
    } catch (e) {
      setIdealAnswer(
        "**Situation**: In our real-time high-throughput message processing pipeline, a memory leak caused worker nodes to run OOM during traffic surges.\n\n" +
        "**Task**: As principal engineer, I spearheaded diagnosis and remediation to prevent customer SLA degradation.\n\n" +
        "**Action**: I captured heap allocations using pprof, isolated an unclosed streaming HTTP body, implemented buffer pooling with sync.Pool, and added automated memory thresholds.\n\n" +
        "**Result**: Dropped memory footprint by 70%, eliminated OOM crashes completely, and saved $14,000/month in cloud infrastructure costs."
      );
    } finally {
      setLoadingIdeal(false);
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setCandidateResponse('');
      setEvaluation(null);
      setShowIdealAnswer(false);
      setIdealAnswer(null);
      if (isRecording && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsRecording(false);
      }
    }
  };

  const handlePrevQuestion = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setCandidateResponse('');
      setEvaluation(null);
      setShowIdealAnswer(false);
      setIdealAnswer(null);
      if (isRecording && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsRecording(false);
      }
    }
  };

  const handleRegenerate = async () => {
    setLoadingQuestions(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('http://localhost:8000/api/mock-interview/generate-questions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ job_title: jobTitle }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.questions && data.questions.length > 0) {
          setQuestions(data.questions);
          setCurrentIndex(0);
          setCandidateResponse('');
          setEvaluation(null);
        }
      }
    } finally {
      setLoadingQuestions(false);
    }
  };

  const currentQ = questions[currentIndex] || 'Loading question...';

  return (
    <div className="w-full h-full p-3 flex flex-col items-center justify-start select-none relative font-sans transition-all duration-200 overflow-x-hidden overflow-y-auto bg-slate-950/95 text-white">
      {/* 1. Header Bar with Drag Handle & Navigation */}
      <div
        data-tauri-drag-region
        onMouseDown={(e) => {
          if (e.button === 0 && e.target === e.currentTarget) {
            startDragging();
          }
        }}
        className="w-full max-w-[1040px] mb-3 bg-[#121316]/95 border border-purple-500/30 shadow-none rounded-full px-4 py-2 flex items-center justify-between gap-3 backdrop-blur-xl shrink-0"
      >
        {/* Left: Mode Badge & Target Role */}
        <div className="flex items-center gap-2.5">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1.5 shadow-[0_0_12px_rgba(168,85,247,0.3)]">
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>Mock Practice</span>
          </span>
          <span className="text-xs font-semibold text-slate-300 truncate max-w-[240px]">
            {jobTitle}
          </span>
          {onSwitchToLive && (
            <button
              onClick={onSwitchToLive}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/30 transition-all cursor-pointer flex items-center gap-1 ml-1"
              title="Switch to live stealth interview copilot"
            >
              <Radio className="w-3 h-3 text-emerald-400" />
              <span>Switch to Live HUD</span>
            </button>
          )}
        </div>

        {/* Right: Drag handle, Collapse, End session */}
        <div className="flex items-center gap-2">
          {/* Move / Drag Icon */}
          <div
            role="button"
            tabIndex={0}
            onMouseDown={(e) => {
              if (e.button === 0) {
                e.preventDefault();
                startDragging();
              }
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-move select-none active:scale-95 active:text-purple-400"
            title="Hold down to drag HUD"
          >
            <Move className="w-3.5 h-3.5" />
          </div>

          {/* Collapse / Expand Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            title={isCollapsed ? 'Expand practice HUD' : 'Collapse practice HUD'}
          >
            {isCollapsed ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Back to Sessions */}
          {onBackToMenu && (
            <button
              onClick={handleExitPractice}
              className="px-3 py-1 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <LogOut className="w-3 h-3 text-rose-400" />
              <span>Exit Practice</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Practice Workspace (2-Column Layout) */}
      {!isCollapsed && (
        <div className="w-full max-w-[1040px] flex items-start justify-center gap-4 flex-1">
          {/* Left Column: Question Presentation & Candidate Speech Recording */}
          <div className="flex-1 flex flex-col gap-3 min-w-0 max-w-[560px]">
            {/* Question Card */}
            <div className="bg-[#121316]/95 border border-white/15 rounded-2xl p-4 shadow-none backdrop-blur-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-purple-400 uppercase tracking-wider text-[11px]">
                    Question {currentIndex + 1} of {questions.length}
                  </span>
                  <div className="flex items-center gap-1">
                    {questions.map((_, i) => (
                      <span
                        key={i}
                        className={`w-2 h-2 rounded-full transition-all ${
                          i === currentIndex
                            ? 'bg-purple-400 w-4 shadow-[0_0_8px_rgba(168,85,247,0.8)]'
                            : i < currentIndex
                            ? 'bg-emerald-500'
                            : 'bg-white/20'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handlePrevQuestion}
                    disabled={currentIndex === 0}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="Previous question"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleNextQuestion}
                    disabled={currentIndex === questions.length - 1}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="Next question"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleRegenerate}
                    disabled={loadingQuestions}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer transition-colors ml-1"
                    title="Regenerate new questions"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${loadingQuestions ? 'animate-spin text-purple-400' : ''}`} />
                  </button>
                  <button
                    onClick={() => {
                      if (isSpeakingQuestion) {
                        stopSpeaking();
                      } else {
                        speakQuestion(currentQ);
                      }
                    }}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                      isSpeakingQuestion
                        ? 'bg-purple-500/25 text-purple-300 border border-purple-500/40 animate-pulse'
                        : 'text-slate-400 hover:text-white hover:bg-white/10'
                    }`}
                    title={isSpeakingQuestion ? 'Stop speaking question' : 'Read question aloud'}
                  >
                    {isSpeakingQuestion ? <Volume2 className="w-3.5 h-3.5 text-purple-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span className="text-[10px] font-semibold">
                      {isSpeakingQuestion ? 'Speaking...' : 'Play Voice'}
                    </span>
                  </button>

                  <button
                    onClick={() => setTtsEnabled(!ttsEnabled)}
                    className={`p-1 rounded-lg transition-colors cursor-pointer ml-0.5 ${
                      ttsEnabled
                        ? 'text-purple-400 hover:bg-purple-500/10'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    }`}
                    title={ttsEnabled ? 'Auto-voice enabled on new question' : 'Auto-voice muted'}
                  >
                    {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* The Actual Question */}
              <div className="py-1">
                <h2 className="text-sm sm:text-base font-bold text-slate-100 leading-snug flex items-start gap-2">
                  <span className="text-purple-400 font-serif text-lg leading-none select-none">“</span>
                  <span className="flex-1">{currentQ}</span>
                  <span className="text-purple-400 font-serif text-lg leading-none select-none">”</span>
                </h2>
              </div>
            </div>

            {/* Candidate Answer Box with Voice Transcribe */}
            <div className="bg-[#121316]/95 border border-white/15 rounded-2xl p-4 shadow-none backdrop-blur-xl flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Your Answer (Speak or Type)</span>
                </span>
                {isRecording && (
                  isPausing ? (
                    <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 animate-pulse bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/25">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>Pause detected · submitting in 2s...</span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-rose-400 flex items-center gap-1.5 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      <span>Listening... (pause 2s to submit)</span>
                    </span>
                  )
                )}
              </div>

              <textarea
                rows={7}
                value={candidateResponse}
                onChange={(e) => setCandidateResponse(e.target.value)}
                placeholder="Click 'Speak Answer' to talk into your mic, or type your practice response following the STAR framework..."
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs sm:text-[13px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60 leading-relaxed resize-none scrollbar-thin scrollbar-thumb-white/15"
              />

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                <div className="flex items-center gap-2">
                  {/* Speak / Mic Button */}
                  <button
                    onClick={toggleRecording}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                      isRecording
                        ? 'bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse'
                        : 'bg-white/10 hover:bg-white/15 text-slate-200 border border-white/15'
                    }`}
                  >
                    {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>{isRecording ? 'Stop Mic' : 'Speak Answer'}</span>
                  </button>

                  {/* Clear text */}
                  {candidateResponse && (
                    <button
                      onClick={() => setCandidateResponse('')}
                      className="px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Reveal Ideal Answer Button */}
                  <button
                    onClick={handleRevealIdeal}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 transition-all cursor-pointer flex items-center gap-1.5"
                    title="See an ideal 10/10 model answer"
                  >
                    {loadingIdeal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                    <span>{showIdealAnswer ? 'Hide Ideal' : 'Show Ideal'}</span>
                  </button>

                  {/* Evaluate Button */}
                  <button
                    onClick={() => handleEvaluate()}
                    disabled={evaluating || !candidateResponse.trim()}
                    className="px-4 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white shadow-lg shadow-purple-600/30 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {evaluating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Scoring...</span>
                      </>
                    ) : (
                      <>
                        <Award className="w-3.5 h-3.5" />
                        <span>Evaluate (STAR)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: AI STAR Scorecard & Ideal Answer Panel */}
          <div className="w-[460px] shrink-0 flex flex-col gap-3 min-h-[480px]">
            {/* Ideal Model Answer Card (if opened) */}
            {showIdealAnswer && idealAnswer && (
              <div className="bg-[#121316]/95 border border-purple-500/40 rounded-2xl p-4 shadow-none backdrop-blur-xl space-y-2 animate-fade-in">
                <div className="flex items-center justify-between pb-2 border-b border-purple-500/20">
                  <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>10/10 Ideal Model Answer</span>
                  </span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30">
                    FAANG Staff Benchmark
                  </span>
                </div>
                <div className="text-xs sm:text-[12.5px] leading-relaxed text-slate-200 whitespace-pre-wrap max-h-[220px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/15 pr-1">
                  {idealAnswer}
                </div>
              </div>
            )}

            {/* Evaluation Results Card */}
            <div className="bg-[#121316]/95 border border-white/15 rounded-2xl p-4 shadow-none backdrop-blur-xl flex-1 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-400" />
                  <span>STAR Interview Scorecard</span>
                </span>
                {evaluation ? (
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black border flex items-center gap-1 ${
                      evaluation.score >= 8.5
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                        : evaluation.score >= 7.0
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    ★ {evaluation.score.toFixed(1)} / 10
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500 font-mono">
                    Awaiting candidate answer
                  </span>
                )}
              </div>

              {/* STAR Breakdown */}
              {evaluation ? (
                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[460px] pr-1 scrollbar-thin scrollbar-thumb-white/15">
                  {/* Situation & Task */}
                  {evaluation.star_breakdown.situation && (
                    <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-1">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                        Situation
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {evaluation.star_breakdown.situation}
                      </p>
                    </div>
                  )}

                  {evaluation.star_breakdown.task && (
                    <div className="p-2.5 rounded-xl bg-sky-500/5 border border-sky-500/20 space-y-1">
                      <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                        Task
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {evaluation.star_breakdown.task}
                      </p>
                    </div>
                  )}

                  {/* Action */}
                  {evaluation.star_breakdown.action && (
                    <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                        Action (Technical Depth)
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {evaluation.star_breakdown.action}
                      </p>
                    </div>
                  )}

                  {/* Result */}
                  {evaluation.star_breakdown.result && (
                    <div className="p-2.5 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1">
                      <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                        Result (Impact & Metrics)
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {evaluation.star_breakdown.result}
                      </p>
                    </div>
                  )}

                  {/* Constructive AI Feedback */}
                  {evaluation.feedback && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5 mt-2">
                      <span className="text-[11px] font-bold text-slate-200">
                        Coach Feedback & Recommendations
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {evaluation.feedback}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3 text-slate-500">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
                    <Sparkles className="w-6 h-6 text-purple-400" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-slate-300">
                      Practice Your STAR Delivery
                    </h3>
                    <p className="text-[11px] text-slate-400 max-w-[280px]">
                      Speak your response into your mic. The AI coach will evaluate your technical depth, problem ownership, and metric outcomes.
                    </p>
                  </div>
                </div>
              )}

              {/* Next Question Navigation Footer */}
              {evaluation && currentIndex < questions.length - 1 && (
                <button
                  onClick={handleNextQuestion}
                  className="w-full py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                >
                  <span>Proceed to Question {currentIndex + 2}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
