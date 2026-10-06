import { useEffect, useRef, useState, useCallback } from 'react';
import { floatTo16BitPCM, resampleTo16kHz } from '../utils/pcmEncoder';

interface UseAudioCaptureProps {
  onAudioData: (pcmBuffer: ArrayBuffer) => void;
  isStreaming: boolean;
}

export function useAudioCapture({ onAudioData, isStreaming }: UseAudioCaptureProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silenceTimerRef = useRef<number | null>(null);

  const startCapture = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      // ScriptProcessorNode 4096 buffer size
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!isStreaming) return;
        const inputData = e.inputBuffer.getChannelData(0);

        // Calculate audio RMS volume for speaking visualizer
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const normalizedVol = Math.min(1, rms * 10);
        setVolumeLevel(normalizedVol);

        if (normalizedVol > 0.05) {
          setIsSpeaking(true);
          if (silenceTimerRef.current) {
            window.clearTimeout(silenceTimerRef.current);
          }
          silenceTimerRef.current = window.setTimeout(() => {
            setIsSpeaking(false);
          }, 400);
        }

        const resampled = resampleTo16kHz(inputData, audioCtx.sampleRate);
        const pcmBuffer = floatTo16BitPCM(resampled);
        onAudioData(pcmBuffer);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      setIsCapturing(true);
      console.log('[AudioCapture] Mic capture started at 16kHz.');
    } catch (err: any) {
      console.error('[AudioCapture] Mic capture error:', err);
      setError(err.message || 'Microphone access denied');
      setIsCapturing(false);
    }
  }, [isStreaming, onAudioData]);

  const stopCapture = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
    console.log('[AudioCapture] Audio capture stopped.');
  }, []);

  useEffect(() => {
    if (isStreaming && !isCapturing) {
      startCapture();
    } else if (!isStreaming && isCapturing) {
      stopCapture();
    }
    return () => {
      stopCapture();
    };
  }, [isStreaming, isCapturing, startCapture, stopCapture]);

  return { isCapturing, isSpeaking, volumeLevel, error, startCapture, stopCapture };
}
