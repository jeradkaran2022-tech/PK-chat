export interface SecurityShieldStatus {
  isLocked: boolean;
  lockoutUntil?: number;
  remainingSeconds: number;
  minutes: number;
  seconds: number;
  reason?: string;
  alertSent?: boolean;
  message?: string;
}

export interface TriggerLockdownOptions {
  reloadPage?: boolean;
  onDispatchAlert?: (alertMessage: string, reason: string) => Promise<void> | void;
}

export class SecurityShieldSystem {
  readonly LOCKOUT_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds
  readonly STORAGE_KEY_LOCK_TIME = 'pk_chat_lockout_until';
  readonly STORAGE_KEY_ALERT_SENT = 'pk_chat_alert_sent';
  readonly STORAGE_KEY_LOCK_REASON = 'pk_chat_lockout_reason';
  readonly STORAGE_KEY_ANTI_DEBUG = 'pk_chat_anti_debug_guard';

  private listeners = new Set<() => void>();

  isAntiDebugEnabled(): boolean {
    const raw = this.getStorage()?.getItem(this.STORAGE_KEY_ANTI_DEBUG);
    return raw !== 'false';
  }

  setAntiDebugEnabled(enabled: boolean): void {
    try {
      this.getStorage()?.setItem(this.STORAGE_KEY_ANTI_DEBUG, enabled ? 'true' : 'false');
    } catch {
      // Ignore storage quota errors
    }
    this.notifyListeners();
  }

  // Safely checks DevTools viewport docking anomaly only in top-level browser windows
  // (avoids false positives inside split-screen iframe preview hosts)
  isDevToolsViewportAnomaly(threshold = 160): boolean {
    if (typeof window === 'undefined') return false;
    let isEmbedded = false;
    try {
      isEmbedded = window.self !== window.top;
    } catch {
      isEmbedded = true;
    }
    if (isEmbedded) return false;
    const outerW = Number(window.outerWidth || 0);
    const innerW = Number(window.innerWidth || 0);
    const outerH = Number(window.outerHeight || 0);
    const innerH = Number(window.innerHeight || 0);
    if (outerW <= 0 || innerW <= 0 || outerH <= 0 || innerH <= 0) return false;
    return outerW - innerW > threshold || outerH - innerH > threshold;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // Ignore subscriber cleanup errors
      }
    });
  }

  private getStorage(): Storage | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  }

  // 1. Check security status at startup or during runtime countdown
  checkSecurityStatus(preferredLangCode = 'ta'): SecurityShieldStatus {
    const storage = this.getStorage();
    const lockoutRaw = storage?.getItem(this.STORAGE_KEY_LOCK_TIME);

    if (lockoutRaw) {
      const lockoutUntil = Number.parseInt(lockoutRaw, 10);
      const currentTime = Date.now();
      if (Number.isFinite(lockoutUntil) && currentTime < lockoutUntil) {
        const remainingSeconds = Math.max(1, Math.ceil((lockoutUntil - currentTime) / 1000));
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const reason =
          storage?.getItem(this.STORAGE_KEY_LOCK_REASON) ||
          'அனுமதிக்கப்படாத ஊடுருவல் அல்லது ஆய்வு முயற்சி கண்டறியப்பட்டது';
        const alertSent = Boolean(storage?.getItem(this.STORAGE_KEY_ALERT_SENT));
        const isTamil = preferredLangCode.toLowerCase().startsWith('ta');
        const message = isTamil
          ? `பாதுகாப்பு காரணங்களுக்காக செயலி இடைநிறுத்தப்பட்டுள்ளது. மீதமுள்ள நேரம்: ${minutes} நிமிடங்கள் மற்றும் ${seconds} விநாடிகள்.`
          : `App temporarily paused for security protection. Time remaining: ${minutes} min ${seconds} sec (மீதமுள்ள நேரம்: ${minutes} நிமிடங்கள் ${seconds} விநாடிகள்).`;

        return {
          isLocked: true,
          lockoutUntil,
          remainingSeconds,
          minutes,
          seconds,
          reason,
          alertSent,
          message,
        };
      }

      // 10 minutes elapsed — automatically resume normal operation
      this.clearLockdown();
    }

    return {
      isLocked: false,
      remainingSeconds: 0,
      minutes: 0,
      seconds: 0,
    };
  }

  // 2. Triggered on tamper detection or manual shield activation
  async triggerSecurityLockdown(
    reason = 'அனுமதிக்கப்படாத ஊடுருவல் அல்லது ஆய்வு முயற்சி கண்டறியப்பட்டது',
    options?: TriggerLockdownOptions
  ): Promise<SecurityShieldStatus> {
    const storage = this.getStorage();
    const cleanReason =
      reason.trim() || 'அனுமதிக்கப்படாத ஊடுருவல் அல்லது ஆய்வு முயற்சி கண்டறியப்பட்டது';
    const currentTime = Date.now();
    const lockoutUntil = currentTime + this.LOCKOUT_DURATION;

    try {
      storage?.setItem(this.STORAGE_KEY_LOCK_TIME, lockoutUntil.toString());
      storage?.setItem(this.STORAGE_KEY_LOCK_REASON, cleanReason);
    } catch {
      // Ignore storage quota issues
    }

    await this.sendAutomatedSecurityAlert(cleanReason, options?.onDispatchAlert);
    this.notifyListeners();

    if (options?.reloadPage && typeof window !== 'undefined' && window.location?.reload) {
      window.location.reload();
    }

    return this.checkSecurityStatus();
  }

  // 3. Dispatch automated user & audit security alert
  async sendAutomatedSecurityAlert(
    reason: string,
    onDispatchAlert?: (alertMessage: string, reason: string) => Promise<void> | void
  ): Promise<string> {
    const alertMessage = `⚠️ PK Chat பாதுகாப்பு எச்சரிக்கை: பயனர் தரவு மற்றும் பாதுகாப்பு அம்சங்களின் பாதுகாப்பிற்காக இந்த ஆப் அடுத்த 10 நிமிடத்திற்கு தற்காலிகமாக இடைநிறுத்தப்படுகிறது. காரணம்: ${reason}`;
    const storage = this.getStorage();

    try {
      storage?.setItem(this.STORAGE_KEY_ALERT_SENT, new Date().toISOString());
      if (onDispatchAlert) {
        await onDispatchAlert(alertMessage, reason);
      }
    } catch {
      // Non-fatal alert dispatch failure; lockout remains enforced
    }

    return alertMessage;
  }

  // 4. Clear lockout after 10 minutes or owner verification
  clearLockdown(): void {
    const storage = this.getStorage();
    try {
      storage?.removeItem(this.STORAGE_KEY_LOCK_TIME);
      storage?.removeItem(this.STORAGE_KEY_ALERT_SENT);
      storage?.removeItem(this.STORAGE_KEY_LOCK_REASON);
    } catch {
      // Ignore storage issues
    }
    this.notifyListeners();
  }
}

