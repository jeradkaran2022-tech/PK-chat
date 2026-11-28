import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { auth, storage } from './firebase';
import { StatusPrivacyMode, StatusUpdate } from '../types/pkchat';

export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
const FIRESTORE_SAFE_MEDIA_CHARS = 330000;

export const STATUS_TEXT_BACKGROUNDS = [
  { id: 'sky_frost', label: 'PK Sky Frost', css: '#0284C7', gradient: 'from-[#0284C7] to-[#0369A1]' },
  { id: 'ocean', label: 'Deep Ocean', css: '#1D4ED8', gradient: 'from-blue-700 to-cyan-600' },
  { id: 'Sunset', label: 'Warm Sunset', css: '#C2410C', gradient: 'from-orange-600 to-rose-600' },
  { id: 'plum', label: 'Royal Plum', css: '#7E22CE', gradient: 'from-purple-700 to-fuchsia-600' },
  { id: 'midnight', label: 'Midnight Slate', css: '#0F172A', gradient: 'from-slate-900 to-slate-700' },
  { id: 'crimson', label: 'Crimson Pulse', css: '#BE123C', gradient: 'from-rose-700 to-pink-600' },
  { id: 'teal', label: 'Ice Cyan', css: '#0891B2', gradient: 'from-cyan-600 to-sky-500' },
  { id: 'gold', label: 'Amber Gold', css: '#B45309', gradient: 'from-amber-600 to-yellow-600' },
] as const;

export const STATUS_QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '🔥'] as const;

export function toEpochMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object') {
    const rec = value as { toMillis?: () => number; seconds?: number };
    if (typeof rec.toMillis === 'function') {
      return rec.toMillis();
    }
    if (typeof rec.seconds === 'number') {
      return rec.seconds * 1000;
    }
  }
  return 0;
}

export function isStatusActive(status: Pick<StatusUpdate, 'expiresAt'>, nowMs = Date.now()): boolean {
  const exp = toEpochMs(status.expiresAt);
  return exp > nowMs;
}

