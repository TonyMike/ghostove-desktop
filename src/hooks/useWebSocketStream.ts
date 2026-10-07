import { useState, useEffect, useRef, useCallback } from 'react';
import { WS_URL } from '../utils/config';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'transcribing' | 'generating' | 'quota_exhausted';

export interface TranscriptItem {
  id: string;
  text: string;
  isFinal: boolean;
  speaker: string; // 'You' | 'Interviewer'
  timestamp: string; // e.g. '16:55'
}

interface UseWebSocketStreamProps {
  token: string | null;
  wsUrl?: string;
}

function formatCurrentTime(): string {
  const d = new Date();
  const hrs = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${hrs}:${mins}`;
}

export function useWebSocketStream({ token, wsUrl = WS_URL }: UseWebSocketStreamProps) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [transcript, setTranscript] = useState<{ text: string; isFinal: boolean } | null>(null);
  const [interimText, setInterimText] = useState<string>('');
  const [transcriptList, setTranscriptList] = useState<TranscriptItem[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [sourceType, setSourceType] = useState<string>('');
  const [streamingToken, setStreamingToken] = useState<string | null>(null);
  const [fullAnswer, setFullAnswer] = useState<string>('');
  const [quotaExhausted, setQuotaExhausted] = useState<{ message: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const sendAudio = useCallback((pcmBuffer: ArrayBuffer) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(pcmBuffer);
    }
  }, []);

  const sendJSON = useCallback((payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const clearAnswer = useCallback(() => {
    setCurrentQuestion('');
    setFullAnswer('');
    setStreamingToken(null);
  }, []);

  const clearTranscripts = useCallback(() => {
    setTranscriptList([]);
    setInterimText('');
    setTranscript(null);
  }, []);

  const askQuestion = useCallback((questionText: string, source: string = 'Chat') => {
    if (!questionText.trim()) return;
    const time = formatCurrentTime();
    setCurrentQuestion(questionText.trim());
    setFullAnswer('');
    setStreamingToken('');
    setStatus('generating');
    setSourceType(`${source} ${time}`);

    // Append to transcript as a new recognized prompt
    setTranscriptList((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        text: questionText.trim(),
        isFinal: true,
        speaker: 'You',
        timestamp: time,
      },
    ]);

    // Send to WebSocket if open
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'ask_question',
          text: questionText.trim(),
        })
      );
    } else {
      setFullAnswer('Connecting to backend AI streaming engine...');
      setStatus('connected');
      setStreamingToken(null);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');
    const fullUrl = `${wsUrl}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(fullUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS Stream] Connected to backend websocket.');
      setStatus('connected');
      setQuotaExhausted(null);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const msgType = data.type;

        if (msgType === 'transcript') {
          setStatus('transcribing');
          const isFinal = Boolean(data.is_final);
          const text = (data.text || '').trim();

          setTranscript({ text, isFinal });

          if (isFinal && text) {
            setInterimText('');
            const time = formatCurrentTime();
            setTranscriptList((prev) => [
              ...prev,
              {
                id: Date.now().toString(),
                text,
                isFinal: true,
                speaker: 'You',
                timestamp: time,
              },
            ]);

            // If it ends with ? or contains question indicators, set as current question
            if (
              text.endsWith('?') ||
              /^(can|could|how|what|why|tell|explain|describe|who|where|when)/i.test(text)
            ) {
              setCurrentQuestion(text);
              setFullAnswer('');
              setSourceType(`Audio ${time}`);
            }
          } else if (!isFinal && text) {
            setInterimText(text);
          }
        } else if (msgType === 'llm_token') {
          setStatus('generating');
          setStreamingToken(data.token);
          setFullAnswer((prev) => prev + data.token);
        } else if (msgType === 'llm_end') {
          setStatus('connected');
          setStreamingToken(null);
        }
      } catch (e) {
        // Ignore non-json frames
      }
    };

    ws.onerror = (err) => {
      console.error('[WS Stream] WebSocket error:', err);
    };

    ws.onclose = (event) => {
      console.log(`[WS Stream] WebSocket closed code: ${event.code}`);
      setStatus('disconnected');
    };


    return () => {
      if (ws) ws.close();
    };
  }, [token, wsUrl]);

  return {
    status,
    transcript,
    interimText,
    transcriptList,
    currentQuestion,
    sourceType,
    streamingToken,
    fullAnswer,
    quotaExhausted,
    sendAudio,
    sendJSON,
    askQuestion,
    clearAnswer,
    clearTranscripts,
    setCurrentQuestion,
    setFullAnswer,
  };
}

