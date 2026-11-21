export type SilentGenderProfile = 'feminine' | 'masculine' | 'balanced';

export interface SilentLightingAdjustment {
  profile: SilentGenderProfile;
  warmOverlayColor: string;
  warmOverlayOpacity: number;
  softHighlightColor: string;
  softHighlightOpacity: number;
}

const FEMININE_NAME_HINTS = new Set([
  'kavitha',
  'priya',
  'anitha',
  'lakshmi',
  'nisha',
  'divya',
  'sara',
  'maria',
  'elena',
  'aisha',
  'fatima',
  'sophia',
  'meera',
  'deepa',
  'revathi',
]);

const MASCULINE_NAME_HINTS = new Set([
  'jerad',
  'prashath',
  'nimal',
  'kumar',
  'arun',
  'ravi',
  'david',
  'michael',
  'john',
  'ahmed',
  'ali',
  'karthik',
  'vijay',
  'suresh',
  'rohan',
]);

/**
 * Silent background auto-beautification engine.
 * Infers adaptive natural lighting and subtle skin-tone warmth in the background
 * without rendering any manual sliders, percentage readouts, or overlay labels.
 */
export function inferSilentGenderProfile(displayName?: string | null): SilentGenderProfile {
  const firstToken = (displayName || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)[0]
    ?.replace(/[^a-z]/g, '');

  if (firstToken && FEMININE_NAME_HINTS.has(firstToken)) return 'feminine';
  if (firstToken && MASCULINE_NAME_HINTS.has(firstToken)) return 'masculine';
  if (firstToken && firstToken.endsWith('a')) return 'feminine';
  return 'balanced';
}

export function computeSilentNaturalLighting(
  displayName?: string | null,
  ambientBrightness = 0.5
): SilentLightingAdjustment {
  const profile = inferSilentGenderProfile(displayName);
  const clampedAmbient = Math.max(0.2, Math.min(0.9, ambientBrightness));
  const lowLightLift = clampedAmbient < 0.45 ? 0.08 : 0.04;

  if (profile === 'feminine') {
    return {
      profile,
      warmOverlayColor: '#FFF1E6',
      warmOverlayOpacity: lowLightLift + 0.03,
      softHighlightColor: '#FFE4E6',
      softHighlightOpacity: 0.04,
    };
  }

  if (profile === 'masculine') {
    return {
      profile,
      warmOverlayColor: '#F5EFE6',
      warmOverlayOpacity: lowLightLift,
      softHighlightColor: '#E0F2FE',
      softHighlightOpacity: 0.03,
    };
  }

  return {
    profile,
    warmOverlayColor: '#FFF7ED',
    warmOverlayOpacity: lowLightLift + 0.01,
    softHighlightColor: '#FFFFFF',
    softHighlightOpacity: 0.03,
  };
}
