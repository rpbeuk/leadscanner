import React, { useEffect, useRef, useState } from 'react';
import { X, Database, RefreshCw, User, Tag } from 'lucide-react';
import { isActualRepName, saveRepName, saveCampaignId, saveEventEmail } from '../lib/storage';
import { getSavedClaudeKey, saveClaudeKey, getSavedGeminiKey, saveGeminiKey, ENGINES } from '../lib/ocrEngine';

interface SettingsModalProps {
  currentRepName: string;
  currentCampaignId: string;
  currentEventEmail: string;
  guideRepresentativeName?: boolean;
  onUpdate: (repName: string, campaignId: string, eventEmail: string) => void;
  onCloseEvent: (campaignId: string) => Promise<void>;
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
  onCloseEvent,
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
  const [repNameError, setRepNameError] = useState<string | null>(null);
  const [pendingCampaignSwitch, setPendingCampaignSwitch] = useState<{
    repName: string;
    campaignId: string;
    eventEmail: string;
    previousCampaignId: string;
  } | null>(null);
  const [campaignSwitchError, setCampaignSwitchError] = useState<string | null>(null);
  const [isSwitchingCampaign, setIsSwitchingCampaign] = useState(false);
  const representativeNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (guideRepresentativeName) {
      representativeNameInputRef.current?.focus();
    }
  }, [guideRepresentativeName]);

  const saveSettings = (actualRepName: string, actualCampaignId: string, actualEventEmail: string) => {
    saveRepName(actualRepName);
    saveCampaignId(actualCampaignId);
    saveEventEmail(actualEventEmail);
    saveClaudeKey(claudeKey);
    saveGeminiKey(geminiKey);
    onUpdate(actualRepName, actualCampaignId, actualEventEmail);
    onClose();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const actualRepName = repName.trim();
    const actualCampaignId = campaignId.trim();
    const actualEventEmail = eventEmail.trim();
    if (!isActualRepName(actualRepName)) {
      setRepNameError('Please enter the actual representative name before saving.');
      return;
    }

    setRepNameError(null);
    if (actualCampaignId !== currentCampaignId.trim()) {
      setPendingCampaignSwitch({
        repName: actualRepName,
        campaignId: actualCampaignId,
        eventEmail: actualEventEmail,
        previousCampaignId: currentCampaignId.trim()
      });
      setCampaignSwitchError(null);
      return;
    }
    saveSettings(actualRepName, actualCampaignId, actualEventEmail);
  };

  const handleCampaignSwitch = async (removePreviousLeads: boolean) => {
    if (!pendingCampaignSwitch) return;
    setIsSwitchingCampaign(true);
    setCampaignSwitchError(null);
    try {
      if (removePreviousLeads) {
        await onCloseEvent(pendingCampaignSwitch.previousCampaignId);
      }
      saveSettings(
        pendingCampaignSwitch.repName,
        pendingCampaignSwitch.campaignId,
        pendingCampaignSwitch.eventEmail
      );
    } catch (error) {
      console.error('Unable to switch campaign:', error);
      setCampaignSwitchError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSwitchingCampaign(false);
    }
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
      {pendingCampaignSwitch && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="campaign-switch-title"
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <h2 id="campaign-switch-title" className="text-base font-bold text-slate-900">
              Switch to a new event?
            </h2>
            <p className="mt-1.5 text-sm leading-snug text-slate-600">
              You’re switching from <strong>{pendingCampaignSwitch.previousCampaignId}</strong> to{' '}
              <strong>{pendingCampaignSwitch.campaignId}</strong>. Would you like to permanently remove all
              leads for the previous event from Supabase and this device?
            </p>
            {campaignSwitchError && (
              <p role="alert" className="mt-2 text-sm font-medium text-red-700">{campaignSwitchError}</p>
            )}
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setPendingCampaignSwitch(null)}
                disabled={isSwitchingCampaign}
                className="min-h-11 rounded-lg border border-slate-300 px-1.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => void handleCampaignSwitch(false)}
                disabled={isSwitchingCampaign}
                className="min-h-11 rounded-lg border border-slate-300 px-1.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Switch &amp; Keep
              </button>
              <button
                type="button"
                onClick={() => void handleCampaignSwitch(true)}
                disabled={isSwitchingCampaign}
                className="min-h-11 rounded-lg bg-rose-700 px-1.5 py-2 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
              >
                {isSwitchingCampaign ? 'Removing...' : 'Switch &amp; Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
