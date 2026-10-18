import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

interface MandatoryUpdaterProps {
  deferWhileSessionActive: boolean;
}

export function MandatoryUpdater({ deferWhileSessionActive }: MandatoryUpdaterProps) {
  const updateRef = useRef<Update | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const installButtonRef = useRef<HTMLButtonElement>(null);
  const checkInProgressRef = useRef(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [installing, setInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdate = useCallback(async () => {
    if (import.meta.env.DEV || !isTauri() || checkInProgressRef.current || updateRef.current) return;

    checkInProgressRef.current = true;
    try {
      const update = await check();
      if (update) {
        updateRef.current = update;
        setUpdateVersion(update.version);
        setReleaseNotes(update.body?.trim() || 'A newer version is ready to install.');
      }
    } catch (checkError) {
      // A temporary network or release-server problem should not prevent app use.
      console.warn('[Ghostove Updater] Could not check for updates:', checkError);
    } finally {
      checkInProgressRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV || !isTauri()) return;

    void checkForUpdate();
    const intervalId = window.setInterval(() => void checkForUpdate(), UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [checkForUpdate]);

  useEffect(() => {
    if (!updateVersion || deferWhileSessionActive) return;

    const focusInstallAction = () => {
      if (installing) dialogRef.current?.focus();
      else installButtonRef.current?.focus();
    };
    focusInstallAction();

    const keepFocusInsideDialog = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        focusInstallAction();
      }
    };

    document.addEventListener('keydown', keepFocusInsideDialog, true);
    return () => document.removeEventListener('keydown', keepFocusInsideDialog, true);
  }, [deferWhileSessionActive, installing, updateVersion]);

  // Development builds use the local Vite app and must never install releases
  // from the production updater feed.
  if (import.meta.env.DEV) return null;

  const handleInstall = async () => {
    const update = updateRef.current;
    if (!update || installing) return;

    setInstalling(true);
    setError(null);
    setDownloadProgress(0);
    let receivedBytes = 0;
    let totalBytes: number | undefined;

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength;
          setDownloadProgress(totalBytes ? 0 : null);
        } else if (event.event === 'Progress') {
          receivedBytes += event.data.chunkLength;
          if (totalBytes) {
            setDownloadProgress(Math.min(100, Math.round((receivedBytes / totalBytes) * 100)));
          }
        } else if (event.event === 'Finished') {
          setDownloadProgress(100);
        }
      });

      await relaunch();
    } catch (installError) {
      console.error('[Ghostove Updater] Installation failed:', installError);
      setError('The update could not be installed. Check your internet connection and try again.');
      setInstalling(false);
    }
  };

  if (!updateVersion || deferWhileSessionActive) return null;

  return (
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/90 p-5 text-white backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mandatory-update-title"
      aria-describedby="mandatory-update-description"
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="w-full max-w-md rounded-2xl border border-emerald-400/20 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
          <Download size={23} aria-hidden="true" />
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Update required
        </p>
        <h1 id="mandatory-update-title" className="text-xl font-semibold">
          Install Ghostove Desktop {updateVersion}
        </h1>
        <p id="mandatory-update-description" className="mt-3 text-sm leading-6 text-slate-300">
          This update is required before you can continue using Ghostove Desktop.
        </p>

        <div className="mt-5 max-h-36 overflow-y-auto rounded-xl bg-slate-950/70 p-3 text-sm leading-5 text-slate-300">
          <p className="mb-1 font-medium text-slate-200">What’s new</p>
          <p className="whitespace-pre-wrap">{releaseNotes}</p>
        </div>

        {installing && (
          <div className="mt-5" aria-live="polite">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
              <span>{downloadProgress === 100 ? 'Installing update…' : 'Downloading update…'}</span>
              {downloadProgress !== null && downloadProgress < 100 && <span>{downloadProgress}%</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
              <div
                className={`h-full rounded-full bg-emerald-400 transition-all ${downloadProgress === null ? 'w-1/3 animate-pulse' : ''}`}
                style={downloadProgress === null ? undefined : { width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-300" role="alert">{error}</p>}

        <button
          type="button"
          ref={installButtonRef}
          onClick={handleInstall}
          disabled={installing}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-70"
        >
          {installing ? <RefreshCw size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
          {installing ? 'Updating Ghostove…' : error ? 'Retry update' : 'Update and restart'}
        </button>
        <p className="mt-3 text-center text-xs text-slate-400">
          The app will restart automatically when installation finishes.
        </p>
      </div>
    </div>
  );
}
