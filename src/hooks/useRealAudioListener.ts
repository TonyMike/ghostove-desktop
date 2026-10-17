import { useState, useEffect, useRef, useCallback } from 'react';
import { floatTo16BitPCM, resampleTo16kHz } from '../utils/pcmEncoder';
import { captureScreen } from '../utils/windowManager';
import { BACKEND_API_URL, WS_URL } from '../utils/config';

export interface TranscriptItem {
  id: string;
  text: string;
  isFinal: boolean;
  speaker: string; // 'You' | 'Interviewer'
  timestamp: string; // e.g. '17:25'
}

export interface QAItem {
  id: string;
  question: string;
  answer: string;
  timestamp: string;
  sourceType: string;
}

interface UseRealAudioListenerProps {
  token?: string | null;
  selectedLanguage?: string;
  wsUrl?: string;
  sessionId?: string | null;
  initialSharedStream?: MediaStream | null;
  autoAnswer?: boolean;
}

function formatCurrentTime(): string {
  const d = new Date();
  const hrs = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${hrs}:${mins}`;
}

export function useRealAudioListener({
  token,
  selectedLanguage = 'English',
  wsUrl = WS_URL,
  sessionId,
  initialSharedStream,
  autoAnswer = true,
}: UseRealAudioListenerProps) {
  const [isMicActive, setIsMicActive] = useState(false);
  const [isSharedAudioActive, setIsSharedAudioActive] = useState(false);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const [transcriptList, setTranscriptList] = useState<TranscriptItem[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [fullAnswer, setFullAnswer] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingToken, setStreamingToken] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<string>('');
  const [quotaExhausted, setQuotaExhausted] = useState<{ message: string; reason?: string } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0);
  const [pauseStatus, setPauseStatus] = useState<'idle' | 'speaking' | 'pausing' | 'triggered'>('idle');

  // Question & Answer History State for previous/next navigation
  const [qaHistory, setQaHistory] = useState<QAItem[]>([]);
  const [currentQAIndex, setCurrentQAIndex] = useState<number>(-1);
  const qaHistoryRef = useRef<QAItem[]>([]);
  const currentQAIndexRef = useRef<number>(-1);

  useEffect(() => {
    qaHistoryRef.current = qaHistory;
  }, [qaHistory]);

  useEffect(() => {
    currentQAIndexRef.current = currentQAIndex;
  }, [currentQAIndex]);

  useEffect(() => {
    isSharedAudioActiveRef.current = isSharedAudioActive;
  }, [isSharedAudioActive]);

  const navigateToQA = useCallback((index: number) => {
    const history = qaHistoryRef.current;
    if (index < 0 || index >= history.length) return;
    currentQAIndexRef.current = index;
    setCurrentQAIndex(index);
    const item = history[index];
    if (item) {
      setCurrentQuestion(item.question);
      fullAnswerRef.current = item.answer;
      setFullAnswer(item.answer);
      setSourceType(item.sourceType);
      setIsGenerating(false);
      setStreamingToken(null);
    }
  }, []);

  const goToPrevQA = useCallback(() => {
    const current = currentQAIndexRef.current;
    if (current > 0) {
      navigateToQA(current - 1);
    }
  }, [navigateToQA]);

  const goToNextQA = useCallback(() => {
    const current = currentQAIndexRef.current;
    if (current < qaHistoryRef.current.length - 1) {
      navigateToQA(current + 1);
    }
  }, [navigateToQA]);

  const streamRef = useRef<MediaStream | null>(null);
  const sharedStreamRef = useRef<MediaStream | null>(null);
  const sharedSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sharedProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const isMicActiveRef = useRef<boolean>(false);
  const isSharedAudioActiveRef = useRef<boolean>(false);
  const autoAnswerRef = useRef<boolean>(autoAnswer);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const refreshQuota = useCallback(async (): Promise<number | null> => {
    if (!token) return null;
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/credits`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const credits = await response.json();
      const remaining = credits.is_unlimited
        ? credits.daily_seconds_remaining
        : (credits.total_seconds_remaining ?? (
            (credits.free_demo_seconds_remaining || 0) + (credits.paid_seconds_balance || 0)
          ));
      const normalizedRemaining = Math.max(0, Number(remaining) || 0);
      setRemainingSeconds(normalizedRemaining);
      if (normalizedRemaining > 0 && quotaExhausted) {
        setQuotaExhausted(null);
        setQuotaRefreshKey((key) => key + 1);
      }
      return normalizedRemaining;
    } catch (error) {
      console.warn('[RealAudio WS] Could not refresh quota:', error);
      return null;
    }
  }, [quotaExhausted, token]);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);

  useEffect(() => {
    if (!isBackendConnected || remainingSeconds === null || remainingSeconds <= 0) return;
    const intervalId = window.setInterval(() => {
      setRemainingSeconds((seconds) => seconds === null ? null : Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isBackendConnected, remainingSeconds]);
  const isSpeakingRef = useRef<boolean>(false);
  const tokenBufferRef = useRef<string>('');
  const tokenFlushTimerRef = useRef<any>(null);
  const fullAnswerRef = useRef<string>('');
  const isGeneratingRef = useRef<boolean>(false);
  const recentFinalTranscriptsRef = useRef<Array<{ text: string; speaker: string; origin: string; at: number }>>([]);

  const appendFinalTranscript = useCallback((text: string, speaker: string, origin: 'browser' | 'backend') => {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    const now = Date.now();
    const recent = recentFinalTranscriptsRef.current.filter((item) => now - item.at < 8000);
    if (recent.some((item) => item.origin !== origin && item.speaker === speaker && item.text === normalized)) return;
    recentFinalTranscriptsRef.current = [...recent, { text: normalized, speaker, origin, at: now }].slice(-30);
    setTranscriptList((items) => [...items, {
      id: now.toString() + Math.random().toString(36).slice(2, 5),
      text: text.trim(),
      isFinal: true,
      speaker,
      timestamp: formatCurrentTime(),
    }]);
  }, []);

  useEffect(() => {
    autoAnswerRef.current = autoAnswer;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'audio_source',
        source: 'meeting_audio',
        enabled: isSharedAudioActiveRef.current,
        auto_answer: autoAnswer,
      }));
    }
  }, [autoAnswer]);

  // Trigger question asking & answer generation from real backend AI
  const askQuestion = useCallback(
    (questionText: string, source: string = 'Audio') => {
      const trimmed = questionText.trim();
      const ws = wsRef.current;
      if (!trimmed || !ws || ws.readyState !== WebSocket.OPEN) return false;

      if (tokenFlushTimerRef.current) {
        clearTimeout(tokenFlushTimerRef.current);
        tokenFlushTimerRef.current = null;
      }
      tokenBufferRef.current = '';

      const time = formatCurrentTime();
      setCurrentQuestion(trimmed);
      fullAnswerRef.current = '';
      setFullAnswer('');
      setIsGenerating(true);
      isGeneratingRef.current = true;
      setStreamingToken('');
      setSourceType(`${source} ${time}`);

      const newQA: QAItem = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
        question: trimmed,
        answer: '',
        timestamp: time,
        sourceType: `${source} ${time}`,
      };

      setQaHistory((prev) => {
        const next = [...prev, newQA];
        qaHistoryRef.current = next;
        currentQAIndexRef.current = next.length - 1;
        setCurrentQAIndex(next.length - 1);
        return next;
      });

      // Send to WebSocket to trigger real backend LLM stream
      const sendPayload = () => {
        const recentHistory: { role: string; content: string }[] = [];
        const pastTurns = qaHistoryRef.current.slice(-4);
        for (const item of pastTurns) {
          if (item.question && item.answer) {
            recentHistory.push({ role: 'user', content: `Interviewer: ${item.question}` });
            recentHistory.push({ role: 'assistant', content: item.answer });
          }
        }
        ws.send(
          JSON.stringify({
            type: 'ask_question',
            text: trimmed,
            history: recentHistory,
            client_handled: true,
          })
        );
        return true;
      };

      return sendPayload();
    },
    []
  );

  const waitForBackendWebSocket = useCallback(async (timeoutMs = 10000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) return ws;
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
    return null;
  }, []);

  // Capture the screen and answer its most relevant visible question or issue.
  const analyzeScreenshot = useCallback(
    async (targetLanguage: string = 'Python', customBase64?: string): Promise<boolean> => {
      try {
        let imageB64 = customBase64;
        if (!imageB64) {
          imageB64 = (await captureScreen()) || undefined;
        }

        if (!imageB64) {
          console.warn('[RealAudio] captureScreen returned null or empty.');
          setFullAnswer('The operating system returned an empty screenshot. Check screen-capture access and try again.');
          setIsGenerating(false);
          return false;
        }

        // Clean any data:image prefix if present
        if (imageB64.includes(',')) {
          imageB64 = imageB64.split(',')[1];
        }

        const time = formatCurrentTime();
        setIsGenerating(true);
        setCurrentQuestion('🖼️ Reviewing screenshot...');
        setFullAnswer('Inspecting the screen and preparing a relevant response...');
        setStreamingToken(null);
        setSourceType(`Screen ${time}`);

        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          setFullAnswer('Screenshot captured. Waiting for the backend to reconnect...');
        }
        const ws = await waitForBackendWebSocket();
        if (!ws) {
          setFullAnswer('The screenshot was captured, but the backend is still disconnected. Wait for it to reconnect, then try again.');
          setIsGenerating(false);
          return false;
        }

        ws.send(
          JSON.stringify({
            type: 'read_screen',
            image_base64: imageB64,
            target_language: targetLanguage,
          })
        );
        return true;
      } catch (err) {
        console.error('[RealAudio] Error in analyzeScreenshot:', err);
        const details = err instanceof Error ? err.message : String(err);
        setFullAnswer(`Could not start screen analysis: ${details}`);
        setIsGenerating(false);
        return false;
      }
    },
    [waitForBackendWebSocket]
  );

  // 3. Clear handlers
  const clearAnswer = useCallback(() => {
    setCurrentQuestion('');
    fullAnswerRef.current = '';
    setFullAnswer('');
    setStreamingToken(null);
    setIsGenerating(false);
    setQaHistory([]);
    setCurrentQAIndex(-1);
    qaHistoryRef.current = [];
    currentQAIndexRef.current = -1;
  }, []);

  const clearTranscripts = useCallback(() => {
    setTranscriptList([]);
    recentFinalTranscriptsRef.current = [];
    setInterimText('');
  }, []);

  // 4. Stop shared audio helper
  const stopSharedAudio = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'audio_source', source: 'meeting_audio', enabled: false, auto_answer: autoAnswerRef.current }));
    }
    if (sharedProcessorRef.current) {
      try {
        sharedProcessorRef.current.disconnect();
      } catch (_) {}
      sharedProcessorRef.current = null;
    }
    if (sharedSourceRef.current) {
      try {
        sharedSourceRef.current.disconnect();
      } catch (_) {}
      sharedSourceRef.current = null;
    }
    if (sharedStreamRef.current) {
      sharedStreamRef.current.getTracks().forEach((track) => track.stop());
      sharedStreamRef.current = null;
    }
    isSharedAudioActiveRef.current = false;
    setIsSharedAudioActive(false);
    console.log('[RealAudio] Shared audio stopped.');
  }, []);

  // 5. Attach an existing or new shared audio stream to isolated pipeline
  const attachSharedStream = useCallback((audioStream: MediaStream) => {
    sharedStreamRef.current = audioStream;

    let audioCtx = audioCtxRef.current;
    if (!audioCtx || audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioContextClass({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    try {
      if (sharedProcessorRef.current) {
        try { sharedProcessorRef.current.disconnect(); } catch (_) {}
        sharedProcessorRef.current = null;
      }
      if (sharedSourceRef.current) {
        try { sharedSourceRef.current.disconnect(); } catch (_) {}
        sharedSourceRef.current = null;
      }

      const sharedSource = audioCtx.createMediaStreamSource(audioStream);
      sharedSourceRef.current = sharedSource;

      // Solution 1: Dedicated ScriptProcessor for Interviewer Meeting Audio (Channel 1)
      const sharedProcessor = audioCtx.createScriptProcessor(2048, 1, 1);
      sharedProcessorRef.current = sharedProcessor;

      sharedProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const resampled = resampleTo16kHz(inputData, audioCtx!.sampleRate);
          const pcmBuffer = floatTo16BitPCM(resampled);

          // Channel 1 = Interviewer meeting sound
          const tagged = new Uint8Array(1 + pcmBuffer.byteLength);
          tagged[0] = 1;
          tagged.set(new Uint8Array(pcmBuffer), 1);
          wsRef.current.send(tagged.buffer);
        }
      };

      const sharedMuteGain = audioCtx.createGain();
      sharedMuteGain.gain.value = 0;
      sharedSource.connect(sharedProcessor);
      sharedProcessor.connect(sharedMuteGain);
      sharedMuteGain.connect(audioCtx.destination);

      // Connect to analyser so meeting audio also drives HUD visualizer
      if (analyserRef.current) {
        try {
          sharedSource.connect(analyserRef.current);
        } catch (_) {}
      }

      const audioTracks = audioStream.getAudioTracks();
      if (audioTracks[0]) {
        audioTracks[0].onended = () => {
          stopSharedAudio();
        };
      }

      isSharedAudioActiveRef.current = true;
      setIsSharedAudioActive(true);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'audio_source', source: 'meeting_audio', enabled: true, auto_answer: autoAnswerRef.current }));
      }
      console.log('[RealAudio] Shared meeting audio attached on Channel 1 (Interviewer).');
    } catch (err) {
      console.warn('[RealAudio] Failed to attach shared audio stream:', err);
    }
  }, [stopSharedAudio]);

  // 6. Start Real Microphone Capture & Visualizer
  const startRealAudio = useCallback(async () => {
    try {
      setMicError(null);
      console.log('[RealAudio] Requesting real microphone stream...');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      let audioCtx: AudioContext;
      try {
        audioCtx = new AudioContextClass({ sampleRate: 16000 });
      } catch (_) {
        audioCtx = new AudioContextClass();
      }
      audioCtxRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume();
        } catch (_) {}
      }

      // Analyser Node for real-time visualizer
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // ScriptProcessor for ultra-low latency PCM streaming to backend WebSocket (128ms chunks)
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const resampled = resampleTo16kHz(inputData, audioCtx.sampleRate);
          const pcmBuffer = floatTo16BitPCM(resampled);

          // With meeting audio, the mic is the candidate channel. In mic-only
          // mode it feeds interviewer detection so spoken questions auto-answer.
          const channelId = isSharedAudioActiveRef.current ? 2 : 1;
          const tagged = new Uint8Array(1 + pcmBuffer.byteLength);
          tagged[0] = channelId;
          tagged.set(new Uint8Array(pcmBuffer), 1);
          wsRef.current.send(tagged.buffer);
        }
      };

      // Connect through a zero-gain node to keep the processor running without audio feedback echo
      const muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;
      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(audioCtx.destination);

      // If shared meeting audio was already connected, re-attach its dedicated pipeline
      if (sharedStreamRef.current) {
        attachSharedStream(sharedStreamRef.current);
      }

      isMicActiveRef.current = true;
      setIsMicActive(true);
      console.log('[RealAudio] Microphone active and audio pipeline established.');

      // Real-time Volume Monitoring Loop (Throttled to ~11 FPS to eliminate React render churn)
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastVolumeTime = 0;
      let lastVolumeLevel = 0;

      const updateVolume = (timestamp: number) => {
        if (!analyserRef.current) return;

        // Throttle frequency calculation and React state update to at most once per 90ms (~11 FPS)
        if (timestamp - lastVolumeTime >= 90) {
          lastVolumeTime = timestamp;
          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const normalized = Math.min(1, avg / 90);

          // Only trigger state updates when level changes meaningfully (> 6%) or drops to silence
          if (Math.abs(normalized - lastVolumeLevel) > 0.06 || (normalized === 0 && lastVolumeLevel > 0)) {
            lastVolumeLevel = normalized;
            setVolumeLevel(normalized);
          }

          if (normalized > 0.08) {
            if (!isSpeakingRef.current) {
              isSpeakingRef.current = true;
              setIsSpeaking(true);
            }
            if (silenceTimerRef.current) {
              window.clearTimeout(silenceTimerRef.current);
            }
            silenceTimerRef.current = window.setTimeout(() => {
              isSpeakingRef.current = false;
              setIsSpeaking(false);
            }, 400);
          }
        }

        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };

      animationFrameRef.current = requestAnimationFrame(updateVolume);

      // 5. SpeechRecognition (Web Speech API) for real-time transcription
      const SpeechRecognitionClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognitionClass) {
        try {
          const recognition = new SpeechRecognitionClass();
          recognitionRef.current = recognition;
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.maxAlternatives = 1;

          // Map language selection
          const langCode = selectedLanguage.includes('Spanish')
            ? 'es-ES'
            : selectedLanguage.includes('French')
            ? 'fr-FR'
            : selectedLanguage.includes('German')
            ? 'de-DE'
            : selectedLanguage.includes('Mandarin')
            ? 'zh-CN'
            : selectedLanguage.includes('Portuguese')
            ? 'pt-BR'
            : selectedLanguage.includes('Japanese')
            ? 'ja-JP'
            : 'en-US';

          recognition.lang = langCode;

          recognition.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const res = event.results[i];
              const text = res[0].transcript;

              if (res.isFinal) {
                const trimmedText = text.trim();
                if (trimmedText) {
                  const isWsActive = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
                  if (!isWsActive) {
                    appendFinalTranscript(trimmedText, 'You', 'browser');
                    setInterimText('');
                  }
                }
              } else {
                interim += text;
              }
            }
            if (interim) {
              if (wsRef.current?.readyState !== WebSocket.OPEN) setPauseStatus('speaking');
            }
            const isWsActive = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
            if (!isWsActive && interim) {
              setInterimText(interim);
            }
          };

          recognition.onerror = (err: any) => {
            console.warn('[RealAudio] SpeechRecognition warning/error:', err.error);
            if (err.error === 'not-allowed') {
              setMicError('Microphone permission required');
            }
          };

          recognition.onend = () => {
            // Keep restarting recognition while mic is active
            if (isMicActiveRef.current && streamRef.current && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (_) {}
            }
          };

          recognition.start();
          console.log('[RealAudio] Native SpeechRecognition started.');
        } catch (recErr) {
          console.warn('[RealAudio] SpeechRecognition init fallback:', recErr);
        }
      } else {
        console.info('[RealAudio] Native SpeechRecognition API not supported, using volume VAD.');
      }
    } catch (err: any) {
      console.error('[RealAudio] Failed to access microphone:', err);
      setMicError(err.message || 'Microphone access denied');
      isMicActiveRef.current = false;
      setIsMicActive(false);
    }
  }, [selectedLanguage, appendFinalTranscript]);

  // 7. Start shared audio helper (listen to meeting / computer sound)
  const startSharedAudio = useCallback(async () => {
    try {
      console.log('[RealAudio] Requesting shared audio stream...');
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach((t) => t.stop());
        console.warn('[RealAudio] No audio track was selected in display media.');
        alert('No audio detected in shared screen/tab. Please ensure "Share audio" is checked in the browser/system picker.');
        return;
      }

      // Stop video tracks immediately since we only listen to audio
      displayStream.getVideoTracks().forEach((t) => t.stop());

      const audioStream = new MediaStream(audioTracks);
      attachSharedStream(audioStream);
    } catch (err: any) {
      console.warn('[RealAudio] Screen audio capture cancelled or failed:', err);
      setIsSharedAudioActive(false);
    }
  }, [attachSharedStream]);

  // 8. Toggle Shared Audio
  const toggleSharedAudio = useCallback(async () => {
    if (isSharedAudioActive) {
      stopSharedAudio();
    } else {
      await startSharedAudio();
    }
  }, [isSharedAudioActive, startSharedAudio, stopSharedAudio]);

  // 9. Stop and Continue (Mute/Unmute) Microphone
  const toggleMic = useCallback(async () => {
    if (isMicActive) {
      // Mute microphone
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      isMicActiveRef.current = false;
      setIsMicActive(false);
      setIsSpeaking(false);
      console.log('[RealAudio] Microphone stopped/muted.');
    } else {
      // Continue / unmute microphone
      if (streamRef.current && streamRef.current.getAudioTracks().some((t) => t.readyState === 'live')) {
        streamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        isMicActiveRef.current = true;
        setIsMicActive(true);
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (_) {}
        }
        console.log('[RealAudio] Microphone continued/unmuted.');
      } else {
        await startRealAudio();
      }
    }
  }, [isMicActive, startRealAudio]);

  // 10. Stop audio capture and cleanup
  const stopRealAudio = useCallback(() => {
    isMicActiveRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (tokenFlushTimerRef.current) {
      clearTimeout(tokenFlushTimerRef.current);
      tokenFlushTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sharedProcessorRef.current) {
      sharedProcessorRef.current.disconnect();
      sharedProcessorRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    stopSharedAudio();
    setIsMicActive(false);
    setIsSpeaking(false);
    setVolumeLevel(0);
  }, [stopSharedAudio]);

  // 11. WebSocket setup with auto-reconnection
  useEffect(() => {
    let isUnmounted = false;
    let reconnectTimeout: any = null;
    const effectiveToken = token || 'desktop-dev-token';

    const connectWs = () => {
      if (isUnmounted) return;

      // Close any existing active connection first to prevent dual sockets during hot reloads
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (_) {}
        wsRef.current = null;
      }

      try {
        let deviceId = '';
        if (typeof window !== 'undefined') {
          deviceId = localStorage.getItem('ghostove_device_id') || '';
          if (!deviceId) {
            deviceId = 'hud_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
            localStorage.setItem('ghostove_device_id', deviceId);
          }
        }
        const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac');
        const deviceOs = isMac ? 'macos' : 'windows';
        const deviceName = `${isMac ? 'Apple Mac' : 'Windows PC'} Stealth HUD`;

        let fullUrl = `${wsUrl}?token=${encodeURIComponent(effectiveToken)}`;
        if (sessionId) {
          fullUrl += `&session_id=${encodeURIComponent(sessionId)}`;
        }
        if (selectedLanguage) {
          fullUrl += `&language=${encodeURIComponent(selectedLanguage)}`;
        }
        if (deviceId) {
          fullUrl += `&device_id=${encodeURIComponent(deviceId)}&device_name=${encodeURIComponent(deviceName)}&device_os=${encodeURIComponent(deviceOs)}`;
        }
        const ws = new WebSocket(fullUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[RealAudio WS] Connected to backend websocket.');
          setIsBackendConnected(true);
          setInterimText('');
          setPauseStatus('idle');
          ws.send(JSON.stringify({
            type: 'audio_source',
            source: 'meeting_audio',
            enabled: isSharedAudioActiveRef.current,
            auto_answer: autoAnswerRef.current,
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'transcript') {
              const text = (data.text || '').trim();
              if (data.is_final && text) {
                const speaker = data.speaker || 'Interviewer';
                appendFinalTranscript(text, speaker, 'backend');
                setInterimText('');
              } else if (!data.is_final && text) {
                if (data.speaker !== 'You') {
                  setInterimText(text);
                }
              }
            } else if (data.type === 'pause_status') {
              const status = data.status || 'idle';
              setPauseStatus(status as any);
            } else if (data.type === 'question_detected') {
              // Validated interviewer question detected by Intent Guard or Screen Vision
              const text = (data.text || '').trim();
              if (text) {
                if (tokenFlushTimerRef.current) {
                  clearTimeout(tokenFlushTimerRef.current);
                  tokenFlushTimerRef.current = null;
                }
                tokenBufferRef.current = '';
                fullAnswerRef.current = '';

                const time = formatCurrentTime();
                const speakerLabel = data.speaker === 'Screen' ? 'Screen' : 'Audio';
                setInterimText('');
                setCurrentQuestion(text);
                setFullAnswer('');
                setIsGenerating(true);
                isGeneratingRef.current = true;
                setSourceType(`${speakerLabel} ${time}`);

                const newQA: QAItem = {
                  id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
                  question: text,
                  answer: '',
                  timestamp: time,
                  sourceType: `${speakerLabel} ${time}`,
                };

                setQaHistory((prev) => {
                  const next = [...prev, newQA];
                  qaHistoryRef.current = next;
                  currentQAIndexRef.current = next.length - 1;
                  setCurrentQAIndex(next.length - 1);
                  return next;
                });
              }
            } else if (data.type === 'llm_token') {
              if (!isGeneratingRef.current) {
                isGeneratingRef.current = true;
                setIsGenerating(true);
              }
              const tok = data.token || '';
              const isFirstToken = !fullAnswerRef.current;
              fullAnswerRef.current += tok;
              tokenBufferRef.current += tok;

              if (isFirstToken) {
                // Immediate 0ms flush for the very first token to deliver instantaneous perceived response
                setFullAnswer(fullAnswerRef.current);
                setStreamingToken(tok);
                tokenBufferRef.current = '';
              } else if (!tokenFlushTimerRef.current) {
                // Flush to React state at a throttled 35ms interval (~28 FPS) to eliminate microtask churn
                tokenFlushTimerRef.current = window.setTimeout(() => {
                  tokenFlushTimerRef.current = null;
                  setFullAnswer(fullAnswerRef.current);
                  if (tokenBufferRef.current) {
                    setStreamingToken(tokenBufferRef.current.slice(-1));
                    tokenBufferRef.current = '';
                  }
                }, 35);
              }
            } else if (data.type === 'llm_end') {
              if (tokenFlushTimerRef.current) {
                clearTimeout(tokenFlushTimerRef.current);
                tokenFlushTimerRef.current = null;
              }
              tokenBufferRef.current = '';
              isGeneratingRef.current = false;
              setIsGenerating(false);
              setStreamingToken(null);
              const finalAns = fullAnswerRef.current;
              setFullAnswer(finalAns);

              // Single commit of the final completed answer to QA history
              setQaHistory((hList) => {
                if (hList.length === 0) return hList;
                const lastIdx = hList.length - 1;
                const updatedList = [...hList];
                updatedList[lastIdx] = {
                  ...updatedList[lastIdx],
                  answer: finalAns,
                };
                qaHistoryRef.current = updatedList;
                return updatedList;
              });
            } else if (data.type === 'llm_reset') {
              if (tokenFlushTimerRef.current) {
                clearTimeout(tokenFlushTimerRef.current);
                tokenFlushTimerRef.current = null;
              }
              tokenBufferRef.current = '';
              fullAnswerRef.current = '';
              setFullAnswer('');
              setStreamingToken('');
            } else if (
              data.type === 'error' &&
              !['concurrent_session_blocked', 'device_limit_exceeded'].includes(data.code)
            ) {
              const errorMessage = `⚠️ ${data.message || 'Ghostove could not analyze the screenshot or generate an answer. Please try again.'}`;
              if (data.code === 'stt_provider_unavailable') {
                setMicError(data.message || 'Live speech recognition could not connect.');
              }
              fullAnswerRef.current = errorMessage;
              if (tokenFlushTimerRef.current) {
                clearTimeout(tokenFlushTimerRef.current);
                tokenFlushTimerRef.current = null;
              }
              tokenBufferRef.current = '';
              isGeneratingRef.current = false;
              setIsGenerating(false);
              setStreamingToken(null);
              setFullAnswer(errorMessage);
              setQaHistory((hList) => {
                if (hList.length === 0) return hList;
                const lastIdx = hList.length - 1;
                const updatedList = [...hList];
                updatedList[lastIdx] = { ...updatedList[lastIdx], answer: errorMessage };
                qaHistoryRef.current = updatedList;
                return updatedList;
              });
            } else if (data.type === 'quota_update') {
              const quota = data.quota || {};
              const remaining = quota.is_unlimited
                ? quota.daily_seconds_remaining
                : quota.total_seconds_remaining;
              if (Number.isFinite(Number(remaining))) {
                const normalizedRemaining = Math.max(0, Number(remaining));
                setRemainingSeconds(normalizedRemaining);
                if (normalizedRemaining === 0) {
                  const dailyLimitReached = Boolean(quota.is_unlimited);
                  setQuotaExhausted({
                    message: dailyLimitReached
                      ? 'You have reached today’s session-time limit. Your allowance resets tomorrow at 00:00 UTC.'
                      : 'Your available session time has been used. Add time to continue.',
                    reason: dailyLimitReached ? 'daily_cap_reached' : 'quota_exhausted',
                  });
                }
              }
            } else if (data.type === 'quota_exhausted') {
              console.warn('[RealAudio WS] Quota exhausted:', data.message);
              setRemainingSeconds(0);
              setQuotaExhausted({
                message: data.message || 'Your available session time has been used. Add time to continue.',
                reason: 'quota_exhausted',
              });
              setFullAnswer('⚠️ ' + (data.message || 'Demo session finished (10 minutes used). Please upgrade in your web dashboard to continue.'));
            } else if (data.type === 'daily_cap_reached') {
              console.warn('[RealAudio WS] Daily cap reached:', data.message);
              setRemainingSeconds(0);
              setQuotaExhausted({
                message: data.message || 'You have reached today’s session-time limit. Your allowance resets tomorrow at 00:00 UTC.',
                reason: 'daily_cap_reached',
              });
              setFullAnswer('⏳ ' + (data.message || 'Daily limit reached (2 hours). Your quota will reset tomorrow at 00:00 UTC.'));
            } else if (data.type === 'error' && data.code === 'concurrent_session_blocked') {
              console.error('[RealAudio WS] Concurrent session blocked');
              setFullAnswer('🔒 ' + (data.message || 'Another live interview session is already active on this account. Simultaneous calls are disabled.'));
            } else if (data.type === 'error' && data.code === 'device_limit_exceeded') {
              console.error('[RealAudio WS] Device limit exceeded');
              setFullAnswer('🚫 ' + (data.message || 'Device limit exceeded (max 3 devices). Revoke an unused device in your web dashboard.'));
            }
          } catch (_) {}
        };

        ws.onclose = (event: CloseEvent) => {
          if (wsRef.current !== ws) return;
          if (!isUnmounted) {
            setIsBackendConnected(false);
            console.log(`[RealAudio WS] Disconnected (code: ${event.code}).`);
            // Do not reconnect automatically if blocked by security lock or quota
            if (event.code === 4001 || event.code === 4002 || event.code === 4003) {
              console.warn(`[RealAudio WS] Connection stopped permanently due to code ${event.code}.`);
              return;
            }
            console.log('[RealAudio WS] Reconnecting in 2.0s...');
            reconnectTimeout = setTimeout(connectWs, 2000);
          }
        };

        ws.onerror = (err) => {
          if (wsRef.current !== ws) return;
          console.warn('[RealAudio WS] WebSocket error:', err);
          setIsBackendConnected(false);
        };
      } catch (e) {
        if (!isUnmounted) {
          reconnectTimeout = setTimeout(connectWs, 2000);
        }
      }
    };

    connectWs();

    return () => {
      isUnmounted = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token, wsUrl, sessionId, selectedLanguage, appendFinalTranscript, quotaRefreshKey]);

  // 12. Auto-start real audio on mount
  useEffect(() => {
    startRealAudio();
    return () => {
      stopRealAudio();
    };
  }, [startRealAudio, stopRealAudio]);

  // 13. Automatically attach pre-connected shared meeting audio stream
  useEffect(() => {
    if (initialSharedStream) {
      attachSharedStream(initialSharedStream);
    }
  }, [initialSharedStream, attachSharedStream]);

  // 14. Auto-resume suspended AudioContext on first user interaction (WebKit / macOS policy)
  useEffect(() => {
    const resumeAudio = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('click', resumeAudio);
    window.addEventListener('keydown', resumeAudio);
    window.addEventListener('pointerdown', resumeAudio);
    return () => {
      window.removeEventListener('click', resumeAudio);
      window.removeEventListener('keydown', resumeAudio);
      window.removeEventListener('pointerdown', resumeAudio);
    };
  }, []);

  return {
    isMicActive,
    isSharedAudioActive,
    isBackendConnected,
    isSpeaking,
    volumeLevel,
    micError,
    quotaExhausted,
    remainingSeconds,
    refreshQuota,
    startRealAudio,
    stopRealAudio,
    toggleMic,
    toggleSharedAudio,
    transcriptList,
    interimText,
    currentQuestion,
    fullAnswer,
    isGenerating,
    streamingToken,
    sourceType,
    askQuestion,
    analyzeScreenshot,
    solveCodingScreen: analyzeScreenshot,
    take_screenshot_of_code: analyzeScreenshot,
    takeScreenshotOfCode: analyzeScreenshot,
    clearAnswer,
    clearTranscripts,
    setCurrentQuestion,
    setFullAnswer,
    qaHistory,
    currentQAIndex,
    goToPrevQA,
    goToNextQA,
    pauseStatus,
    isWaitingForPause: pauseStatus === 'pausing',
  };
}
