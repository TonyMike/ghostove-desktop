import { useState } from 'react';
import { ExternalLink, ShieldCheck, Loader2 } from 'lucide-react';
import { TopBar } from './TopBar';
import { WEB_API_URL } from '../utils/config';
import { getOrCreateDeviceId } from '../utils/device';

interface AuthScreenProps {
  onManualTokenSubmit?: (token: string) => void;
  webAuthUrl?: string;
  onOpenScreenPosition?: () => void;
}

export function AuthScreen({
  webAuthUrl = `${WEB_API_URL}/auth/desktop-auth`,
  onOpenScreenPosition,
}: AuthScreenProps) {
  const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);

  const handleOpenBrowser = async () => {
    setIsOpeningBrowser(true);
    try {
      const pairingUrl = new URL(webAuthUrl);
      pairingUrl.searchParams.set('deviceId', getOrCreateDeviceId());
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(pairingUrl.toString());
    } catch {
      const pairingUrl = new URL(webAuthUrl);
      pairingUrl.searchParams.set('deviceId', getOrCreateDeviceId());
      window.open(pairingUrl.toString(), '_blank');
    } finally {
      setTimeout(() => setIsOpeningBrowser(false), 2000);
    }
  };

  return (
    <div className="h-full w-full bg-slate-950 text-slate-100 flex flex-col select-none overflow-hidden">
      <TopBar
        onOpenScreenPosition={onOpenScreenPosition}
      />

      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
        <div className="max-w-sm w-full space-y-6 text-center">
          {/* Logo Badge */}
          <img
            src="/ghostove-icon.svg"
            alt="Ghostove"
            className="mx-auto h-14 w-14 rounded-2xl shadow-lg shadow-emerald-500/10"
          />

          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              Ghostove Stealth HUD
            </h1>
            <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
              Pair your web account to unlock sub-second live interview transcription &amp; STAR talking points.
            </p>
          </div>

          {/* Automatic Pairing Action */}
          <div className="space-y-4">
            <button
              onClick={handleOpenBrowser}
              disabled={isOpeningBrowser}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-75"
            >
              {isOpeningBrowser ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Opening Browser...</span>
                </>
              ) : (
                <>
                  <span>Pair with Ghostove Web</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </>
              )}
            </button>

            {/* Waiting for Deep-Link Status Box */}
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 text-center space-y-1.5">
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Ready for Connection</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Click above to connect, or click <strong className="text-white font-semibold">Start Session</strong> on the web to pair automatically.
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Screen-Share Invisibility Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