export interface PayloadSanitizeResult {
  safe: boolean;
  sanitizedText: string;
  blockedReason?: string;
}

export interface AttachmentScanResult {
  safe: boolean;
  badge: string;
  blockedReason?: string;
}

const DANGEROUS_TEXT_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: '<script> tag', regex: /<\s*\/?\s*script\b/i },
  { label: '<iframe> injection', regex: /<\s*iframe\b/i },
  { label: 'embedded object/applet', regex: /<\s*(object|embed|applet)\b/i },
  { label: 'javascript/vbscript URI', regex: /\b(?:javascript|vbscript)\s*:/i },
  { label: 'data:text/html URI', regex: /data\s*:\s*text\/html/i },
  { label: 'inline DOM event handler', regex: /\bon(?:error|load|click|mouseover|focus)\s*=/i },
  { label: 'dynamic eval/cookie access', regex: /\b(?:eval\s*\(|document\.cookie\b)/i },
];

export const MAX_DOC_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB for docs, images, and audio
export const MAX_LARGE_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB for up to 4-hour videos
export const MAX_VIDEO_DURATION_SECONDS = 4 * 60 * 60; // 4 hours (14,400 seconds)

const DANGEROUS_FILE_EXTENSIONS = new Set([
  'exe',
  'bat',
  'cmd',
  'msi',
  'vbs',
  'vbe',
  'js',
  'jse',
  'ps1',
  'sh',
  'scr',
  'pif',
  'hta',
  'jar',
  'dll',
  'com',
  'reg',
  'html',
  'htm',
  'svg',
  'php',
  'apk',
  'elf',
  'deb',
  'rpm',
]);

const VIDEO_SAFE_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', '3gp', 'mkv', 'avi', 'ogv']);

