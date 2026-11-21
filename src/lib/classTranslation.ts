import { LanguageOption } from '../types/pkchat';
import { WORLD_LANGUAGES_CATALOG, findWorldLanguage } from '../data/worldLanguages';

export interface PassThroughEvaluation {
  isPassThrough: boolean;
  speakerBaseCode: string;
  listenerBaseCode: string;
  speakerLanguageName: string;
  listenerLanguageName: string;
  mode: 'direct_pass_through' | 'live_translate';
  estimatedLatencyMs: number;
  summary: string;
}

export interface WhiteboardPoint {
  x: number;
  y: number;
}

export interface WhiteboardStroke {
  strokeId: string;
  authorUid: string;
  authorName: string;
  tool: 'pen' | 'highlighter' | 'eraser';
  color: string;
  width: number;
  points: WhiteboardPoint[];
  createdAt: string;
}

export interface ClassSubtitleEntry {
  id: string;
  speakerUid: string;
  speakerName: string;
  speakerLanguageCode: string;
  listenerLanguageCode: string;
  originalText: string;
  translatedText: string;
  isPassThrough: boolean;
  lipSyncLatencyMs: number;
  createdAt: string;
}

export interface ClassParticipant {
  uid: string;
  name: string;
  role: 'teacher' | 'student';
  preferredLanguage: string;
  handRaised: boolean;
  muted?: boolean;
  joinedAt: string;
}

export interface ClassRoomState {
  roomId: string;
  title: string;
  meetingUrl: string;
  deepLinkUri: string;
  hostUid: string;
  hostName: string;
  teacherLanguage: string;
  mediaTier: '4k_uhd' | 'hd_1080p' | 'low_signal_resilient';
  expiresAt?: string;
  expiresAtMs?: number;
  isLocked?: boolean;
  screenShareProtected?: boolean;
  participants: ClassParticipant[];
  strokes: WhiteboardStroke[];
  subtitles: ClassSubtitleEntry[];
  createdAt: string;
  updatedAt: string;
}

export function normalizeLanguageBaseCode(
  code?: string | null,
  dynamicCatalog: LanguageOption[] = WORLD_LANGUAGES_CATALOG
): string {
  const clean = (code || 'en').trim().toLowerCase();
  if (!clean) return 'en';
  const entry = findWorldLanguage(clean, dynamicCatalog);
  if (entry) {
    if (entry.parentCode) return entry.parentCode.toLowerCase();
    if (entry.iso639_1) return entry.iso639_1.toLowerCase();
    return entry.code.toLowerCase().split(/[-_]/)[0];
  }
  return clean.split(/[-_]/)[0] || 'en';
}

/**
 * Automatically detects whether Teacher and Student speak the same base language
 * (e.g., ta <-> ta-LK, en <-> en-GB, ar <-> ar-AE) so translation overhead is bypassed
 * cleanly with 0ms Pass-Through.
 */
export function evaluateSameLanguagePassThrough(
  teacherLangCode?: string | null,
  studentLangCode?: string | null,
  dynamicCatalog: LanguageOption[] = WORLD_LANGUAGES_CATALOG
): PassThroughEvaluation {
  const teacherEntry = findWorldLanguage(teacherLangCode, dynamicCatalog);
  const studentEntry = findWorldLanguage(studentLangCode, dynamicCatalog);
  const speakerBaseCode = normalizeLanguageBaseCode(teacherLangCode, dynamicCatalog);
  const listenerBaseCode = normalizeLanguageBaseCode(studentLangCode, dynamicCatalog);
  const isPassThrough = speakerBaseCode === listenerBaseCode;
  const speakerLanguageName = teacherEntry?.name || teacherLangCode || 'English';
  const listenerLanguageName = studentEntry?.name || studentLangCode || 'English';

  return {
    isPassThrough,
    speakerBaseCode,
    listenerBaseCode,
    speakerLanguageName,
    listenerLanguageName,
    mode: isPassThrough ? 'direct_pass_through' : 'live_translate',
    estimatedLatencyMs: isPassThrough ? 0 : 140,
    summary: isPassThrough
      ? `Same language (${speakerLanguageName}) · Direct Pass-Through active`
      : `Translating ${speakerLanguageName} -> ${listenerLanguageName}`,
  };
}

export function buildClassMeetingUrl(roomId: string): string {
  const safeId = sanitizeClassRoomId(roomId);
  return `https://pkchat.app/class/${safeId}`;
}

export function sanitizeClassRoomId(raw?: string | null): string {
  const cleaned = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return cleaned || 'pkc-global-class';
}

/**
 * Extracts a Class Room ID from either:
 * - https://pkchat.app/class/<roomId>
 * - pkchat://class/<roomId>
 * - /class/<roomId>
 * - ?classRoom=<roomId>
 * - direct slug input
 */
export function parseClassRoomFromInput(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const queryMatch = trimmed.match(/[?&](?:classRoom|room|class)=([^&#]+)/i);
  if (queryMatch?.[1]) {
    return sanitizeClassRoomId(decodeURIComponent(queryMatch[1]));
  }

  const pathMatch = trimmed.match(/\/class\/([a-zA-Z0-9_-]+)/i);
  if (pathMatch?.[1]) {
    return sanitizeClassRoomId(pathMatch[1]);
  }

  const schemeMatch = trimmed.match(/^pkchat:\/\/class\/([a-zA-Z0-9_-]+)/i);
  if (schemeMatch?.[1]) {
    return sanitizeClassRoomId(schemeMatch[1]);
  }

  if (/^[a-zA-Z0-9_-]{3,48}$/.test(trimmed)) {
    return sanitizeClassRoomId(trimmed);
  }

  return null;
}
