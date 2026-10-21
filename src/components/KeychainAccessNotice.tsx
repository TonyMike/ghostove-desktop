import { KeyRound, ShieldCheck } from 'lucide-react';

interface KeychainAccessNoticeProps {
  onContinue: () => void;
}

export function KeychainAccessNotice({ onContinue }: KeychainAccessNoticeProps) {
  return (
    <main className="flex h-full w-full items-center justify-center overflow-y-auto bg-slate-950 p-5 text-slate-100">
      <section className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
          <KeyRound size={21} aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white">Keep this Mac paired securely</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Ghostove keeps your sign-in token and this Mac’s device key in the macOS Keychain. The key lets Ghostove verify that requests come from a computer you paired.
        </p>
        <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <p className="text-sm font-semibold text-slate-100">About the macOS prompt</p>
          <p className="mt-1.5 text-xs leading-5 text-slate-400">
            macOS may ask Ghostove Desktop to access a saved sign-in or device item. Choose <strong className="text-slate-200">Always Allow</strong> to avoid being asked again for that item.
          </p>
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-400">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" />
          This does not grant microphone, screen-recording, or remote-control access. Those permissions are requested separately when needed.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-6 min-h-11 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          Continue to Ghostove
        </button>
      </section>
    </main>
  );
}