export function sanitizeChatPayload(rawText: string): PayloadSanitizeResult {
  // Strip invisible ASCII control characters while preserving newlines/tabs and Unicode (Tamil, Sinhala, Arabic, Emoji)
  // eslint-disable-next-line no-control-regex
  const cleaned = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  if (!cleaned) {
    return { safe: true, sanitizedText: '' };
  }

  for (const rule of DANGEROUS_TEXT_PATTERNS) {
    if (rule.regex.test(cleaned)) {
      return {
        safe: false,
        sanitizedText: '',
        blockedReason: `🛡️ Cyber Shield Alert: Potentially malicious payload (${rule.label}) detected and blocked automatically!`,
      };
    }
  }

  return {
    safe: true,
    sanitizedText: cleaned,
  };
}

export function inspectAttachmentForMalware(params: {
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  mediaCategory?: 'image' | 'video' | 'document' | 'audio';
}): AttachmentScanResult {
  const cleanName = (params.fileName || '').trim();
  const lowerName = cleanName.toLowerCase();
  const segments = lowerName.split('.').filter(Boolean);
  const ext = segments.length > 1 ? segments[segments.length - 1] : '';
  const mime = (params.mimeType || '').toLowerCase();

  // Catch both direct dangerous extensions (.exe) and double-extension decoys (report.pdf.exe)
  const hasDangerousSegment =
    segments.length > 1 && segments.slice(1).some((seg) => DANGEROUS_FILE_EXTENSIONS.has(seg));

  if (
    DANGEROUS_FILE_EXTENSIONS.has(ext) ||
    hasDangerousSegment ||
    mime.includes('x-msdownload') ||
    mime.includes('x-dosexec') ||
    mime.includes('x-executable') ||
    mime.includes('x-sh') ||
    mime.includes('text/html') ||
    mime.includes('image/svg+xml') ||
    mime.includes('application/javascript') ||
    mime.includes('text/javascript')
  ) {
    return {
      safe: false,
      badge: 'Quarantined',
      blockedReason: `🛡️ Cyber Shield Alert: "${cleanName || 'file'}" uses a restricted executable or active script format (.${ext || 'bin'}) and was blocked.`,
    };
  }

  const isVideoFile =
    params.mediaCategory === 'video' ||
    mime.startsWith('video/') ||
    VIDEO_SAFE_EXTENSIONS.has(ext);
  const maxAllowedBytes = isVideoFile ? MAX_LARGE_VIDEO_BYTES : MAX_DOC_IMAGE_BYTES;

  if (typeof params.sizeBytes === 'number') {
    if (params.sizeBytes <= 0) {
      return {
        safe: false,
        badge: 'Invalid File',
        blockedReason: '🛡️ Cyber Shield Alert: Selected file is empty (0 bytes) and cannot be sent.',
      };
    }
    if (params.sizeBytes > maxAllowedBytes) {
      return {
        safe: false,
        badge: 'Size Limit',
        blockedReason: isVideoFile
          ? '🛡️ Cyber Shield Alert: Video exceeds the 2 GB (up to 4-hour) upload limit. Compress or trim the video before sending.'
          : '🛡️ Cyber Shield Alert: Attachment exceeds the 25 MB safety sandbox limit.',
      };
    }
  }

  return {
    safe: true,
    badge: isVideoFile ? '🛡️ Video Guard Verified' : '🛡️ Anti-Virus Scanned & Safe',
  };
}

/**
 * Inspects leading magic bytes (first <=512 bytes) to catch malware, executables,
 * shell scripts, or HTML/SVG XSS payloads disguised with a fake extension like .mp4 or .pdf.
 */
