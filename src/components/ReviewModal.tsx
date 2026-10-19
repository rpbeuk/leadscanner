import React, { useLayoutEffect, useRef, useState } from 'react';
import type { ConfidenceFlag, Lead } from '../types';
import { AlertTriangle, Check, X, Mail, ChevronRight, ChevronLeft, Eye, Trash2 } from 'lucide-react';
import { validateEmailMatch } from '../lib/ocrEngine';
import { matchCrmAccount } from '../lib/crmAccounts';

interface ConfidenceMatch {
  start: number;
  end: number;
  confidence: number;
  word: string;
  reason?: string;
}

function findConfidenceMatches(text: string, flags: ConfidenceFlag[]): ConfidenceMatch[] {
  return flags
    .filter((flag) => flag.word.trim())
    .flatMap((flag) => {
      const word = flag.word.trim();
      const escapedWord = word.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      const startsWithWordCharacter = /^[\p{L}\p{N}_]/u.test(word);
      const endsWithWordCharacter = /[\p{L}\p{N}_]$/u.test(word);
      const pattern = new RegExp(
        `${startsWithWordCharacter ? '(?<![\\p{L}\\p{N}_])' : ''}${escapedWord}${endsWithWordCharacter ? '(?![\\p{L}\\p{N}_])' : ''}`,
        'giu'
      );
      return Array.from(text.matchAll(pattern), (match) => ({
        start: match.index,
        end: match.index + match[0].length,
        confidence: Math.max(0, Math.min(1, flag.confidence)),
        word: match[0],
        reason: flag.reason
      }));
    })
    .sort((a, b) => a.start - b.start || a.confidence - b.confidence);
}

function renderConfidenceText(text: string, matches: ConfidenceMatch[]): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start < cursor) return;
    parts.push(
      <span key={`plain-${cursor}-${index}`}>
        {text.slice(cursor, match.start)}
      </span>
    );
    parts.push(
      <span
        key={`${match.start}-${index}`}
        title={`OCR confidence: ${Math.round(match.confidence * 100)}%${match.reason ? ` - ${match.reason}` : ''}`}
        style={{ color: 'rgb(234, 178, 22)' }}
      >
        {match.word}
      </span>
    );
    cursor = match.end;
  });
  parts.push(<span key={`plain-${cursor}-end`}>{text.slice(cursor)}</span>);
  return parts;
}

