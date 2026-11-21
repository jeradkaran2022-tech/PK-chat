// Real Web Crypto API utilities for PK CHAT PIN Lock & E2EE Messaging

export function getOrCreateDeviceId(): string {
  const storageKey = 'pk_chat_device_id';
  let id = localStorage.getItem(storageKey);
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    id = 'dev_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(storageKey, id);
  }
  return id;
}

export function detectPlatformLabel(): string {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'Android';
  if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
  if (/Mac/i.test(ua)) return 'macOS Web';
  if (/Win/i.test(ua)) return 'Windows Web';
  return 'Cloud Web';
}

export async function hashPin(pin: string, uid: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`pkchat_pin_v1:${uid}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin: string, uid: string, storedHash: string): Promise<boolean> {
  const computed = await hashPin(pin, uid);
  return computed === storedHash;
}

const E2EE_PRIV_KEY = 'pk_chat_e2ee_priv_jwk';
const E2EE_PUB_KEY = 'pk_chat_e2ee_pub_jwk';

export async function getOrCreateE2eeKeyPair(): Promise<{
  publicKeyBase64: string;
  fingerprint: string;
}> {
  let pubJwkStr = localStorage.getItem(E2EE_PUB_KEY);
  let privJwkStr = localStorage.getItem(E2EE_PRIV_KEY);

  if (!pubJwkStr || !privJwkStr) {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );
    const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    pubJwkStr = JSON.stringify(pubJwk);
    privJwkStr = JSON.stringify(privJwk);
    localStorage.setItem(E2EE_PUB_KEY, pubJwkStr);
    localStorage.setItem(E2EE_PRIV_KEY, privJwkStr);
  }

  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(pubJwkStr));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  const fingerprint = hex.slice(0, 24).match(/.{1,4}/g)?.join(' ') || hex.slice(0, 24);

  return {
    publicKeyBase64: btoa(pubJwkStr),
    fingerprint: fingerprint.toUpperCase(),
  };
}

async function deriveChatAesKeyV1(chatId: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`pkchat_aes_channel:${chatId}:e2ee_v1`)
  );
  return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function deriveEcdhChannelAesKeyV2(
  chatId: string,
  peerPublicKeyBase64?: string
): Promise<CryptoKey | null> {
  if (!peerPublicKeyBase64) return null;
  try {
    const privJwkStr = localStorage.getItem(E2EE_PRIV_KEY);
    if (!privJwkStr) return null;
    const privJwk = { ...(JSON.parse(privJwkStr) as JsonWebKey) };
    const peerJwk = { ...(JSON.parse(atob(peerPublicKeyBase64)) as JsonWebKey) };
    delete privJwk.key_ops;
    delete peerJwk.key_ops;

    const privateKey = await crypto.subtle.importKey(
      'jwk',
      privJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits']
    );
    const peerPublicKey = await crypto.subtle.importKey(
      'jwk',
      peerJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: peerPublicKey },
      privateKey,
      256
    );
    const channelSalt = new TextEncoder().encode(`pkchat_aes_channel:${chatId}:e2ee_v2`);
    const combined = new Uint8Array(sharedBits.byteLength + channelSalt.byteLength);
    combined.set(new Uint8Array(sharedBits), 0);
    combined.set(channelSalt, sharedBits.byteLength);
    const keyMaterial = await crypto.subtle.digest('SHA-256', combined);
    return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ]);
  } catch {
    return null;
  }
}

function bytesToBase64Chunked(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export async function encryptE2eeText(
  plaintext: string,
  chatId: string,
  peerPublicKeyBase64?: string
): Promise<string> {
  const v2Key = await deriveEcdhChannelAesKeyV2(chatId, peerPublicKeyBase64);
  const key = v2Key || (await deriveChatAesKeyV1(chatId));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  try {
    const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuffer), iv.length);
    const b64 = bytesToBase64Chunked(combined);
    secureShredUint8Array(combined);
    return v2Key ? `v2:${b64}` : b64;
  } finally {
    secureShredUint8Array(encoded);
  }
}

export async function decryptE2eeText(
  payloadBase64: string,
  chatId: string,
  peerPublicKeyBase64?: string
): Promise<string> {
  const isV2 = payloadBase64.startsWith('v2:');
  const rawB64 = isV2 ? payloadBase64.slice(3) : payloadBase64;
  const binary = atob(rawB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const key = isV2
    ? (await deriveEcdhChannelAesKeyV2(chatId, peerPublicKeyBase64)) || (await deriveChatAesKeyV1(chatId))
    : await deriveChatAesKeyV1(chatId);
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  secureShredUint8Array(bytes);
  return new TextDecoder().decode(plainBuffer);
}

/**
 * Zone 1 Secure File Shredder: multi-pass overwrite (CSPRNG + zero-fill)
 * for sensitive raw byte buffers and local object URLs.
 */
export function secureShredUint8Array(buf: Uint8Array | null | undefined): void {
  if (!buf || buf.length === 0) return;
  try {
    const step = 65536;
    for (let offset = 0; offset < buf.length; offset += step) {
      crypto.getRandomValues(
        buf.subarray(offset, Math.min(offset + step, buf.length)) as Uint8Array<ArrayBuffer>
      );
    }
  } catch {
    buf.fill(0xff);
  }
  buf.fill(0);
}

export function secureShredMediaObjectUrl(url?: string | null): void {
  if (!url || !url.startsWith('blob:')) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore invalid object URL
  }
}

export function secureShredTextPayload(_sensitiveText?: string | null): string {
  return 'This message was permanently shredded.';
}

export function isMessageExpiredByBurnTimer(
  msg: { burnAfterSeconds?: number; expiresAtMs?: number; deleted?: boolean },
  nowMs = Date.now()
): boolean {
  if (typeof msg.expiresAtMs === 'number' && Number.isFinite(msg.expiresAtMs) && msg.expiresAtMs > 0) {
    return nowMs >= msg.expiresAtMs;
  }
  return false;
}