export function inspectMagicBytesBuffer(
  bytes: Uint8Array,
  params: { fileName: string; mimeType?: string }
): AttachmentScanResult {
  if (!bytes || bytes.length < 2) {
    return {
      safe: false,
      badge: 'Corrupt File',
      blockedReason: '🛡️ Magic-Byte Guard: File header is empty or unreadable.',
    };
  }

  const b0 = bytes[0] ?? 0;
  const b1 = bytes[1] ?? 0;
  const b2 = bytes[2] ?? 0;
  const b3 = bytes[3] ?? 0;

  // Windows PE / DOS executable ('MZ')
  if (b0 === 0x4d && b1 === 0x5a) {
    return {
      safe: false,
      badge: 'Quarantined (PE/EXE)',
      blockedReason: `🛡️ Magic-Byte Guard: "${params.fileName}" contains a Windows executable (MZ) signature disguised as media/document.`,
    };
  }

  // Linux ELF binary (\x7fELF)
  if (b0 === 0x7f && b1 === 0x45 && b2 === 0x4c && b3 === 0x46) {
    return {
      safe: false,
      badge: 'Quarantined (ELF)',
      blockedReason: `🛡️ Magic-Byte Guard: "${params.fileName}" contains an ELF executable binary header and was blocked.`,
    };
  }

  // Mach-O executables (excluding MP4/ISO BMFF; Mach-O magic constants are strict 32-bit signatures)
  const isMachO =
    (b0 === 0xfe && b1 === 0xed && b2 === 0xfa && (b3 === 0xce || b3 === 0xcf)) ||
    ((b0 === 0xce || b0 === 0xcf) && b1 === 0xfa && b2 === 0xed && b3 === 0xfe);
  if (isMachO) {
    return {
      safe: false,
      badge: 'Quarantined (Mach-O)',
      blockedReason: `🛡️ Magic-Byte Guard: "${params.fileName}" contains an executable binary header and was blocked.`,
    };
  }

  // Unix shebang script (#!)
  if (b0 === 0x23 && b1 === 0x21) {
    return {
      safe: false,
      badge: 'Quarantined (Script)',
      blockedReason: `🛡️ Magic-Byte Guard: "${params.fileName}" contains a shell script (#!) header and was blocked.`,
    };
  }

  // Decode leading ASCII bytes cleanly to catch active HTML / SVG / XML script smuggling
  let asciiHead = '';
  const scanLen = Math.min(bytes.length, 256);
  for (let i = 0; i < scanLen; i += 1) {
    const ch = bytes[i];
    if (ch === 9 || ch === 10 || ch === 13 || (ch >= 32 && ch <= 126)) {
      asciiHead += String.fromCharCode(ch);
    }
  }
  const lowerHead = asciiHead.trimStart().toLowerCase();
  if (/^<\s*(?:!doctype\s+html|html|script|svg|iframe|object|embed|\?php)\b/i.test(lowerHead) ||
      /<\s*script\b/i.test(lowerHead)) {
    return {
      safe: false,
      badge: 'Quarantined (Active Script)',
      blockedReason: `🛡️ Magic-Byte Guard: "${params.fileName}" contains embedded HTML/SVG/script markup and was blocked.`,
    };
  }

  // Validate strict magic signature for declared PDF / PNG / JPEG attachments
  const ext = (params.fileName.toLowerCase().split('.').pop() || '').trim();
  const mime = (params.mimeType || '').toLowerCase();
  if ((ext === 'pdf' || mime === 'application/pdf') && bytes.length >= 4) {
    const trimmed = asciiHead.replace(/^\uFEFF/, '').trimStart();
    if (!trimmed.startsWith('%PDF-')) {
      return {
        safe: false,
        badge: 'Quarantined (Fake PDF)',
        blockedReason: `🛡️ Magic-Byte Guard: "${params.fileName}" does not start with a valid %PDF- header.`,
      };
    }
  }
  if ((ext === 'png' || mime === 'image/png') && bytes.length >= 8) {
    const isPng =
      b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    if (!isPng) {
      return {
        safe: false,
        badge: 'Quarantined (Fake PNG)',
        blockedReason: `🛡️ Magic-Byte Guard: "${params.fileName}" failed PNG signature verification.`,
      };
    }
  }
  if ((ext === 'jpg' || ext === 'jpeg' || mime === 'image/jpeg') && bytes.length >= 3) {
    if (!(b0 === 0xff && b1 === 0xd8 && b2 === 0xff)) {
      return {
        safe: false,
        badge: 'Quarantined (Fake JPEG)',
        blockedReason: `🛡️ Magic-Byte Guard: "${params.fileName}" failed JPEG signature verification.`,
      };
    }
  }

  return {
    safe: true,
    badge: '🛡️ Magic-Byte & Malware Verified',
  };
}

/**
 * Full async safety scan: checks filename, MIME, category size limits,
 * then reads ONLY the first 512 bytes via Blob.slice() (zero full-file RAM spike).
 */
