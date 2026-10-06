import React from 'react';
import { Cloud, CloudOff, RefreshCw, User, Tag } from 'lucide-react';

interface HeaderProps {
  repName: string;
  campaignId: string;
  isOnline: boolean;
  pendingSyncCount: number;
  onOpenSettings: () => void;
  onManualSync: () => void;
  isSyncing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  repName,
  campaignId,
  isOnline,
  pendingSyncCount,
  onOpenSettings,
  onManualSync,
  isSyncing
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#002B49] text-white shadow-md border-b border-blue-950">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center p-1.5 shadow-sm">
            {/* Miltenyi Delta/Circle symbol */}
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <polygon points="50,15 88,80 12,80" fill="#002B49" />
              <circle cx="50" cy="58" r="16" fill="#EB690B" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold tracking-tight text-base sm:text-lg">Miltenyi Biotec</span>
              <span className="text-xs uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-semibold border border-orange-500/30">
                Lead Scanner
              </span>
            </div>
            <p className="text-[11px] text-blue-200 hidden sm:block">BNL Trade Show & Conference Capture</p>
          </div>
        </div>

        {/* Rep & Campaign Badges */}
        <div className="flex items-center gap-2">
          {/* Campaign Pill */}
          <button
            onClick={onOpenSettings}
            title="Klik om campagne aan te passen"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-900/60 hover:bg-blue-800 text-xs font-medium border border-blue-700/60 transition-colors"
          >
            <Tag className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-blue-200 hidden xs:inline">Campagne:</span>
            <span className="font-semibold text-white">{campaignId}</span>
          </button>

          {/* Rep Pill */}
          <button
            onClick={onOpenSettings}
            title="Klik om medewerker aan te passen"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-900/60 hover:bg-blue-800 text-xs font-medium border border-blue-700/60 transition-colors"
          >
            <User className="w-3.5 h-3.5 text-blue-300" />
            <span className="max-w-[100px] truncate">{repName}</span>
          </button>

          {/* Cloud Sync Status */}
          <button
            onClick={onManualSync}
            disabled={isSyncing}
            title={pendingSyncCount > 0 ? `${pendingSyncCount} leads wachten op synchronisatie` : 'Alles gesynchroniseerd met Supabase'}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              pendingSyncCount > 0
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : isOnline
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}
          >
            {isSyncing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : pendingSyncCount > 0 ? (
              <CloudOff className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className="hidden sm:inline">
              {isSyncing ? 'Synchroniseert...' : pendingSyncCount > 0 ? `${pendingSyncCount} offline` : 'Cloud OK'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
