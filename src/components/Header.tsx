import React from 'react';

interface HeaderProps {
  repName: string;
  campaignId: string;
  isOnline: boolean;
  pendingSyncCount: number;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  repName,
  campaignId,
  isOnline,
  pendingSyncCount,
  onOpenSettings
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#002B49] text-white shadow-sm border-b border-blue-950/60 w-full">
      <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center p-1 shadow-sm shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <polygon points="50,15 88,80 12,80" fill="#002B49" />
              <circle cx="50" cy="58" r="16" fill="#EB690B" />
            </svg>
          </div>
          <span className="font-bold text-sm tracking-tight text-white">
            Lead Scanner
          </span>
        </div>

        {/* Single Combined Settings/Status Pill */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/80 hover:bg-blue-900 border border-blue-800/60 text-xs font-medium text-slate-200 transition-colors"
          title="Instellingen & Campagne"
        >
          <span className="font-semibold text-white">{campaignId}</span>
          <span className="text-blue-300">•</span>
          <span className="max-w-[80px] sm:max-w-[120px] truncate text-slate-300">{repName}</span>
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              pendingSyncCount > 0
                ? 'bg-amber-400 animate-pulse'
                : isOnline
                ? 'bg-emerald-400'
                : 'bg-rose-400'
            }`}
            title={pendingSyncCount > 0 ? `${pendingSyncCount} offline` : isOnline ? 'Online' : 'Offline'}
          />
        </button>
      </div>
    </header>
  );
};
