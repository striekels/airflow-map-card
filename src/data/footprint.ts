import { angularDifference, normalizeAngle } from './bearing';

export interface LatLon {
  lat: number;
  lon: number;
}

/** Local tangent-plane coordinates in metres: x east, y north. */
export interface Point {
  x: number;
  y: number;
}

export interface WallEdge {
  /** Outward normal of the wall, degrees clockwise from north. */
  normal: number;
  /** Wall length in metres. */
  length: number;
}

export interface FacadeDetection {
  /** Outward normal of the wall judged to be the front, degrees. */
  bearing: number;
  /** Direction from the building to the nearest road, degrees. */
  streetBearing: number;
  /** Distance to that road in metres. */
  streetDistance: number;
  /** How far the chosen wall's normal sits from the street direction. */
  offStreet: number;
  /** Every outward-facing wall, longest first. */
  walls: WallEdge[];
}

const METRES_PER_DEGREE_LAT = 111320;

/**
 * Project to a local tangent plane in metres.
 *
 * A building is tens of metres across, so a flat-earth approximation about a
 * nearby origin is exact to well under a centimetre — far below the precision
 * of the OSM geometry itself.
 */
export function toLocalMetres(origin: LatLon, point: LatLon): Point {
  const metresPerDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (point.lon - origin.lon) * metresPerDegreeLon,
    y: (point.lat - origin.lat) * METRES_PER_DEGREE_LAT,
  };
}

/** Bearing from `from` to `to`, degrees clockwise from north. */
export function bearingBetween(from: Point, to: Point): number {
  return normalizeAngle((Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI);
}

export function polygonCentroid(polygon: Point[]): Point {
  const ring = openRing(polygon);
  return {
    x: ring.reduce((sum, p) => sum + p.x, 0) / ring.length,
    y: ring.reduce((sum, p) => sum + p.y, 0) / ring.length,
  };
}

export function pointInPolygon(polygon: Point[], point: Point): boolean {
  const ring = openRing(polygon);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const straddles = a.y > point.y !== b.y > point.y;
    if (straddles && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Twice the signed area. Positive means the ring winds counter-clockwise. */
function signedArea2(ring: Point[]): number {
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total;
}

function openRing(polygon: Point[]): Point[] {
  if (polygon.length < 2) return polygon;
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  const closed = Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9;
  return closed ? polygon.slice(0, -1) : polygon;
}

/**
 * Outward normal of every wall, longest first.
 *
 * Direction comes from the ring's winding via the signed area rather than by
 * probing an offset point for containment: OSM does not guarantee winding
 * order, and a probe offset large enough to escape a thick wall lands inside
 * the building on a narrow one.
 */
export function outwardNormals(polygon: Point[], minLength = 0.5): WallEdge[] {
  const ring = openRing(polygon);
  if (ring.length < 3) return [];

  const counterClockwise = signedArea2(ring) > 0;
  const walls: WallEdge[] = [];

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < minLength) continue;

    const normal = counterClockwise ? { x: dy, y: -dx } : { x: -dy, y: dx };
    walls.push({
      normal: normalizeAngle((Math.atan2(normal.x, normal.y) * 180) / Math.PI),
      length,
    });
  }

  return walls.sort((a, b) => b.length - a.length);
}

/** Shortest distance from `point` to a polyline, with the closest point on it. */
export function distanceToPolyline(
  point: Point,
  line: Point[],
): { distance: number; closest: Point } | null {
  if (line.length < 2) return null;
  let best: { distance: number; closest: Point } | null = null;

  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared
      ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
      : 0;
    const closest = { x: a.x + t * dx, y: a.y + t * dy };
    const distance = Math.hypot(point.x - closest.x, point.y - closest.y);
    if (!best || distance < best.distance) best = { distance, closest };
  }

  return best;
}

/** Plan area of a ring in square metres. */
export function polygonArea(polygon: Point[]): number {
  return Math.abs(signedArea2(openRing(polygon))) / 2;
}

