import { isIntentionalDataOff, isLowDataPackageActive } from './connectivityAndDnd';

export interface WeatherSnapshot {
  city: string;
  countryCode: string;
  tempC: number;
  condition: string;
  icon: string;
  updatedAtMs: number;
  isLive: boolean;
}

export const WEATHER_UPDATED_EVENT = 'pkchat-weather-updated';
const WEATHER_CACHE_KEY = 'pk_cached_weather_v1';

const COUNTRY_DEFAULT_WEATHER: Record<string, Omit<WeatherSnapshot, 'updatedAtMs' | 'isLive'>> = {
  LK: { city: 'Colombo', countryCode: 'LK', tempC: 30, condition: 'Warm Breeze', icon: '🌤️' },
  GB: { city: 'London', countryCode: 'GB', tempC: 14, condition: 'Partly Cloudy', icon: '⛅' },
  IN: { city: 'Chennai', countryCode: 'IN', tempC: 32, condition: 'Sunny', icon: '☀️' },
  US: { city: 'New York', countryCode: 'US', tempC: 18, condition: 'Clear Sky', icon: '☀️' },
  SG: { city: 'Singapore', countryCode: 'SG', tempC: 31, condition: 'Tropical Breeze', icon: '🌦️' },
  AE: { city: 'Dubai', countryCode: 'AE', tempC: 34, condition: 'Clear & Sunny', icon: '☀️' },
  CA: { city: 'Toronto', countryCode: 'CA', tempC: 15, condition: 'Crisp Air', icon: '🌤️' },
  AU: { city: 'Sydney', countryCode: 'AU', tempC: 23, condition: 'Clear Coast', icon: '☀️' },
  MY: { city: 'Kuala Lumpur', countryCode: 'MY', tempC: 30, condition: 'Warm Clouds', icon: '⛅' },
  JP: { city: 'Tokyo', countryCode: 'JP', tempC: 19, condition: 'Mild & Clear', icon: '🌤️' },
};

function decodeWmoCode(code: number): { condition: string; icon: string } {
  if (code === 0) return { condition: 'Clear Sky', icon: '☀️' };
  if (code <= 3) return { condition: 'Partly Cloudy', icon: '⛅' };
  if (code <= 48) return { condition: 'Misty', icon: '🌫️' };
  if (code <= 67) return { condition: 'Rain Showers', icon: '🌧️' };
  if (code <= 77) return { condition: 'Snow', icon: '❄️' };
  if (code <= 82) return { condition: 'Heavy Rain', icon: '🌦️' };
  if (code >= 95) return { condition: 'Thunderstorm', icon: '⛈️' };
  return { condition: 'Fair Weather', icon: '🌤️' };
}

export function getInstantWeatherSnapshot(params: {
  countryCode?: string;
  cityName?: string;
}): WeatherSnapshot {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(WEATHER_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as WeatherSnapshot;
        if (typeof parsed.tempC === 'number' && parsed.condition) {
          return parsed;
        }
      }
    }
  } catch {
    // ignore
  }
  const cc = (params.countryCode || 'LK').toUpperCase();
  const base = COUNTRY_DEFAULT_WEATHER[cc] || COUNTRY_DEFAULT_WEATHER.LK;
  return {
    ...base,
    city: params.cityName?.trim() || base.city,
    countryCode: cc,
    updatedAtMs: Date.now(),
    isLive: false,
  };
}

let inFlightWeatherFetch: Promise<WeatherSnapshot> | null = null;

export async function refreshWeatherSnapshotIfNeeded(params: {
  latitude?: number;
  longitude?: number;
  countryCode?: string;
  cityName?: string;
  force?: boolean;
}): Promise<WeatherSnapshot> {
  const current = getInstantWeatherSnapshot({
    countryCode: params.countryCode,
    cityName: params.cityName,
  });

  if (isIntentionalDataOff()) return current;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return current;

  const minTtlMs = isLowDataPackageActive() ? 90 * 60 * 1000 : 30 * 60 * 1000;
  if (!params.force && current.isLive && Date.now() - current.updatedAtMs < minTtlMs) {
    return current;
  }

  const lat = typeof params.latitude === 'number' ? params.latitude : 6.9271;
  const lng = typeof params.longitude === 'number' ? params.longitude : 79.8612;

  if (inFlightWeatherFetch) return inFlightWeatherFetch;

  inFlightWeatherFetch = (async () => {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 3200);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current_weather=true`;
      const res = await fetch(url, { signal: controller.signal });
      window.clearTimeout(timer);
      if (!res.ok) return current;
      const json = (await res.json()) as {
        current_weather?: { temperature?: number; weathercode?: number };
      };
      const temp = json.current_weather?.temperature;
      const code = json.current_weather?.weathercode ?? 1;
      if (typeof temp !== 'number') return current;
      const meta = decodeWmoCode(code);
      const next: WeatherSnapshot = {
        city: params.cityName?.trim() || current.city,
        countryCode: (params.countryCode || current.countryCode || 'LK').toUpperCase(),
        tempC: Math.round(temp),
        condition: meta.condition,
        icon: meta.icon,
        updatedAtMs: Date.now(),
        isLive: true,
      };
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent<WeatherSnapshot>(WEATHER_UPDATED_EVENT, { detail: next }));
      }
      return next;
    } catch {
      return current;
    } finally {
      inFlightWeatherFetch = null;
    }
  })();

  return inFlightWeatherFetch;
}
