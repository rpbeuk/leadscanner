import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, X, Play, Loader2 } from 'lucide-react';
import type { Lead } from '../types';
import { processFormImage, renderSyntheticFormImage } from '../lib/ocrEngine';

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
  onClose
}) => {
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
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
      setCameraError('Camera niet geopend. Gebruik de fotoupload of de testknop hieronder.');
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

  // Process captured image
  const handleImageCaptured = async (dataUrl: string, profileIdx = 0) => {
    setIsProcessing(true);
    try {
      const lead = await processFormImage(dataUrl, campaignId, repName, profileIdx);
      setIsProcessing(false);
      stopCamera();
      onLeadCaptured(lead);
    } catch (err) {
      console.error('Scan processing error:', err);
      setIsProcessing(false);
    }
  };

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

    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target?.result) {
        await handleImageCaptured(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  // Trigger Demo Scan
  const triggerDemoScan = async () => {
    setIsProcessing(true);
    const randomIdx = Math.floor(Math.random() * 4);
    const dataUrl = renderSyntheticFormImage(randomIdx);
    await handleImageCaptured(dataUrl, randomIdx);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between">
      {/* Top Bar */}
      <div className="px-5 py-4 flex items-center justify-between text-white z-10 bg-gradient-to-b from-black/80 to-transparent">
        <span className="text-sm font-semibold tracking-wide text-slate-200">
          Lijn formulier uit in kader
        </span>
        <button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Viewfinder Center */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {/* Camera stream */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={`w-full h-full object-cover ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
        />

        {/* Crisp Document Corner Frame */}
        <div className="absolute inset-8 sm:inset-16 border-2 border-white/50 rounded-2xl pointer-events-none flex flex-col justify-between p-4">
          <div className="flex justify-between text-[11px] font-mono text-white/70">
            <span>┌ CONTACT</span>
            <span>MILTENYI ┐</span>
          </div>
          <div className="text-center text-xs font-medium text-white/70 bg-black/30 backdrop-blur-sm py-1 px-3 rounded-full mx-auto">
            Houd formulier recht en stil
          </div>
          <div className="flex justify-between text-[11px] font-mono text-white/70">
            <span>└ RESEARCH</span>
            <span>CHECKBOX ┘</span>
          </div>
        </div>

        {/* Fallback if no camera */}
        {(!cameraActive || cameraError) && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center text-white z-10">
            <Camera className="w-10 h-10 text-slate-500 mb-3" />
            <p className="text-xs text-slate-300 max-w-xs mb-5">
              {cameraError || 'Camera initialiseren...'}
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Foto van formulier uploaden</span>
              </button>
              <button
                type="button"
                onClick={triggerDemoScan}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-3.5 h-3.5 text-orange-400" />
                <span>Simuleer test-scan</span>
              </button>
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        {isProcessing && (
          <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-white z-20">
            <Loader2 className="w-10 h-10 animate-spin text-orange-500 mb-3" />
            <p className="text-sm font-semibold">Formulier verwerken...</p>
            <p className="text-xs text-slate-400 mt-0.5">Uitsnedes maken & CRM controleren</p>
          </div>
        )}
      </div>

      {/* Bottom Shutter Controls (Clean iOS style) */}
      <div className="px-8 py-6 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-between z-10">
        {/* Upload Button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-3.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Upload foto"
        >
          <Upload className="w-5 h-5" />
        </button>

        {/* Shutter Button */}
        <button
          type="button"
          disabled={isProcessing}
          onClick={capturePhoto}
          className="w-18 h-18 rounded-full bg-white p-1 shadow-lg active:scale-95 transition-transform"
        >
          <div className="w-16 h-16 rounded-full bg-orange-600 hover:bg-orange-500 flex items-center justify-center text-white">
            <Camera className="w-7 h-7" />
          </div>
        </button>

        {/* Quick Demo Test Button */}
        <button
          type="button"
          disabled={isProcessing}
          onClick={triggerDemoScan}
          className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-orange-400 transition-colors flex items-center justify-center"
          title="Test scan"
        >
          <Play className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
