import { useState } from 'react';
import { ArrowLeft, Clock, ExternalLink, Lock, RefreshCw, ShieldAlert, Zap } from 'lucide-react';
import { openBrowserUrl } from '../utils/browser';
import { WEB_API_URL } from '../utils/config';
import { SessionItem } from './SessionSelectScreen';

type InterviewTimeCheck = 'available' | 'exhausted' | 'unavailable';

interface PlanRequiredScreenProps {
  session?: SessionItem | null;
  reason: 'exhausted' | 'unavailable';
  onBack: () => void;
  onRefreshCredits?: () => Promise<InterviewTimeCheck>;
  onContinueSession?: () => void;
}

export function PlanRequiredScreen({
  session,
  reason,
  onBack,
  onRefreshCredits,
  onContinueSession,
}: PlanRequiredScreenProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const handleOpenPlans = () => {
    void openBrowserUrl(`${WEB_API_URL}/dashboard/plans`);
  };

  const handleRefresh = async () => {
    if (!onRefreshCredits) return;
    setIsRefreshing(true);
    setRefreshMessage(null);
    try {
      const result = await onRefreshCredits();
      if (result === 'available') {
        setRefreshMessage('Interview time confirmed. Returning to session setup…');
        if (onContinueSession) setTimeout(onContinueSession, 500);
      } else if (result === 'unavailable') {
        setRefreshMessage('Could not check your time balance. Check your internet connection and try again.');
      } else {
        setRefreshMessage('No interview time is available yet. Buy time or choose a plan, then check again.');
      }
    } catch {
      setRefreshMessage('Could not check your time balance. Check your internet connection and try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const unavailable = reason === 'unavailable';

  return (
    <div className="p-5 flex flex-col h-[calc(100%-48px)] justify-between select-none overflow-y-auto relative bg-slate-950 text-slate-100 font-sans">
      <div className="flex items-center justify-between pb-2 border-b border-slate-900">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Sessions</span>
        </button>

        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-[10px] font-mono font-bold text-rose-400">
          <Lock className="w-3 h-3" />
          <span>{unavailable ? 'TIME CHECK NEEDED' : 'NO TIME LEFT'}</span>
        </div>
      </div>

      <div className="space-y-4 py-2">
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            {unavailable ? 'Couldn’t Check Interview Time' : 'No Interview Time Remaining'}
          </h2>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            {unavailable ? (
              'Connect to the internet and check your time balance before starting the interview.'
            ) : (
              <>
                You need available interview time to start live assistance for{' '}
                <strong className="text-slate-200">{session?.company_name || session?.title || 'this session'}</strong>.
                {' '}Buy time or choose a plan to continue.
              </>
            )}
          </p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Interview Time</div>
              <div className="font-mono font-bold text-rose-400">{unavailable ? 'Could not verify' : '0 seconds remaining'}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">Next Step</div>
            <div className="font-mono text-[11px] text-slate-400">{unavailable ? 'Reconnect and retry' : 'Buy time to start'}</div>
          </div>
        </div>

        {!unavailable && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-center">
            <div className="text-xs font-bold text-white">Add interview time</div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Choose the time or plan that works for you from your dashboard.
            </p>
          </div>
        )}

        {refreshMessage && (
          <div role="status" className="text-center text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 py-2 px-3 rounded-xl">
            {refreshMessage}
          </div>
        )}
      </div>

      <div className="space-y-2 pt-2 border-t border-slate-900">
        <button
          onClick={handleOpenPlans}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs transition-colors cursor-pointer active:scale-95"
        >
          <Zap className="w-4 h-4 fill-slate-950" />
          <span>{unavailable ? 'Open Plans & Usage' : 'Buy Time or Choose a Plan'}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="w-full bg-slate-900 hover:bg-slate-800/90 border border-slate-800 text-slate-300 hover:text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Checking interview time…' : 'I’ve added time — check again'}</span>
        </button>
      </div>
    </div>
  );
}
