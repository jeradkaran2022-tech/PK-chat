import {
  MAX_LARGE_VIDEO_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
  isSafeMediaUrl,
} from './securityShield';

const FIRESTORE_MEDIA_SAFE_CHAR_LIMIT = 330000;

export const MAX_CHAT_VIDEO_DURATION_SECONDS = MAX_VIDEO_DURATION_SECONDS; // 4 hours (14,400s)
export const MAX_CHAT_VIDEO_BYTES = MAX_LARGE_VIDEO_BYTES; // 2 GB

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDurationClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0:00';
  const rounded = Math.max(1, Math.round(totalSeconds));
  const hrs = Math.floor(rounded / 3600);
  const mins = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  if (hrs > 0) {
    return `${hrs}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function validateVideoDurationSeconds(durationSeconds: number): {
  valid: boolean;
  durationLabel: string;
  error?: string;
} {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return {
      valid: false,
      durationLabel: '0:00',
      error: 'Video duration could not be verified or stream is empty.',
    };
  }
  const durationLabel = formatDurationClock(durationSeconds);
  if (durationSeconds > MAX_CHAT_VIDEO_DURATION_SECONDS) {
    return {
      valid: false,
      durationLabel,
      error: `Selected video is ${durationLabel}. Maximum supported chat video length is 4 hours (4h 00m 00s).`,
    };
  }
  return { valid: true, durationLabel };
}

/**
 * Reads video duration & dimensions using URL.createObjectURL + off-DOM <video preload="metadata">
 * so multi-GB / 4-hour videos never touch FileReader.readAsDataURL or cause browser RAM crashes.
 */
export async function inspectVideoFileMetadata(file: File | Blob): Promise<{
  durationSeconds: number;
  durationLabel: string;
  width: number;
  height: number;
}> {
  if (!file || file.size <= 0) {
    throw new Error('Selected video file is empty.');
  }
  if (file.size > MAX_CHAT_VIDEO_BYTES) {
    throw new Error(
      `Video is ${formatFileSize(file.size)}. Maximum allowed file size is 2 GB (up to 4 hours).`
    );
  }
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return { durationSeconds: 0, durationLabel: 'Ready', width: 0, height: 0 };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      let settled = false;
      const finishError = (msg: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        video.removeAttribute('src');
        video.load();
        reject(new Error(msg));
      };

      const timeoutId = window.setTimeout(() => {
        finishError('Timed out inspecting video metadata. Please ensure the file is a valid MP4/WebM/MOV video.');
      }, 15_000);

      video.onloadedmetadata = () => {
        if (settled) return;
        const duration = Number(video.duration);
        const width = Number(video.videoWidth || 0);
        const height = Number(video.videoHeight || 0);
        if (!Number.isFinite(duration) || duration <= 0) {
          finishError('Selected video stream could not be decoded or has invalid duration.');
          return;
        }
        const check = validateVideoDurationSeconds(duration);
        if (!check.valid) {
          finishError(check.error || 'Video exceeds the 4-hour maximum duration.');
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        video.removeAttribute('src');
        video.load();
        resolve({
          durationSeconds: Math.round(duration),
          durationLabel: check.durationLabel,
          width,
          height,
        });
      };

      video.onerror = () => {
        finishError('Selected file could not be decoded as a playable video.');
      };

      video.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function getDocExtensionBadge(
  fileName?: string,
  mimeType?: string
): { ext: string; colorClass: string } {
  const extFromName = fileName?.split('.').pop()?.trim().toUpperCase() || '';
  const ext = extFromName.slice(0, 5) || (mimeType?.split('/').pop()?.toUpperCase().slice(0, 5) ?? 'FILE');

  if (ext === 'PDF' || mimeType === 'application/pdf') {
    return { ext: 'PDF', colorClass: 'bg-rose-600 text-white' };
  }
  if (ext === 'DOC' || ext === 'DOCX' || mimeType?.includes('word')) {
    return { ext: ext === 'DOC' ? 'DOC' : 'DOCX', colorClass: 'bg-blue-700 text-white' };
  }
  if (ext === 'XLS' || ext === 'XLSX' || ext === 'CSV' || mimeType?.includes('sheet') || mimeType?.includes('excel')) {
    return { ext: ext || 'XLS', colorClass: 'bg-[#0284c7] text-white' };
  }
  if (ext === 'PPT' || ext === 'PPTX') {
    return { ext: ext, colorClass: 'bg-amber-600 text-white' };
  }
  if (ext === 'ZIP' || ext === 'RAR' || ext === '7Z') {
    return { ext: ext, colorClass: 'bg-indigo-700 text-white' };
  }
  return { ext: ext || 'FILE', colorClass: 'bg-slate-700 text-white' };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read file contents.'));
      }
    };
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Selected photo could not be decoded.'));
    img.src = src;
  });
}

/**
 * Compresses any photo (up to 15 MB raw) cleanly onto a canvas so it fits comfortably
 * inside Cloud Firestore's 350 KB `mediaPreviewData` cap while preserving sharp WhatsApp clarity.
 */
export async function compressChatPhoto(file: File): Promise<{
  dataUrl: string;
  mimeType: string;
  sizeLabel: string;
}> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (JPEG, PNG, or WebP).');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Photo is larger than 15 MB. Please choose a smaller photo.');
  }

  const rawUrl = await readFileAsDataUrl(file);
  const img = await loadHtmlImage(rawUrl);

  const dimensionSteps = [1280, 960, 720, 540];
  const qualitySteps = [0.85, 0.72, 0.6, 0.48, 0.36];

  for (const maxDim of dimensionSteps) {
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const width = Math.max(1, Math.round((img.naturalWidth || maxDim) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || maxDim) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas image processor unavailable in this browser.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const q of qualitySteps) {
      const encoded = canvas.toDataURL('image/jpeg', q);
      if (encoded.length <= FIRESTORE_MEDIA_SAFE_CHAR_LIMIT) {
        return {
          dataUrl: encoded,
          mimeType: 'image/jpeg',
          sizeLabel: formatFileSize(file.size),
        };
      }
    }
  }

  throw new Error('Photo could not be compressed under 330 KB for cloud delivery.');
}

/**
 * Reads documents (PDF, DOC, DOCX, XLS, TXT, ZIP, etc.) up to 240 KB raw as downloadable data URLs,
 * matching Firestore's 350,000-character security rule constraint.
 */
export async function prepareDocumentAttachment(file: File): Promise<{
  dataUrl: string;
  mimeType: string;
  sizeLabel: string;
}> {
  const MAX_RAW_DOC_BYTES = 240 * 1024;
  if (file.size > MAX_RAW_DOC_BYTES) {
    throw new Error(
      `"${file.name}" is ${formatFileSize(file.size)}. Direct cloud document attachments support files up to 240 KB so recipients can download them safely.`
    );
  }
  const dataUrl = await readFileAsDataUrl(file);
  if (dataUrl.length > FIRESTORE_MEDIA_SAFE_CHAR_LIMIT) {
    throw new Error(
      `"${file.name}" exceeds the 330 KB encrypted document packet limit. Choose a smaller file.`
    );
  }
  return {
    dataUrl,
    mimeType: file.type || 'application/octet-stream',
    sizeLabel: formatFileSize(file.size),
  };
}

/**
 * Generates a custom portrait avatar JPEG dataUrl (under 30 KB) from an avatar style theme + name,
 * giving users instant one-click avatar customization if they don't upload a photo yet.
 */
export function renderMonogramAvatarDataUrl(
  fullName: string,
  palette: { bgStart: string; bgEnd: string; accent: string }
): string {
  const size = 320;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, palette.bgStart);
  grad.addColorStop(1, palette.bgEnd);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = palette.accent;
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.arc(size * 0.82, size * 0.22, size * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const clean = (fullName || 'PK').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
      : clean.slice(0, 2).toUpperCase();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 124px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials || 'PK', size / 2, size / 2 + 6);

  return canvas.toDataURL('image/jpeg', 0.88);
}

/**
 * Safely triggers a file download for both data: URLs and https: URLs without popups.
 */
export function triggerMediaDownload(dataUrl: string, fileName: string): void {
  if (!dataUrl || !isSafeMediaUrl(dataUrl)) return;
  const safeName =
    (fileName || 'pk-chat-attachment')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140) || 'pk-chat-attachment';
  try {
    if (dataUrl.startsWith('data:')) {
      const [header, b64] = dataUrl.split(',');
      const mimeMatch = header.match(/data:([^;]+);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const bin = atob(b64 || '');
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);
      return;
    }

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = safeName;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    // Fallback if browser blocks blob
  }
}
