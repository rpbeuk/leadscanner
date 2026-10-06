import { createClient } from '@supabase/supabase-js';
import type { Lead, Campaign } from '../types';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://dpcickhcpoqjtetoksaj.supabase.co';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_M6DlmRYQ1tMH6Zk0WfGofQ_E83jzEGn';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function testCloudConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('campaigns').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

export async function syncLeadToSupabase(lead: Lead): Promise<{ success: boolean; error?: string }> {
  try {
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
      account_id: lead.account_id || null,
      email_warning: lead.email_warning,
      confidence_flags: lead.confidence_flags,
      image_url: lead.image_url || null,
      status: lead.status,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('leads')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('Supabase sync error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Failed to sync to Supabase:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

export async function fetchLeadsFromSupabase(campaignId?: string): Promise<Lead[]> {
  try {
    let query = supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    }
    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((d: any) => ({
      ...d,
      synced_to_cloud: true,
      confidence_flags: d.confidence_flags || []
    }));
  } catch (err) {
    console.error('Fetch leads error:', err);
    return [];
  }
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