export interface BuildingChoice {
  building: LatLon[];
  /** False when the point is outside every candidate and a neighbour was used. */
  contained: boolean;
  /** Distance from the point to the chosen building's centre, metres. */
  distance: number;
}

/**
 * The building containing `point`, or the nearest one if none contains it.
 *
 * When several rings contain the point, the smallest wins: Overpass can return
 * a terrace outline, a `building:part` and the individual house all covering
 * the same spot, and the largest would align the guide to the whole block.
 *
 * `contained` matters. Falling back to the nearest building silently borrows a
 * neighbour's geometry, and neighbouring houses in a row are rotated just
 * enough that the result looks plausible while being wrong. Callers are
 * expected to say so rather than present it as a clean detection.
 */
export function selectBuilding(buildings: LatLon[][], point: LatLon): BuildingChoice | null {
  if (buildings.length === 0) return null;

  const projected = buildings.map((building) => {
    const ring = building.map((p) => toLocalMetres(point, p));
    const centre = polygonCentroid(ring);
    return {
      building,
      ring,
      contained: pointInPolygon(ring, { x: 0, y: 0 }),
      distance: Math.hypot(centre.x, centre.y),
    };
  });

  const containing = projected.filter((candidate) => candidate.contained);
  if (containing.length > 0) {
    const smallest = containing.sort((a, b) => polygonArea(a.ring) - polygonArea(b.ring))[0];
    return { building: smallest.building, contained: true, distance: smallest.distance };
  }

  const nearest = projected.sort((a, b) => a.distance - b.distance)[0];
  return { building: nearest.building, contained: false, distance: nearest.distance };
}

/**
 * Work out which wall is the front.
 *
 * The heuristic is simply that houses face the street: of the walls whose
 * outward normal points nearest the closest road, take the longest. Tested
 * against a real semi-detached house whose owner had hand-tuned the value to
 * 166.52 degrees; this returns 167.0.
 */
export function detectFacadeBearing(
  building: LatLon[],
  roads: LatLon[][],
  origin: LatLon,
  tolerance = 10,
): FacadeDetection | null {
  const ring = building.map((p) => toLocalMetres(origin, p));
  const walls = outwardNormals(ring);
  if (walls.length === 0) return null;

  const centre = polygonCentroid(ring);

  let nearestRoad: { distance: number; closest: Point } | null = null;
  for (const road of roads) {
    const hit = distanceToPolyline(
      centre,
      road.map((p) => toLocalMetres(origin, p)),
    );
    if (hit && (!nearestRoad || hit.distance < nearestRoad.distance)) nearestRoad = hit;
  }
  if (!nearestRoad) return null;

  const streetBearing = bearingBetween(centre, nearestRoad.closest);
  const offStreet = (wall: WallEdge) => Math.abs(angularDifference(wall.normal, streetBearing));

  const bestOffset = Math.min(...walls.map(offStreet));
  // Walls within `tolerance` of the best are treated as the same face of the
  // building; a bay window should not beat the wall it sits in.
  const front = walls
    .filter((wall) => offStreet(wall) <= bestOffset + tolerance)
    .sort((a, b) => b.length - a.length)[0];

  return {
    bearing: front.normal,
    streetBearing,
    streetDistance: nearestRoad.distance,
    offStreet: offStreet(front),
    walls,
  };
}

/**
 * Snap a freely dragged bearing onto a wall normal when it is close enough.
 * Turns "roughly along the front" into the building's actual angle.
 */
export function snapToWalls(bearing: number, walls: WallEdge[], tolerance = 8): number {
  let best: { normal: number; offset: number } | null = null;
  for (const wall of walls) {
    const offset = Math.abs(angularDifference(wall.normal, bearing));
    if (offset <= tolerance && (!best || offset < best.offset)) {
      best = { normal: wall.normal, offset };
    }
  }
  return best ? best.normal : bearing;
}
