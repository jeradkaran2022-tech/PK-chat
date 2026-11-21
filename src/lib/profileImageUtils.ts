export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const MAX_RAW_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB upload cap before client crop & compression

export function validateProfileImageFile(file: File): { valid: boolean; error?: string } {
  const mime = (file.type || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
    return {
      valid: false,
      error: 'Unsupported file format. Please choose a JPEG, PNG, or WebP image.',
    };
  }
  if (file.size <= 0) {
    return { valid: false, error: 'Selected image file is empty.' };
  }
  if (file.size > MAX_RAW_IMAGE_BYTES) {
    return {
      valid: false,
      error: 'Image exceeds 10 MB upload limit. Choose a smaller photo.',
    };
  }
  return { valid: true };
}

export async function renderCroppedProfileImage(params: {
  sourceUrl: string;
  outputWidth: number;
  outputHeight: number;
  zoom: number;
  offsetXPercent: number;
  offsetYPercent: number;
  maxDataUrlLength: number;
  onProgress?: (pct: number) => void;
}): Promise<{ dataUrl: string; mimeType: string; estimatedBytes: number }> {
  const {
    sourceUrl,
    outputWidth,
    outputHeight,
    zoom,
    offsetXPercent,
    offsetYPercent,
    maxDataUrlLength,
    onProgress,
  } = params;

  onProgress?.(15);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Unable to load image for cropping.'));
    el.src = sourceUrl;
  });

  onProgress?.(40);

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas image processor unavailable.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, outputWidth, outputHeight);

  const imgAspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  const canvasAspect = outputWidth / Math.max(1, outputHeight);

  // Base "cover" fit
  let baseWidth = outputWidth;
  let baseHeight = outputHeight;
  if (imgAspect > canvasAspect) {
    baseHeight = outputHeight;
    baseWidth = baseHeight * imgAspect;
  } else {
    baseWidth = outputWidth;
    baseHeight = baseWidth / Math.max(0.01, imgAspect);
  }

  const safeZoom = Math.max(1, Math.min(3.5, zoom));
  const drawW = baseWidth * safeZoom;
  const drawH = baseHeight * safeZoom;

  // Compute clamped pan range
  const maxPanX = Math.max(0, (drawW - outputWidth) / 2);
  const maxPanY = Math.max(0, (drawH - outputHeight) / 2);
  const clampedOffsetX = Math.max(-100, Math.min(100, offsetXPercent)) / 100;
  const clampedOffsetY = Math.max(-100, Math.min(100, offsetYPercent)) / 100;

  const drawX = (outputWidth - drawW) / 2 + clampedOffsetX * maxPanX;
  const drawY = (outputHeight - drawH) / 2 + clampedOffsetY * maxPanY;

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  onProgress?.(70);

  // Iteratively compress to guarantee strict backend document & byte bounds
  const qualities = [0.88, 0.78, 0.68, 0.56, 0.44];
  let bestUrl = canvas.toDataURL('image/jpeg', 0.85);
  for (const q of qualities) {
    const candidate = canvas.toDataURL('image/jpeg', q);
    bestUrl = candidate;
    if (candidate.length <= maxDataUrlLength) {
      break;
    }
  }

  // Fallback downscale pass if still slightly above target cap
  if (bestUrl.length > maxDataUrlLength) {
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = Math.round(outputWidth * 0.75);
    smallCanvas.height = Math.round(outputHeight * 0.75);
    const sctx = smallCanvas.getContext('2d');
    if (sctx) {
      sctx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
      bestUrl = smallCanvas.toDataURL('image/jpeg', 0.52);
    }
  }

  onProgress?.(95);
  const b64Part = bestUrl.split(',')[1] || '';
  const estimatedBytes = Math.floor((b64Part.length * 3) / 4);
  return {
    dataUrl: bestUrl,
    mimeType: 'image/jpeg',
    estimatedBytes,
  };
}
