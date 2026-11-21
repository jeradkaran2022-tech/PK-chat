import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Image as ImageIcon,
  Move,
  RotateCcw,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import { renderCroppedProfileImage, validateProfileImageFile } from '../lib/profileImageUtils';

interface ProfileImageEditorModalProps {
  open: boolean;
  mode: 'avatar' | 'cover';
  initialImageUrl?: string;
  onClose: () => void;
  onSaveComplete: (result: {
    dataUrl: string;
    mimeType: string;
    estimatedBytes: number;
  }) => Promise<void> | void;
}

export function ProfileImageEditorModal({
  open,
  mode,
  initialImageUrl,
  onClose,
  onSaveComplete,
}: ProfileImageEditorModalProps) {
  const [sourceUrl, setSourceUrl] = useState<string>(initialImageUrl || '');
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (open) {
      setSourceUrl(initialImageUrl || '');
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
      setProgressPct(0);
      setErrorMsg(null);
      setBusy(false);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open, initialImageUrl]);

  if (!open) return null;

  const handleGalleryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);

    const check = validateProfileImageFile(file);
    if (!check.valid) {
      setErrorMsg(check.error || 'Invalid image file.');
      return;
    }

    stopCamera();
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceUrl(reader.result);
        setZoom(1);
        setOffsetX(0);
        setOffsetY(0);
      }
    };
    reader.onerror = () => {
      setErrorMsg('Unable to read selected image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleStartCamera = async () => {
    setErrorMsg(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Camera capture is not supported in this browser.');
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode === 'avatar' ? 'user' : 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraActive(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `Camera permission unavailable (${err.message}). Choose a photo from Gallery instead.`
          : 'Camera permission denied. Choose a photo from Gallery instead.'
      );
      stopCamera();
    }
  };

  const handleCaptureSnapshot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setErrorMsg('Camera feed is still initializing. Wait a moment and capture again.');
      return;
    }
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = video.videoWidth;
    snapCanvas.height = video.videoHeight;
    const ctx = snapCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
    const capturedDataUrl = snapCanvas.toDataURL('image/jpeg', 0.92);
    setSourceUrl(capturedDataUrl);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    stopCamera();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sourceUrl || cameraActive) return;
    setDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      origX: offsetX,
      origY: offsetY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const nextX = Math.max(-100, Math.min(100, Math.round(dragStartRef.current.origX + dx * 0.7)));
    const nextY = Math.max(-100, Math.min(100, Math.round(dragStartRef.current.origY + dy * 0.7)));
    setOffsetX(nextX);
    setOffsetY(nextY);
  };

  const handlePointerUp = () => {
    setDragging(false);
    dragStartRef.current = null;
  };

  const handleApplyAndUpload = async () => {
    if (!sourceUrl) {
      setErrorMsg('Upload a photo from Gallery or take one with Camera first.');
      return;
    }
    setErrorMsg(null);
    setBusy(true);
    setProgressPct(10);
    try {
      const rendered = await renderCroppedProfileImage({
        sourceUrl,
        outputWidth: mode === 'avatar' ? 512 : 960,
        outputHeight: mode === 'avatar' ? 512 : 540,
        zoom,
        offsetXPercent: offsetX,
        offsetYPercent: offsetY,
        maxDataUrlLength: mode === 'avatar' ? 180000 : 270000,
        onProgress: (pct) => setProgressPct(pct),
      });
      setProgressPct(98);
      await onSaveComplete(rendered);
      setProgressPct(100);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to process and upload cropped image.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-sky-950/55 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-lg w-full max-h-[92vh] flex flex-col rounded-3xl bg-[#e6f4ff]/88 dark:bg-slate-900/92 backdrop-blur-2xl border border-[#7dd3fc] dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">
              {mode === 'avatar' ? 'Edit Profile Photo' : 'Edit Profile Cover Image'}
            </h2>
            <p className="text-[11px] text-sky-100">
              JPEG, PNG, or WebP up to 10 MB · Crop, zoom, and reposition before saving
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-white/10"
            aria-label="Close photo editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Source Selector Buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleGalleryFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4 text-[#0284c7]" />
              <span>Select from Gallery</span>
            </button>

            <button
              type="button"
              onClick={cameraActive ? handleCaptureSnapshot : handleStartCamera}
              className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 ${
                cameraActive
                  ? 'bg-[#0284c7] hover:bg-[#0369a1] text-white'
                  : 'bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>{cameraActive ? 'Capture Photo' : 'Take New Photo'}</span>
            </button>
          </div>

          {cameraActive && (
            <button
              type="button"
              onClick={stopCamera}
              className="w-full py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
            >
              Cancel Camera Preview
            </button>
          )}

          {/* Interactive Crop Viewport / Live Camera */}
          <div className="flex justify-center">
            {cameraActive ? (
              <div
                className={`relative w-full overflow-hidden rounded-2xl bg-slate-950 border border-slate-700 ${
                  mode === 'avatar' ? 'max-w-[280px] aspect-square' : 'aspect-video'
                }`}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className={`relative w-full overflow-hidden bg-slate-950 border-2 border-dashed border-slate-300 dark:border-slate-700 select-none touch-none ${
                  sourceUrl ? 'cursor-grab active:cursor-grabbing' : ''
                } ${
                  mode === 'avatar'
                    ? 'max-w-[270px] aspect-square rounded-full'
                    : 'aspect-video rounded-2xl'
                }`}
              >
                {sourceUrl ? (
                  <img
                    src={sourceUrl}
                    alt="Crop preview"
                    draggable={false}
                    className="w-full h-full object-cover pointer-events-none transition-transform duration-75"
                    style={{
                      transform: `translate(${offsetX * 0.4}%, ${offsetY * 0.4}%) scale(${zoom})`,
                      transformOrigin: 'center center',
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 text-center gap-2">
                    <ImageIcon className="w-8 h-8 opacity-70" />
                    <span className="text-xs">
                      Select an image or capture from camera to preview crop
                    </span>
                  </div>
                )}

                {sourceUrl && (
                  <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-sky-400/70" />
                )}
              </div>
            )}
          </div>

          {/* Crop Controls: Zoom & Reposition */}
          {!cameraActive && sourceUrl && (
            <div className="p-3.5 rounded-2xl bg-[#d6eeff]/80 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <ZoomIn className="w-3.5 h-3.5 text-[#0284c7]" />
                  <span>Zoom ({zoom.toFixed(2)}x)</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setOffsetX(0);
                    setOffsetY(0);
                  }}
                  className="text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-1 hover:underline"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Framing</span>
                </button>
              </div>
              <input
                type="range"
                min={1}
                max={3.5}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full accent-emerald-600"
              />

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <span className="flex items-center gap-1">
                      <Move className="w-3 h-3" /> Horizontal
                    </span>
                    <span className="font-mono">{offsetX}%</span>
                  </label>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={2}
                    value={offsetX}
                    onChange={(e) => setOffsetX(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-600"
                  />
                </div>
                <div>
                  <label className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <span className="flex items-center gap-1">
                      <Move className="w-3 h-3" /> Vertical
                    </span>
                    <span className="font-mono">{offsetY}%</span>
                  </label>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={2}
                    value={offsetY}
                    onChange={(e) => setOffsetY(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-600"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Tip: Drag directly on the photo above or use the sliders to frame your shot.
              </p>
            </div>
          )}

          {/* Upload Progress Bar */}
          {busy && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-[#0284c7] dark:text-[#38bdf8]">
                <span>Compressing, verifying &amp; syncing securely...</span>
                <span className="font-mono">{progressPct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-[#0284c7] transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <p className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-200">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#7dd3fc]/60 dark:border-slate-800 flex items-center justify-end gap-2.5 bg-[#d6eeff]/80 dark:bg-slate-950">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !sourceUrl || cameraActive}
            onClick={handleApplyAndUpload}
            className="px-5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{busy ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
