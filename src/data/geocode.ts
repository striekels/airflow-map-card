export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

export class GeocodeError extends Error {}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

/**
 * Look up an address with OpenStreetMap's Nominatim service.
 *
 * Called only from the editor, and only when the user presses Search — never
 * per keystroke and never while the card is running. Nominatim's usage policy
 * caps automated use at one request per second and forbids autocomplete-style
 * querying; a submit-triggered lookup that gets stored as coordinates stays
 * well inside it.
 */
export async function geocode(query: string, language?: string): Promise<GeocodeResult> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', query);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: language ? { 'Accept-Language': language } : {},
    });
  } catch {
    throw new GeocodeError('Could not reach the address lookup service.');
  }

  if (response.status === 429) {
    throw new GeocodeError('Address lookup is rate limited. Wait a moment and try again.');
  }
  if (!response.ok) {
    throw new GeocodeError(`Address lookup failed (HTTP ${response.status}).`);
  }

  const results = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;

  if (!Array.isArray(results) || results.length === 0) {
    throw new GeocodeError('No match for that address.');
  }

  const [first] = results;
  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new GeocodeError('Address lookup returned an unusable position.');
  }

  return { latitude, longitude, displayName: first.display_name ?? query };
}
