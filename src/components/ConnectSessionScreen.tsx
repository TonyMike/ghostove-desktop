import React, { useState, useEffect } from 'react';
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
import { checkSystemPermissions } from '../utils/windowManager';
import type { SystemPermissions } from '../utils/windowManager';

interface ConnectSessionScreenProps {
  session?: SessionItem | null;
  onConnect: (sharedStream?: MediaStream | null) => void;
  onBack: () => void;
  hasAccess?: boolean;
  onUpgradeRequired?: () => void;
}

export function ConnectSessionScreen({
  session,
  onConnect,
  onBack,
  hasAccess = true,
  onUpgradeRequired,
}: ConnectSessionScreenProps) {
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionType, setPermissionType] = useState<'mic' | 'share_audio'>('share_audio');
  const [checkingAudio, setCheckingAudio] = useState(false);
  const [systemPermissions, setSystemPermissions] = useState<SystemPermissions | null>(null);
  const [includeMeetingAudio, setIncludeMeetingAudio] = useState(false);

  // Pre-flight check system permissions on screen load
  useEffect(() => {
    let isMounted = true;
    checkSystemPermissions().then((perms) => {
      if (isMounted) {
        setSystemPermissions(perms);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenTutorial = () => {
    openBrowserUrl('https://www.youtube.com/results?search_query=ghostove+tutorial');
  };

  const handleOpenMockVideo = () => {
    openBrowserUrl('https://www.youtube.com/watch?v=s0bXh_dYtps');
  };

  const handleConnectClick = async () => {
    if (!hasAccess) {
      if (onUpgradeRequired) {
        onUpgradeRequired();
        return;
      }
    }

    setCheckingAudio(true);

    // 1. Verify candidate microphone access
    const perms = await checkSystemPermissions();
    setSystemPermissions(perms);

    let micOk = perms.microphone;
    if (!micOk) {
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
        micOk = true;
      } catch (err) {
        console.warn('[Ghostove] Microphone access check failed:', err);
        setCheckingAudio(false);
        setPermissionType('mic');
        setShowPermissionModal(true);
        return;
      }
    }

    // 2. If user explicitly opted to include meeting / tab audio right away
    if (includeMeetingAudio) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length > 0) {
          displayStream.getVideoTracks().forEach((t) => t.stop());
          const sharedAudioStream = new MediaStream(audioTracks);
          setCheckingAudio(false);
          onConnect(sharedAudioStream);
          return;
        } else {
          displayStream.getTracks().forEach((t) => t.stop());
          console.info('[Ghostove] No audio track selected in screen picker, continuing with mic.');
        }
      } catch (err: any) {
        console.info('[Ghostove] Meeting audio picker dismissed or cancelled:', err);
        // If the user cancelled the picker dialog, do NOT show the error modal.
        // Only if it's a hard permission failure and screen capture is disabled:
        if (err.name === 'PermissionDeniedError' && !perms.screen_capture) {
          setCheckingAudio(false);
          setPermissionType('share_audio');
          setShowPermissionModal(true);
          return;
        }
      }
    }

    // 3. All necessary permissions are enabled! Connect directly without any pop-up.
    setCheckingAudio(false);
    onConnect(null);
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
        {/* Card 0: Dual-Channel Capture */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3.5 flex flex-col gap-2.5 text-left shadow-sm">
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20 shadow-sm">
              <Headphones className="w-4 h-4" />
            </div>
            <div className="text-xs leading-relaxed text-slate-300 flex-1">
              <strong className="text-white block font-bold mb-0.5">
                Dual-Channel Audio Capture
              </strong>
              Captures your microphone & interviewer audio simultaneously with 1.2s token latency.
            </div>
          </div>

          {/* Real-time System Permission Status Badge */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {systemPermissions?.microphone
                  ? 'Microphone: Ready'
                  : 'Microphone: Auto-verify on connect'}
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

      {/* Optional: Include meeting sound selector */}
      <div className="pt-1 pb-1">
        <label className="flex items-start gap-2.5 px-3 py-2 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 cursor-pointer select-none hover:bg-slate-800/60 transition-colors">
          <input
            type="checkbox"
            checked={includeMeetingAudio}
            onChange={(e) => setIncludeMeetingAudio(e.target.checked)}
            className="w-3.5 h-3.5 mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
          />
          <div className="flex flex-col text-left">
            <span className="font-semibold text-white text-[11px]">
              Select Computer Audio Loopback Now
            </span>
            <span className="text-[10px] text-slate-500">
              Leave unchecked to start with mic only. You can toggle system audio anytime in the session.
            </span>
          </div>
        </label>
      </div>

      {/* 3. Bottom Action Buttons: Back & Connect */}
      <div className="space-y-2 pt-2">
        {!hasAccess && (
          <div className="text-center text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 py-1.5 px-3 rounded-xl flex items-center justify-center gap-1.5">
            <span>Free trial exhausted (0m remaining) · Plan required to launch</span>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="py-2.5 px-4 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs text-center transition-all cursor-pointer"
          >
            Back
          </button>

          <button
            type="button"
            disabled={checkingAudio}
            onClick={handleConnectClick}
            className={`flex-1 py-2.5 px-4 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
              !hasAccess
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-emerald-500/20'
                : 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-50 text-slate-950 shadow-emerald-500/20'
            }`}
          >
            {checkingAudio ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                <span>Verifying Audio...</span>
              </>
            ) : !hasAccess ? (
              <>
                <Zap className="w-4 h-4 fill-slate-950" />
                <span>Unlock Access to Launch</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 stroke-[2.4]" />
                <span>Launch Stealth HUD</span>
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
          onConnect(grantedStream || null);
        }}
        onProceedMicOnly={() => {
          setShowPermissionModal(false);
          onConnect(null);
        }}
      />
    </div>
  );
}
