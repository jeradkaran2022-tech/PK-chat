import {
  ConsentedLocation,
  DisasterAlert,
} from '../types/pkchat';
export {
  getVerifiedLocationAlerts,
  type LocationHierarchyFilter,
  type VerifiedDisasterAlert,
} from './pkMirrorEngine';

function normalizeConsentedLocationPayload(
  raw: Record<string, unknown>,
  fallbackSource: 'gps' | 'manual'
): ConsentedLocation {
  const modeOrSource = raw.source === 'manual' || raw.mode === 'manual' ? 'manual' : fallbackSource;
  return {
    latitude: typeof raw.latitude === 'number' ? raw.latitude : undefined,
    longitude: typeof raw.longitude === 'number' ? raw.longitude : undefined,
    accuracyMeters: typeof raw.accuracyMeters === 'number' ? raw.accuracyMeters : undefined,
    country: typeof raw.country === 'string' ? raw.country : '',
    countryCode: typeof raw.countryCode === 'string' ? raw.countryCode : '',
    province:
      typeof raw.province === 'string'
        ? raw.province
        : typeof raw.provinceState === 'string'
          ? raw.provinceState
          : '',
    district: typeof raw.district === 'string' ? raw.district : '',
    city:
      typeof raw.city === 'string'
        ? raw.city
        : typeof raw.locality === 'string'
          ? raw.locality
          : '',
    displayAddress: typeof raw.displayAddress === 'string' ? raw.displayAddress : undefined,
    source: modeOrSource,
    consentedAt:
      typeof raw.consentedAt === 'string'
        ? raw.consentedAt
        : typeof raw.updatedAt === 'string'
          ? raw.updatedAt
          : new Date().toISOString(),
  };
}

export async function reverseGeocodeConsentedCoords(
  lat: number,
  lng: number
): Promise<ConsentedLocation> {
  const res = await fetch(
    `/api/emergency/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Unable to resolve location details.');
  }
  return normalizeConsentedLocationPayload(data as Record<string, unknown>, 'gps');
}

export async function searchManualLocationPlaces(queryText: string): Promise<ConsentedLocation[]> {
  if (!queryText.trim()) return [];
  const res = await fetch(`/api/emergency/search-place?q=${encodeURIComponent(queryText.trim())}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Place search failed.');
  }
  return Array.isArray(data.results)
    ? data.results.map((r: Record<string, unknown>) => normalizeConsentedLocationPayload(r, 'manual'))
    : [];
}

export async function fetchGeoMatchedOfficialDisasters(params?: {
  lat?: number;
  lng?: number;
  country?: string;
}): Promise<{
  alerts: DisasterAlert[];
  sourcesChecked: string[];
  feedErrors: string[];
  fetchedAt: string;
}> {
  const qs = new URLSearchParams();
  if (typeof params?.lat === 'number' && typeof params?.lng === 'number') {
    qs.set('lat', String(params.lat));
    qs.set('lng', String(params.lng));
  }
  if (params?.country) qs.set('country', params.country);
  const url = qs.toString() ? `/api/disasters/official?${qs.toString()}` : '/api/disasters/official';
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch official disaster feeds');
  }
  return data;
}
