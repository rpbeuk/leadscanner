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
import { testCloudConnection, fetchLeadsFromSupabase } from './lib/supabase';
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

  // Batch queue
  const [batchQueue, setBatchQueue] = useState<Lead[]>([]);
  const [batchIndex, setBatchIndex] = useState<number>(0);

  // Load leads from storage and sync
  const loadLeads = useCallback(async () => {
    const local = await getAllLocalLeads();
    setLeads(local);

    // If online, check Supabase
    const cloudOk = await testCloudConnection();
    setIsOnline(cloudOk);

    if (cloudOk) {
      // Sync pending
      await syncPendingLeads();
      const updatedLocal = await getAllLocalLeads();

      // Also merge any remote leads for this campaign
      const remoteLeads = await fetchLeadsFromSupabase(campaignId);
      const map = new Map<string, Lead>();
      remoteLeads.forEach(r => map.set(r.id, r));
      updatedLocal.forEach(l => map.set(l.id, l)); // local takes precedence

      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setLeads(merged);
    }
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
    setBatchQueue([]);
    setBatchIndex(0);
  };

  // Batch scan captured
  const handleBatchCaptured = (batchLeads: Lead[]) => {
    setIsScannerOpen(false);
    if (batchLeads.length > 0) {
      setBatchQueue(batchLeads);
      setBatchIndex(0);
      setActiveReviewLead(batchLeads[0]);
    }
  };

  // Save reviewed lead
  const handleSaveReviewedLead = async (updatedLead: Lead) => {
    await saveLocalLead(updatedLead);
    await loadLeads();

    // Trigger sync in background
    syncPendingLeads().then(() => loadLeads());

    // If in batch review mode, advance to next
    if (batchQueue.length > 0 && batchIndex < batchQueue.length - 1) {
      const nextIdx = batchIndex + 1;
      setBatchIndex(nextIdx);
      setActiveReviewLead(batchQueue[nextIdx]);
    } else {
      setActiveReviewLead(null);
      setBatchQueue([]);
    }
  };

  // Delete lead
  const handleDeleteLead = async (id: string) => {
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
        onManualSync={handleManualSync}
        isSyncing={isSyncing}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-6 overflow-x-hidden">
        <LeadsTable
          leads={leads}
          activeCampaignId={campaignId}
          repName={repName}
          onOpenScanner={() => setIsScannerOpen(true)}
          onSelectLead={(lead) => {
            setActiveReviewLead(lead);
            setBatchQueue([]);
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
          currentIndex={batchQueue.length > 0 ? batchIndex : undefined}
          totalCount={batchQueue.length > 0 ? batchQueue.length : undefined}
          hasNext={batchQueue.length > 0 && batchIndex < batchQueue.length - 1}
          hasPrev={batchQueue.length > 0 && batchIndex > 0}
          onNext={() => {
            if (batchIndex < batchQueue.length - 1) {
              const n = batchIndex + 1;
              setBatchIndex(n);
              setActiveReviewLead(batchQueue[n]);
            }
          }}
          onPrev={() => {
            if (batchIndex > 0) {
              const p = batchIndex - 1;
              setBatchIndex(p);
              setActiveReviewLead(batchQueue[p]);
            }
          }}
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
