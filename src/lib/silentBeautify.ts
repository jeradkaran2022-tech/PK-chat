/**
 * Silent Background Auto-Beautify & Natural Lighting Processor
 * Automatically detects facial lighting and tone profile silently in the background
 * during video calls and applies balanced natural warmth and softness without any UI overlays.
 */

export type InferredToneProfile = 'feminine' | 'masculine' | 'neutral';

export interface SilentBeautyMetrics {
  brightness: number;
  contrast: number;
  saturate: number;
  profile: InferredToneProfile;
}

const SAMPLE_WIDTH = 32;
const SAMPLE_HEIGHT = 24;

let cachedCanvas: HTMLCanvasElement | null = null;

function getOffscreenCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!cachedCanvas) {
    cachedCanvas = document.createElement('canvas');
    cachedCanvas.width = SAMPLE_WIDTH;
    cachedCanvas.height = SAMPLE_HEIGHT;
  }
  return cachedCanvas;
}

/**
 * Infers subtle lighting & skin-tone balance from the video feed or user metadata silently.
 * Zero visual overlays, sliders, or numeric indicators are exposed.
 */
export function computeSilentNaturalLightProfile(
  videoEl: HTMLVideoElement | null,
  hintName?: string
): SilentBeautyMetrics {
  let avgLuma = 128;
  let warmRatio = 1.05;

  if (videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
    try {
      const canvas = getOffscreenCanvas();
      const ctx = canvas?.getContext('2d', { willReadFrequently: true });
      if (ctx && canvas) {
        ctx.drawImage(videoEl, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        const frame = ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;
        let lumaSum = 0;
        let rSum = 0;
        let bSum = 0;
        // Center facial region crop
        let count = 0;
        for (let y = 6; y < 18; y += 1) {
          for (let x = 8; x < 24; x += 1) {
            const idx = (y * SAMPLE_WIDTH + x) * 4;
            const r = frame[idx] || 0;
            const g = frame[idx + 1] || 0;
            const b = frame[idx + 2] || 0;
            lumaSum += 0.299 * r + 0.587 * g + 0.114 * b;
            rSum += r;
            bSum += b;
            count += 1;
          }
        }
        if (count > 0) {
          avgLuma = lumaSum / count;
          warmRatio = bSum > 0 ? rSum / bSum : 1.05;
        }
      }
    } catch {
      // Fallback silently to balanced defaults
    }
  }

  // Silent heuristic profile selection based on soft facial luminance & name suffix cues
  const normalizedName = (hintName || '').trim().toLowerCase();
  let profile: InferredToneProfile = 'neutral';
  if (/[aei]$/.test(normalizedName) || warmRatio > 1.14) {
    profile = 'feminine';
  } else if (normalizedName.length > 0 && warmRatio <= 1.14) {
    profile = 'masculine';
  }

  // Boost dark rooms slightly, preserve bright rooms cleanly
  const lowLightBoost = avgLuma < 105 ? 0.1 : avgLuma < 140 ? 0.06 : 0.03;

  if (profile === 'feminine') {
    return {
      profile,
      brightness: Number((1.05 + lowLightBoost).toFixed(2)),
      contrast: 0.98,
      saturate: 1.08,
    };
  }
  if (profile === 'masculine') {
    return {
      profile,
      brightness: Number((1.03 + lowLightBoost).toFixed(2)),
      contrast: 1.02,
      saturate: 1.04,
    };
  }
  return {
    profile,
    brightness: Number((1.04 + lowLightBoost).toFixed(2)),
    contrast: 1.0,
    saturate: 1.06,
  };
}

export function buildSilentBeautyCssFilter(
  metrics: SilentBeautyMetrics,
  softBlurBackground = false
): string {
  const base = `brightness(${metrics.brightness}) contrast(${metrics.contrast}) saturate(${metrics.saturate})`;
  return softBlurBackground ? `${base} blur(1.1px)` : base;
}
