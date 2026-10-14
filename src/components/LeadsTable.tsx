import React, { useEffect, useState, useRef } from 'react';
import type { Lead } from '../types';
import { 
  FileSpreadsheet, 
  Mail, 
  Camera, 
  Camera as CameraStack,
  Loader2,
  Search, 
  AlertTriangle, 
  Building, 
  ChevronRight,
  Upload,
  X
} from 'lucide-react';
import { openMarketingMailClient, exportLeadsToExcel } from '../lib/excelExport';
import { isActualRepName } from '../lib/storage';

interface LeadsTableProps {
  leads: Lead[];
  activeCampaignId: string;
  repName: string;
  eventEmail: string;
  onRequireRepName: () => void;
  onDirectImageCaptured: (dataUrl: string) => void;
  onSelectLead: (lead: Lead) => void;
}

export const LeadsTable: React.FC<LeadsTableProps> = ({
  leads,
  activeCampaignId,
  repName,
  eventEmail,
  onRequireRepName,
  onDirectImageCaptured,
  onSelectLead
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFastScanActive, setIsFastScanActive] = useState(false);
  const [isFastCapturePending, setIsFastCapturePending] = useState(false);
  const [fastScanCount, setFastScanCount] = useState(0);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isFastScanActive || isFastCapturePending) return;
    const timeout = window.setTimeout(() => {
      setIsFastScanActive(false);
    }, 10000);
    return () => window.clearTimeout(timeout);
  }, [isFastScanActive, isFastCapturePending, fastScanCount]);

  useEffect(() => {
    const cameraInput = cameraInputRef.current;
    if (!cameraInput) return;
    const handleCancel = () => setIsFastCapturePending(false);
    cameraInput.addEventListener('cancel', handleCancel);
    return () => cameraInput.removeEventListener('cancel', handleCancel);
  }, []);

  const openCaptureInput = (inputRef: React.RefObject<HTMLInputElement | null>) => {
    if (!isActualRepName(repName)) {
      setIsFastScanActive(false);
      onRequireRepName();
      return;
    }
    if (isFastScanActive && inputRef === cameraInputRef) {
      setIsFastCapturePending(true);
    }
    inputRef.current?.click();
  };

  const startFastScan = () => {
    if (!isActualRepName(repName)) {
      onRequireRepName();
      return;
    }
    setFastScanCount(0);
    setIsFastScanActive(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      if (isFastScanActive) setIsFastCapturePending(false);
      return;
    }
    if (!isActualRepName(repName)) {
      e.target.value = '';
      setIsFastCapturePending(false);
      setIsFastScanActive(false);
      onRequireRepName();
      return;
    }
    if (isFastScanActive && e.currentTarget === cameraInputRef.current) {
      setFastScanCount((count) => count + 1);
      setIsFastCapturePending(false);
    }
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        onDirectImageCaptured(event.target.result as string);
      }
    };
    reader.onerror = () => {
      console.error('Failed to read the selected form image:', reader.error);
      setIsFastCapturePending(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Filter leads for this campaign and search term
  const campaignLeads = leads.filter(l => l.campaign_id === activeCampaignId);
  const exportableLeads = campaignLeads.filter((lead) => !lead.processing);
  const filteredLeads = campaignLeads.filter((lead) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      `${lead.first_name} ${lead.last_name}`.toLowerCase().includes(term) ||
      lead.email.toLowerCase().includes(term) ||
      lead.institute.toLowerCase().includes(term) ||
      lead.notes.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-24">
      {/* Top Bar: Lead count & Discrete Export Actions */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-lg font-bold text-slate-900 leading-tight">
            Event forms
          </h1>
          <p className="text-xs text-slate-500">
            {campaignLeads.length} {campaignLeads.length === 1 ? 'lead' : 'leads'} in database
          </p>
        </div>

        {/* Export & Mail Actions */}
        {exportableLeads.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => exportLeadsToExcel(exportableLeads, activeCampaignId)}
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              title="Export to Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Excel</span>
            </button>

            <button
              type="button"
              onClick={() => openMarketingMailClient(exportableLeads, activeCampaignId, repName, eventEmail)}
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              title="Open email draft; attach the Excel export manually"
            >
              <Mail className="w-3.5 h-3.5 text-blue-900" />
              <span className="hidden sm:inline">Mail</span>
            </button>
          </div>
        )}
      </div>

      {/* Subtle Search input if there are multiple leads */}
      {campaignLeads.length > 2 && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search leads..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:ring-2 focus:ring-[#002B49] focus:border-transparent shadow-sm"
          />
        </div>
      )}

      {/* Hidden Native Device Inputs */}
      {/* Direct Phone Camera: Prompts for permission instantly on iOS and Android */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      {/* Photo Library / Files */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Main List */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden divide-y divide-slate-100">
        {filteredLeads.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center mx-auto mb-3 text-orange-600">
              <Camera className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">No forms in the database</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mb-6">
              Take a photo of a completed contact form to capture its details.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => openCaptureInput(cameraInputRef)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs sm:text-sm shadow-md inline-flex items-center justify-center gap-2 transition-transform active:scale-95"
              >
                <Camera className="w-4 h-4" />
                <span>Open camera & scan</span>
              </button>
              <button
                type="button"
                onClick={() => openCaptureInput(galleryInputRef)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>Choose a photo</span>
              </button>
            </div>
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <div
              key={lead.id}
              onClick={lead.processing ? undefined : () => onSelectLead(lead)}
              aria-busy={lead.processing || undefined}
              className={`p-3.5 sm:p-4 ${
                lead.processing
                  ? 'bg-slate-50'
                  : lead.status === 'reviewed'
                  ? 'bg-emerald-100/70 hover:bg-emerald-100 active:bg-emerald-200/70'
                  : 'hover:bg-slate-50/80 active:bg-blue-50/50'
              } transition-colors ${lead.processing ? 'cursor-wait' : 'cursor-pointer'} flex items-center justify-between gap-3 group`}
            >
              <div className="flex-1 min-w-0">
                {/* Name & Indicators */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900 text-sm group-hover:text-blue-900 truncate">
                    {lead.processing
                      ? `Analyzing form ${lead.processing_number}`
                      : lead.first_name || lead.last_name
                        ? `${lead.first_name} ${lead.last_name}`
                        : 'Unnamed form'}
                  </span>
                  {lead.processing && (
                    <Loader2 className="h-3 w-3 animate-spin text-slate-500" aria-label="Form analysis in progress" />
                  )}
                  {lead.email_warning && (
                    <span title="Check email address" className="shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    </span>
                  )}
                  {lead.matched_account_level === 'level_3' && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      CRM Lvl 3
                    </span>
                  )}
                </div>

                {/* Email */}
                {!lead.processing && (
                  <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
                    {lead.email || 'No email'}
                  </p>
                )}

                {/* Institute & Department */}
                {(lead.institute || lead.department) && (
                  <div className="flex items-center gap-1 text-xs text-slate-700 mt-1 truncate">
                    <Building className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{lead.institute}</span>
                    {lead.department && <span className="text-slate-400 truncate">• {lead.department}</span>}
                  </div>
                )}

                {/* Research Note Snippet */}
                {lead.notes && (
                  <p className="text-[11px] text-slate-600 line-clamp-1 italic mt-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                    "{lead.notes}"
                  </p>
                )}
              </div>

              {/* Right Side: Arrow */}
              <div className="flex items-center gap-1 shrink-0">
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Bottom Bar: Instant Camera Prompt + Gallery + Live Framing */}
      <div className="fixed bottom-5 inset-x-0 flex justify-center items-center gap-3 px-4 pointer-events-none z-30">
        {/* Gallery / Files */}
        <button
          type="button"
          onClick={() => openCaptureInput(galleryInputRef)}
          className="pointer-events-auto p-3.5 rounded-full bg-white text-slate-700 hover:text-slate-900 shadow-lg border border-slate-200 active:scale-95 transition-all"
          title="Upload a photo from your gallery"
        >
          <Upload className="w-5 h-5 text-slate-600" />
        </button>

        {/* Primary Scan Button (Prompts for camera permission & opens camera directly) */}
        <button
          type="button"
          onClick={() => openCaptureInput(cameraInputRef)}
          className="pointer-events-auto px-7 py-3.5 rounded-full bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-bold text-sm shadow-xl shadow-orange-600/30 flex items-center gap-2.5 transition-all border-2 border-white ring-2 ring-orange-400/20"
        >
          <Camera className="w-5 h-5" />
          <span>Scan form</span>
        </button>

        {/* Multi-form quick capture */}
        <button
          type="button"
          onClick={startFastScan}
          className="pointer-events-auto relative h-14 w-14 rounded-full bg-white text-slate-700 hover:text-slate-900 shadow-lg border border-slate-200 active:scale-95 transition-all flex items-center justify-center"
          title="Start fast multi-form scanning"
          aria-label="Start fast multi-form scanning"
        >
          <Camera className="absolute h-5 w-5 -translate-x-1.5 -translate-y-1.5 text-slate-400" />
          <CameraStack className="relative h-5 w-5 translate-x-1.5 translate-y-1.5 text-orange-600" />
        </button>

      </div>

      {isFastScanActive && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fast-scan-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/85 p-4 text-white backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-5 text-center shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200">Fast lead scanner</span>
              <button
                type="button"
                onClick={() => setIsFastScanActive(false)}
                aria-label="Close fast scanner"
                className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/15 text-orange-400">
              <CameraStack className="h-9 w-9" />
            </div>
            <h2 id="fast-scan-title" className="text-lg font-bold">Capture forms one after another</h2>
            <p className="mt-2 text-sm text-slate-300">
              Each photo is added to the lead list and analyzed in the background. The scanner returns to the overview after 10 seconds without activity.
            </p>
            <p className="mt-3 text-xs font-semibold text-slate-400">
              Photos captured: {fastScanCount}
            </p>
            <button
              type="button"
              onClick={() => openCaptureInput(cameraInputRef)}
              disabled={isFastCapturePending}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-500 disabled:cursor-wait disabled:opacity-70"
            >
              {isFastCapturePending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Waiting for camera...
                </>
              ) : (
                <>
                  <Camera className="h-5 w-5" />
                  Take photo
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
