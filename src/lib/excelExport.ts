import * as XLSX from 'xlsx';
import type { Lead } from '../types';

function createLeadsWorkbook(leads: Lead[], campaignId: string): XLSX.WorkBook {
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
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
  return workbook;
}

function getExcelFilename(campaignId: string, date: string): string {
  const safeCampaignId = campaignId.replace(/[<>:"/\\|?*\r\n]/g, '_');
  return `Leads_${safeCampaignId}_${date}.xlsx`;
}

export function exportLeadsToExcel(leads: Lead[], campaignId: string): void {
  const todayStr = new Date().toISOString().split('T')[0];
  const workbook = createLeadsWorkbook(leads, campaignId);
  XLSX.writeFile(workbook, getExcelFilename(campaignId, todayStr));
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join('\r\n') || '';
}

function encodeMimeSubject(value: string): string {
  return `=?UTF-8?B?${encodeBase64Utf8(value)}?=`;
}

export function downloadMarketingEmailDraft(leads: Lead[], campaignId: string, repName: string): void {
  const now = new Date();
  const fileDate = now.toISOString().split('T')[0];
  const displayDate = now.toLocaleDateString('en-GB');
  const todaysLeads = leads.filter((lead) => new Date(lead.created_at).toDateString() === now.toDateString());
  const excelFilename = getExcelFilename(campaignId, fileDate);
  const emlFilename = `Lead_Scanner_Report_${fileDate}.eml`;
  const boundary = `lead-scanner-${crypto.randomUUID()}`;
  const subject = `Lead Scanner end-of-day report for campaign ${campaignId} - ${displayDate}`;
  const bodyText = `Hello,

Please find the end-of-day report for contact forms collected at campaign ${campaignId}.

Summary:
- Date: ${displayDate}
- Campaign: ${campaignId}
- Submitted by: ${repName}
- Total leads: ${todaysLeads.length}
- Newsletter opt-ins: ${todaysLeads.filter(l => l.newsletter_opt_in).length}

Kind regards,
${repName}
`;

  const workbookBase64 = XLSX.write(createLeadsWorkbook(todaysLeads, campaignId), {
    bookType: 'xlsx',
    type: 'base64'
  });
  const eml = [
    'To: marketing_BNL@miltenyi.com',
    `Subject: ${encodeMimeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(encodeBase64Utf8(bodyText)),
    `--${boundary}`,
    `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="${excelFilename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${excelFilename}"`,
    '',
    wrapBase64(workbookBase64),
    `--${boundary}--`,
    ''
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([eml], { type: 'message/rfc822' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = emlFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