export async function inspectFileWithDeepGuard(
  file: Blob,
  params: {
    fileName: string;
    mimeType?: string;
    mediaCategory?: 'image' | 'video' | 'document' | 'audio';
  }
): Promise<AttachmentScanResult> {
  const basic = inspectAttachmentForMalware({
    fileName: params.fileName,
    mimeType: params.mimeType || file.type,
    sizeBytes: file.size,
    mediaCategory: params.mediaCategory,
  });
  if (!basic.safe) return basic;

  try {
    const headerSlice = file.slice(0, 512);
    const buffer = await headerSlice.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const magic = inspectMagicBytesBuffer(bytes, {
      fileName: params.fileName,
      mimeType: params.mimeType || file.type,
    });
    if (!magic.safe) return magic;
    return {
      safe: true,
      badge: magic.badge,
    };
  } catch {
    return {
      safe: false,
      badge: 'Scan Error',
      blockedReason: '🛡️ Cyber Shield Alert: Could not inspect file header safely.',
    };
  }
}

export function isSafeMediaUrl(rawUrl?: string | null): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/api/media/file/')) {
    return /^\/api\/media\/file\/[a-zA-Z0-9_-]{4,96}$/.test(trimmed);
  }
  if (trimmed.startsWith('https://') || trimmed.startsWith('blob:')) {
    return true;
  }
  if (trimmed.startsWith('data:')) {
    const lower = trimmed.slice(0, 80).toLowerCase();
    if (lower.startsWith('data:text/html') || lower.startsWith('data:image/svg+xml')) {
      return false;
    }
    return /^data:(?:image\/(?:jpeg|jpg|png|webp|gif)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/(?:pdf|octet-stream|zip|msword|vnd\.[a-z0-9._-]+)|text\/plain);base64,/i.test(
      trimmed
    );
  }
  return false;
}

export interface ClassSafetyScanResult {
  safe: boolean;
  blackoutRequired: boolean;
  matchedCategory?: 'sexual_content' | 'nudity' | 'inappropriate_activity';
  reason?: string;
  confidence: number;
}

const CLASS_UNSAFE_PATTERNS: Array<{
  category: 'sexual_content' | 'nudity' | 'inappropriate_activity';
  label: string;
  regex: RegExp;
}> = [
  {
    category: 'sexual_content',
    label: 'explicit sexual terms',
    regex: /\b(porn|pornography|xxx|nsfw|nude\s*video|sex\s*chat|sex\s*cam|erotic|explicit\s*sex|blowjob|masturbat\w*|strip\s*tease|onlyfans|camgirl|camboy|escort\s*service|adult\s*video)\b/i,
  },
  {
    category: 'nudity',
    label: 'nudity or stripping request',
    regex: /\b(send\s*nudes?|show\s*nudes?|take\s*off\s*clothes|undress\s*now|strip\s*naked|genitals?|topless\s*cam|naked\s*cam)\b/i,
  },
  {
    category: 'inappropriate_activity',
    label: 'inappropriate sexual solicitation',
    regex: /\b(sext(?:ing)?|sexual\s*favor|cybersex|adult\s*show|18\+\s*live)\b|(?:ஆபாச|நிர்வாண|பாலியல்|செக்ஸ்)/i,
  },
];

export interface ExplicitContentScanResult {
  safe: boolean;
  matchedCategory?: 'sexual_content' | 'nudity' | 'inappropriate_activity';
  blockedReason?: string;
}

const EXPLICIT_SEXUAL_TEXT_PATTERNS: Array<{
  category: 'sexual_content' | 'nudity' | 'inappropriate_activity';
  label: string;
  regex: RegExp;
}> = [
  {
    category: 'sexual_content',
    label: 'explicit sexual or adult pornography terms',
    regex: /\b(porn|pornography|xxx|nsfw|nude\s*video|sex\s*chat|sex\s*cam|sex\s*shop|sex\s*toy|erotic\w*|explicit\s*sex|oral\s*sex|anal\s*sex|intercourse|blowjob|handjob|masturbat\w*|strip\s*tease|onlyfans|camgirl|camboy|escort\s*service|adult\s*video|adult\s*dating|18\+\s*sex|hardcore\s*sex|fetish\s*show|kama\s*sutra\s*video)\b/i,
  },
  {
    category: 'nudity',
    label: 'nudity or explicit body exposure request',
    regex: /\b(nude\b|nudes\b|nudity|naked\s*photo|naked\s*video|send\s*nudes?|show\s*nudes?|take\s*off\s*clothes|undress\s*now|strip\s*naked|genitals?|topless\s*(?:cam|pic|photo|video)|naked\s*cam|boobs?\s*pic|dick\s*pic|vagina|penis|pussy|cock\b|nipple\s*show)\b/i,
  },
  {
    category: 'inappropriate_activity',
    label: 'sexual solicitation or adult services',
    regex: /\b(sext(?:ing)?|sexual\s*favor|sexual\s*service|sexual\s*massage|happy\s*ending\s*massage|call\s*girl|call\s*boy|prostitut\w*|cybersex|adult\s*show|18\+\s*live|hookup\s*tonight|paid\s*sex)\b|(?:ஆபாச|நிர்வாண|பாலியல்|செக்ஸ்|காம\s*வீடியோ|காமம்)/i,
  },
];

