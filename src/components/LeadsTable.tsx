import React, { useState } from 'react';
import type { Lead } from '../types';
import { 
  FileSpreadsheet, 
  Mail, 
  Camera, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Building, 
  Trash2, 
  ExternalLink,
  Users,
  ChevronRight
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
  onClearAllLeads: () => void;
}

export const LeadsTable: React.FC<LeadsTableProps> = ({
  leads,
  activeCampaignId,
  repName,
  onOpenScanner,
  onSelectLead,
  onDeleteLead,
  onLoadSampleLeads,
  onClearAllLeads
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCampaign, setFilterCampaign] = useState<string>(activeCampaignId);

  // Filter leads
  const filteredLeads = leads.filter((lead) => {
    const matchesCampaign = filterCampaign === 'ALL' || lead.campaign_id === filterCampaign;
    const matchesSearch =
      !searchTerm ||
      `${lead.first_name} ${lead.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.institute.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.notes.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCampaign && matchesSearch;
  });

  const campaignLeads = leads.filter(l => l.campaign_id === activeCampaignId);
  const newsletterCount = campaignLeads.filter(l => l.newsletter_opt_in).length;
  const syncedCount = campaignLeads.filter(l => l.synced_to_cloud).length;

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-hidden">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 w-full">
        <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
            Leads ({activeCampaignId})
          </span>
          <div className="flex items-baseline justify-between mt-1 sm:mt-2">
            <span className="text-xl sm:text-3xl font-extrabold text-[#002B49]">{campaignLeads.length}</span>
            <span className="text-[10px] sm:text-xs text-orange-600 font-semibold bg-orange-50 px-1.5 py-0.5 rounded-full border border-orange-200">
              Vandaag
            </span>
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
            Nieuwsbrief
          </span>
          <div className="flex items-baseline justify-between mt-1 sm:mt-2">
            <span className="text-xl sm:text-3xl font-extrabold text-emerald-600">{newsletterCount}</span>
            <span className="text-[10px] sm:text-xs text-slate-400">
              {campaignLeads.length > 0 ? `${Math.round((newsletterCount / campaignLeads.length) * 100)}%` : '0%'}
            </span>
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
            Cloud Sync
          </span>
          <div className="flex items-baseline justify-between mt-1 sm:mt-2">
            <span className="text-xl sm:text-3xl font-extrabold text-blue-700">{syncedCount}/{campaignLeads.length}</span>
            <span className="text-[10px] sm:text-xs text-emerald-600 font-semibold">Live</span>
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
            Invoer door
          </span>
          <div className="flex items-baseline justify-between mt-1 sm:mt-2">
            <span className="text-sm sm:text-lg font-bold text-slate-800 truncate" title={repName}>{repName}</span>
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* Action Bar (Mobile Responsive Stack) */}
      <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm space-y-3 w-full">
        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 sm:top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Zoek op naam, e-mail, instituut of research..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:ring-2 focus:ring-[#002B49] focus:border-transparent bg-slate-50/50"
            />
          </div>

          <select
            value={filterCampaign}
            onChange={(e) => setFilterCampaign(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-[#002B49] w-full sm:w-auto"
          >
            <option value={activeCampaignId}>Campagne: {activeCampaignId}</option>
            <option value="ALL">Alle Campagnes</option>
          </select>
        </div>

        {/* Buttons Grid */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1 border-t border-slate-100 sm:border-0 sm:pt-0">
          {/* Primary CTA */}
          <button
            type="button"
            onClick={onOpenScanner}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-orange-500/20 transition-all"
          >
            <Camera className="w-4 h-4" />
            <span>Nieuw Formulier Scannen</span>
          </button>

          {/* Secondary Actions */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <button
              type="button"
              onClick={() => exportLeadsToExcel(filteredLeads, activeCampaignId)}
              disabled={filteredLeads.length === 0}
              className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:scale-98 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              title="Download Excel (.xlsx) voor Miltenyi Marketing"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>

            <button
              type="button"
              onClick={() => openMarketingMailClient(filteredLeads, activeCampaignId, repName)}
              disabled={filteredLeads.length === 0}
              className="px-3 py-2 rounded-xl bg-[#002B49] hover:bg-blue-900 active:scale-98 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              title="Open email naar marketing_BNL@Miltenyi.com met samenvatting"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Mail Marketing</span>
            </button>
          </div>
        </div>
      </div>

      {/* Leads Container */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-full">
        {filteredLeads.length === 0 ? (
          <div className="py-12 sm:py-16 px-4 text-center">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto mb-3 sm:mb-4 text-orange-600">
              <Camera className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-800 mb-1">Nog geen formulieren gescand</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              Tik op de oranje knop om een papieren Miltenyi contactformulier te fotograferen.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
              <button
                type="button"
                onClick={onOpenScanner}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs sm:text-sm shadow-md inline-flex items-center justify-center gap-1.5"
              >
                <Camera className="w-4 h-4" />
                <span>Start Eerste Scan</span>
              </button>
              <button
                type="button"
                onClick={onLoadSampleLeads}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 font-bold text-xs sm:text-sm shadow-sm inline-flex items-center justify-center gap-1.5"
              >
                <span>⚡ Laad 4 Testformulieren</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* MOBILE VIEW: Clean Touch Cards (sm:hidden) */}
            <div className="sm:hidden divide-y divide-slate-100">
              {filteredLeads.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="p-3.5 active:bg-blue-50/60 transition-colors flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    {/* Top row: Name + warning */}
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                      <span className="truncate">{lead.first_name} {lead.last_name}</span>
                      {lead.email_warning && (
                        <span title="E-mailcontrole vereist" className="shrink-0">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        </span>
                      )}
                      {lead.synced_to_cloud ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-auto" />
                      ) : (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1 py-0.2 rounded shrink-0 ml-auto">
                          Lokaal
                        </span>
                      )}
                    </div>

                    {/* Email */}
                    <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
                      {lead.email || '—'}
                    </p>

                    {/* Institute & Department */}
                    <div className="flex items-center gap-1 text-xs text-slate-700 mt-1 truncate">
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium truncate">{lead.institute || '—'}</span>
                      {lead.department && <span className="text-slate-400 truncate">• {lead.department}</span>}
                    </div>

                    {/* Notes preview */}
                    {lead.notes && (
                      <p className="text-[11px] text-slate-600 line-clamp-1 italic mt-1 bg-slate-50 px-2 py-1 rounded">
                        "{lead.notes}"
                      </p>
                    )}

                    {/* Badges footer */}
                    <div className="flex items-center gap-2 mt-2">
                      {lead.newsletter_opt_in && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800">
                          Nieuwsbrief ✓
                        </span>
                      )}
                      {lead.matched_account_level && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800">
                          {lead.matched_account_level === 'level_3' ? 'CRM Lvl 3' : 'CRM Lvl 1'}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 ml-auto">
                        {new Date(lead.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 self-center" />
                </div>
              ))}
            </div>

            {/* DESKTOP VIEW: Full Wide Data Table (hidden on mobile) */}
            <div className="hidden sm:block overflow-x-auto w-full">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-[11px] uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Contactpersoon</th>
                    <th className="py-3 px-4">Instituut & Afdeling</th>
                    <th className="py-3 px-4">Research / Interesse</th>
                    <th className="py-3 px-3 text-center">Nieuwsbrief</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => onSelectLead(lead)}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                    >
                      {/* Name & Email */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 group-hover:text-blue-900 flex items-center gap-1.5">
                          <span>{lead.first_name} {lead.last_name}</span>
                          {lead.email_warning && (
                            <span title="E-mailcontrole vereist">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          {lead.email || '—'}
                        </div>
                      </td>

                      {/* Institute & Department */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[200px]">{lead.institute || '—'}</span>
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-[200px] mt-0.5">
                          {lead.department || '—'}
                        </div>
                        {lead.matched_account_level && (
                          <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800">
                            {lead.matched_account_level === 'level_3' ? 'CRM Lvl 3' : 'CRM Lvl 1'}
                          </span>
                        )}
                      </td>

                      {/* Research Notes */}
                      <td className="py-3 px-4 max-w-[280px]">
                        <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed">
                          {lead.notes || <span className="text-slate-400 italic">Geen notities</span>}
                        </p>
                        {lead.confidence_flags && lead.confidence_flags.length > 0 && (
                          <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-1 inline-block">
                            {lead.confidence_flags.length} OCR twijfelpunt(en)
                          </span>
                        )}
                      </td>

                      {/* Newsletter */}
                      <td className="py-3 px-3 text-center">
                        {lead.newsletter_opt_in ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                            Ja
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Nee</span>
                        )}
                      </td>

                      {/* Cloud Status */}
                      <td className="py-3 px-3 text-center">
                        {lead.synced_to_cloud ? (
                          <span title="Gesynchroniseerd met Supabase Cloud" className="inline-flex items-center text-emerald-600">
                            <CheckCircle2 className="w-4 h-4" />
                          </span>
                        ) : (
                          <span title="Lokaal opgeslagen, wacht op sync" className="inline-flex items-center text-amber-500 font-semibold text-[11px]">
                            Lokaal
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectLead(lead);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-900 hover:bg-slate-100 transition-colors"
                            title="Bekijk & Bewerk"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Weet je zeker dat je de lead van ${lead.first_name} ${lead.last_name} wilt verwijderen?`)) {
                                onDeleteLead(lead.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Verwijder lead"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Test Helper Footer */}
            <div className="p-3 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                onClick={onLoadSampleLeads}
                className="font-semibold text-blue-900 hover:text-blue-700 flex items-center gap-1"
              >
                <span>⚡ + Testleads Toevoegen</span>
              </button>
              <button
                type="button"
                onClick={onClearAllLeads}
                className="text-slate-400 hover:text-rose-600 transition-colors"
              >
                Wis alle leads
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
