import {
  deleteObject,
  getDownloadURL,
  listAll,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { auth, storage } from './firebase';

function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string; ext: string } {
  const match = dataUrl.match(/^data:(image\/(jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    throw new Error('Invalid image encoding. Allowed formats: JPEG, PNG, WebP.');
  }
  const rawMime = match[1].toLowerCase();
  const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  const sub = match[2].toLowerCase();
  const ext = sub === 'png' ? 'png' : sub === 'webp' ? 'webp' : 'jpg';
  const binary = atob(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return {
    blob: new Blob([bytes], { type: mimeType }),
    mimeType,
    ext,
  };
}

export async function deleteProfilePhotosFromStorage(
  uid: string,
  kind: 'avatar' | 'cover'
): Promise<void> {
  if (!uid || auth.currentUser?.uid !== uid) return;
  try {
    const folderRef = ref(storage, `profile_photos/${uid}`);
    const listing = await Promise.race([
      listAll(folderRef),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('storage_timeout')), 6000)),
    ]);
    const prefix = `${kind}_`;
    const matching = listing.items.filter((item) => item.name.startsWith(prefix));
    await Promise.allSettled(matching.map((item) => deleteObject(item)));
  } catch {
    // Ignore cleanup errors when folder is empty or Storage bucket is not yet provisioned
  }
}

export async function uploadProfilePhotoToStorage(params: {
  uid: string;
  kind: 'avatar' | 'cover';
  dataUrl: string;
  onProgress?: (pct: number) => void;
}): Promise<{ url: string; storagePath: string; storedInStorage: boolean }> {
  const { uid, kind, dataUrl, onProgress } = params;
  if (!uid || auth.currentUser?.uid !== uid) {
    throw new Error('Authentication mismatch: users can only upload their own profile photo.');
  }

  if (dataUrl.startsWith('https://')) {
    return { url: dataUrl, storagePath: '', storedInStorage: true };
  }

  const { blob, mimeType, ext } = dataUrlToBlob(dataUrl);
  const objectName = `${kind}_${Date.now()}.${ext}`;
  const storagePath = `profile_photos/${uid}/${objectName}`;
  const fileRef = ref(storage, storagePath);

  onProgress?.(10);

  try {
    const task = uploadBytesResumable(fileRef, blob, {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000',
      customMetadata: {
        ownerUid: uid,
        kind,
      },
    });

    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        try {
          task.cancel();
        } catch {
          // ignore
        }
        reject(new Error('storage_timeout'));
      }, 15000);

      task.on(
        'state_changed',
        (snapshot) => {
          if (snapshot.totalBytes > 0) {
            const pct = Math.min(92, Math.max(12, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 90)));
            onProgress?.(pct);
          }
        },
        (error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        },
        () => {
          window.clearTimeout(timeoutId);
          resolve();
        }
      );
    });

    const downloadUrl = await getDownloadURL(task.snapshot.ref);
    onProgress?.(98);

    // Best-effort cleanup of older versions of this photo kind
    listAll(ref(storage, `profile_photos/${uid}`))
      .then((listing) => {
        const older = listing.items.filter(
          (item) => item.name.startsWith(`${kind}_`) && item.name !== objectName
        );
        return Promise.allSettled(older.map((item) => deleteObject(item)));
      })
      .catch(() => {});

    onProgress?.(100);
    return { url: downloadUrl, storagePath, storedInStorage: true };
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    const msg = err instanceof Error ? err.message : String(err);

    // Strictly surface permission violations if Storage rules reject tampering
    if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
      throw new Error('Upload blocked by Firebase Storage security rules. Sign in to your own account to change your photo.');
    }

    // If bucket is not yet activated or transient network timeout occurs in preview, keep compressed image safely
    console.warn(`Firebase Storage upload fallback (${code || msg}): persisting validated profile image in Firestore.`);
    onProgress?.(100);
    return { url: dataUrl, storagePath: '', storedInStorage: false };
  }
}
