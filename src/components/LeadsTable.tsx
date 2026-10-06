import React, { useState } from 'react';
import type { Lead } from '../types';
import { 
  FileSpreadsheet, 
  Mail, 
  Camera, 
  Search, 
  AlertTriangle, 
  Building, 
  Trash2, 
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { exportLeadsToExcel, openMarketingMailClient } from '../lib/excelExport';

interface LeadsTableProps {
  leads: Lead[];
  activeCampaignId: string;
  repName: string;
  onOpenScanner: () => void;
  onSelectLead: (lead: Lead) => void;
  onDeleteLead: (id: string) => void;
  onLoadSampleLeads: () => void;
}

export const LeadsTable: React.FC<LeadsTableProps> = ({
  leads,
  activeCampaignId,
  repName,
  onOpenScanner,
  onSelectLead,
  onDeleteLead,
  onLoadSampleLeads
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter leads for this campaign and search term
  const campaignLeads = leads.filter(l => l.campaign_id === activeCampaignId);
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
            Contactformulieren
          </h1>
          <p className="text-xs text-slate-500">
            {campaignLeads.length} {campaignLeads.length === 1 ? 'lead' : 'leads'} geregistreerd voor <span className="font-semibold text-slate-700">{activeCampaignId}</span>
          </p>
        </div>

        {/* Export & Mail Actions (Discrete clean buttons) */}
        {campaignLeads.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => exportLeadsToExcel(campaignLeads, activeCampaignId)}
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              title="Exporteer naar Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Excel</span>
            </button>

            <button
              type="button"
              onClick={() => openMarketingMailClient(campaignLeads, activeCampaignId, repName)}
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              title="Mail dagafsluiting naar marketing_BNL@Miltenyi.com"
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
            placeholder="Zoek lead op naam, instituut of trefwoord..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:ring-2 focus:ring-[#002B49] focus:border-transparent shadow-sm"
          />
        </div>
      )}

      {/* Main List */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden divide-y divide-slate-100">
        {filteredLeads.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center mx-auto mb-3 text-orange-600">
              <Camera className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">Geen formulieren in deze sessie</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mb-6">
              Maak een foto van een papieren formulier om de gegevens automatisch in te lezen.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
              <button
                type="button"
                onClick={onOpenScanner}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-md inline-flex items-center justify-center gap-1.5"
              >
                <Camera className="w-4 h-4" />
                <span>Formulier Scannen</span>
              </button>
              <button
                type="button"
                onClick={onLoadSampleLeads}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs inline-flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                <span>Laad Voorbeeld (Test)</span>
              </button>
            </div>
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <div
              key={lead.id}
              onClick={() => onSelectLead(lead)}
              className="p-3.5 sm:p-4 hover:bg-slate-50/80 active:bg-blue-50/50 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
            >
              <div className="flex-1 min-w-0">
                {/* Name & Indicators */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900 text-sm group-hover:text-blue-900 truncate">
                    {lead.first_name} {lead.last_name}
                  </span>
                  {lead.email_warning && (
                    <span title="Controleer e-mailadres" className="shrink-0">
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
                <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
                  {lead.email || 'Geen email'}
                </p>

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

              {/* Right Side: Arrow & Delete on desktop hover */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Verwijder lead ${lead.first_name} ${lead.last_name}?`)) {
                      onDeleteLead(lead.id);
                    }
                  }}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100"
                  title="Verwijder"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Bottom Bar: Single, Focused Primary Action */}
      <div className="fixed bottom-4 inset-x-0 flex justify-center px-4 pointer-events-none z-30">
        <button
          type="button"
          onClick={onOpenScanner}
          className="pointer-events-auto px-6 py-3.5 rounded-full bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-bold text-sm shadow-xl shadow-orange-600/30 flex items-center gap-2 transition-all border-2 border-white ring-2 ring-orange-400/20"
        >
          <Camera className="w-5 h-5" />
          <span>Scan Formulier</span>
        </button>
      </div>
    </div>
  );
};