function selectWordAtCaret(input: HTMLInputElement) {
  const cursor = input.selectionStart;
  if (cursor === null) return;

  const pattern = input.type === 'email'
    ? /[^\s@]+@[^\s@]+/g
    : /[\p{L}\p{N}_]+(?:['’\-][\p{L}\p{N}_]+)*/gu;
  const match = Array.from(input.value.matchAll(pattern)).find(
    (word) => word.index !== undefined && cursor >= word.index && cursor <= word.index + word[0].length
  );

  if (match?.index !== undefined) {
    input.setSelectionRange(match.index, match.index + match[0].length);
  }
}

interface ConfidenceTextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  confidenceFlags: ConfidenceFlag[];
  overlayPaddingClassName?: string;
  leadingIcon?: React.ReactNode;
  onValueChange: (value: string) => void;
}

const ConfidenceTextInput: React.FC<ConfidenceTextInputProps> = ({
  value,
  confidenceFlags,
  overlayPaddingClassName = 'px-3',
  leadingIcon,
  onValueChange,
  className = '',
  ...inputProps
}) => {
  const [scrollLeft, setScrollLeft] = useState(0);
  const matches = findConfidenceMatches(value, confidenceFlags);

  return (
    <div className="relative">
      {matches.length > 0 && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-px z-20 flex items-center overflow-hidden font-sans text-sm font-medium leading-normal text-slate-900 ${overlayPaddingClassName}`}
        >
          <div className="whitespace-pre" style={{ transform: `translateX(-${scrollLeft}px)` }}>
            {renderConfidenceText(value, matches)}
          </div>
        </div>
      )}
      <input
        {...inputProps}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onClick={(event) => {
          const input = event.currentTarget;
          window.requestAnimationFrame(() => {
            if (document.activeElement === input) selectWordAtCaret(input);
          });
        }}
        onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
        className={`${className} ${matches.length > 0 ? 'text-transparent' : ''}`}
      />
      {leadingIcon}
    </div>
  );
};

interface ReviewModalProps {
  lead: Lead;
  onSave: (updatedLead: Lead) => void;
  onDelete: (id: string) => void;
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
  onDelete,
  onClose,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  currentIndex,
  totalCount
}) => {
  const [lead, setLead] = useState<Lead>({ ...initialLead });
  const [showOriginalPhoto, setShowOriginalPhoto] = useState(false);
  const [notesScrollTop, setNotesScrollTop] = useState(0);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

  const noteMatches = findConfidenceMatches(lead.notes, lead.confidence_flags);

  useLayoutEffect(() => {
    const textarea = notesTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [lead.notes]);

  const renderNotesWithConfidence = () => {
    return renderConfidenceText(lead.notes, noteMatches);
  };

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto max-w-full overflow-x-hidden">
      <div className="relative my-auto flex h-[95dvh] max-h-[95vh] w-full min-w-0 max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-6">
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

          {/* The 7 Standard Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* First Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                First name*
              </label>
              <ConfidenceTextInput
                type="text"
                value={lead.first_name}
                confidenceFlags={lead.confidence_flags}
                onValueChange={(value) => handleFieldChange('first_name', value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#002B49] focus:border-transparent text-sm font-medium"
                placeholder="e.g. Sophie"
              />
            </div>

            {/* Last Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Last name*
              </label>
              <ConfidenceTextInput
                type="text"
                value={lead.last_name}
                confidenceFlags={lead.confidence_flags}
                onValueChange={(value) => handleFieldChange('last_name', value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#002B49] focus:border-transparent text-sm font-medium"
                placeholder="e.g. van den Berg"
              />
            </div>

            {/* Email */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Email* (Essential for follow-up)</span>
                {lead.email_warning && (
                  <span className="text-[11px] text-amber-600 font-normal">⚠️ Mismatch detected</span>
                )}
              </label>
              <ConfidenceTextInput
                type="email"
                value={lead.email}
                confidenceFlags={lead.confidence_flags}
                onValueChange={(value) => handleFieldChange('email', value)}
                overlayPaddingClassName="pl-9 pr-3"
                className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm font-medium focus:ring-2 focus:ring-[#002B49] ${
                  lead.email_warning
                    ? 'border-amber-400 bg-amber-50/30'
                    : 'border-slate-300 focus:border-transparent'
                }`}
                placeholder="e.g. s.vdberg@nki.nl"
                leadingIcon={<Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 z-30" />}
              />
            </div>

            {/* University / Institution */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                University / Institution / Company (CRM level 1)
              </label>
              <ConfidenceTextInput
                type="text"
                value={lead.institute}
                confidenceFlags={lead.confidence_flags}
                onValueChange={(value) => handleFieldChange('institute', value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-sm font-medium"
                placeholder="e.g. NKI - Antoni van Leeuwenhoek"
              />
            </div>

            {/* Department */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Department (CRM level 3)
              </label>
              <ConfidenceTextInput
                type="text"
                value={lead.department}
                confidenceFlags={lead.confidence_flags}
                onValueChange={(value) => handleFieldChange('department', value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#002B49] text-sm font-medium"
                placeholder="e.g. Division of Immunology"
              />
            </div>

            {/* Research Support Notes (Large Box) */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  Notes
                </label>
              </div>
              <div className="relative">
                {noteMatches.length > 0 && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-px z-20 overflow-hidden rounded-lg px-3 py-2 font-sans text-sm leading-relaxed text-slate-900"
                  >
                    <div
                      className="whitespace-pre-wrap break-words"
                      style={{ transform: `translateY(-${notesScrollTop}px)` }}
                    >
                      {renderNotesWithConfidence()}
                    </div>
                  </div>
                )}
                <textarea
                  ref={notesTextareaRef}
                  rows={1}
                  value={lead.notes}
                  onChange={(e) => handleFieldChange('notes', e.target.value)}
                  onScroll={(e) => setNotesScrollTop(e.currentTarget.scrollTop)}
                  className={`relative z-10 w-full resize-none overflow-hidden rounded-lg border border-slate-300 bg-transparent px-3 py-2 font-sans text-sm leading-relaxed caret-slate-900 focus:ring-2 focus:ring-[#002B49] ${
                    noteMatches.length > 0 ? 'text-transparent' : 'text-slate-900'
                  }`}
                  placeholder="Describe cell types, assays, instruments, and specific reagents..."
                />
              </div>

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
                  <b>Newsletter opt-in</b>
                </span>
              </label>
            </div>

          </div>
        </div>

        {/* Footer Actions */}
        <div className="relative z-20 flex-none bg-slate-50 px-3 sm:px-5 py-3.5 border-t border-slate-200 flex items-center justify-between gap-2">
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

          <div className="flex -translate-y-2 items-center gap-2">
            {lead.image_url && (
              <button
                type="button"
                onClick={() => setShowOriginalPhoto(true)}
                className="whitespace-nowrap px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-blue-800 hover:bg-blue-50 transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Eye className="w-4 h-4" />
                View photo
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const name = `${lead.first_name} ${lead.last_name}`.trim() || 'this lead';
                if (confirm(`Are you sure you want to delete the lead from ${name}?`)) onDelete(lead.id);
              }}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-rose-700 hover:bg-rose-50 transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 shadow-md flex items-center gap-1.5 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Confirm</span>
            </button>
          </div>
        </div>
      </div>
      {showOriginalPhoto && lead.image_url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Original contact form photo"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-3 sm:p-6"
        >
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Original contact form</h3>
              <button
                type="button"
                onClick={() => setShowOriginalPhoto(false)}
                aria-label="Close original photo"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-auto bg-slate-100 p-2 sm:p-4">
              <img
                src={lead.image_url}
                alt="Full scanned contact form"
                className="mx-auto h-auto max-h-[calc(95vh-5rem)] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
