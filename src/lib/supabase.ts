import { createClient } from '@supabase/supabase-js';
import type { Lead, Campaign } from '../types';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://not-configured.supabase.co';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey || 'missing-publishable-key');

export async function testCloudConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('campaigns').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

export async function syncLeadToSupabase(lead: Lead): Promise<{ success: boolean; error?: string }> {
  const payload = {
    id: lead.id,
    campaign_id: lead.campaign_id,
    collected_by: lead.collected_by,
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    institute: lead.institute,
    department: lead.department,
    notes: lead.notes,
    newsletter_opt_in: lead.newsletter_opt_in,
    // Local CRM catalog IDs are not Supabase account UUIDs.
    account_id: null,
    email_warning: lead.email_warning,
    confidence_flags: lead.confidence_flags,
    ocr_suggestions: lead.ocr_suggestions || null,
    image_url: lead.image_url || null,
    status: lead.status,
    updated_at: lead.updated_at || new Date().toISOString()
  };

  const retryDelays = [500, 1000, 2000];
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      const { error: campaignError } = await supabase
        .from('campaigns')
        .upsert(
          { id: lead.campaign_id, name: lead.campaign_id },
          { onConflict: 'id', ignoreDuplicates: true }
        );

      if (campaignError) {
        console.error('Supabase campaign registration error:', campaignError);
        return { success: false, error: campaignError.message };
      }

      const { error } = await supabase
        .from('leads')
        .upsert(payload, { onConflict: 'id' });

      if (!error) return { success: true };

      const retryable = error.code === 'FETCH_ERROR' ||
        error.code === 'ECONNRESET' ||
        /\b(408|425|429|5\d{2})\b/.test(`${error.code} ${error.message}`) ||
        /network|fetch|timeout|temporar/i.test(error.message);
      if (!retryable || attempt === retryDelays.length) {
        console.error('Supabase sync error:', error);
        return { success: false, error: error.message };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === retryDelays.length) {
        console.error('Failed to sync to Supabase:', error);
        return { success: false, error: message };
      }
    }

    await new Promise((resolve) => window.setTimeout(resolve, retryDelays[attempt]));
  }

  return { success: false, error: 'Supabase sync failed after retries.' };
}

export async function fetchLeadsFromSupabase(campaignId?: string): Promise<Lead[]> {
  let query = supabase.from('leads').select('*').order('created_at', { ascending: false });
  if (campaignId) {
    query = query.eq('campaign_id', campaignId);
  }
  const { data, error } = await query;
  if (error) {
    console.error('Fetch leads error:', error);
    throw new Error(error.message);
  }
  if (!data) throw new Error('Supabase returned no lead list.');

  return data.map((d: any) => ({
    ...d,
    synced_to_cloud: true,
    confidence_flags: d.confidence_flags || []
  }));
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  try {
    const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function createOrUpdateCampaign(campaign: Campaign): Promise<boolean> {
  try {
    const { error } = await supabase.from('campaigns').upsert(campaign, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}
