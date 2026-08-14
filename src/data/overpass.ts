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

interface OverpassWay {
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

/**
 * Fetch building footprints and nearby roads around a point.
 *
 * Editor-only and button-triggered, never called while the card is running.
 * Overpass is a donated public service with a strict fair-use policy; one
 * request per button press, whose result is written into the card config as a
 * single number, stays well inside it.
 *
 * Buildings and roads come back in one query rather than two, halving the load
 * on the endpoint.
 */
export async function fetchFootprints(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<FootprintQueryResult> {
  const query = `[out:json][timeout:25];(way(around:30,${lat},${lon})["building"];way(around:80,${lat},${lon})["highway"];);out geom;`;

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      body: new URLSearchParams({ data: query }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new OverpassError('Could not reach OpenStreetMap.');
  }

  if (response.status === 429 || response.status === 504) {
    throw new OverpassError('OpenStreetMap is busy right now. Try again in a moment.');
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

  return parseFootprints(payload.elements ?? []);
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
