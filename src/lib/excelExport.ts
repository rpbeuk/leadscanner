import * as XLSX from 'xlsx';
import type { Lead } from '../types';

export function exportLeadsToExcel(leads: Lead[], campaignId: string): void {
  // Map leads to the required 7 columns + metadata
  const rows = leads.map((lead, index) => ({
    'No.': index + 1,
    'Campaign ID': lead.campaign_id || campaignId,
    'First Name': lead.first_name,
    'Last Name': lead.last_name,
    'Email': lead.email,
    'University / Institution / Company': lead.institute,
    'Department': lead.department,
    'How can we support you with your research?': lead.notes,
    'Newsletter Opt-in': lead.newsletter_opt_in ? 'Yes' : 'No',
    'Collected By': lead.collected_by,
    'CRM Level': lead.matched_account_level || 'N/A',
    'Email Validated': lead.email_warning ? 'Check Required' : 'OK',
    'Date Scanned': new Date(lead.created_at).toLocaleString('en-GB')
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths for readability
  worksheet['!cols'] = [
    { wch: 5 },  // Nr
    { wch: 14 }, // Campaign ID
    { wch: 16 }, // First Name
    { wch: 18 }, // Last Name
    { wch: 28 }, // Email
    { wch: 32 }, // University / Institution
    { wch: 26 }, // Department
    { wch: 55 }, // Research notes
    { wch: 18 }, // Newsletter
    { wch: 20 }, // Collected By
    { wch: 14 }, // CRM Level
    { wch: 16 }, // Email Status
    { wch: 20 }  // Date
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Miltenyi Leads');

  const todayStr = new Date().toISOString().split('T')[0];
  const filename = `Miltenyi_Leads_${campaignId}_${todayStr}.xlsx`;

  XLSX.writeFile(workbook, filename);
}

export function openMarketingMailClient(leads: Lead[], campaignId: string, repName: string): void {
  const recipient = 'marketing_BNL@Miltenyi.com';
  const fileDate = new Date().toISOString().split('T')[0];
  const displayDate = new Date().toLocaleDateString('en-GB');
  const filename = `Miltenyi_Leads_${campaignId}_${fileDate}.xlsx`;
  const subject = encodeURIComponent(`[Miltenyi Leads] End-of-day report for campaign ${campaignId} - ${displayDate}`);
  
  const bodyText = `Dear Marketing Team,

Please find the end-of-day report for contact forms collected at campaign ${campaignId}.

Summary:
- Date: ${displayDate}
- Campaign: ${campaignId}
- Submitted by: ${repName}
- Total leads: ${leads.length}
- Newsletter opt-ins: ${leads.filter(l => l.newsletter_opt_in).length}

The corresponding Excel file (${filename}) has just been downloaded and can be attached to this email.

Kind regards,
${repName}
Miltenyi Biotec B.V.
`;

  const mailtoUrl = `mailto:${recipient}?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
  window.open(mailtoUrl, '_blank');
}
