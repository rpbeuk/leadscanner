import { useState, useEffect, useCallback } from 'react';
import type { Lead } from './types';
import { 
  getSavedRepName, 
  getSavedCampaignId, 
  getAllLocalLeads, 
  saveLocalLead, 
  deleteLocalLead, 
  syncPendingLeads 
} from './lib/storage';
import { testCloudConnection, fetchLeadsFromSupabase, syncLeadToSupabase, supabase } from './lib/supabase';
import { Header } from './components/Header';
import { LeadsTable } from './components/LeadsTable';
import { ScannerModal } from './components/ScannerModal';
import { ReviewModal } from './components/ReviewModal';
import { SettingsModal } from './components/SettingsModal';

export function App() {
  const [repName, setRepName] = useState<string>(getSavedRepName);
  const [campaignId, setCampaignId] = useState<string>(getSavedCampaignId);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [activeReviewLead, setActiveReviewLead] = useState<Lead | null>(null);

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
    setLeads(local);
  }, [campaignId]);

  useEffect(() => {
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
  }, [loadLeads]);

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

  // Single scan captured
  const handleSingleLeadCaptured = (newLead: Lead) => {
    setIsScannerOpen(false);
    setActiveReviewLead(newLead);
  };

  // Batch scan captured
  const handleBatchCaptured = (batchLeads: Lead[]) => {
    setIsScannerOpen(false);
    if (batchLeads.length > 0) {
      setActiveReviewLead(batchLeads[0]);
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

  const pendingCount = leads.filter(l => !l.synced_to_cloud).length;

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-slate-50 flex flex-col font-sans text-slate-900 pb-12">
      {/* Global Header */}
      <Header
        repName={repName}
        campaignId={campaignId}
        isOnline={isOnline}
        pendingSyncCount={pendingCount}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 sm:py-6">
        <LeadsTable
          leads={leads}
          activeCampaignId={campaignId}
          repName={repName}
          onOpenScanner={() => setIsScannerOpen(true)}
          onSelectLead={(lead) => {
            setActiveReviewLead(lead);
          }}
          onDeleteLead={handleDeleteLead}
        />
      </main>

      {/* Scanner View Modal */}
      {isScannerOpen && (
        <ScannerModal
          campaignId={campaignId}
          repName={repName}
          onLeadCaptured={handleSingleLeadCaptured}
          onBatchCaptured={handleBatchCaptured}
          onClose={() => setIsScannerOpen(false)}
        />
      )}

      {/* Review & Edit Modal */}
      {activeReviewLead && (
        <ReviewModal
          lead={activeReviewLead}
          onSave={handleSaveReviewedLead}
          onClose={() => setActiveReviewLead(null)}
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          currentRepName={repName}
          currentCampaignId={campaignId}
          onUpdate={(newRep, newCamp) => {
            setRepName(newRep);
            setCampaignId(newCamp);
            loadLeads();
          }}
          onClose={() => setIsSettingsOpen(false)}
          isOnline={isOnline}
          onTriggerSync={handleManualSync}
          isSyncing={isSyncing}
        />
      )}
    </div>
  );
}

export default App;
