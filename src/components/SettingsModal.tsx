import React, { useEffect, useRef, useState } from 'react';
import { X, Database, RefreshCw, User, Tag } from 'lucide-react';
import { isActualRepName, saveRepName, saveCampaignId, saveEventEmail } from '../lib/storage';
import { getSavedClaudeKey, saveClaudeKey, getSavedGeminiKey, saveGeminiKey, getSavedAccessCode, saveAccessCode, ENGINES } from '../lib/ocrEngine';

interface SettingsModalProps {
  currentRepName: string;
  currentCampaignId: string;
  currentEventEmail: string;
  guideRepresentativeName?: boolean;
  onUpdate: (repName: string, campaignId: string, eventEmail: string) => void;
  onClose: () => void;
  isOnline: boolean;
  onTriggerSync: () => void;
  isSyncing: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  currentRepName,
  currentCampaignId,
  currentEventEmail,
  guideRepresentativeName = false,
  onUpdate,
  onClose,
  isOnline,
  onTriggerSync,
  isSyncing
}) => {
  const [repName, setRepName] = useState(currentRepName);
  const [campaignId, setCampaignId] = useState(currentCampaignId);
  const [eventEmail, setEventEmail] = useState(currentEventEmail);
  const [claudeKey, setClaudeKey] = useState(getSavedClaudeKey());
  const [geminiKey, setGeminiKey] = useState(getSavedGeminiKey());
  const [accessCode, setAccessCode] = useState(getSavedAccessCode());
  const [repNameError, setRepNameError] = useState<string | null>(null);
  const representativeNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (guideRepresentativeName) {
      representativeNameInputRef.current?.focus();
    }
  }, [guideRepresentativeName]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const actualRepName = repName.trim();
    const actualEventEmail = eventEmail.trim();
    if (!isActualRepName(actualRepName)) {
      setRepNameError('Please enter the actual representative name before saving.');
      return;
    }

    setRepNameError(null);
    saveRepName(actualRepName);
    saveCampaignId(campaignId);
    saveEventEmail(actualEventEmail);
    saveClaudeKey(claudeKey);
    saveGeminiKey(geminiKey);
    saveAccessCode(accessCode);
    onUpdate(actualRepName, campaignId, actualEventEmail);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm max-w-full overflow-x-hidden">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden min-w-0">
        {/* Header */}
        <div className="bg-[#002B49] text-white px-4 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <User className="w-5 h-5 text-orange-400" />
            <h2 className="font-bold text-base sm:text-lg">Event settings</h2>
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
            {guideRepresentativeName && (
              <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                Please enter your actual name here before scanning a form.
              </p>
            )}
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <User className="w-4 h-4 text-blue-900" />
              <span>Representative name</span>
            </label>
            <input
              ref={representativeNameInputRef}
              type="text"
              value={repName}
              aria-invalid={repNameError !== null}
              aria-describedby={repNameError ? 'representative-name-error' : undefined}
              onChange={(e) => {
                setRepName(e.target.value);
                setRepNameError(null);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl border focus:ring-2 focus:ring-[#002B49] text-sm font-semibold text-slate-900 ${
                guideRepresentativeName ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-300'
              }`}
            />
            {repNameError && (
              <p id="representative-name-error" role="alert" className="mt-1 text-xs text-rose-700">
                {repNameError}
              </p>
            )}
          </div>

          {/* Campaign ID */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-orange-600" />
              <span>Campaign ID</span>
            </label>
            <input
              type="text"
              required
              maxLength={20}
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-sm font-mono font-bold text-slate-900"
              placeholder="U-00012345"
            />
          </div>

          {/* Event closing email recipient */}
          <div>
            <label htmlFor="event-email" className="mb-1 block text-xs font-semibold text-slate-700">
              When closing an event, email to:
            </label>
            <input
              id="event-email"
              type="email"
              required
              value={eventEmail}
              onChange={(e) => setEventEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-transparent focus:ring-2 focus:ring-[#002B49]"
            />
          </div>

          {/* OCR API keys */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Azure OCR access code</label>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-base font-mono text-slate-900"
              />
            </div>
            {ENGINES.claude && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Claude API key (backup 1)</label>
              <input
                type="password"
                autoComplete="off"
                value={claudeKey}
                onChange={(e) => setClaudeKey(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-sm font-mono text-slate-900"
              />
            </div>
            )}
            {ENGINES.gemini && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Gemini API key (backup 2)</label>
              <input
                type="password"
                autoComplete="off"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-sm font-mono text-slate-900"
              />
            </div>
            )}
          </div>

          {/* Cloud Status Card */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-600" /> Supabase database
              </span>
              <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}>
                {isOnline ? 'Connected' : 'Offline'}
              </span>
            </div>
            <div className="flex items-center justify-end border-t border-slate-200 pt-2">
              <button
                type="button"
                onClick={onTriggerSync}
                disabled={isSyncing}
                className="px-3 py-1 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold flex items-center gap-1 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync now'}</span>
              </button>
            </div>
          </div>

          {/* Footer Action */}
          <div className="pt-2 flex items-center justify-end">
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 shadow-md flex items-center gap-1.5 transition-colors"
            >
              <span>Save & apply</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
