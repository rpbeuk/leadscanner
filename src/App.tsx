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
  deleteLocalLeadsForCampaign,
  syncPendingLeads 
} from './lib/storage';
import { fetchLeadsFromSupabase, syncLeadToSupabase, supabase, isSupabaseConfigured } from './lib/supabase';
import { processFormImage } from './lib/ocrEngine';
import { learnPersonalOcrCorrections } from './lib/personalizedOcr';
import { AuthScreen } from './components/AuthScreen';
import { Header } from './components/Header';
import { LeadsTable } from './components/LeadsTable';
import { ReviewModal } from './components/ReviewModal';
import { SettingsModal } from './components/SettingsModal';

const MAX_CONCURRENT_OCR_JOBS = 3;

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
  const [verifiedCampaignId, setVerifiedCampaignId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const processingLeads = useRef(new Map<string, Lead>());
  const nextProcessingNumber = useRef(1);
  const activeOcrJobs = useRef(0);
  const queuedOcrJobs = useRef<Array<() => void>>([]);
  const isRefreshingLeads = useRef(false);
  const refreshLeadsAgain = useRef(false);
  const isRetryingPendingUploads = useRef(false);

  const acquireOcrSlot = () => new Promise<void>((resolve) => {
    const start = () => {
      activeOcrJobs.current += 1;
      resolve();
    };
    if (activeOcrJobs.current < MAX_CONCURRENT_OCR_JOBS) start();
    else queuedOcrJobs.current.push(start);
  });

  const releaseOcrSlot = () => {
    activeOcrJobs.current -= 1;
    queuedOcrJobs.current.shift()?.();
  };

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
    if (isRefreshingLeads.current) {
      refreshLeadsAgain.current = true;
      return;
    }
    isRefreshingLeads.current = true;
    let remoteCampaignDataLoaded = false;
    try {
      try {
        const remoteLeads = await fetchLeadsFromSupabase(campaignId);
        remoteCampaignDataLoaded = true;
        setIsOnline(true);
        const remoteIds = new Set(remoteLeads.map((lead) => lead.id));
        const localBeforeRefresh = await getAllLocalLeads();
        const localById = new Map(localBeforeRefresh.map((lead) => [lead.id, lead]));
        for (const localLead of localBeforeRefresh) {
          if (
            localLead.campaign_id === campaignId &&
            localLead.synced_to_cloud &&
            !remoteIds.has(localLead.id)
          ) {
            await deleteLocalLead(localLead.id);
          }
        }
        for (const remoteLead of remoteLeads) {
          if (!localById.has(remoteLead.id) || localById.get(remoteLead.id)?.synced_to_cloud) {
            await saveLocalLead(remoteLead);
          }
        }
      } catch (error) {
        console.error('Unable to refresh shared campaign leads:', error);
        setIsOnline(false);
      }

      const local = await getAllLocalLeads();
      const localIds = new Set(local.map((lead) => lead.id));
      const activeProcessing = Array.from(processingLeads.current.values())
        .filter((lead) => !localIds.has(lead.id));
      setLeads([...activeProcessing, ...local]);
      setVerifiedCampaignId(remoteCampaignDataLoaded ? campaignId : null);
    } finally {
      isRefreshingLeads.current = false;
      if (refreshLeadsAgain.current) {
        refreshLeadsAgain.current = false;
        void loadLeads();
      }
    }
  }, [campaignId]);

  useEffect(() => {
    if (!session) return;
    loadLeads();

    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadLeads();
      if (isRetryingPendingUploads.current) return;
      isRetryingPendingUploads.current = true;
      void getAllLocalLeads()
        .then(async (localLeads) => {
          if (localLeads.some((lead) => !lead.synced_to_cloud && !lead.processing)) {
            await syncPendingLeads();
            await loadLeads();
          }
        })
        .catch((error: unknown) => {
          console.error('Automatic retry of pending lead uploads failed:', error);
        })
        .finally(() => {
          isRetryingPendingUploads.current = false;
        });
    }, 5000);
    const channel = supabase
      .channel(`campaign-leads-${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `campaign_id=eq.${campaignId}`
        },
        () => void loadLeads()
      )
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          void loadLeads();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Realtime lead subscription unavailable; polling remains enabled.', error);
        }
      });
    const handleFocus = () => {
      if (document.visibilityState === 'visible') void loadLeads();
    };
    const handleStatus = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) {
        handleManualSync();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);

    return () => {
      window.clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
      window.removeEventListener('focus', handleFocus);
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

  const handleCreateManualLead = () => {
    const now = new Date().toISOString();
    setActiveReviewLead({
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
      status: 'draft',
      synced_to_cloud: false,
      created_at: now,
      updated_at: now
    });
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
      processing_status: 'queued',
      created_at: now,
      updated_at: now
    };

    processingLeads.current.set(placeholder.id, placeholder);
    setLeads((current) => [placeholder, ...current]);

    let hasOcrSlot = false;
    try {
      await acquireOcrSlot();
      hasOcrSlot = true;
      processingLeads.current.set(placeholder.id, {
        ...placeholder,
        processing_status: 'analyzing'
      });
      setLeads((current) => current.map((item) =>
        item.id === placeholder.id
          ? { ...item, processing_status: 'analyzing' }
          : item
      ));

      const processedLead = await processFormImage(dataUrl, campaignId, repName, session?.user.id || '');
      const lead: Lead = {
        ...processedLead,
        id: placeholder.id,
        processing: false,
        created_at: placeholder.created_at
      };
      const cloudResult = await syncLeadToSupabase(lead);
      if (cloudResult.success) {
        lead.synced_to_cloud = true;
      } else {
        console.error('New lead is saved locally but could not be shared:', cloudResult.error);
      }
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
    } finally {
      if (hasOcrSlot) releaseOcrSlot();
    }
  };

  // Save reviewed lead directly to Supabase live
  const handleSaveReviewedLead = async (updatedLead: Lead) => {
    // Save to Supabase live
    const leadWithModifier = { ...updatedLead, collected_by: repName };
    const res = await syncLeadToSupabase(leadWithModifier);
    if (res.success) {
      leadWithModifier.synced_to_cloud = true;
    } else {
      console.error('Could not share the reviewed lead with other devices:', res.error);
    }
    
    // Save local cache
    await saveLocalLead(leadWithModifier);
    if (!res.success) {
      setLeads((current) => current.some((lead) => lead.id === leadWithModifier.id)
        ? current.map((lead) => lead.id === leadWithModifier.id ? leadWithModifier : lead)
        : [leadWithModifier, ...current]);
      alert(
        `This change is saved on this device but could not be shared with other users. Check the connection and confirm again to retry.\n\nSupabase error: ${res.error || 'Unknown error'}`
      );
      return;
    }
    try {
      await learnPersonalOcrCorrections(session?.user.id || '', leadWithModifier);
    } catch (error) {
      console.error('Lead saved but personalized OCR learning failed:', error);
      alert(`Lead saved, but personalized OCR learning failed: ${error instanceof Error ? error.message : String(error)}`);
      await loadLeads();
      return;
    }
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

  const handleCloseEvent = async (eventCampaignId: string) => {
    if (Array.from(processingLeads.current.values()).some((lead) => lead.campaign_id === eventCampaignId)) {
      throw new Error('Wait for all form analyses to finish before closing this event.');
    }

    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('campaign_id', eventCampaignId);
    if (error) {
      throw new Error(`Could not remove this event’s leads from Supabase: ${error.message}`);
    }

    try {
      await deleteLocalLeadsForCampaign(eventCampaignId);
    } catch (error) {
      throw new Error(
        `The leads were removed from Supabase, but local cleanup failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    setLeads((current) => current.filter((lead) => lead.campaign_id !== eventCampaignId));
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
          onCreateManualLead={handleCreateManualLead}
          onCloseEvent={handleCloseEvent}
          onSelectLead={(lead) => {
            setActiveReviewLead(lead);
          }}
        />
      </main>

      {/* Review & Edit Modal */}
      {activeReviewLead && (
        <ReviewModal
          lead={leads.find((lead) => lead.id === activeReviewLead.id) || activeReviewLead}
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
          currentCampaignLeadCount={leads.filter((lead) => lead.campaign_id === campaignId).length}
          canSkipCampaignSwitchConfirmation={verifiedCampaignId === campaignId}
          currentEventEmail={eventEmail}
          guideRepresentativeName={guideRepresentativeName}
          onCloseEvent={handleCloseEvent}
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
