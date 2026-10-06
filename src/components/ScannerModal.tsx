import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Layers, X, Play, Loader2 } from 'lucide-react';
import type { Lead, ScanBatchItem } from '../types';
import { processFormImage } from '../lib/ocrEngine';

interface ScannerModalProps {
  campaignId: string;
  repName: string;
  onLeadCaptured: (lead: Lead) => void;
  onBatchCaptured: (leads: Lead[]) => void;
  onClose: () => void;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  campaignId,
  repName,
  onLeadCaptured,
  onBatchCaptured,
  onClose
}) => {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [batchItems, setBatchItems] = useState<ScanBatchItem[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Start Camera
  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError('Geen toegang tot camera (of camera niet beschikbaar). Gebruik fotoupload of testknop.');
      setCameraActive(false);
    }
  };

  // Stop Camera
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Snap photo from video stream
  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    await handleImageCaptured(dataUrl);
  };

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          await handleImageCaptured(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Process captured image
  const handleImageCaptured = async (dataUrl: string) => {
    setIsProcessing(true);
    try {
      if (mode === 'single') {
        const lead = await processFormImage(dataUrl, campaignId, repName);
        setIsProcessing(false);
        stopCamera();
        onLeadCaptured(lead);
      } else {
        // Batch mode: add to batch list
        const newItem: ScanBatchItem = {
          id: crypto.randomUUID(),
          imageBlob: new Blob(),
          previewUrl: dataUrl,
          status: 'processing'
        };
        setBatchItems((prev) => [...prev, newItem]);

        const lead = await processFormImage(dataUrl, campaignId, repName, batchItems.length);
        setBatchItems((prev) =>
          prev.map((item) =>
            item.id === newItem.id ? { ...item, status: 'done', extractedLead: lead } : item
          )
        );
        setIsProcessing(false);
      }
    } catch (err) {
      console.error('Scan processing error:', err);
      setIsProcessing(false);
    }
  };

  // Trigger Instant Demo Scan
  const triggerDemoScan = async () => {
    setIsProcessing(true);
    // Draw a synthetic representation of the Miltenyi Contact Form
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1700;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 1200, 1700);
      
      // Header
      ctx.fillStyle = '#002B49';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText('Contact form', 80, 120);

      ctx.fillStyle = '#002B49';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText('Miltenyi Biotec', 850, 120);

      // Divider
      ctx.strokeStyle = '#002B49';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(80, 160);
      ctx.lineTo(1120, 160);
      ctx.stroke();

      // Fields
      ctx.fillStyle = '#333333';
      ctx.font = '26px sans-serif';
      ctx.fillText('First Name*:  Dr. Sophie', 80, 240);
      ctx.fillText('Last Name*:  van den Berg', 600, 240);
      ctx.fillText('Email*:  s.vdberg@nki.nl', 80, 340);
      ctx.fillText('University/Institution/Company:  NKI - Antoni van Leeuwenhoek', 80, 440);
      ctx.fillText('Department:  Division of Immunology', 80, 540);

      ctx.font = 'bold 38px sans-serif';
      ctx.fillText('How can we support you with your research?', 80, 680);

      // Notes Box
      ctx.strokeRect(80, 720, 1040, 750);
      ctx.font = 'italic 28px serif';
      ctx.fillStyle = '#111827';
      ctx.fillText('Interested in MACSQuant Tyto cell sorter for sterile CAR-T cell manufacturing.', 110, 800);
      ctx.fillText('Currently using flow cytometry with REAfinity antibodies.', 110, 860);
      ctx.fillText('Needs quotation for autoMACS Pro separator next month.', 110, 920);

      // Checkbox
      ctx.strokeRect(80, 1550, 30, 30);
      ctx.fillRect(85, 1555, 20, 20); // Checked
      ctx.font = '22px sans-serif';
      ctx.fillStyle = '#444444';
      ctx.fillText('Yes, I want to receive scientific news, product promotions... - sign me up for newsletter', 130, 1575);
    }
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    await handleImageCaptured(dataUrl);
  };

  const handleFinishBatch = () => {
    const readyLeads = batchItems
      .filter((b) => b.extractedLead !== undefined)
      .map((b) => b.extractedLead!);
    stopCamera();
    onBatchCaptured(readyLeads);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Top Control Bar */}
        <div className="bg-[#002B49] text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-orange-400" />
            <h2 className="font-bold text-base sm:text-lg">Miltenyi Formulier Scanner</h2>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1 bg-blue-950 p-1 rounded-xl border border-blue-800">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                mode === 'single' ? 'bg-orange-600 text-white shadow' : 'text-blue-300 hover:text-white'
              }`}
            >
              Enkele Scan
            </button>
            <button
              type="button"
              onClick={() => setMode('batch')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 ${
                mode === 'batch' ? 'bg-orange-600 text-white shadow' : 'text-blue-300 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Batch (Burst)</span>
            </button>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder & Controls */}
        <div className="flex-1 bg-black relative flex flex-col items-center justify-center overflow-hidden min-h-[320px] sm:min-h-[420px]">
          {/* Live Video */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              cameraActive ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Form Alignment Guidelines Overlay */}
          <div className="absolute inset-6 sm:inset-10 border-2 border-dashed border-white/60 rounded-2xl pointer-events-none flex flex-col justify-between p-4 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
            <div className="flex justify-between items-start text-[11px] text-white/80 font-mono tracking-wider">
              <span>[ CONTACT DETAILS ]</span>
              <span className="text-orange-400 font-bold">MILTENYI FORM</span>
            </div>

            {/* Note box outline guideline */}
            <div className="my-auto h-40 border border-white/40 rounded-lg flex items-center justify-center">
              <span className="text-xs text-white/70 font-semibold bg-black/40 px-3 py-1 rounded">
                Plaats "Research Support" veld hier
              </span>
            </div>

            <div className="text-center text-[11px] text-white/80 font-mono">
              [ NEWSLETTER CHECKBOX ]
            </div>
          </div>

          {/* Camera Error / Fallback Card */}
          {(!cameraActive || cameraError) && (
            <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center text-white">
              <Camera className="w-12 h-12 text-slate-400 mb-3" />
              <p className="text-sm font-medium text-slate-300 max-w-sm mb-4">
                {cameraError || 'Camera initialiseren... Zorg voor cameratoegang in je browser.'}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-xs font-semibold transition-colors"
                >
                  Opnieuw proberen
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4" /> Foto uploaden
                </button>
              </div>
            </div>
          )}

          {/* Processing Spinner Overlay */}
          {isProcessing && (
            <div className="absolute inset-0 bg-slate-950/75 flex flex-col items-center justify-center text-white z-20">
              <Loader2 className="w-10 h-10 animate-spin text-orange-500 mb-2" />
              <p className="text-sm font-semibold">Handschrift analyseren & velden splitsen...</p>
              <p className="text-xs text-slate-400 mt-1">Extractie van 7 velden + research notes</p>
            </div>
          )}
        </div>

        {/* Batch Preview Tray (if batch mode has items) */}
        {mode === 'batch' && batchItems.length > 0 && (
          <div className="bg-slate-100 p-3 border-t border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto py-1">
              {batchItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="relative w-12 h-16 rounded-lg overflow-hidden border-2 border-orange-500 bg-white shadow-sm shrink-0"
                >
                  <img src={item.previewUrl} alt={`Scan ${idx + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-white text-center font-bold">
                    #{idx + 1}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleFinishBatch}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 shadow flex items-center gap-1.5"
            >
              Klaar ({batchItems.length}) → Review
            </button>
          </div>
        )}

        {/* Bottom Shutter & Action Bar */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-4">
          {/* File Upload Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple={mode === 'batch'}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-2xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors shadow-sm"
            title="Upload foto vanaf toestel"
          >
            <Upload className="w-5 h-5" />
          </button>

          {/* Shutter Button */}
          <button
            type="button"
            disabled={isProcessing}
            onClick={capturePhoto}
            className="w-16 h-16 rounded-full bg-orange-600 hover:bg-orange-500 active:scale-95 text-white flex items-center justify-center shadow-lg transition-transform border-4 border-white ring-4 ring-orange-200"
            title="Maak foto"
          >
            <Camera className="w-7 h-7" />
          </button>

          {/* Instant Demo Test Button */}
          <button
            type="button"
            onClick={triggerDemoScan}
            disabled={isProcessing}
            className="px-3.5 py-2.5 rounded-2xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-900 text-xs font-semibold transition-colors shadow-sm flex items-center gap-1.5"
            title="Test met standaard Miltenyi contactformulier"
          >
            <Play className="w-4 h-4 text-orange-600" />
            <span className="hidden sm:inline">Test met Formulier</span>
            <span className="sm:hidden">Test</span>
          </button>
        </div>
      </div>
    </div>
  );
};
