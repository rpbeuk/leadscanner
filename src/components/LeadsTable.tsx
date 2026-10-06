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
  Users
} from 'lucide-react';
import { exportLeadsToExcel, openMarketingMailClient } from '../lib/excelExport';

interface LeadsTableProps {
  leads: Lead[];
  activeCampaignId: string;
  repName: string;
  onOpenScanner: () => void;
  onSelectLead: (lead: Lead) => void;
  onDeleteLead: (id: string) => void;
}

export const LeadsTable: React.FC<LeadsTableProps> = ({
  leads,
  activeCampaignId,
  repName,
  onOpenScanner,
  onSelectLead,
  onDeleteLead
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
    <div className="space-y-6">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Totaal Leads ({activeCampaignId})</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-[#002B49]">{campaignLeads.length}</span>
            <span className="text-xs text-orange-600 font-semibold bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
              Vandaag
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nieuwsbrief Opt-ins</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600">{newsletterCount}</span>
            <span className="text-xs text-slate-400">
              {campaignLeads.length > 0 ? `${Math.round((newsletterCount / campaignLeads.length) * 100)}%` : '0%'}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Supabase Cloud Sync</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-blue-700">{syncedCount} / {campaignLeads.length}</span>
            <span className="text-xs text-emerald-600 font-semibold">Live</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Geregistreerd door</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-base sm:text-lg font-bold text-slate-800 truncate" title={repName}>{repName}</span>
            <Users className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-sm">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Zoek op naam, e-mail, instituut of trefwoord..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#002B49] focus:border-transparent bg-slate-50/50"
          />
        </div>

        {/* Filter Campaign Dropdown */}
        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={filterCampaign}
            onChange={(e) => setFilterCampaign(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-[#002B49]"
          >
            <option value={activeCampaignId}>Huidige: {activeCampaignId}</option>
            <option value="ALL">Alle Beurzen / Campagnes</option>
          </select>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={onOpenScanner}
            className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-orange-500/20 transition-all shrink-0"
          >
            <Camera className="w-4 h-4" />
            <span>Nieuw Formulier Scannen</span>
          </button>

          <button
            type="button"
            onClick={() => exportLeadsToExcel(filteredLeads, activeCampaignId)}
            disabled={filteredLeads.length === 0}
            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 shrink-0"
            title="Download Excel (.xlsx) voor Miltenyi Marketing"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden md:inline">Export</span> Excel
          </button>

          <button
            type="button"
            onClick={() => openMarketingMailClient(filteredLeads, activeCampaignId, repName)}
            disabled={filteredLeads.length === 0}
            className="px-3.5 py-2 rounded-xl bg-[#002B49] hover:bg-blue-900 active:scale-95 text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 shrink-0"
            title="Open email naar marketing_BNL@Miltenyi.com met samenvatting"
          >
            <Mail className="w-4 h-4" />
            <span className="hidden md:inline">Mail</span> Marketing
          </button>
        </div>
      </div>

      {/* Leads Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredLeads.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto mb-4 text-orange-600">
              <Camera className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">Nog geen contactformulieren gescand</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
              Gebruik de camera van je telefoon om papieren Miltenyi contactformulieren in te scannen. Handschrift wordt direct herkend en geëxporteerd naar de 7 CRM-kolommen.
            </p>
            <button
              type="button"
              onClick={onOpenScanner}
              className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm shadow-md inline-flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              <span>Start Eerste Scan</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
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
        )}
      </div>
    </div>
  );
};
