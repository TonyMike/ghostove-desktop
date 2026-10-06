import { useState } from 'react';
import {
  ShieldAlert,
  ArrowLeft,
  Sparkles,
  Zap,
  ExternalLink,
  RefreshCw,
  Clock,
  CheckCircle2,
  Lock,
  ChevronRight
} from 'lucide-react';
import { openBrowserUrl } from '../utils/browser';
import { SessionItem } from './SessionSelectScreen';

interface PlanRequiredScreenProps {
  session?: SessionItem | null;
  onBack: () => void;
  onRefreshCredits?: () => Promise<boolean>;
  onContinueSession?: () => void;
}

export function PlanRequiredScreen({
  session,
  onBack,
  onRefreshCredits,
  onContinueSession,
}: PlanRequiredScreenProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const handleOpenBilling = () => {
    openBrowserUrl('http://localhost:3000/dashboard');
  };

  const handleRefresh = async () => {
    if (!onRefreshCredits) return;
    setIsRefreshing(true);
    setRefreshMessage(null);
    try {
      const hasAccess = await onRefreshCredits();
      if (hasAccess) {
        setRefreshMessage('Access confirmed! Launching session...');
        if (onContinueSession) {
          setTimeout(() => onContinueSession(), 500);
        }
      } else {
        setRefreshMessage('No active plan found yet. Please complete checkout on the web.');
      }
    } catch {
      setRefreshMessage('Unable to check subscription. Please check your internet connection.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="p-5 flex flex-col h-[calc(100%-48px)] justify-between select-none overflow-y-auto relative bg-slate-950 text-slate-100 font-sans">
      {/* Top Header / Back Navigation */}
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
          <span>DEMO EXHAUSTED</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-4 py-2">
        {/* Hero Lock Header */}
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto shadow-lg shadow-rose-500/10">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Session Access Locked
          </h2>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            Your 10-minute free trial has completed. To launch live interview assistance for{' '}
            <strong className="text-slate-200">{session?.company_name || session?.title || 'this session'}</strong>, choose an access plan to continue.
          </p>
        </div>

        {/* Telemetry Status Strip */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Trial Balance</div>
              <div className="font-mono font-bold text-rose-400">0 minutes remaining</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">Intelligence Engine</div>
            <div className="font-mono text-[11px] text-slate-400">Universal-3.5-Pro (Locked)</div>
          </div>
        </div>

        {/* Pricing Options Cards */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
            Available Access Passes
          </div>

          {/* Plan 1: Pro Unlimited */}
          <div
            onClick={handleOpenBilling}
            className="p-3 rounded-2xl bg-slate-900/80 border border-emerald-500/30 hover:border-emerald-500/60 transition-all cursor-pointer group flex items-center justify-between shadow-sm relative overflow-hidden"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                  Pro Monthly Pass
                </span>
                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Most Popular
                </span>
              </div>
              <p className="text-[11px] text-slate-400">2h daily interview cap · Unlimited sessions</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-extrabold text-white">$39</div>
              <div className="text-[10px] text-slate-400">/ month</div>
            </div>
          </div>

          {/* Plan 2: 7-Day Sprint Pass */}
          <div
            onClick={handleOpenBilling}
            className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer group flex items-center justify-between"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">
                  7-Day Sprint Pass
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Full week of live call intelligence</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-extrabold text-white">$19</div>
              <div className="text-[10px] text-slate-400">/ 7 days</div>
            </div>
          </div>

          {/* Plan 3: Hourly On-Demand */}
          <div
            onClick={handleOpenBilling}
            className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer group flex items-center justify-between"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">
                  Hourly On-Demand
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Pay-as-you-go · Seconds deducted only during calls</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-extrabold text-white">$4</div>
              <div className="text-[10px] text-slate-400">/ hour</div>
            </div>
          </div>
        </div>

        {refreshMessage && (
          <div className="text-center text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 py-2 px-3 rounded-xl">
            {refreshMessage}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="space-y-2 pt-2 border-t border-slate-900">
        <button
          onClick={handleOpenBilling}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer active:scale-95"
        >
          <Zap className="w-4 h-4 fill-slate-950" />
          <span>Unlock Instant Access in Dashboard</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="w-full bg-slate-900 hover:bg-slate-800/90 border border-slate-800 text-slate-300 hover:text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Verifying plan...' : "I've Upgraded — Re-check Access"}</span>
        </button>
      </div>
    </div>
  );
}
