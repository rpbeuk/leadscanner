import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, X, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import type { Lead } from '../types';
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
  onClose
}) => {
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);

  // Request WebRTC Camera Permission & Stream
  const requestCameraPermission = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('unsupported_webrtc');
      return;
    }

    try {
      setCameraError(null);
      let stream: MediaStream | null = null;

      // Try environment / back camera first
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
      } catch (e1) {
        // Fallback to simpler environment constraint
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false
          });
        } catch (e2) {
          // Fallback to any available video stream
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }
      }

      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Video autoPlay deferred:', playErr);
        }
        setCameraActive(true);
      }
    } catch (err: any) {
      console.warn('Camera access / permission error:', err);
      setCameraError('permission_blocked');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    requestCameraPermission();
    return () => {
      stopCamera();
    };
  }, []);

  // Process captured image with Gemini Vision / OCR
  const handleImageCaptured = async (dataUrl: string) => {
    setIsProcessing(true);
    try {
      const lead = await processFormImage(dataUrl, campaignId, repName);
      setIsProcessing(false);
      stopCamera();
      onLeadCaptured(lead);
    } catch (err) {
      console.error('Scan processing error:', err);
      setIsProcessing(false);
    }
  };

  // Snap photo from live video stream
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

  // File or camera input handler
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between max-w-full overflow-hidden">
      {/* Hidden Native Inputs */}
      {/* 1. Native Mobile Camera (prompts for camera permission instantly on iPhone & Android) */}
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileInput}
        className="hidden"
      />

      {/* 2. File / Gallery Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        className="hidden"
      />

      {/* Top Bar */}
      <div className="px-5 py-4 flex items-center justify-between text-white z-10 bg-gradient-to-b from-black/80 to-transparent">
        <span className="text-sm font-semibold tracking-wide text-slate-200">
          Miltenyi Contactformulier Scanner
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
        {/* Live video */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            cameraActive ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Alignment Frame */}
        {cameraActive && (
          <div className="absolute inset-8 sm:inset-16 border-2 border-dashed border-white/60 rounded-2xl pointer-events-none flex flex-col justify-between p-4">
            <div className="flex justify-between text-[11px] font-mono text-white/70">
              <span>┌ CONTACT</span>
              <span>MILTENYI ┐</span>
            </div>
            <div className="text-center text-xs font-medium text-white/80 bg-black/40 backdrop-blur-sm py-1.5 px-3 rounded-full mx-auto">
              Lijn formulier uit in het kader
            </div>
            <div className="flex justify-between text-[11px] font-mono text-white/70">
              <span>└ RESEARCH</span>
              <span>CHECKBOX ┘</span>
            </div>
          </div>
        )}

        {/* Permission Request / Fallback UI */}
        {!cameraActive && (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center text-white z-10">
            <div className="w-16 h-16 rounded-3xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mb-4 text-orange-400">
              <Camera className="w-8 h-8" />
            </div>

            <h3 className="text-base font-bold mb-1">Cameratoegang Nodig</h3>
            <p className="text-xs text-slate-300 max-w-xs mb-3 leading-relaxed">
              Tik hieronder om cameratoestemming te geven en direct een formulier te fotograferen.
            </p>
            {cameraError === 'permission_blocked' && (
              <p className="text-xs text-amber-400 bg-amber-950/60 border border-amber-500/30 rounded-lg px-3 py-1.5 mb-3 max-w-xs">
                Toegang geweigerd in browser. Tik op "Open Direct Telefoon Camera" hieronder.
              </p>
            )}

            <div className="flex flex-col gap-2.5 w-full max-w-xs">
              {/* Primary Camera Permission Action */}
              <button
                type="button"
                onClick={async () => {
                  if (typeof navigator.mediaDevices?.getUserMedia === 'function') {
                    await requestCameraPermission();
                  } else {
                    nativeCameraInputRef.current?.click();
                  }
                }}
                className="w-full py-3.5 rounded-2xl bg-orange-600 hover:bg-orange-500 active:scale-95 text-white text-sm font-bold shadow-lg shadow-orange-600/30 flex items-center justify-center gap-2 transition-all"
              >
                <Camera className="w-5 h-5" />
                <span>Geef Cameratoestemming</span>
              </button>

              {/* Native Mobile Camera Button */}
              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Open Direct Telefoon Camera</span>
              </button>

              {/* Gallery Pick */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 rounded-xl border border-white/20 hover:bg-white/10 text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors mt-1"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Foto uit bibliotheek kiezen</span>
              </button>
            </div>
          </div>
        )}

        {/* Processing Spinner */}
        {isProcessing && (
          <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center text-white z-20">
            <Loader2 className="w-10 h-10 animate-spin text-orange-500 mb-3" />
            <p className="text-sm font-bold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-orange-400" />
              <span>Gemini Vision AI analyseert formulier...</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">Uitsnedes genereren en 7 velden extraheren</p>
          </div>
        )}
      </div>

      {/* Bottom Shutter Controls */}
      <div className="px-8 py-6 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-around z-10">
        {/* Upload Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-3.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Foto uit bibliotheek"
        >
          <Upload className="w-5 h-5" />
        </button>

        {/* Shutter Button */}
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => {
            if (cameraActive) {
              capturePhoto();
            } else {
              nativeCameraInputRef.current?.click();
            }
          }}
          className="w-18 h-18 rounded-full bg-white p-1 shadow-lg active:scale-95 transition-transform"
          title="Maak foto"
        >
          <div className="w-16 h-16 rounded-full bg-orange-600 hover:bg-orange-500 flex items-center justify-center text-white">
            <Camera className="w-7 h-7" />
          </div>
        </button>

        {/* Native camera direct launcher */}
        <button
          type="button"
          onClick={() => nativeCameraInputRef.current?.click()}
          className="p-3.5 rounded-full bg-white/10 hover:bg-white/20 text-orange-400 transition-colors"
          title="Direct iPhone Camera"
        >
          <Camera className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
