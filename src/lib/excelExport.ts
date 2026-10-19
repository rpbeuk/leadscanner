import Fuse from 'fuse.js';
import * as XLSX from 'xlsx';
import type { Lead } from '../types';
import { fetchLeadExportLookups, type CrmAccountDirectoryEntry } from './supabase';

function normalizeAccountName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getAccountAliases(account: CrmAccountDirectoryEntry): string[] {
  const name = account.full_name_1 || account.account_name;
  const aliases = [...name.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]);
  const acronymWords = name
    .replace(/\([^)]*\)/g, ' ')
    .split(/[^a-zA-ZÀ-ÿ0-9]+/)
    .filter((word) => word.length > 2 && !/^(and|the|de|van|of|for)$/i.test(word));
  const acronym = acronymWords.map((word) => word[0]).join('');
  if (acronym.length >= 3 && acronym.length <= 8) aliases.push(acronym);

  const normalizedName = normalizeAccountName(name);
  if (normalizedName.includes('katholieke universiteit leuven')) {
    aliases.push('KU Leuven', 'K U Leuven');
  }
  if (normalizedName.includes('universite catholique de louvain')) {
    aliases.push('UCLouvain', 'De Duve Institute', 'Institut de Duve');
  }

  return aliases;
}

function createAccountMatcher(accounts: CrmAccountDirectoryEntry[]) {
  const firstExactMatch = new Map<string, CrmAccountDirectoryEntry>();
  const searchableAccounts = accounts.map((account) => ({
    ...account,
    searchAliases: getAccountAliases(account)
  }));
  for (const account of searchableAccounts) {
    for (const name of [account.full_name_1, account.account_name, ...account.searchAliases]) {
      const key = normalizeAccountName(name);
      if (key && !firstExactMatch.has(key)) firstExactMatch.set(key, account);
    }
  }

  const fuzzySearch = new Fuse(searchableAccounts, {
    keys: ['full_name_1', 'account_name', 'searchAliases'],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true
  });

  return (ocrName: string): CrmAccountDirectoryEntry | undefined => {
    const normalized = normalizeAccountName(ocrName);
    if (!normalized) return undefined;

    const exact = firstExactMatch.get(normalized);
    if (exact) return exact;

    const bestMatch = fuzzySearch.search(ocrName)[0];
    return bestMatch?.score !== undefined && bestMatch.score <= 0.4
      ? bestMatch.item
      : undefined;
  };
}

function splitStreetAddress(value: string | null): { street: string; houseNumber: string } {
  const street = value?.trim() || '';
  const match = street.match(/^(.*\S)\s+(\d+[a-z]?(?:[-/][a-z]?\d+[a-z]?)?)$/i);
  if (!match) return { street, houseNumber: '' };
  return { street: match[1], houseNumber: match[2] };
}

async function createLeadsWorkbook(leads: Lead[], campaignId: string): Promise<XLSX.WorkBook> {
  const [lookups, templateResponse] = await Promise.all([
    fetchLeadExportLookups(),
    fetch(`${import.meta.env.BASE_URL}CRM_LeadUpload_Template.xlsx`)
  ]);
  if (!templateResponse.ok) {
    throw new Error(`Unable to load the CRM upload template (HTTP ${templateResponse.status}).`);
  }

  const template = await templateResponse.arrayBuffer();
  const workbook = XLSX.read(template, { type: 'array', cellStyles: true });
  const worksheet = workbook.Sheets.Template;
  if (!worksheet) throw new Error('The CRM upload template is missing its Template worksheet.');

  for (const address of Object.keys(worksheet)) {
    if (address.startsWith('!')) continue;
    const cell = worksheet[address] as XLSX.CellObject | undefined;
    if (cell?.c) delete cell.c;
  }

  const findAccount = createAccountMatcher(lookups.accounts);
  const campaignElements = new Map(
    lookups.campaignElements.map((entry) => [entry.campaign_id.trim().toUpperCase(), entry.campaign_element])
  );

  const rows = leads.map((lead) => {
    const account = findAccount(lead.institute);
    const address = splitStreetAddress(account?.street || null);
    const key = lead.campaign_id.trim().toUpperCase();

    return [
      lead.campaign_id || campaignId,
      '', // Title / Gender
      '', // Academic Title
      lead.first_name,
      lead.last_name,
      lead.email,
      '', // Alternative Function
      account?.full_name_1 || lead.institute,
      '', // Full Name 2
      lead.department, // CRM level 3
      '', // Full Name 4
      address.street,
      address.houseNumber,
      '', // Building / Floor / Room
      account?.city || '',
      account?.postal_code || '',
      '', // Region
      account?.country || '',
      '', // Phone
      '', // Phone Extension
      '', // Products
      '', // Application
      '', // Customer Request
      lead.notes, // Research response
      campaignElements.get(key) || ''
    ];
  });

  XLSX.utils.sheet_add_aoa(worksheet, rows, { origin: 'A3' });

  // Keep each output cell's formatting from the first blank template row.
  rows.forEach((row, rowIndex) => {
    row.forEach((_value, columnIndex) => {
      const sourceAddress = XLSX.utils.encode_cell({ r: 2, c: columnIndex });
      const targetAddress = XLSX.utils.encode_cell({ r: rowIndex + 2, c: columnIndex });
      const sourceCell = worksheet[sourceAddress];
      const targetCell = worksheet[targetAddress];
      if (sourceCell?.s && targetCell) targetCell.s = sourceCell.s;
      if (sourceCell?.z && targetCell) targetCell.z = sourceCell.z;
    });
  });

  return workbook;
}

function getExcelFilename(campaignId: string, date: string): string {
  const safeCampaignId = campaignId.replace(/[<>:"/\\|?*\r\n]/g, '_');
  return `Leads_${safeCampaignId}_${date}.xlsx`;
}

export async function exportLeadsToExcel(leads: Lead[], campaignId: string): Promise<void> {
  const todayStr = new Date().toISOString().split('T')[0];
  const workbook = await createLeadsWorkbook(leads, campaignId);
  XLSX.writeFile(workbook, getExcelFilename(campaignId, todayStr));
}

export function openMarketingMailClient(leads: Lead[], campaignId: string, repName: string, recipient: string): void {
  const today = new Date();
  const displayDate = today.toLocaleDateString('en-GB');
  const excelFilename = getExcelFilename(campaignId, today.toISOString().split('T')[0]);
  const subject = `End-of-day report for campaign ${campaignId} - ${displayDate}`;
  const bodyText = `Hello,

Please find the end-of-day report for contact forms collected at campaign ${campaignId}.

Summary:
- Date: ${displayDate}
- Campaign: ${campaignId}
- Submitted by: ${repName}
- Total leads: ${leads.length}
- Newsletter opt-ins: ${leads.filter(l => l.newsletter_opt_in).length}

Please download and attach the Excel export (${excelFilename}) before sending.

Kind regards,
${repName}
`;

  const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
  window.location.href = mailtoUrl;
}