export function getStatusRemainingLabel(expiresAt: unknown, nowMs = Date.now()): string {
  const diff = toEpochMs(expiresAt) - nowMs;
  if (diff <= 0) return 'Expired';
  const totalMinutes = Math.max(1, Math.floor(diff / 60000));
  if (totalMinutes < 60) return `${totalMinutes}m left`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m left` : `${hours}h left`;
}

export function formatStatusRelativeTime(createdAt: unknown, nowMs = Date.now()): string {
  const ts = toEpochMs(createdAt);
  if (!ts) return 'Just now';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return 'Yesterday';
}

export function computeAuthorizedViewerIds(params: {
  ownerUid: string;
  privacyMode: StatusPrivacyMode;
  contactUids: string[];
  excludedIds?: string[];
  allowedIds?: string[];
  blockedUserIds?: string[];
}): string[] {
  const {
    ownerUid,
    privacyMode,
    contactUids,
    excludedIds = [],
    allowedIds = [],
    blockedUserIds = [],
  } = params;

  const blockedSet = new Set(blockedUserIds.filter((id) => id && id !== ownerUid));
  const excludedSet = new Set(excludedIds.filter((id) => id && id !== ownerUid));

  let candidateIds: string[] = [];
  if (privacyMode === 'only_share_with') {
    candidateIds = allowedIds;
  } else if (privacyMode === 'contacts_except') {
    candidateIds = contactUids.filter((id) => !excludedSet.has(id));
  } else {
    candidateIds = contactUids;
  }

  const finalSet = new Set<string>([ownerUid]);
  for (const id of candidateIds) {
    if (typeof id === 'string' && id.trim() && !blockedSet.has(id) && !excludedSet.has(id)) {
      finalSet.add(id.trim());
    }
  }
  return Array.from(finalSet).slice(0, 200);
}

export function canUserViewStatus(
  status: Pick<StatusUpdate, 'userId' | 'authorizedViewerIds' | 'excludedViewerIds' | 'expiresAt'>,
  viewerUid: string,
  nowMs = Date.now()
): boolean {
  if (!viewerUid) return false;
  if (status.userId === viewerUid) return isStatusActive(status, nowMs);
  if (!isStatusActive(status, nowMs)) return false;
  if (status.excludedViewerIds?.includes(viewerUid)) return false;
  return Array.isArray(status.authorizedViewerIds) && status.authorizedViewerIds.includes(viewerUid);
}

export interface GroupedContactStatuses {
  userId: string;
  authorName: string;
  authorAvatar?: string;
  statuses: StatusUpdate[];
  latestCreatedAtMs: number;
  hasUnseen: boolean;
  unseenCount: number;
}

export function groupStatusesByAuthor(
  statuses: StatusUpdate[],
  currentUid: string,
  nowMs = Date.now()
): {
  myStatuses: StatusUpdate[];
  recentGroups: GroupedContactStatuses[];
  viewedGroups: GroupedContactStatuses[];
} {
  const active = statuses.filter((s) => canUserViewStatus(s, currentUid, nowMs));

  const myStatuses = active
    .filter((s) => s.userId === currentUid)
    .sort((a, b) => toEpochMs(a.createdAt) - toEpochMs(b.createdAt));

  const othersByAuthor = new Map<string, StatusUpdate[]>();
  for (const s of active) {
    if (s.userId === currentUid) continue;
    const list = othersByAuthor.get(s.userId) || [];
    list.push(s);
    othersByAuthor.set(s.userId, list);
  }

  const recentGroups: GroupedContactStatuses[] = [];
  const viewedGroups: GroupedContactStatuses[] = [];

  for (const [userId, items] of othersByAuthor.entries()) {
    items.sort((a, b) => toEpochMs(a.createdAt) - toEpochMs(b.createdAt));
    const latest = items[items.length - 1];
    const unseenCount = items.filter((s) => !s.viewedByUids?.includes(currentUid)).length;
    const hasUnseen = unseenCount > 0;
    const group: GroupedContactStatuses = {
      userId,
      authorName: latest.authorName,
      authorAvatar: latest.authorAvatar,
      statuses: items,
      latestCreatedAtMs: toEpochMs(latest.createdAt),
      hasUnseen,
      unseenCount,
    };
    if (hasUnseen) {
      recentGroups.push(group);
    } else {
      viewedGroups.push(group);
    }
  }

  recentGroups.sort((a, b) => b.latestCreatedAtMs - a.latestCreatedAtMs);
  viewedGroups.sort((a, b) => b.latestCreatedAtMs - a.latestCreatedAtMs);

  return { myStatuses, recentGroups, viewedGroups };
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Unable to read media blob.'));
    };
    reader.onerror = () => reject(new Error('Failed to read media file.'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to decode selected image.'));
    img.src = src;
  });
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string; ext: string } {
  const match = dataUrl.match(/^data:(image\/(jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    throw new Error('Invalid image encoding. Use JPEG, PNG, or WebP.');
  }
  const mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const ext = match[2].toLowerCase() === 'png' ? 'png' : match[2].toLowerCase() === 'webp' ? 'webp' : 'jpg';
  const bin = atob(match[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: mime }), mimeType: mime, ext };
}

export async function compressStatusImageFile(file: File): Promise<{
  dataUrl: string;
  mimeType: string;
}> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPEG, PNG, or WebP).');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Image exceeds 15 MB limit.');
  }
  const raw = await readAsDataUrl(file);
  const img = await loadImage(raw);

  for (const maxDim of [1440, 1080, 720, 540]) {
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const width = Math.max(1, Math.round((img.naturalWidth || maxDim) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || maxDim) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const q of [0.84, 0.72, 0.58, 0.45]) {
      const encoded = canvas.toDataURL('image/jpeg', q);
      if (encoded.length <= FIRESTORE_SAFE_MEDIA_CHARS) {
        return { dataUrl: encoded, mimeType: 'image/jpeg' };
      }
    }
  }
  throw new Error('Could not compress image under 330 KB.');
}

function formatFirebaseStorageError(err: unknown, mediaLabel: 'Photo' | 'Video'): string {
  const code = (err as { code?: string })?.code || '';
  const message = err instanceof Error ? err.message : String(err || '');

  if (code === 'storage/unauthenticated') {
    return 'Authentication required. Please sign in again before uploading Status media.';
  }
  if (code === 'storage/unauthorized') {
    return `${mediaLabel} upload blocked by Firebase Storage rules on project pkchat-41ef3. Ensure your account email/phone/Google sign-in is verified and publish the updated storage.rules in Firebase Console → Storage → Rules.`;
  }
  if (code === 'storage/bucket-not-found' || message.includes('404')) {
    return 'Firebase Storage is not enabled on project pkchat-41ef3 yet. Open Firebase Console (pkchat-41ef3) → Build → Storage → Get Started, then publish storage.rules.';
  }
  if (code === 'storage/quota-exceeded') {
    return 'Firebase Storage quota exceeded on project pkchat-41ef3. Free up space or upgrade your Storage plan.';
  }
  if (code === 'storage/canceled') {
    return `${mediaLabel} upload was canceled.`;
  }
  if (code === 'storage/retry-limit-exceeded' || message === 'storage_stall_timeout' || message === 'storage_max_timeout') {
    return `${mediaLabel} upload stalled or timed out. Check your internet connection and verify Firebase Storage is enabled on project pkchat-41ef3 with storage.rules deployed.`;
  }
  if (message.toLowerCase().includes('cors') || message.toLowerCase().includes('network')) {
    return `${mediaLabel} upload network/CORS error. Ensure Firebase Storage is initialized on bucket pkchat-41ef3.firebasestorage.app and publish storage.rules.`;
  }
  return message
    ? `${mediaLabel} upload error (${code || 'storage'}): ${message}`
    : `${mediaLabel} upload requires Firebase Storage to be enabled on project pkchat-41ef3 with storage.rules deployed.`;
}

export interface MediaUploadProgressDetail {
  pct: number;
  loadedBytes: number;
  totalBytes: number;
}

async function uploadBlobToFirebaseStorage(params: {
  storagePath: string;
  blob: Blob;
  mimeType: string;
  uid: string;
  onProgress?: (pct: number) => void;
  onProgressDetail?: (detail: MediaUploadProgressDetail) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { storagePath, blob, mimeType, uid, onProgress, onProgressDetail, signal } = params;
  if (signal?.aborted) {
    throw new Error('storage_canceled');
  }
  const fileRef = ref(storage, storagePath);
  onProgress?.(2);
  onProgressDetail?.({ pct: 2, loadedBytes: 0, totalBytes: blob.size });
  const task = uploadBytesResumable(fileRef, blob, {
    contentType: mimeType,
    cacheControl: 'public, max-age=86400',
    customMetadata: { ownerUid: uid },
  });

  await new Promise<void>((resolve, reject) => {
    let lastBytes = -1;
    let settled = false;
    let stallTimer = 0;

    const cleanup = () => {
      if (stallTimer) window.clearTimeout(stallTimer);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        task.cancel();
      } catch {
        // ignore cancel errors
      }
      reject(new Error('storage_canceled'));
    };

    const armStallTimer = () => {
      if (stallTimer) window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          task.cancel();
        } catch {
          // ignore cancel errors
        }
        reject(new Error('storage_stall_timeout'));
      }, 60_000);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    armStallTimer();

    task.on(
      'state_changed',
      (snap) => {
        if (snap.bytesTransferred > lastBytes) {
          lastBytes = snap.bytesTransferred;
          armStallTimer();
        }
        if (snap.totalBytes > 0) {
          const pct = Math.min(97, Math.max(2, Math.round((snap.bytesTransferred / snap.totalBytes) * 97)));
          onProgress?.(pct);
          onProgressDetail?.({
            pct,
            loadedBytes: snap.bytesTransferred,
            totalBytes: snap.totalBytes,
          });
        }
      },
      (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      },
      () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      }
    );
  });

  const url = await getDownloadURL(task.snapshot.ref);
  onProgress?.(100);
  onProgressDetail?.({ pct: 100, loadedBytes: blob.size, totalBytes: blob.size });
  return url;
}

const CHUNKED_UPLOAD_SLICE_BYTES = 2 * 1024 * 1024; // 2 MB binary chunks

async function uploadChunkedToServerRelay(params: {
  uid: string;
  kind: 'vid' | 'aud' | 'doc' | 'img';
  blobOrFile: Blob;
  fileName: string;
  mimeType: string;
  onProgress?: (pct: number) => void;
  onProgressDetail?: (detail: MediaUploadProgressDetail) => void;
  signal?: AbortSignal;
}): Promise<{ url: string; mimeType: string; storedInStorage: boolean }> {
  const { uid, kind, blobOrFile, fileName, mimeType, onProgress, onProgressDetail, signal } = params;
  if (signal?.aborted) {
    throw new Error('Upload canceled by user.');
  }

  let idToken = '';
  try {
    if (auth.currentUser) {
      idToken = await auth.currentUser.getIdToken();
    }
  } catch {
    idToken = '';
  }

  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };

  onProgress?.(1);
  onProgressDetail?.({ pct: 1, loadedBytes: 0, totalBytes: blobOrFile.size });

  const initRes = await fetch('/api/media/upload/init', {
    method: 'POST',
    headers: baseHeaders,
    signal,
    body: JSON.stringify({
      uid,
      kind,
      fileName,
      mimeType,
      totalBytes: blobOrFile.size,
    }),
  });

  const initData = (await initRes.json().catch(() => ({}))) as {
    uploadId?: string;
    uploadToken?: string;
    error?: string;
  };
  if (!initRes.ok || !initData.uploadId || !initData.uploadToken) {
    throw new Error(initData.error || `Unable to start chunked upload (HTTP ${initRes.status}).`);
  }

  const { uploadId, uploadToken } = initData;
  let offset = 0;

  try {
    while (offset < blobOrFile.size) {
      if (signal?.aborted) {
        throw new Error('Upload canceled by user.');
      }
      const nextEnd = Math.min(blobOrFile.size, offset + CHUNKED_UPLOAD_SLICE_BYTES);
      const sliceBlob = blobOrFile.slice(offset, nextEnd);

      let uploadedChunk = false;
      let lastChunkErr: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (signal?.aborted) {
          throw new Error('Upload canceled by user.');
        }
        try {
          const chunkRes = await fetch(
            `/api/media/upload/chunk?uploadId=${encodeURIComponent(uploadId)}&offset=${offset}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'x-upload-token': uploadToken,
                ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
              },
              signal,
              body: sliceBlob,
            }
          );
          if (chunkRes.ok) {
            uploadedChunk = true;
            break;
          }
          const errJson = (await chunkRes.json().catch(() => ({}))) as {
            error?: string;
            expectedOffset?: number;
          };
          if (chunkRes.status === 409 && typeof errJson.expectedOffset === 'number') {
            offset = errJson.expectedOffset;
            uploadedChunk = true;
            break;
          }
          lastChunkErr = new Error(errJson.error || `Chunk upload failed (HTTP ${chunkRes.status}).`);
          if (chunkRes.status === 400 || chunkRes.status === 403 || chunkRes.status === 413) {
            throw lastChunkErr;
          }
        } catch (err) {
          if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
            throw new Error('Upload canceled by user.');
          }
          lastChunkErr = err instanceof Error ? err : new Error('Chunk upload network error.');
        }
        await new Promise((r) => window.setTimeout(r, 400 * (attempt + 1)));
      }

      if (!uploadedChunk) {
        throw lastChunkErr || new Error('Chunked upload interrupted. Retry when connection stabilizes.');
      }

      if (offset < nextEnd) {
        offset = nextEnd;
      }
      const pct = Math.min(96, Math.max(2, Math.round((offset / blobOrFile.size) * 96)));
      onProgress?.(pct);
      onProgressDetail?.({ pct, loadedBytes: offset, totalBytes: blobOrFile.size });
    }

    const completeRes = await fetch('/api/media/upload/complete', {
      method: 'POST',
      headers: {
        ...baseHeaders,
        'x-upload-token': uploadToken,
      },
      signal,
      body: JSON.stringify({ uploadId }),
    });
    const completeData = (await completeRes.json().catch(() => ({}))) as {
      url?: string;
      mimeType?: string;
      error?: string;
    };
    if (!completeRes.ok || !completeData.url) {
      throw new Error(completeData.error || 'Could not finalize uploaded media.');
    }

    onProgress?.(100);
    onProgressDetail?.({ pct: 100, loadedBytes: blobOrFile.size, totalBytes: blobOrFile.size });
    return {
      url: completeData.url,
      mimeType: completeData.mimeType || mimeType,
      storedInStorage: false,
    };
  } catch (err) {
    fetch(`/api/media/upload/${encodeURIComponent(uploadId)}`, {
      method: 'DELETE',
      headers: {
        'x-upload-token': uploadToken,
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
    }).catch(() => {});
    throw err;
  }
}

