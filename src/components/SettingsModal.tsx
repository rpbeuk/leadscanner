import React, { useState } from 'react';
import { X, Check, Database, RefreshCw, User, Tag, ShieldCheck } from 'lucide-react';
import { supabaseUrl } from '../lib/supabase';
import { saveRepName, saveCampaignId } from '../lib/storage';
import { getSavedClaudeKey, saveClaudeKey, getSavedGeminiKey, saveGeminiKey, getSavedAccessCode, saveAccessCode, ENGINES } from '../lib/ocrEngine';

interface SettingsModalProps {
  currentRepName: string;
  currentCampaignId: string;
  onUpdate: (repName: string, campaignId: string) => void;
  onClose: () => void;
  isOnline: boolean;
  onTriggerSync: () => void;
  isSyncing: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  currentRepName,
  currentCampaignId,
  onUpdate,
  onClose,
  isOnline,
  onTriggerSync,
  isSyncing
}) => {
  const [repName, setRepName] = useState(currentRepName);
  const [campaignId, setCampaignId] = useState(currentCampaignId);
  const [claudeKey, setClaudeKey] = useState(getSavedClaudeKey());
  const [geminiKey, setGeminiKey] = useState(getSavedGeminiKey());
  const [accessCode, setAccessCode] = useState(getSavedAccessCode());
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveRepName(repName);
    saveCampaignId(campaignId);
    saveClaudeKey(claudeKey);
    saveGeminiKey(geminiKey);
    saveAccessCode(accessCode);
    onUpdate(repName, campaignId);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm max-w-full overflow-x-hidden">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden min-w-0">
        {/* Header */}
        <div className="bg-[#002B49] text-white px-4 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <User className="w-5 h-5 text-orange-400" />
            <h2 className="font-bold text-base sm:text-lg">Instellingen & Beursconfiguratie</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Rep Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <User className="w-4 h-4 text-blue-900" />
              <span>Naam van de Beursmedewerker</span>
            </label>
            <input
              type="text"
              required
              value={repName}
              onChange={(e) => setRepName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-sm font-semibold text-slate-900"
              placeholder="bijv. Aron Overgaauw of Ruben Miltenyi"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Wordt permanent op deze telefoon bewaard, maar kan per lead worden aangepast.
            </p>
          </div>

          {/* Campaign ID */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-orange-600" />
              <span>Campagne ID van deze beurs</span>
            </label>
            <input
              type="text"
              required
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value.toUpperCase())}
              pattern="^U-\d{4,6}$"
              title="Formaat moet zijn: U- gevolgd door 5 cijfers (bijv. U-10245)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-sm font-mono font-bold text-slate-900"
              placeholder="bijv. U-10245"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Vast format: <b>U-</b> gevolgd door 5 cijfers (bijv. U-10245).
            </p>
          </div>

          {/* OCR API keys */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Toegangscode Azure OCR (voorkeur)</label>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-base font-mono text-slate-900"
                placeholder="bijv. appel-tulp-4821"
              />
            </div>
            {ENGINES.claude && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Claude API-sleutel (reserve 1)</label>
              <input
                type="password"
                autoComplete="off"
                value={claudeKey}
                onChange={(e) => setClaudeKey(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-sm font-mono text-slate-900"
                placeholder="sk-ant-..."
              />
            </div>
            )}
            {ENGINES.gemini && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Gemini API-sleutel (reserve 2)</label>
              <input
                type="password"
                autoComplete="off"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-sm font-mono text-slate-900"
                placeholder="AIza... of AQ...."
              />
            </div>
            )}
            <p className="text-[11px] text-slate-500">
              De toegangscode wordt alleen op deze telefoon bewaard. Uitlezen gaat via Azure.
            </p>
          </div>

          {/* Cloud Status Card */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-600" /> Supabase Database
              </span>
              <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}>
                {isOnline ? 'Verbonden' : 'Offline'}
              </span>
            </div>
            <p className="text-slate-500 text-[11px] break-all">
              Host: <span className="font-mono text-slate-700">{new URL(supabaseUrl).host}</span>
            </p>
            <div className="pt-2 flex items-center justify-between border-t border-slate-200">
              <span className="text-slate-600">Handmatige cloudsynchronisatie:</span>
              <button
                type="button"
                onClick={onTriggerSync}
                disabled={isSyncing}
                className="px-3 py-1 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold flex items-center gap-1 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Bezig...' : 'Sync nu'}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 text-[11px] text-blue-900">
            <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
            <span>Alle scans worden eerst lokaal opgeslagen en vervolgens veilig naar Supabase gestuurd.</span>
          </div>

          {/* Footer Action */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Sluiten
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 shadow-md flex items-center gap-1.5 transition-colors"
            >
              {savedNotice ? <Check className="w-4 h-4" /> : null}
              <span>{savedNotice ? 'Opgeslagen!' : 'Opslaan & Toepassen'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
