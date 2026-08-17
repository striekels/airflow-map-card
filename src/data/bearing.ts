/**
 * All compass maths for the card lives here, and nowhere else.
 *
 * Conventions, stated once so nothing downstream has to guess:
 *
 *  - A bearing is degrees clockwise from true north, normalised to [0, 360).
 *  - Home Assistant's `wind_bearing` is the direction the wind blows *from*.
 *    Wind with `wind_bearing: 0` comes out of the north and travels southwards.
 *  - `windTravelBearing()` converts from-direction to travel-direction. The
 *    arrow glyph in this card points north at rotation 0, so it is rotated by
 *    the travel bearing.
 *  - `facade_bearing` is the outward normal of the front of the house: 45 means
 *    the front of the house faces north-east.
 */

const CARDINALS: Record<string, number> = {
  n: 0,
  nne: 22.5,
  ne: 45,
  ene: 67.5,
  e: 90,
  ese: 112.5,
  se: 135,
  sse: 157.5,
  s: 180,
  ssw: 202.5,
  sw: 225,
  wsw: 247.5,
  w: 270,
  wnw: 292.5,
  nw: 315,
  nnw: 337.5,
};

const CARDINAL_NAMES = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
];

/** Normalise any angle into [0, 360). */
export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Parse a bearing from whatever an integration decided to report. Returns null
 * for anything that is not a usable bearing, so callers can render a neutral
 * state rather than a confidently wrong arrow.
 *
 * Accepts numbers, numeric strings, and cardinal text ("NNW", "north-west").
 */
export function parseBearing(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? normalizeAngle(value) : null;
  }
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (raw === '') return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return normalizeAngle(numeric);

  const key = raw
    .toLowerCase()
    .replace(/[\s_-]/g, '')
    .replace(/north/g, 'n')
    .replace(/south/g, 's')
    .replace(/east/g, 'e')
    .replace(/west/g, 'w');

  return key in CARDINALS ? CARDINALS[key] : null;
}

/**
 * Signed shortest angular distance from `b` to `a`, in (-180, 180].
 * Positive means `a` is clockwise of `b`.
 */
export function angularDifference(a: number, b: number): number {
  const d = normalizeAngle(a - b);
  return d > 180 ? d - 360 : d;
}

/** Direction the wind travels towards, given the direction it comes from. */
export function windTravelBearing(windFrom: number): number {
  return normalizeAngle(windFrom + 180);
}

/**
 * Bearing of a screen point as seen from a centre point, in the screen's
 * coordinate system where y grows downwards. North is up.
 */
export function pointerBearing(
  centreX: number,
  centreY: number,
  pointerX: number,
  pointerY: number,
): number {
  return normalizeAngle((Math.atan2(pointerX - centreX, centreY - pointerY) * 180) / Math.PI);
}

/*
 * `bearingFromDrag` lived here until the guide's handle moved onto the outward
 * normal. It resolved the 180-degree ambiguity of grabbing the wall line, which
 * looks the same from both ends, by picking whichever normal sat nearer the
 * current bearing. A handle on the normal points one way only, so the pointer
 * angle is the bearing and the ambiguity does not arise.
 */

/** 16-point cardinal name for a bearing, e.g. 337.5 -> "NNW". */
export function cardinalName(deg: number): string {
  const index = Math.round(normalizeAngle(deg) / 22.5) % 16;
  return CARDINAL_NAMES[index];
}