export async function uploadStatusMedia(params: {
  uid: string;
  mediaType: 'image' | 'video';
  fileOrBlob: File | Blob;
  mimeTypeOverride?: string;
  onProgress?: (pct: number) => void;
}): Promise<{
  mediaUrl: string;
  mediaMimeType: string;
  storagePath: string;
  storedInStorage: boolean;
}> {
  const { uid, mediaType, fileOrBlob, mimeTypeOverride, onProgress } = params;
  if (!uid || auth.currentUser?.uid !== uid) {
    throw new Error('Sign in required to upload Status updates.');
  }

  if (mediaType === 'image') {
    onProgress?.(4);
    let dataUrl = '';
    if (fileOrBlob instanceof File) {
      const compressed = await compressStatusImageFile(fileOrBlob);
      dataUrl = compressed.dataUrl;
    } else {
      const file = new File([fileOrBlob], `status_${Date.now()}.jpg`, {
        type: mimeTypeOverride || fileOrBlob.type || 'image/jpeg',
      });
      const compressed = await compressStatusImageFile(file);
      dataUrl = compressed.dataUrl;
    }

    const { blob, mimeType, ext } = dataUrlToBlob(dataUrl);
    const storagePath = `users/${uid}/status/status_${Date.now()}.${ext}`;
    try {
      const downloadUrl = await uploadBlobToFirebaseStorage({
        storagePath,
        blob,
        mimeType,
        uid,
        onProgress,
      });
      return {
        mediaUrl: downloadUrl,
        mediaMimeType: mimeType,
        storagePath,
        storedInStorage: true,
      };
    } catch (err) {
      throw new Error(formatFirebaseStorageError(err, 'Photo'));
    }
  }

  // Longer Video status support (up to 100 MB, longer than standard 30s/60s status clips)
  const maxBytes = 100 * 1024 * 1024;
  if (fileOrBlob.size === 0) {
    throw new Error('Selected video file is empty.');
  }
  if (fileOrBlob.size > maxBytes) {
    throw new Error('Status video exceeds the 100 MB upload limit. Please select or record a slightly smaller clip.');
  }
  const fileNameHint = fileOrBlob instanceof File ? fileOrBlob.name.toLowerCase() : '';
  const rawMime = (mimeTypeOverride || fileOrBlob.type || '').toLowerCase();
  const safeMime =
    rawMime.includes('webm') || fileNameHint.endsWith('.webm')
      ? 'video/webm'
      : rawMime.includes('quicktime') || fileNameHint.endsWith('.mov')
        ? 'video/quicktime'
        : 'video/mp4';
  const ext = safeMime === 'video/webm' ? 'webm' : safeMime === 'video/quicktime' ? 'mov' : 'mp4';
  const storagePath = `users/${uid}/status/status_${Date.now()}.${ext}`;

  try {
    const downloadUrl = await uploadBlobToFirebaseStorage({
      storagePath,
      blob: fileOrBlob,
      mimeType: safeMime,
      uid,
      onProgress,
    });
    return {
      mediaUrl: downloadUrl,
      mediaMimeType: safeMime,
      storagePath,
      storedInStorage: true,
    };
  } catch (err) {
    throw new Error(formatFirebaseStorageError(err, 'Video'));
  }
}

