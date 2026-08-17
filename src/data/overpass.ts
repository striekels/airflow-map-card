import type { LatLon } from './footprint';

export interface BuildingFootprint {
  ring: LatLon[];
  /** OSM address tags, when the building has them. */
  address?: { street?: string; housenumber?: string };
}

export interface FootprintQueryResult {
  buildings: BuildingFootprint[];
  roads: LatLon[][];
}

export class OverpassError extends Error {}

const ENDPOINT = 'https://overpass-api.de/api/interpreter';

/**
 * Backoff between attempts, in milliseconds.
 *
 * The public endpoint is intermittently overloaded rather than down: a request
 * that returns 504 often succeeds a few seconds later, which was measured
 * directly while building this. Retrying is therefore worth far more than a
 * mirror list.
 *
 * No mirrors are shipped, deliberately. The obvious candidates were tested and
 * rejected: overpass.osm.ch only carries Switzerland (five buildings for Zurich,
 * zero for Brussels), and two others were unreachable. An unverified endpoint is
 * worse than retrying one known to work.
 */
const BACKOFF_MS = [1200, 3000];

/** Successful results, so pressing Detect again costs the service nothing. */
const cache = new Map<string, FootprintQueryResult>();

/** About a metre of precision, far finer than any building. */
function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** Overload and rate-limit responses, which are worth retrying. */
function isTransient(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

interface OverpassWay {
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

/**
 * Fetch building footprints and nearby roads around a point.
 *
 * Editor-only and button-triggered, never called while the card is running.
 * Overpass is a donated public service with a strict fair-use policy. One
 * request per button press, cached afterwards and reduced to a single number in
 * the card config, stays well inside it; buildings and roads come back in one
 * query rather than two for the same reason.
 */
export async function fetchFootprints(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<FootprintQueryResult> {
  const key = cacheKey(lat, lon);
  const hit = cache.get(key);
  if (hit) return hit;

  const query = `[out:json][timeout:25];(way(around:30,${lat},${lon})["building"];way(around:80,${lat},${lon})["highway"];);out geom;`;
  let lastError: OverpassError | undefined;

  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1], signal);

    let response: Response;
    try {
      // GET, not POST, and deliberately. A POST whose Content-Type Overpass
      // does not accept is answered with 406, and GET has no body to negotiate
      // and needs no preflight. The query is a couple of hundred characters,
      // nowhere near any URL length limit.
      const url = `${ENDPOINT}?${new URLSearchParams({ data: query }).toString()}`;

      // `referrerPolicy` is what makes this work from inside Home Assistant,
      // and it is not optional.
      //
      // Overpass sits behind Apache rules that reject a request carrying a
      // browser User-Agent with no Referer, which is ordinary anti-scraping.
      // Apache answers 406 before Overpass sees the request, and that response
      // has no Access-Control-Allow-Origin header, so the browser cannot show
      // the 406 and reports an opaque CORS failure instead.
      //
      // Home Assistant serves `Referrer-Policy: no-referrer` on every page, so
      // without this every request from a card arrives refererless and is
      // rejected. A card cannot set User-Agent instead: it is a forbidden
      // header. Reproduced directly against the service, holding everything
      // else constant: browser UA without Referer gives 406, the same request
      // with a Referer gives 200.
      //
      // 'origin' sends the origin only and never the path. That does disclose
      // the Home Assistant origin to overpass-api.de, which is a deliberate
      // trade: the service already receives the user's IP address and the
      // coordinates of their house, so the hostname adds little, and the
      // feature does not work at all without it.
      response = await fetch(url, { method: 'GET', referrerPolicy: 'origin', signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      // A thrown fetch is a network-level failure: DNS, TLS, an extension, or a
      // Content-Security-Policy that blocks connect-src. Retrying is cheap and
      // occasionally helps, but the message has to point somewhere useful.
      lastError = new OverpassError(
        'Could not reach OpenStreetMap. Check that your browser is allowed to connect to overpass-api.de.',
      );
      continue;
    }

    if (isTransient(response.status)) {
      lastError = new OverpassError(
        `The public OpenStreetMap query service is busy (HTTP ${response.status}). It was retried ${BACKOFF_MS.length} times; try again shortly.`,
      );
      continue;
    }

    if (!response.ok) {
      throw new OverpassError(`OpenStreetMap lookup failed (HTTP ${response.status}).`);
    }

    let payload: { elements?: OverpassWay[] };
    try {
      payload = await response.json();
    } catch {
      throw new OverpassError('OpenStreetMap returned something unreadable.');
    }

    const result = parseFootprints(payload.elements ?? []);
    cache.set(key, result);
    return result;
  }

  throw lastError ?? new OverpassError('OpenStreetMap lookup failed.');
}

/** Split an Overpass element list into buildings and roads. Exported for testing. */
export function parseFootprints(elements: OverpassWay[]): FootprintQueryResult {
  const buildings: BuildingFootprint[] = [];
  const roads: LatLon[][] = [];

  for (const element of elements) {
    const geometry = element.geometry;
    if (!geometry || geometry.length < 2) continue;
    const ring = geometry.map((p) => ({ lat: p.lat, lon: p.lon }));

    if (element.tags?.building) {
      const street = element.tags['addr:street'];
      const housenumber = element.tags['addr:housenumber'];
      buildings.push({
        ring,
        ...(street || housenumber ? { address: { street, housenumber } } : {}),
      });
    } else if (element.tags?.highway) {
      roads.push(ring);
    }
  }

  return { buildings, roads };
}

/** Human-readable label for a detected building, e.g. "Mill Lane 55". */
export function describeBuilding(building: BuildingFootprint | undefined): string | undefined {
  const address = building?.address;
  if (!address) return undefined;
  return [address.street, address.housenumber].filter(Boolean).join(' ') || undefined;
}