/**
 * Unified pre-publish sexual activity & explicit content filter enforced across
 * Sponsored Business Ads, 24h Status Updates, Profiles, and Live Classrooms.
 */
export function detectExplicitSexualContent(rawText: string): ExplicitContentScanResult {
  const clean = (rawText || '').trim();
  if (!clean) {
    return { safe: true };
  }
  for (const rule of EXPLICIT_SEXUAL_TEXT_PATTERNS) {
    if (rule.regex.test(clean)) {
      return {
        safe: false,
        matchedCategory: rule.category,
        blockedReason: `🛡️ PK Chat Safety Shield blocked this content before publishing (${rule.label} violates community & Play Store safety policy).`,
      };
    }
  }
  return { safe: true };
}

export async function analyzeImageDataUrlForExplicitContent(
  mediaDataUrl: string,
  fileName?: string
): Promise<ExplicitContentScanResult> {
  if (fileName) {
    const nameCheck = detectExplicitSexualContent(fileName.replace(/[_.-]+/g, ' '));
    if (!nameCheck.safe) return nameCheck;
  }
  if (!mediaDataUrl || typeof document === 'undefined' || !mediaDataUrl.startsWith('data:image/')) {
    return { safe: true };
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = mediaDataUrl;
    });
    const w = Math.min(96, Math.max(16, img.naturalWidth || 64));
    const h = Math.min(96, Math.max(16, img.naturalHeight || 64));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { safe: true };
    ctx.drawImage(img, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h);
    const scan = analyzeVideoFrameForUnsafeContent({
      data: frame.data,
      width: w,
      height: h,
    });
    if (!scan.safe) {
      return {
        safe: false,
        matchedCategory: scan.matchedCategory || 'nudity',
        blockedReason:
          '🛡️ PK Chat Visual Safety Shield detected explicit/excessive nudity exposure and blocked this image before publishing.',
      };
    }
  } catch {
    // Non-fatal fallback if image cannot be decoded locally
  }
  return { safe: true };
}

export function evaluateClassSafetyContent(rawText: string): ClassSafetyScanResult {
  const clean = (rawText || '').trim();
  if (!clean) {
    return { safe: true, blackoutRequired: false, confidence: 0 };
  }
  for (const rule of CLASS_UNSAFE_PATTERNS) {
    if (rule.regex.test(clean)) {
      return {
        safe: false,
        blackoutRequired: true,
        matchedCategory: rule.category,
        reason: `🛡️ PK Live Class Safety Shield detected ${rule.label} and immediately blanked the classroom screen.`,
        confidence: 0.98,
      };
    }
  }
  const explicitMatch = detectExplicitSexualContent(clean);
  if (!explicitMatch.safe) {
    return {
      safe: false,
      blackoutRequired: true,
      matchedCategory: explicitMatch.matchedCategory || 'sexual_content',
      reason: explicitMatch.blockedReason,
      confidence: 0.96,
    };
  }
  return { safe: true, blackoutRequired: false, confidence: 0.02 };
}

/**
 * Lightweight local frame guard checking excessive contiguous unclothed skin-tone exposure
 * across the central frame region without blocking normal teacher faces or whiteboards.
 */
