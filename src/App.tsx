import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { Lead } from './types';
import { 
  getSavedRepName, 
  getSavedCampaignId, 
  getSavedEventEmail,
  getAllLocalLeads, 
  saveLocalLead, 
  deleteLocalLead, 
  syncPendingLeads 
} from './lib/storage';
import { testCloudConnection, fetchLeadsFromSupabase, syncLeadToSupabase, supabase, isSupabaseConfigured } from './lib/supabase';
import { processFormImage } from './lib/ocrEngine';
import { AuthScreen } from './components/AuthScreen';
import { Header } from './components/Header';
import { LeadsTable } from './components/LeadsTable';
import { ReviewModal } from './components/ReviewModal';
import { SettingsModal } from './components/SettingsModal';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(
    () => ['invite', 'recovery'].includes(
      new URLSearchParams(window.location.hash.slice(1)).get('type') || ''
    )
  );
  const [repName, setRepName] = useState<string>(getSavedRepName);
  const [campaignId, setCampaignId] = useState<string>(getSavedCampaignId);
  const [eventEmail, setEventEmail] = useState<string>(getSavedEventEmail);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const processingLeads = useRef(new Map<string, Lead>());
  const nextProcessingNumber = useRef(1);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [guideRepresentativeName, setGuideRepresentativeName] = useState(false);
  const [activeReviewLead, setActiveReviewLead] = useState<Lead | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (nextSession) setAuthError(null);
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      } else if (event === 'SIGNED_OUT') {
        setRecoveryMode(false);
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthError(error.message);
      setSession(data.session);
      setAuthReady(true);
    }).catch((err: unknown) => {
      if (!mounted) return;
      setAuthError(err instanceof Error ? err.message : 'Unable to check the sign-in session.');
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Load leads directly from Supabase and sync local storage
  const loadLeads = useCallback(async () => {
    // 1. Fetch live from Supabase
    const cloudOk = await testCloudConnection();
    setIsOnline(cloudOk);

    if (cloudOk) {
      const remoteLeads = await fetchLeadsFromSupabase(campaignId);
      for (const r of remoteLeads) {
        await saveLocalLead(r);
      }
    }

    // 2. Read local
    const local = await getAllLocalLeads();
    const localIds = new Set(local.map((lead) => lead.id));
    const activeProcessing = Array.from(processingLeads.current.values())
      .filter((lead) => !localIds.has(lead.id));
    setLeads([...activeProcessing, ...local]);
  }, [campaignId]);

  useEffect(() => {
    if (!session) return;
    loadLeads();

    const handleStatus = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) {
        handleManualSync();
      }
    };

    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);

    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, [loadLeads, session]);

  // Trigger manual sync
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncPendingLeads();
      await loadLeads();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign-out failed:', error);
      alert(`Could not sign out: ${error.message}`);
    }
  };

  // Direct camera / gallery captured from table
  const handleDirectImageCaptured = async (dataUrl: string) => {
    const now = new Date().toISOString();
    if (processingLeads.current.size === 0) {
      nextProcessingNumber.current = 1;
    }
    const processingNumber = nextProcessingNumber.current++;
    const placeholder: Lead = {
      id: crypto.randomUUID(),
      campaign_id: campaignId,
      collected_by: repName,
      first_name: '',
      last_name: '',
      email: '',
      institute: '',
      department: '',
      notes: '',
      newsletter_opt_in: false,
      email_warning: false,
      confidence_flags: [],
      image_url: dataUrl,
      status: 'draft',
      synced_to_cloud: false,
      processing: true,
      processing_number: processingNumber,
      created_at: now,
      updated_at: now
    };

    processingLeads.current.set(placeholder.id, placeholder);
    setLeads((current) => [placeholder, ...current]);

    try {
      const processedLead = await processFormImage(dataUrl, campaignId, repName);
      const lead: Lead = {
        ...processedLead,
        id: placeholder.id,
        processing: false,
        created_at: placeholder.created_at
      };
      await saveLocalLead(lead);
      processingLeads.current.delete(placeholder.id);
      setLeads((current) => {
        const exists = current.some((item) => item.id === lead.id);
        return exists
          ? current.map((item) => item.id === lead.id ? lead : item)
          : [lead, ...current];
      });
    } catch (err) {
      console.error('Scan processing error:', err);
      const failedLead: Lead = {
        ...placeholder,
        processing: false,
        email_warning: true,
        email_warning_reason: 'Form analysis failed. Open this lead to enter the details manually.',
        updated_at: new Date().toISOString()
      };
      processingLeads.current.delete(placeholder.id);
      setLeads((current) => {
        const exists = current.some((item) => item.id === failedLead.id);
        return exists
          ? current.map((item) => item.id === failedLead.id ? failedLead : item)
          : [failedLead, ...current];
      });
      try {
        await saveLocalLead(failedLead);
      } catch (saveError) {
        console.error('Failed to save the lead for manual review:', saveError);
      }
    }
  };

  // Save reviewed lead directly to Supabase live
  const handleSaveReviewedLead = async (updatedLead: Lead) => {
    // Save to Supabase live
    const res = await syncLeadToSupabase(updatedLead);
    if (res.success) {
      updatedLead.synced_to_cloud = true;
    }
    
    // Save local cache
    await saveLocalLead(updatedLead);
    await loadLeads();
    setActiveReviewLead(null);
  };

  // Delete lead directly from Supabase live
  const handleDeleteLead = async (id: string) => {
    try {
      await supabase.from('leads').delete().eq('id', id);
    } catch (err) {
      console.warn('Failed to delete from remote:', err);
    }
    await deleteLocalLead(id);
    await loadLeads();
  };

  const pendingCount = leads.filter(l => !l.synced_to_cloud && !l.processing).length;

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <section className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Supabase configuration missing</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> for your new project
            in the local <code>.env</code> file and in GitHub Actions secrets. Use only the publishable key.
          </p>
        </section>
      </main>
    );
  }

  if (!authReady) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Checking sign-in session" />
      </main>
    );
  }

  if (!session || recoveryMode) {
    return (
      <AuthScreen
        recoveryMode={recoveryMode}
        authError={authError}
        onRecoveryComplete={() => setRecoveryMode(false)}
      />
    );
  }

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-slate-50 flex flex-col font-sans text-slate-900 pb-12">
      {/* Global Header */}
      <Header
        campaignId={campaignId}
        userEmail={session.user.email || 'Signed-in user'}
        isOnline={isOnline}
        pendingSyncCount={pendingCount}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 sm:py-6">
        <LeadsTable
          leads={leads}
          activeCampaignId={campaignId}
          repName={repName}
          eventEmail={eventEmail}
          onRequireRepName={() => {
            setGuideRepresentativeName(true);
            setIsSettingsOpen(true);
          }}
          onDirectImageCaptured={handleDirectImageCaptured}
          onSelectLead={(lead) => {
            setActiveReviewLead(lead);
          }}
        />
      </main>

      {/* Review & Edit Modal */}
      {activeReviewLead && (
        <ReviewModal
          lead={activeReviewLead}
          onSave={handleSaveReviewedLead}
          onDelete={(id) => {
            void handleDeleteLead(id);
            setActiveReviewLead(null);
          }}
          onClose={() => setActiveReviewLead(null)}
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          currentRepName={repName}
          currentCampaignId={campaignId}
          currentEventEmail={eventEmail}
          guideRepresentativeName={guideRepresentativeName}
          onUpdate={(newRep, newCamp, newEmail) => {
            setRepName(newRep);
            setCampaignId(newCamp);
            setEventEmail(newEmail);
            loadLeads();
          }}
          onClose={() => {
            setIsSettingsOpen(false);
            setGuideRepresentativeName(false);
          }}
          isOnline={isOnline}
          onTriggerSync={handleManualSync}
          isSyncing={isSyncing}
        />
      )}
    </div>
  );
}

export default App;