export async function deleteStatusMediaFromStorage(storagePath?: string): Promise<void> {
  if (!storagePath) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch {
    // Ignore already-deleted or unprovisioned Storage cleanup errors
  }
}

export async function uploadChatMediaFile(params: {
  uid: string;
  kind: 'vid' | 'aud' | 'doc';
  blobOrFile: Blob | File;
  fileName: string;
  mimeType: string;
  onProgress?: (pct: number) => void;
  onProgressDetail?: (detail: MediaUploadProgressDetail) => void;
  signal?: AbortSignal;
}): Promise<{ url: string; mimeType: string; storedInStorage: boolean }> {
  const { uid, kind, blobOrFile, fileName, mimeType, onProgress, onProgressDetail, signal } = params;
  if (!uid) {
    throw new Error('Authentication required.');
  }
  if (signal?.aborted) {
    throw new Error('Upload canceled by user.');
  }

  const rawExt = (fileName.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const defaultExt = kind === 'vid' ? 'mp4' : kind === 'aud' ? 'webm' : 'pdf';
  const ext = rawExt || defaultExt;
  const cleanMime =
    mimeType.split(';')[0].trim() ||
    (kind === 'vid' ? 'video/mp4' : kind === 'aud' ? 'audio/webm' : 'application/octet-stream');
  const storagePath = `chat_media/${uid}/${kind}_${Date.now()}.${ext}`;

  // Use Firebase Storage resumable upload first when authenticated with Firebase
  if (auth.currentUser?.uid === uid) {
    try {
      const url = await uploadBlobToFirebaseStorage({
        storagePath,
        blob: blobOrFile,
        mimeType: cleanMime,
        uid,
        onProgress,
        onProgressDetail,
        signal,
      });
      return { url, mimeType: cleanMime, storedInStorage: true };
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : '';
      if (signal?.aborted || code === 'storage/canceled' || msg === 'storage_canceled') {
        throw new Error('Upload canceled by user.');
      }
      // Fall through cleanly to chunked resumable server upload if Firebase Storage bucket isn't deployed yet
    }
  }

  try {
    return await uploadChunkedToServerRelay({
      uid,
      kind,
      blobOrFile,
      fileName,
      mimeType: cleanMime,
      onProgress,
      onProgressDetail,
      signal,
    });
  } catch (relayErr) {
    if (signal?.aborted || (relayErr instanceof Error && relayErr.message.includes('canceled'))) {
      throw relayErr;
    }
    if (blobOrFile.size <= 240 * 1024) {
      const dataUrl = await readAsDataUrl(blobOrFile);
      if (dataUrl.length <= FIRESTORE_SAFE_MEDIA_CHARS) {
        onProgress?.(100);
        onProgressDetail?.({ pct: 100, loadedBytes: blobOrFile.size, totalBytes: blobOrFile.size });
        return { url: dataUrl, mimeType: cleanMime, storedInStorage: false };
      }
    }
    throw relayErr instanceof Error
      ? relayErr
      : new Error('Unable to upload media file. Check your connection and try again.');
  }
}

export async function uploadEmergencyMedia(params: {
  uid: string;
  mediaType: 'image' | 'video';
  fileOrBlob: File | Blob;
  onProgress?: (pct: number) => void;
}): Promise<{ mediaUrl: string; mediaMimeType: string; storagePath: string; storedInStorage: boolean }> {
  const { uid, mediaType, fileOrBlob, onProgress } = params;
  if (!uid || auth.currentUser?.uid !== uid) {
    throw new Error('Sign in required to attach emergency media.');
  }

  if (mediaType === 'image') {
    const file =
      fileOrBlob instanceof File
        ? fileOrBlob
        : new File([fileOrBlob], `emergency_${Date.now()}.jpg`, { type: fileOrBlob.type || 'image/jpeg' });
    const compressed = await compressStatusImageFile(file);
    const { blob, mimeType, ext } = dataUrlToBlob(compressed.dataUrl);
    const storagePath = `emergency_media/${uid}/emg_${Date.now()}.${ext}`;
    try {
      const url = await uploadBlobToFirebaseStorage({
        storagePath,
        blob,
        mimeType,
        uid,
        onProgress,
      });
      return { mediaUrl: url, mediaMimeType: mimeType, storagePath, storedInStorage: true };
    } catch {
      onProgress?.(100);
      return { mediaUrl: compressed.dataUrl, mediaMimeType: mimeType, storagePath: '', storedInStorage: false };
    }
  }

  if (fileOrBlob.size > 25 * 1024 * 1024) {
    throw new Error('Emergency video exceeds 25 MB upload limit.');
  }
  const rawMime = (fileOrBlob.type || 'video/mp4').toLowerCase();
  const safeMime = rawMime.includes('webm')
    ? 'video/webm'
    : rawMime.includes('quicktime')
      ? 'video/quicktime'
      : 'video/mp4';
  const ext = safeMime === 'video/webm' ? 'webm' : safeMime === 'video/quicktime' ? 'mov' : 'mp4';
  const storagePath = `emergency_media/${uid}/emg_${Date.now()}.${ext}`;
  try {
    const url = await uploadBlobToFirebaseStorage({
      storagePath,
      blob: fileOrBlob,
      mimeType: safeMime,
      uid,
      onProgress,
    });
    return { mediaUrl: url, mediaMimeType: safeMime, storagePath, storedInStorage: true };
  } catch {
    if (fileOrBlob.size <= 230 * 1024) {
      const dataUrl = await readAsDataUrl(fileOrBlob);
      if (dataUrl.length <= FIRESTORE_SAFE_MEDIA_CHARS) {
        onProgress?.(100);
        return { mediaUrl: dataUrl, mediaMimeType: safeMime, storagePath: '', storedInStorage: false };
      }
    }
    throw new Error('Large emergency video upload requires Firebase Storage with emergency_media rules deployed.');
  }
}

