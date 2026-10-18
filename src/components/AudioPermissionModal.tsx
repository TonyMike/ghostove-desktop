import React, { useState } from 'react';
import {
  MicOff,
  Settings,
  RefreshCw,
  X,
  ExternalLink,
  Laptop,
  AlertCircle,
  Volume2,
  Monitor
} from 'lucide-react';
import macGuideImg from '../assets/mac-permission-guide.png';
import { checkSystemPermissions, requestScreenCaptureAccess } from '../utils/windowManager';

interface AudioPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPermissionGranted: (stream?: MediaStream) => void;
  permissionType?: 'mic' | 'share_audio';
  onProceedMicOnly?: () => void;
}

export function AudioPermissionModal({
  isOpen,
  onClose,
  onPermissionGranted,
  permissionType = 'mic',
  onProceedMicOnly,
}: AudioPermissionModalProps) {
  // Detect OS default
  const isDefaultMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent || navigator.platform);

  const [activeTab, setActiveTab] = useState<'mac' | 'windows'>(
    isDefaultMac ? 'mac' : 'windows'
  );
  const [testing, setTesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isShareAudio = permissionType === 'share_audio';

  const handleOpenSettings = async (settingType: 'mic' | 'screen' = isShareAudio ? 'screen' : 'mic') => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_privacy_settings', {
        settingType: settingType === 'screen' ? 'screen' : 'mic',
      });
    } catch (e) {
      console.warn('[Ghostove] open_privacy_settings invoke fallback:', e);
    }
  };

  const handleTryAgain = async () => {
    setTesting(true);
    setErrorMsg(null);

    if (isShareAudio) {
      try {
        const permissions = await checkSystemPermissions();
        if (!permissions.screen_capture) {
          const granted = await requestScreenCaptureAccess();
          if (!granted) {
            setTesting(false);
            setErrorMsg('macOS has not granted screen recording to this running app yet. Turn on Ghostove Desktop in System Settings, quit Ghostove completely, then reopen it and try again.');
            return;
          }
        }

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
          displayStream.getTracks().forEach((track) => track.stop());
          setTesting(false);
          setErrorMsg('No audio track detected. Please make sure to check "Share audio" in the window/tab picker dialog.');
          return;
        }

        // Stop video track as only audio is required
        displayStream.getVideoTracks().forEach((track) => track.stop());

        const audioStream = new MediaStream(audioTracks);
        setTesting(false);
        onPermissionGranted(audioStream);
      } catch (err: any) {
        console.warn('[Ghostove] Re-testing share audio failed:', err);
        setTesting(false);
        const permissions = await checkSystemPermissions();
        setErrorMsg(
          !permissions.screen_capture
            ? 'macOS still reports screen recording as disabled. Turn on Ghostove Desktop in System Settings, quit Ghostove completely, then reopen it and try again.'
            : err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
              ? 'The macOS screen picker was dismissed. Try again and select a display or meeting window, then enable Share audio.'
              : err.message || 'System audio access could not be acquired.'
        );
      }
      return;
    }

    // Default: Microphone verification
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setTesting(false);
      onPermissionGranted();
    } catch (err: any) {
      console.warn('[Ghostove] Re-testing mic access failed:', err);
      setTesting(false);
      setErrorMsg(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Microphone permission is still disabled in your system settings. Please toggle it on and try again.'
          : err.message || 'Microphone access could not be acquired.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-[430px] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100 select-none">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${
              isShareAudio
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
            }`}>
              {isShareAudio ? <Monitor className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                {isShareAudio ? 'Meeting Audio Permission Required' : 'Microphone Access Required'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isShareAudio
                  ? "Required to capture the interviewer's voice in your call"
                  : 'Ghostove needs audio access to transcribe calls'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* OS Platform Switcher */}
        <div className="px-5 pt-3 pb-1 flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
            <Laptop className="w-3.5 h-3.5" /> OS:
          </span>
          <button
            onClick={() => {
              setActiveTab('mac');
              setErrorMsg(null);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'mac'
                ? 'bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            macOS
          </button>
          <button
            onClick={() => {
              setActiveTab('windows');
              setErrorMsg(null);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'windows'
                ? 'bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Windows
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3 text-xs">
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-start gap-2 text-[11px] leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isShareAudio && (
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-blue-800 dark:text-blue-300 text-[11px] leading-relaxed flex items-start gap-2">
              <Volume2 className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
              <span>
                <strong>Wearing headphones or using Zoom/Teams/Meet?</strong> The interviewer&apos;s audio goes directly to your speakers/headphones. Granting Screen &amp; Audio recording ensures Ghostove hears the interviewer loud and clear.
              </span>
            </div>
          )}

          {activeTab === 'mac' ? (
            <div className="space-y-3">
              <div className="space-y-2 text-slate-700 dark:text-slate-300">
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Open <strong>System Settings</strong> → <strong>Privacy &amp; Security</strong>.
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Select <strong>{isShareAudio ? 'Screen & System Audio Recording' : 'Microphone'}</strong> and toggle <strong>Ghostove Desktop</strong> to <strong>ON</strong>.
                  </span>
                </div>

                {isShareAudio && (
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </span>
                    <span>
                      If Ghostove was already open, quit and reopen it after enabling access so macOS applies the permission.
                    </span>
                  </div>
                )}

                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    {isShareAudio ? '4' : '3'}
                  </span>
                  <span>
                    When the picker dialog opens, select your meeting window or browser tab and check <strong>&quot;Share audio&quot;</strong>.
                  </span>
                </div>
              </div>

              {/* Reference Picture */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm bg-slate-950">
                <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 font-medium flex items-center justify-between">
                  <span>macOS System Settings Reference</span>
                  <span className="text-emerald-400 font-semibold">Toggles ON</span>
                </div>
                <img
                  src={macGuideImg}
                  alt="macOS Screen & Audio Recording Settings Guide"
                  className="w-full h-auto object-cover max-h-[150px]"
                />
              </div>

              {/* Quick Settings Action Buttons for Mac */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleOpenSettings('screen')}
                  className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-200/80 dark:border-slate-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>System Audio Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenSettings('mic')}
                  className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-200/80 dark:border-slate-700"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Microphone Settings</span>
                </button>
              </div>
            </div>
          ) : (
            /* Windows Steps */
            <div className="space-y-3">
              <div className="space-y-2 text-slate-700 dark:text-slate-300">
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Press <strong>Windows + I</strong> to open <strong>Settings</strong>.
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Navigate to <strong>Privacy &amp; security</strong> → <strong>{isShareAudio ? 'App permissions' : 'Microphone'}</strong>.
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    Ensure <strong>Let desktop apps access your audio</strong> is turned <strong>On</strong> for Ghostove Desktop.
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleOpenSettings(isShareAudio ? 'screen' : 'mic')}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-200/80 dark:border-slate-700"
                >
                  <Settings className="w-4 h-4" />
                  <span>Open Windows Privacy Settings</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={testing}
              onClick={handleTryAgain}
              className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-600/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Checking...' : isShareAudio ? 'Select Meeting Audio' : "I've Enabled It"}</span>
            </button>
          </div>

          {isShareAudio && onProceedMicOnly && (
            <button
              type="button"
              onClick={onProceedMicOnly}
              className="w-full py-1.5 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline text-center cursor-pointer transition-colors"
            >
              Continue with Microphone Only (No Headphones)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
