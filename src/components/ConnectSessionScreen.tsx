import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Upload,
  Play,
  Loader2,
  Volume2,
  Mic,
  Headphones,
  CheckCircle2,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { openBrowserUrl } from '../utils/browser';
import { SessionItem } from './SessionSelectScreen';
import { AudioPermissionModal } from './AudioPermissionModal';
import {
  checkSystemPermissions,
  openPrivacySettings,
  startNativeSystemAudioCapture,
  stopNativeSystemAudioCapture,
  usesNativeMacSystemAudio,
} from '../utils/windowManager';
import type { SystemPermissions } from '../utils/windowManager';

interface ConnectSessionScreenProps {
  session?: SessionItem | null;
  onConnect: (sharedStream?: MediaStream | null, startNativeSystemAudio?: boolean) => void;
  onBack: () => void;
  hasAccess?: boolean;
  onUpgradeRequired?: () => void;
  onCheckTime?: () => Promise<boolean>;
}

export function ConnectSessionScreen({
  session,
  onConnect,
  onBack,
  hasAccess = true,
  onUpgradeRequired,
  onCheckTime,
}: ConnectSessionScreenProps) {
  const nativeMacPlatform = usesNativeMacSystemAudio();
  const requiresMeetingAudio = !((session?.mode || '').toLowerCase().includes('mock'));
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionType, setPermissionType] = useState<'mic' | 'share_audio'>('share_audio');
  const [checkingAudio, setCheckingAudio] = useState(false);
  const [systemPermissions, setSystemPermissions] = useState<SystemPermissions | null>(null);
  const [includeMeetingAudio, setIncludeMeetingAudio] = useState(
    () => requiresMeetingAudio && nativeMacPlatform
  );
  const [selectingSharedAudio, setSelectingSharedAudio] = useState(false);
  const [sharedAudioSelectionError, setSharedAudioSelectionError] = useState<string | null>(null);
  const sharedAudioStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    sharedAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
    sharedAudioStreamRef.current = null;
  }, []);

  useEffect(() => {
    let isMounted = true;
    checkSystemPermissions().then((permissions) => {
      if (isMounted) setSystemPermissions(permissions);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleIncludeMeetingAudioChange = (checked: boolean) => {
    setSharedAudioSelectionError(null);
    if (nativeMacPlatform) {
      setIncludeMeetingAudio(checked);
      return;
    }
    if (!checked) {
      sharedAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
      sharedAudioStreamRef.current = null;
      setIncludeMeetingAudio(false);
      return;
    }

    // Preserve the picker gesture on platforms that still use WebView capture.
    const capturePromise = navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    setIncludeMeetingAudio(true);
    setSelectingSharedAudio(true);
    void capturePromise.then(async (displayStream) => {
      displayStream.getVideoTracks().forEach((track) => track.stop());
      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach((track) => track.stop());
        setIncludeMeetingAudio(false);
        setSharedAudioSelectionError('No audio track was returned. Choose a source that supports audio and enable Share audio.');
        return;
      }
      sharedAudioStreamRef.current = new MediaStream(audioTracks);
    }).catch(async (error: any) => {
      console.warn('[Ghostove] Computer audio selection failed:', error);
      setIncludeMeetingAudio(false);
      const permissions = await checkSystemPermissions();
      if (!permissions.screen_capture) {
        setShowPermissionModal(true);
        setSharedAudioSelectionError('macOS has not granted screen recording to Ghostove Desktop. Enable it in System Settings and reopen Ghostove.');
      } else {
        setSharedAudioSelectionError(
          error?.name === 'InvalidStateError'
            ? 'macOS did not open the picker from this click. Click the checkbox again to retry.'
            : 'Audio selection was cancelled or denied. Click the checkbox again, then choose a source with Share audio enabled.'
        );
      }
    }).finally(() => setSelectingSharedAudio(false));
  };

  const handleOpenTutorial = () => {
    openBrowserUrl('https://www.youtube.com/results?search_query=ghostove+tutorial');
  };

  const handleOpenMockVideo = () => {
    openBrowserUrl('https://www.youtube.com/watch?v=s0bXh_dYtps');
  };

  const handleConnectClick = async () => {
    setCheckingAudio(true);
    setSharedAudioSelectionError(null);
    if (onCheckTime) {
      const canStart = await onCheckTime();
      if (!canStart) {
        setCheckingAudio(false);
        return;
      }
    }

    if (!hasAccess) {
      if (onUpgradeRequired) {
        onUpgradeRequired();
        setCheckingAudio(false);
        return;
      }
    }

    // Request microphone permission before the interview starts, but stop this
    // preflight stream immediately. The HUD microphone stays off until opted in.
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
      micStream.getTracks().forEach((track) => track.stop());
      const permissions = await checkSystemPermissions();
      setSystemPermissions(permissions);
    } catch (error) {
      console.warn('[Ghostove] Microphone permission preflight failed:', error);
      setCheckingAudio(false);
      setPermissionType('mic');
      setShowPermissionModal(true);
      return;
    }

    // Live sessions require a separate interviewer/system-audio source.
    if (requiresMeetingAudio && !includeMeetingAudio) {
      setSharedAudioSelectionError('Computer audio is required to start a live session. Select and enable it above.');
      setCheckingAudio(false);
      return;
    }

    const nativeMacAudio = requiresMeetingAudio && nativeMacPlatform;
    let sharedAudioStream: MediaStream | null = null;
    if (nativeMacAudio) {
      // ScreenCaptureKit is the source of truth for this permission. The
      // legacy CoreGraphics preflight can disagree with TCC for a packaged
      // app, so don't block capture based on that separate status check.
      // Starting a short capture here also lets macOS request access before
      // the session begins; the HUD starts capture again after mounting.
      let captureStarted = false;
      try {
        await startNativeSystemAudioCapture();
        captureStarted = true;
        await stopNativeSystemAudioCapture();
        captureStarted = false;
      } catch (error: any) {
        if (captureStarted) {
          try {
            await stopNativeSystemAudioCapture();
          } catch (_) {}
        }
        console.warn('[Ghostove] System-audio permission preflight failed:', error);
        setSharedAudioSelectionError(
          `Ghostove could not start macOS system-audio capture: ${error?.message || String(error)}. Check Screen & System Audio Recording access in System Settings, then retry.`
        );
        setCheckingAudio(false);
        return;
      }
    } else if (requiresMeetingAudio) {
      const audioTrack = sharedAudioStreamRef.current?.getAudioTracks().find(
        (track) => track.readyState === 'live' && track.enabled
      );
      if (!audioTrack) {
        setSharedAudioSelectionError('Choose a display or meeting window and enable Share audio before starting the session.');
        setCheckingAudio(false);
        return;
      }
      sharedAudioStream = sharedAudioStreamRef.current;
    }

    sharedAudioStreamRef.current = null;
    setCheckingAudio(false);
    onConnect(sharedAudioStream, nativeMacAudio);
  };

  return (
    <div className="p-5 flex flex-col h-[calc(100%-48px)] justify-between select-none overflow-y-auto relative">
      {/* 1. Header Section */}
      <div className="text-center pt-1 pb-1">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[10px] font-bold mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
          PRE-FLIGHT TELEMETRY
        </div>
        <h2 className="text-lg font-bold text-white tracking-tight">
          Connect Call Session
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          {session
            ? `Target: ${session.company_name || session.title}. Ready for live stealth copilot.`
            : 'Pre-flight checks verified. Connect to launch HUD.'}
        </p>
      </div>

      {/* 2. Main Pre-Flight Audio & Stealth Telemetry Deck */}
      <div className="space-y-2.5 flex-1 flex flex-col justify-center py-2">
      {/* Card 0: Required permissions */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3.5 flex flex-col gap-2.5 text-left">
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <Headphones className="w-4 h-4" />
            </div>
            <div className="text-xs leading-relaxed text-slate-300 flex-1">
              <strong className="text-white block font-bold mb-0.5">
                Required Before You Start
              </strong>
              {requiresMeetingAudio
                ? nativeMacPlatform
                  ? 'Allow microphone permission before launch; the candidate mic stays off until you turn it on. Screen & System Audio Recording is required for interviewer audio and screenshot analysis.'
                  : 'Allow microphone permission before launch; the candidate mic stays off until you turn it on. Select a display or meeting window with Share audio enabled for interviewer transcription and screenshot analysis.'
                : 'Allow microphone permission before launch; the candidate mic stays off until you turn it on during mock practice.'}
            </div>
          </div>

          {/* Real-time System Permission Status Badge */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
            <div className={`flex items-center gap-1.5 font-medium ${nativeMacPlatform && systemPermissions?.microphone ? 'text-emerald-400' : 'text-slate-400'}`}>
              {nativeMacPlatform && systemPermissions?.microphone
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                : <Mic className="w-3.5 h-3.5 text-slate-400" />}
              <span>
                {nativeMacPlatform && systemPermissions?.microphone
                  ? 'Mic permission: Ready · mic off'
                  : 'Mic permission: Requested before launch · mic off'}
              </span>
            </div>

            <span className="text-[10px] text-teal-300 flex items-center gap-1 font-mono">
              <ShieldCheck className="w-3 h-3 text-teal-400" />
              Stealth Invisibility Hook
            </span>
          </div>
        </div>

        {/* Card 1: Screen-share protection */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 flex gap-2.5 text-left">
          <div className="shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-[11px] leading-relaxed text-slate-400">
            Ghostove uses OS display-exclusion APIs to keep the copilot window out of Zoom, Microsoft Teams, and Google Meet screen recordings.
          </div>
        </div>

        {/* Card 2: Safe Environment Video Verification */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-left">
            <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
              <Video className="w-3.5 h-3.5 text-slate-300" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-white">Need a quick demo run?</div>
              <div className="text-[10px] text-slate-400">Test audio transcription with a mock video</div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenMockVideo}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          >
            <Play className="w-2.5 h-2.5 fill-slate-200" />
            <span>Test Audio</span>
          </button>
        </div>
      </div>

      {/* Live interviews require a separate interviewer/system-audio source. */}
      {requiresMeetingAudio && <div className="pt-1 pb-1">
        <label className={`flex items-start gap-2.5 px-3 py-2 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 select-none ${nativeMacPlatform ? 'cursor-default' : 'cursor-pointer hover:bg-slate-800/60 transition-colors'}`}>
          <input
            type="checkbox"
            checked={includeMeetingAudio}
            disabled={selectingSharedAudio || nativeMacPlatform}
            onChange={(e) => handleIncludeMeetingAudioChange(e.target.checked)}
            className="w-3.5 h-3.5 mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500 disabled:cursor-not-allowed"
          />
          <div className="flex flex-col text-left">
            <span className="font-semibold text-white text-[11px]">
              {nativeMacPlatform ? 'Required: Computer Audio' : 'Select Required Computer Audio'}
            </span>
            <span className="text-[10px] text-slate-500">
              {selectingSharedAudio
                ? 'Choose a display or meeting window and enable Share audio…'
                : nativeMacPlatform
                  ? 'We verify screen and system-audio access before opening the session.'
                  : includeMeetingAudio
                    ? sharedAudioStreamRef.current?.getAudioTracks().some((track) => track.readyState === 'live')
                      ? 'Computer audio selected. This source is required for live sessions.'
                      : 'Select a source and enable Share audio in the picker.'
                    : 'Select a display or meeting window and enable Share audio. Windows asks you to select a source each session.'}
            </span>
          </div>
        </label>
        {sharedAudioSelectionError && (
          <div className="px-3 pt-1 text-[10px] text-amber-300" role="status">
            <p>{sharedAudioSelectionError}</p>
            {nativeMacPlatform && (
              <button
                type="button"
                onClick={() => void openPrivacySettings('screen')}
                className="mt-1 underline underline-offset-2 hover:text-amber-200 cursor-pointer"
              >
                Open Screen & System Audio Settings
              </button>
            )}
          </div>
        )}
      </div>}

      {/* 3. Bottom Action Buttons: Back & Connect */}
      <div className="space-y-2 pt-2">
        {!hasAccess && (
          <div className="text-center text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 py-1.5 px-3 rounded-xl flex items-center justify-center gap-1.5">
            <span>No interview time available · Buy time or choose a plan to start</span>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={checkingAudio || selectingSharedAudio}
            onClick={onBack}
            className="py-2.5 px-4 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs text-center transition-all cursor-pointer disabled:opacity-50 disabled:cursor-wait"
          >
            Back
          </button>

          <button
            type="button"
            disabled={checkingAudio || selectingSharedAudio || (requiresMeetingAudio && (!includeMeetingAudio || (!nativeMacPlatform && !sharedAudioStreamRef.current?.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled))))}
            onClick={handleConnectClick}
            className="flex-1 py-2.5 px-4 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-50 text-slate-950"
          >
            {checkingAudio ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                <span>Checking time and audio...</span>
              </>
            ) : !hasAccess ? (
              <>
                <Zap className="w-4 h-4 fill-slate-950" />
                <span>Unlock Access to Launch</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 stroke-[2.4]" />
                <span>{sharedAudioSelectionError ? 'Retry Permission Check' : 'Launch Stealth HUD'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4. Audio Permission Guidance Modal */}
      <AudioPermissionModal
        isOpen={showPermissionModal}
        permissionType={permissionType}
        onClose={() => setShowPermissionModal(false)}
        onPermissionGranted={(grantedStream) => {
          setShowPermissionModal(false);
          if (permissionType === 'mic') {
            // Resume the complete preflight after microphone permission is
            // granted instead of entering a live session directly.
            void handleConnectClick();
            return;
          }
          if (permissionType === 'share_audio') {
            if (grantedStream) {
              sharedAudioStreamRef.current = grantedStream;
              setIncludeMeetingAudio(true);
              setSharedAudioSelectionError(null);
            }
            return;
          }
          const sharedStream = grantedStream || sharedAudioStreamRef.current;
          sharedAudioStreamRef.current = null;
          onConnect(sharedStream || null, includeMeetingAudio && nativeMacPlatform);
        }}
        onProceedMicOnly={() => {
          setShowPermissionModal(false);
          if (permissionType === 'share_audio') {
            setIncludeMeetingAudio(false);
            setSharedAudioSelectionError(null);
            sharedAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
            sharedAudioStreamRef.current = null;
            return;
          }
          sharedAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
          sharedAudioStreamRef.current = null;
          onConnect(null, includeMeetingAudio && nativeMacPlatform);
        }}
      />
    </div>
  );
}
