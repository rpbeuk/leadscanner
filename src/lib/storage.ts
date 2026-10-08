import type { Lead } from '../types';
import { syncLeadToSupabase } from './supabase';

const DB_NAME = 'MiltenyiLeadScannerDB-v2';
const STORE_NAME = 'leads';
const DB_VERSION = 1;

// Default Rep and Campaign storage keys
const KEY_REP = 'miltenyi_rep_name';
const KEY_CAMPAIGN = 'miltenyi_campaign_id';

export function getSavedRepName(): string {
  return localStorage.getItem(KEY_REP) || 'Aron Overgaauw';
}

export function saveRepName(name: string): void {
  localStorage.setItem(KEY_REP, name.trim());
}

export function getSavedCampaignId(): string {
  return localStorage.getItem(KEY_CAMPAIGN) || 'U-10245';
}

export function saveCampaignId(id: string): void {
  localStorage.setItem(KEY_CAMPAIGN, id.trim());
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('campaign_id', 'campaign_id', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
        store.createIndex('synced_to_cloud', 'synced_to_cloud', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalLead(lead: Lead): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(lead);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllLocalLeads(): Promise<Lead[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const list: Lead[] = req.result || [];
      // Sort newest first
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLocalLead(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Background sync worker: pushes any un-synced leads to Supabase
export async function syncPendingLeads(): Promise<{ total: number; synced: number }> {
  const leads = await getAllLocalLeads();
  const pending = leads.filter(l => !l.synced_to_cloud);
  let syncedCount = 0;

  for (const lead of pending) {
    const res = await syncLeadToSupabase(lead);
    if (res.success) {
      lead.synced_to_cloud = true;
      await saveLocalLead(lead);
      syncedCount++;
    }
  }

  return { total: pending.length, synced: syncedCount };
}
