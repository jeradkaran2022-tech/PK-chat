export type LightBrandTheme = 'ocean_blue' | 'sky_glass';
export type WallpaperFitMode = 'contain' | 'cover';

export const BRAND_THEME_STORAGE_KEY = 'pk_light_brand_theme';
export const WALLPAPER_FIT_STORAGE_KEY = 'pk_wallpaper_fit_mode';

export const BRAND_THEME_EVENT = 'pkchat-brand-theme';
export const WALLPAPER_FIT_EVENT = 'pkchat-wallpaper-fit';

export const PK_WORLD_PEACE_WALLPAPER_ID = 'wp_world_peace';
export const PK_SIGNATURE_WALLPAPER_ID = 'wp_pk_signature';

const PK_SIGNATURE_WALLPAPER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1600" width="900" height="1600"><defs><linearGradient id="pkbg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0284c7"/><stop offset="48%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#f0f9ff"/></linearGradient><radialGradient id="pkglow1" cx="25%" cy="22%" r="48%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient><radialGradient id="pkglow2" cx="80%" cy="76%" r="52%"><stop offset="0%" stop-color="#0369a1" stop-opacity="0.38"/><stop offset="100%" stop-color="#0369a1" stop-opacity="0"/></radialGradient></defs><rect width="900" height="1600" fill="url(#pkbg)"/><rect width="900" height="1600" fill="url(#pkglow1)"/><rect width="900" height="1600" fill="url(#pkglow2)"/><path d="M0,420 C220,330 430,510 900,370 L900,1600 L0,1600 Z" fill="#ffffff" fill-opacity="0.22"/><path d="M0,780 C280,690 610,870 900,740 L900,1600 L0,1600 Z" fill="#0ea5e9" fill-opacity="0.16"/><path d="M0,1140 C310,1040 580,1220 900,1090 L900,1600 L0,1600 Z" fill="#ffffff" fill-opacity="0.32"/><circle cx="720" cy="240" r="140" fill="#ffffff" fill-opacity="0.16"/><circle cx="190" cy="1320" r="170" fill="#38bdf8" fill-opacity="0.18"/></svg>`;

export const PK_SIGNATURE_WALLPAPER_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PK_SIGNATURE_WALLPAPER_SVG)}`;

function safeReadStorage(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function safeWriteStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    } else if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // ignore storage errors
  }
}

export function getLightBrandTheme(): LightBrandTheme {
  return safeReadStorage(BRAND_THEME_STORAGE_KEY) === 'sky_glass' ? 'sky_glass' : 'ocean_blue';
}

export function setLightBrandTheme(theme: LightBrandTheme): void {
  const normalized: LightBrandTheme = theme === 'sky_glass' ? 'sky_glass' : 'ocean_blue';
  safeWriteStorage(BRAND_THEME_STORAGE_KEY, normalized);
  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof CustomEvent === 'function'
  ) {
    window.dispatchEvent(new CustomEvent<LightBrandTheme>(BRAND_THEME_EVENT, { detail: normalized }));
  }
}

export function getWallpaperFitMode(): WallpaperFitMode {
  return safeReadStorage(WALLPAPER_FIT_STORAGE_KEY) === 'cover' ? 'cover' : 'contain';
}

export function setWallpaperFitMode(mode: WallpaperFitMode): void {
  safeWriteStorage(WALLPAPER_FIT_STORAGE_KEY, mode);
  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof CustomEvent === 'function'
  ) {
    window.dispatchEvent(new CustomEvent<WallpaperFitMode>(WALLPAPER_FIT_EVENT, { detail: mode }));
  }
}