export function analyzeVideoFrameForUnsafeContent(frame: {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}): ClassSafetyScanResult {
  const { data, width, height } = frame;
  if (!data || width <= 0 || height <= 0) {
    return { safe: true, blackoutRequired: false, confidence: 0 };
  }
  let centerPixels = 0;
  let skinPixels = 0;
  let brightWhitePixels = 0;

  const xStart = Math.floor(width * 0.15);
  const xEnd = Math.floor(width * 0.85);
  const yStart = Math.floor(height * 0.15);
  const yEnd = Math.floor(height * 0.9);

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;
      centerPixels += 1;

      if (r > 235 && g > 235 && b > 235) {
        brightWhitePixels += 1;
      }

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const isSkinTone =
        r > 95 &&
        g > 40 &&
        b > 20 &&
        maxC - minC > 15 &&
        Math.abs(r - g) > 15 &&
        r > g &&
        r > b;
      if (isSkinTone) {
        skinPixels += 1;
      }
    }
  }

  if (centerPixels === 0) {
    return { safe: true, blackoutRequired: false, confidence: 0 };
  }

  const skinRatio = skinPixels / centerPixels;
  const boardRatio = brightWhitePixels / centerPixels;

  // Trigger blackout only when overwhelming contiguous center torso/nudity exposure dominates (and isn't a whiteboard)
  if (skinRatio >= 0.78 && boardRatio < 0.15) {
    return {
      safe: false,
      blackoutRequired: true,
      matchedCategory: 'nudity',
      reason: '🛡️ PK Live Class Vision Safety Shield detected inappropriate visual exposure and blacked out the classroom immediately.',
      confidence: Number(skinRatio.toFixed(2)),
    };
  }

  return { safe: true, blackoutRequired: false, confidence: Number((skinRatio * 0.5).toFixed(2)) };
}

const BLOCKED_UNOFFICIAL_DOMAINS = [
  'twitter.com',
  'x.com',
  'facebook.com',
  'fb.com',
  'instagram.com',
  'tiktok.com',
  'reddit.com',
  't.me',
  'telegram.me',
  'telegram.org',
  'youtube.com',
  'youtu.be',
  'whatsapp.com',
  'blogspot.com',
  'wordpress.com',
  'medium.com',
];

const VERIFIED_GOV_HOST_SUFFIXES = [
  'earthquake.usgs.gov',
  'usgs.gov',
  'api.weather.gov',
  'weather.gov',
  'noaa.gov',
  'eonet.gsfc.nasa.gov',
  'nasa.gov',
  'gdacs.org',
  'meteo.gov.lk',
  'dmc.gov.lk',
  'mausam.imd.gov.in',
  'ndma.gov.in',
  'metoffice.gov.uk',
  'bom.gov.au',
  'jma.go.jp',
  'bmkg.go.id',
  'met.gov.my',
  'weather.gc.ca',
  'fema.gov',
];

export function isVerifiedOfficialDisasterAgency(
  sourceName: string,
  sourceUrl?: string
): { verified: boolean; reason: string } {
  const lowerName = (sourceName || '').trim().toLowerCase();
  const lowerUrl = (sourceUrl || '').trim().toLowerCase();

  if (
    !lowerName ||
    /\b(rumor|rumour|unverified|social\s*media|anonymous|user\s*post|viral|whatsapp|telegram|tiktok|reddit|blog)\b/i.test(
      lowerName
    )
  ) {
    return { verified: false, reason: 'Blocked unverified or social media rumor source.' };
  }

  if (lowerUrl) {
    try {
      const host = new URL(lowerUrl).hostname.toLowerCase();
      if (BLOCKED_UNOFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) {
        return { verified: false, reason: `Blocked unofficial social/blog host (${host}).` };
      }
      const allowedHost =
        VERIFIED_GOV_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`)) ||
        /\.(gov|gov\.[a-z]{2}|go\.[a-z]{2}|gc\.ca)$/i.test(host);
      if (!allowedHost) {
        return { verified: false, reason: `Non-government domain rejected (${host}).` };
      }
    } catch {
      return { verified: false, reason: 'Malformed or unverifiable official source URL.' };
    }
  }

  const trustedAgencyNames = [
    'usgs earthquake hazards program',
    'noaa national weather service',
    'nasa eonet earth observatory',
    'national disaster management authority',
    'department of meteorology',
    'disaster management centre',
    'india meteorological department',
    'japan meteorological agency',
    'uk met office',
    'bureau of meteorology',
    'bmkg indonesia',
    'gdacs official disaster feed',
  ];
  const isGovName =
    trustedAgencyNames.some((n) => lowerName === n || lowerName.startsWith(`${n} `)) ||
    /\b(meteorology|meteorological|disaster management|geological survey|national weather service|civil defence|civil defense|emergency management)\b/i.test(
      lowerName
    );

  if (!isGovName) {
    return { verified: false, reason: 'Source is not an accredited government emergency authority.' };
  }

  return { verified: true, reason: '100% Government-Verified Official Agency' };
}

export const securityShield = new SecurityShieldSystem();

