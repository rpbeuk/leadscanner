export interface ConfidenceFlag {
  field: string;
  word: string;
  confidence: number; // 0.0 - 1.0
  reason?: string;
}

export interface Lead {
  id: string;
  campaign_id: string; // e.g. 'U-10245'
  collected_by: string; // Rep name
  
  // The official 7 form fields
  first_name: string;
  last_name: string;
  email: string;
  institute: string;      // University / Institution / Company
  department: string;     // Department
  notes: string;          // "How can we support you with your research?"
  newsletter_opt_in: boolean; // Bottom checkbox
  
  // Quality & Verification
  account_id?: string;
  matched_account_level?: 'level_1' | 'level_2' | 'level_3' | 'fallback_level_1' | null;
  email_warning: boolean;
  email_warning_reason?: string;
  confidence_flags: ConfidenceFlag[];
  
  // Images
  image_url?: string;
  field_crops?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    institute?: string;
    department?: string;
    notes?: string;
  };

  status: 'draft' | 'reviewed' | 'synced';
  synced_to_cloud: boolean;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  location?: string;
  is_active: boolean;
  start_date?: string;
}

export interface AccountLevel {
  id: string;
  level_1: string; // Organization / University
  level_2?: string; // Institute / School
  level_3?: string; // Department
  country?: string;
}

export interface ScanBatchItem {
  id: string;
  imageBlob: Blob;
  previewUrl: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  extractedLead?: Lead;
  error?: string;
}
