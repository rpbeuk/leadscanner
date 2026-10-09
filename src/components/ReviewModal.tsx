import React, { useState } from 'react';
import type { Lead } from '../types';
import { AlertTriangle, Check, X, Building, Mail, Sparkles, ChevronRight, ChevronLeft, Eye } from 'lucide-react';
import { validateEmailMatch } from '../lib/ocrEngine';
import { matchCrmAccount } from '../lib/crmAccounts';

interface ReviewModalProps {
  lead: Lead;
  onSave: (updatedLead: Lead) => void;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  currentIndex?: number;
  totalCount?: number;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  lead: initialLead,
  onSave,
  onClose,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  currentIndex,
  totalCount
}) => {
  const [lead, setLead] = useState<Lead>({ ...initialLead });
  const [activeField, setActiveField] = useState<keyof Lead>('notes');
  const [showFullImage, setShowFullImage] = useState<boolean>(false);

  const handleFieldChange = (field: keyof Lead, value: any) => {
    const updated = { ...lead, [field]: value };
    
    // Auto re-validate email on change
    if (field === 'email' || field === 'first_name' || field === 'last_name') {
      const emailCheck = validateEmailMatch(updated.email, updated.first_name, updated.last_name);
      updated.email_warning = emailCheck.warning;
      updated.email_warning_reason = emailCheck.reason;
    }

    // Auto re-match CRM on change
    if (field === 'institute' || field === 'department') {
      const crmMatch = matchCrmAccount(updated.institute, updated.department);
      if (crmMatch) {
        updated.account_id = crmMatch.account.id;
        updated.matched_account_level = crmMatch.matchLevel;
      }
    }

    setLead(updated);
  };

  const handleSave = () => {
    onSave({
      ...lead,
      status: 'reviewed',
      updated_at: new Date().toISOString()
    });
  };

  // Get current active field crop
  const currentCrop = lead.field_crops?.[activeField as keyof typeof lead.field_crops];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto max-w-full overflow-x-hidden">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[95vh] min-w-0">
        {/* Header Bar */}
        <div className="bg-[#002B49] text-white px-3 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between border-b border-blue-950 gap-2 min-w-0">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
            <div>
              <h2 className="text-base sm:text-lg font-bold leading-tight">
                Review & verify lead
              </h2>
              <p className="text-xs text-blue-200">
                Campaign <span className="font-semibold text-white">{lead.campaign_id}</span> • Collected by{' '}
                <span className="font-semibold text-white">{lead.collected_by}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {totalCount !== undefined && currentIndex !== undefined && (
              <span className="text-xs bg-blue-900/80 px-2.5 py-1 rounded-full text-blue-200 border border-blue-800">
                {currentIndex + 1} of {totalCount}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* E-mail Mismatch Warning */}
          {lead.email_warning && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs sm:text-sm">
                <p className="font-semibold text-amber-800">Check email address:</p>
                <p className="text-amber-700">{lead.email_warning_reason}</p>
              </div>
              <button
                type="button"
                onClick={() => handleFieldChange('email_warning', false)}
                className="text-xs font-semibold px-2 py-1 bg-amber-200/70 hover:bg-amber-200 text-amber-900 rounded-lg transition-colors shrink-0"
              >
                Mark as correct
              </button>
            </div>
          )}

          {/* Context Crop Preview Widget */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 shadow-inner">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Eye className="w-4 h-4 text-orange-600" />
                <span>Original handwriting crop (field: {activeField})</span>
              </div>
              {lead.image_url && (
                <button
                  type="button"
                  onClick={() => setShowFullImage(!showFullImage)}
                  className="text-[11px] text-blue-600 hover:underline font-medium"
                >
                  {showFullImage ? 'Show crop only' : 'View full form'}
                </button>
              )}
            </div>

            {showFullImage && lead.image_url ? (
              <div className="max-h-60 overflow-auto rounded-lg border border-slate-300 bg-white p-1">
                <img src={lead.image_url} alt="Full form" className="w-full object-contain" />
              </div>
            ) : currentCrop ? (
              <div className="rounded-lg border border-slate-300 bg-white p-2 flex flex-col items-center justify-center">
                <img
                  src={currentCrop}
                  alt="Field crop"
                  className="max-h-36 max-w-full object-contain rounded"
                />
                <p className="text-[11px] text-slate-500 mt-1 italic">
                  💡 Tip: Nearby text can help interpret abbreviations.
                </p>
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                No crop is available for this field. Select another field below.
              </div>
            )}
          </div>

          {/* The 7 Standard Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* First Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                First name*
              </label>
              <input
                type="text"
                value={lead.first_name}
                onFocus={() => setActiveField('first_name')}
                onChange={(e) => handleFieldChange('first_name', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#002B49] focus:border-transparent text-sm font-medium"
                placeholder="e.g. Sophie"
              />
            </div>

            {/* Last Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Last name*
              </label>
              <input
                type="text"
                value={lead.last_name}
                onFocus={() => setActiveField('last_name')}
                onChange={(e) => handleFieldChange('last_name', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#002B49] focus:border-transparent text-sm font-medium"
                placeholder="e.g. van den Berg"
              />
            </div>

            {/* Email */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Email* (Required for follow-up)</span>
                {lead.email_warning && (
                  <span className="text-[11px] text-amber-600 font-normal">⚠️ Mismatch detected</span>
                )}
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={lead.email}
                  onFocus={() => setActiveField('email')}
                  onChange={(e) => handleFieldChange('email', e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm font-medium focus:ring-2 focus:ring-[#002B49] ${
                    lead.email_warning
                      ? 'border-amber-400 bg-amber-50/30'
                      : 'border-slate-300 focus:border-transparent'
                  }`}
                  placeholder="e.g. s.vdberg@nki.nl"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            {/* University / Institution */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                University / Institution / Company (CRM levels 1/2)
              </label>
              <input
                type="text"
                value={lead.institute}
                onFocus={() => setActiveField('institute')}
                onChange={(e) => handleFieldChange('institute', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-sm font-medium"
                placeholder="e.g. NKI - Antoni van Leeuwenhoek"
              />
            </div>

            {/* Department */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Department (CRM level 3)
              </label>
              <input
                type="text"
                value={lead.department}
                onFocus={() => setActiveField('department')}
                onChange={(e) => handleFieldChange('department', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-sm font-medium"
                placeholder="e.g. Division of Immunology"
              />
            </div>

            {/* CRM Matching Advice Pill */}
            <div className="sm:col-span-2 bg-blue-50/70 rounded-xl p-3 border border-blue-200/80 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-blue-900 mb-1">
                <Building className="w-4 h-4 text-blue-700" />
                <span>CRM hierarchy match (~3,500 account levels)</span>
              </div>
              <p className="text-slate-600">
                {lead.matched_account_level === 'level_3' ? (
                  <span className="text-emerald-700 font-medium">
                    ✓ Exact match for institution and department (level 3).
                  </span>
                ) : lead.matched_account_level === 'fallback_level_1' ? (
                  <span className="text-amber-700 font-medium">
                    ℹ️ No exact match found in the CRM list. Automatically using <b>level 1 (parent institution)</b>.
                  </span>
                ) : (
                  <span className="text-slate-500">
                    No match found in the CRM reference list. This will be registered as a new account.
                  </span>
                )}
              </p>
            </div>

            {/* Research Support Notes (Large Box) */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  How can we support you with your research? (Product interest / notes)
                </label>
                <span className="text-[11px] text-slate-500">Preserved verbatim</span>
              </div>
              <textarea
                rows={4}
                value={lead.notes}
                onFocus={() => setActiveField('notes')}
                onChange={(e) => handleFieldChange('notes', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-sm leading-relaxed"
                placeholder="Describe cell types, assays, instruments, and specific Miltenyi reagents..."
              />

              {/* Confidence Flags Chips */}
              {lead.confidence_flags && lead.confidence_flags.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    OCR uncertainties:
                  </span>
                  {lead.confidence_flags.map((flag, i) => (
                    <span
                      key={i}
                      title={`Confidence: ${Math.round(flag.confidence * 100)}% - ${flag.reason || 'Possibly unclear'}`}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300"
                    >
                      {flag.word} ({Math.round(flag.confidence * 100)}%)
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Newsletter Opt-in Checkbox */}
            <div className="sm:col-span-2 pt-1">
              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100/70 transition-colors">
                <input
                  type="checkbox"
                  checked={lead.newsletter_opt_in}
                  onChange={(e) => handleFieldChange('newsletter_opt_in', e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300"
                />
                <span className="text-xs text-slate-700 leading-snug">
                  <b>Newsletter opt-in:</b> Yes, I want to receive scientific news, product promotions, and information about upcoming events.
                </span>
              </label>
            </div>

            {/* Sales Rep (Collected By) Override */}
            <div className="sm:col-span-2 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span>Lead collected by:</span>
                <input
                  type="text"
                  value={lead.collected_by}
                  onChange={(e) => handleFieldChange('collected_by', e.target.value)}
                  className="px-2 py-0.5 rounded border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
                />
              </div>
              <span className="text-slate-400">Status: {lead.status === 'reviewed' ? 'Reviewed' : lead.status === 'synced' ? 'Synced' : 'Draft'}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {hasPrev && (
              <button
                type="button"
                onClick={onPrev}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                onClick={onNext}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 shadow-md flex items-center gap-1.5 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Confirm & save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
