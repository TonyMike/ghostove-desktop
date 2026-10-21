import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  CircleHelp,
  Headphones,
  LoaderCircle,
  Mic,
  Monitor,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  openPrivacySettings,
  usesNativeMacSystemAudio,
  startNativeSystemAudioCapture,
  stopNativeSystemAudioCapture,
  startDragging,
} from "../utils/windowManager";
import { markAudioOnboardingComplete } from '../utils/onboarding';

type StepIndex = 0 | 1 | 2;
type Platform = 'macOS' | 'Windows';

interface AudioOnboardingScreenProps {
  onComplete: () => void;
}

function getPlatform(): Platform {
  return /Mac|iPhone|iPad/i.test(`${navigator.platform} ${navigator.userAgent}`) ? 'macOS' : 'Windows';
}

function measureRms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
  return Math.sqrt(sum / samples.length);
}

function ScreenshotPlaceholder({ platform, step }: { platform: Platform; step: StepIndex }) {
  const title =
    step === 0
      ? platform === "macOS"
        ? "Microphone permission"
        : "Microphone settings"
      : step === 1
        ? platform === "macOS"
          ? "Screen & System Audio Recording"
          : "Choose a window and share audio"
        : "Microphone check";

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[26px] border border-white/10 bg-[#0d1413] p-7">
      <div className="absolute inset-0 opacity-40" aria-hidden="true">
        <div className="h-full w-full" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
      </div>
      <div className="relative w-full max-w-[700px]">
        <div className="mb-4 flex items-center gap-2 text-xs font-medium text-slate-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          {platform} guide · {title}
        </div>
        {step === 2 ? <AudioTestPreview /> : platform === 'macOS' && step === 0 ? <MacMicrophonePreview /> : platform === 'macOS' ? <MacSystemAudioPreview /> : step === 0 ? <WindowsMicrophonePreview /> : <WindowsAudioPickerPreview />}
        <p className="mt-4 text-center text-xs text-slate-500">
          Screenshot slot — your {platform} capture can replace this preview.
        </p>
      </div>
    </div>
  );
}

function MacMicrophonePreview() {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-300 bg-[#f3f3f5] p-8 text-slate-800">
      <div className="w-full max-w-[470px] rounded-[22px] bg-white p-7 shadow-xl shadow-black/20">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-700 text-white"><Mic className="h-7 w-7" /></div>
        <h3 className="text-lg font-semibold leading-6">Ghostove Desktop would like to access the microphone.</h3>
        <p className="mt-3 text-sm leading-5 text-slate-600">Allow microphone access so Ghostove can test your audio. Your mic stays off until you turn it on in a session.</p>
        <div className="mt-6 flex justify-end gap-2">
          <span className="rounded-full bg-slate-100 px-5 py-2 text-sm">Don’t Allow</span>
          <span className="rounded-full bg-blue-500 px-7 py-2 text-sm font-semibold text-white">Allow</span>
        </div>
      </div>
    </div>
  );
}

function MacSystemAudioPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-300/80 bg-[#f7f8f9] text-slate-800">
      <div className="flex h-10 items-center gap-2 border-b border-slate-200 bg-[#eceff1] px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-[11px] font-semibold text-slate-500">
          System Settings · Privacy &amp; Security
        </span>
      </div>
      <div className="min-h-[320px] p-7">
        <h3 className="text-lg font-semibold">
          Screen &amp; System Audio Recording
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Allow apps to record screen content and system audio.
        </p>
        <div className="mt-7 space-y-3 rounded-2xl border border-slate-200/80 bg-white/50 p-3">
          {["Zoom", "Ghostove Desktop", "Google Chrome"].map((app) => (
            <div
              key={app}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${app === "Ghostove Desktop" ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}
            >
              <span className="flex items-center gap-3 text-sm">
                <span className="h-8 w-8 rounded-lg bg-slate-200" />
                {app}
              </span>
              <span
                className={`h-5 w-9 rounded-full p-0.5 ${app === "Ghostove Desktop" ? "bg-blue-500" : "bg-slate-300"}`}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-white ${app === "Ghostove Desktop" ? "ml-auto" : ""}`}
                />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WindowsMicrophonePreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-300 bg-[#f7f8fa] text-slate-800">
      <div className="flex h-10 items-center border-b border-slate-200 bg-white px-5 text-xs font-semibold text-slate-500">Settings</div>
      <div className="min-h-[320px] p-7">
        <p className="text-xs text-slate-500">Privacy &amp; security &nbsp;›&nbsp; Microphone</p>
        <h3 className="mt-2 text-xl font-semibold">Microphone</h3>
        <div className="mt-6 space-y-3">
          {['Microphone access', 'Let apps access your microphone', 'Let desktop apps access your microphone'].map((label, index) => (
            <div key={label} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${index === 2 ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}>
              <div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-[11px] text-slate-500">Turn this setting on to continue.</p></div>
              <span className="h-5 w-9 rounded-full bg-blue-500 p-0.5"><span className="ml-auto block h-4 w-4 rounded-full bg-white" /></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WindowsAudioPickerPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-300 bg-[#f7f8fa] text-slate-800">
      <div className="flex h-10 items-center border-b border-slate-200 bg-white px-5 text-xs font-semibold text-slate-600">Share a window or screen</div>
      <div className="min-h-[320px] p-6">
        <div className="mb-5 flex gap-5 border-b border-slate-200 pb-3 text-xs font-medium text-blue-600"><span>Window or screen</span><span className="text-slate-500">Browser tab</span></div>
        <div className="grid grid-cols-3 gap-3">
          {['Entire screen', 'Meeting window', 'Browser tab'].map((label, index) => (
            <div key={label} className={`rounded-xl border p-2 ${index === 1 ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}>
              <div className="mb-2 flex h-20 items-center justify-center rounded-lg bg-slate-200"><Monitor className="h-7 w-7 text-slate-500" /></div>
              <p className="text-center text-[11px] font-medium">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
          <span className="flex items-center gap-2 text-sm"><span className="flex h-5 w-5 items-center justify-center rounded bg-blue-500 text-white"><Check className="h-4 w-4" /></span>Share audio</span>
          <span className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white">Share</span>
        </div>
      </div>
    </div>
  );
}

function AudioTestPreview() {
  return (
    <div className="flex min-h-[360px] flex-col justify-center gap-8 rounded-2xl border border-white/10 bg-[#111917] p-9">
      <div>
        <p className="text-sm font-semibold text-white">Microphone check</p>
        <p className="mt-1 text-xs text-slate-400">
          Your voice stays on this device during the test.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
          <Mic className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-2 text-xs font-medium text-slate-300">
            Microphone
          </div>
          <div className="flex h-10 items-center gap-1">
            {[20, 35, 52, 30, 68, 44, 77, 40, 62, 27, 48, 32].map(
              (height, index) => (
                <span
                  key={index}
                  className="w-2 rounded-full bg-emerald-400/70"
                  style={{ height: `${height}%` }}
                />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AudioOnboardingScreen({ onComplete }: AudioOnboardingScreenProps) {
  const platform = getPlatform();
  const nativeMac = usesNativeMacSystemAudio();
  const [completed, setCompleted] = useState([false, false, false]);
  const [busyStep, setBusyStep] = useState<StepIndex | null>(null);
  const [activeStep, setActiveStep] = useState<StepIndex>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const computerStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const meterCleanupRef = useRef<(() => void)[]>([]);
  const stopNativeRef = useRef(false);
  const cancelTestRef = useRef(false);
  const micDetectedRef = useRef(false);

  const stopMeters = useCallback(() => {
    meterCleanupRef.current.forEach((cleanup) => cleanup());
    meterCleanupRef.current = [];
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    setMicLevel(0);
  }, []);

  const stopComputerStream = useCallback(() => {
    computerStreamRef.current?.getTracks().forEach((track) => track.stop());
    computerStreamRef.current = null;
  }, []);

  useEffect(() => () => {
    meterCleanupRef.current.forEach((cleanup) => cleanup());
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    computerStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (stopNativeRef.current) void stopNativeSystemAudioCapture();
  }, []);

  const resetFrom = useCallback((index: StepIndex) => {
    setErrorMessage(null);
    if (index <= 2) stopMeters();
    if (index <= 1) stopComputerStream();
    if (index <= 1 && stopNativeRef.current) {
      stopNativeRef.current = false;
      void stopNativeSystemAudioCapture();
    }
    setIsTesting(false);
    setCompleted((previous) => previous.map((value, stepIndex) => stepIndex < index ? value : false));
  }, [stopComputerStream, stopMeters]);

  const setStepComplete = (index: StepIndex) => {
    setCompleted((previous) => previous.map((value, stepIndex) => stepIndex === index ? true : stepIndex > index ? false : value));
  };

  const enableMicrophone = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false },
    });
    stream.getTracks().forEach((track) => track.stop());
    setStepComplete(0);
    setActiveStep(1);
  };

  const enableComputerAudio = async () => {
    if (nativeMac) {
      await startNativeSystemAudioCapture();
      stopNativeRef.current = true;
      try {
        await stopNativeSystemAudioCapture();
      } finally {
        stopNativeRef.current = false;
      }
    } else {
      // Call getDisplayMedia directly from the switch click so the OS picker
      // receives the transient user gesture it requires.
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const audioTracks = displayStream.getAudioTracks();
      displayStream.getVideoTracks().forEach((track) => track.stop());
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach((track) => track.stop());
        throw new Error('No audio was shared. Choose a source and enable Share audio in the picker.');
      }
      stopComputerStream();
      computerStreamRef.current = new MediaStream(audioTracks);
    }
    setStepComplete(1);
    setActiveStep(2);
  };

  const addMeter = (stream: MediaStream, context: AudioContext) => {
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const mutedOutput = context.createGain();
    mutedOutput.gain.value = 0;
    analyser.connect(mutedOutput);
    mutedOutput.connect(context.destination);
    const data = new Float32Array(analyser.fftSize);
    let lastUpdate = 0;
    let raf = 0;
    const tick = (timestamp: number) => {
      if (timestamp - lastUpdate >= 80) {
        lastUpdate = timestamp;
        analyser.getFloatTimeDomainData(data);
        const level = Math.min(1, measureRms(data) * 7);
        if (level > 0.012) micDetectedRef.current = true;
        setMicLevel(level);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  };

  const runAudioTest = async () => {
    setIsTesting(true);
    cancelTestRef.current = false;
    setErrorMessage(null);
    micDetectedRef.current = false;
    setMicLevel(0);
    let context: AudioContext | null = null;
    const cleanups: (() => void)[] = [];

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false },
      });
      micStreamRef.current = micStream;
      context = new AudioContext();
      if (context.state === 'suspended') await context.resume();
      cleanups.push(addMeter(micStream, context));

      const timeoutAt = Date.now() + 30000;
      while (Date.now() < timeoutAt) {
        if (cancelTestRef.current) throw new Error('Audio test stopped. Turn the switch on to try again.');
        if (micDetectedRef.current) break;
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }

      if (!micDetectedRef.current) {
        throw new Error(
          "We have not heard your microphone yet. Speak into it and try again.",
        );
      }

      setStepComplete(2);
      setIsTesting(false);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Audio test could not start. Check your permissions and try again.');
      setIsTesting(false);
    } finally {
      cleanups.forEach((cleanup) => cleanup());
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
      if (context && context.state !== 'closed') await context.close().catch(() => undefined);
    }
  };

  const toggleStep = async (index: StepIndex) => {
    setActiveStep(index);
    if (index === 2 && isTesting) {
      cancelTestRef.current = true;
      setErrorMessage('Stopping the audio test…');
      return;
    }
    if (completed[index]) {
      resetFrom(index);
      return;
    }
    if (index > 0 && !completed[index - 1]) return;
    setBusyStep(index);
    setErrorMessage(null);
    try {
      if (index === 0) await enableMicrophone();
      else if (index === 1) await enableComputerAudio();
      else await runAudioTest();
    } catch (error: any) {
      setErrorMessage(error?.message || 'This permission could not be verified. Follow the guide and try again.');
    } finally {
      setBusyStep(null);
    }
  };

  const steps = [
    {
      title: "Allow microphone access",
      description: "Check your mic. It stays off until enabled in a session.",
      icon: Mic,
    },
    {
      title:
        platform === "macOS" ? "Allow computer audio" : "Choose computer audio",
      description:
        platform === "macOS"
          ? "Let Ghostove hear your call audio."
          : "Choose your meeting window and share its audio.",
      icon: Headphones,
    },
    {
      title: "Test your microphone",
      description: "Speak into your mic to check that it’s working.",
      icon: AudioLines,
    },
  ];

  return (
    <main className="flex h-full min-h-0 w-full overflow-hidden rounded-3xl bg-[#070b0a] text-slate-100">
      <section className="flex min-h-0 w-[43%] min-w-[340px] max-w-[400px] flex-col overflow-hidden border-r border-white/10 px-6 py-5">
        <div
          data-tauri-drag-region
          onMouseDown={(event) => {
            if (event.button === 0) void startDragging();
          }}
          className="flex cursor-move items-center gap-2 text-sm font-semibold text-slate-200"
          title="Drag to move Ghostove"
        >
          <img src="/ghostove-icon.svg" alt="" className="h-7 w-7 rounded-lg" />
          Ghostove
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-7 pr-2 pb-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
            Audio setup · {completed.filter(Boolean).length}/3
          </p>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em] text-white">
            Set up your audio
          </h1>
          <p className="mt-2 max-w-sm text-[13px] leading-5 text-slate-400">
            Help Ghostove hear you and your call.
          </p>

          <div className="mt-6 space-y-2.5">
            {steps.map((step, index) => {
              const stepIndex = index as StepIndex;
              const isDone = completed[index];
              const isOn = isDone || (stepIndex === 2 && isTesting);
              const isLocked = index > 0 && !completed[index - 1];
              const isCurrent = activeStep === index;
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className={`rounded-xl border p-3 transition-colors ${isCurrent ? "border-emerald-400/50 bg-[#131c19]" : isLocked ? "border-white/[0.06] bg-white/[0.025] opacity-45" : "border-white/10 bg-white/[0.04]"}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isDone ? "bg-emerald-400/15 text-emerald-300" : isCurrent ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-slate-500"}`}
                    >
                      {isDone ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2
                        className={`text-[13px] font-semibold leading-5 ${isLocked ? "text-slate-400" : "text-white"}`}
                      >
                        {step.title}
                      </h2>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
                        {step.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      aria-label={`${isOn ? "Disable" : "Enable"} ${step.title}`}
                      aria-busy={busyStep === stepIndex}
                      disabled={
                        isLocked ||
                        isDone ||
                        (busyStep !== null && !(stepIndex === 2 && isTesting))
                      }
                      onClick={() => void toggleStep(stepIndex)}
                      className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed ${isOn ? "bg-emerald-400" : "bg-slate-700"} ${isLocked ? "cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span
                        className={`pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${isOn ? "translate-x-5" : "translate-x-0"}`}
                      />
                    </button>
                  </div>
                  {busyStep === stepIndex && (
                    <div
                      className="mt-3 flex items-center gap-2 pl-11 text-xs text-emerald-200"
                      role="status"
                    >
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      {stepIndex === 2
                        ? "Listening for both audio sources…"
                        : "Checking permission…"}
                    </div>
                  )}
                  {stepIndex === 2 && isTesting && (
                    <div className="mt-4 space-y-3 pl-11">
                      <AudioLevel label="Microphone" level={micLevel} />
                    </div>
                  )}
                  {stepIndex === 2 && isDone && (
                    <div
                      className="mt-3 pl-11 text-xs font-medium text-emerald-300"
                      role="status"
                    >
                      Microphone is working.
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-xs leading-5 text-rose-200"
            >
              {errorMessage}
              {activeStep < 2 && (
                <button
                  type="button"
                  className="ml-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                  onClick={() => void toggleStep(activeStep)}
                >
                  <RotateCcw className="h-3 w-3" /> Try again
                </button>
              )}
              {(activeStep === 0 ||
                (activeStep === 1 && platform === "macOS")) && (
                <button
                  type="button"
                  className="ml-3 inline-flex items-center font-semibold underline underline-offset-2"
                  onClick={() =>
                    void openPrivacySettings(
                      activeStep === 1 ? "screen" : "microphone",
                    )
                  }
                >
                  Open{" "}
                  {activeStep === 1 ? "Screen & System Audio" : "Microphone"}{" "}
                  Settings
                </button>
              )}
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 text-[10px] leading-4 text-slate-500">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <p>
              Turning off a step resets later steps. Revoke access in system
              settings.
            </p>
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 pt-3">
          {completed.every(Boolean) ? (
            <button
              type="button"
              onClick={() => {
                markAudioOnboardingComplete();
                onComplete();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-[13px] font-bold text-slate-950 transition-colors hover:bg-emerald-300"
            >
              Finish setup <Check className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2 text-[10px] leading-4 text-slate-500">
              <CircleHelp className="h-4 w-4 shrink-0" /> Change permissions
              later in system settings.
            </div>
          )}
        </div>
      </section>

      <section
        className="flex min-w-0 flex-1 flex-col p-4"
        aria-label={`${platform} setup guide`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[11px] font-medium text-slate-400">
            {platform} setup guide
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Monitor className="h-3 w-3" /> OS settings open separately
          </div>
        </div>
        <ScreenshotPlaceholder platform={platform} step={activeStep} />
        {activeStep === 2 && isTesting && (
          <p className="mt-3 text-center text-xs text-slate-400">
            Speak into your mic. We’ll confirm when the meter moves.
          </p>
        )}
      </section>
    </main>
  );
}

function AudioLevel({ label, level }: { label: string; level: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-[11px] text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
        <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-100" style={{ width: `${Math.max(level * 100, level > 0.01 ? 5 : 0)}%` }} />
      </div>
      <span className="w-14 text-right text-[10px] font-medium text-slate-500">{level > 0.012 ? 'Detected' : 'Waiting'}</span>
    </div>
  );
}
