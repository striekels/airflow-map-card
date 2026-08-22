/**
 * Wind speed in the units Home Assistant actually reports it in.
 *
 * Integrations report speed in whatever unit they please, and getting the
 * conversion wrong does not fail loudly: the flow simply moves at 3.6 times the
 * right rate for an m/s source, which looks plausible and is wrong. The same
 * mistake in the colour scale would paint a breeze as a gale.
 *
 * Lives here rather than beside the animation that first needed it because the
 * colour scale needs it too, and `data/` may not import from `overlay/`.
 */
export function toMetresPerSecond(speed: number, unit: string | null): number {
  switch ((unit ?? 'km/h').toLowerCase()) {
    case 'm/s':
      return speed;
    case 'mph':
      return speed * 0.44704;
    case 'kn':
    case 'kt':
    case 'knots':
      return speed * 0.514444;
    case 'ft/s':
      return speed * 0.3048;
    default:
      // km/h, and anything unrecognised. Home Assistant's own default.
      return speed / 3.6;
  }
}

/** The units worth offering. `source` leaves the reading exactly as it arrives. */
export const SPEED_UNITS = ['source', 'km/h', 'm/s', 'mph', 'kn', 'bft'] as const;

export type SpeedUnit = (typeof SPEED_UNITS)[number];

/** The inverse of toMetresPerSecond, for the display units it can express. */
export function fromMetresPerSecond(ms: number, unit: Exclude<SpeedUnit, 'source' | 'bft'>): number {
  switch (unit) {
    case 'm/s':
      return ms;
    case 'mph':
      return ms / 0.44704;
    case 'kn':
      return ms / 0.514444;
    default:
      return ms * 3.6;
  }
}

/**
 * Beaufort force from metres per second.
 *
 * The lower bound of each force, from the standard scale. Beaufort is a set of
 * bands rather than a unit, so this rounds down to the force the wind is in and
 * never interpolates: force 4.5 is not a thing anyone says.
 */
const BEAUFORT_LOWER_BOUNDS = [0, 0.5, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];

export function beaufort(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0;
  let force = 0;
  for (let i = 0; i < BEAUFORT_LOWER_BOUNDS.length; i += 1) {
    if (ms >= BEAUFORT_LOWER_BOUNDS[i]) force = i;
  }
  return force;
}

/** The speed at which a Beaufort force starts, in metres per second. */
export function beaufortLowerBound(force: number): number {
  const index = Math.min(BEAUFORT_LOWER_BOUNDS.length - 1, Math.max(0, Math.round(force)));
  return BEAUFORT_LOWER_BOUNDS[index];
}

/**
 * A configured threshold in metres per second.
 *
 * The threshold is written in whatever unit the card displays, because that is
 * the number the user is looking at when they pick it. "Weak below 3 Bft" means
 * below where force 3 begins.
 */
export function thresholdMetresPerSecond(
  value: number,
  unit: SpeedUnit | undefined,
  sourceUnit: string | null,
): number {
  if (!unit || unit === 'source') return toMetresPerSecond(value, sourceUnit);
  if (unit === 'bft') return beaufortLowerBound(value);
  return toMetresPerSecond(value, unit);
}

/**
 * Convert a reading from the unit it arrived in to the unit to display it in.
 *
 * Everything routes through metres per second rather than converting between
 * pairs directly: one table to be wrong in instead of twenty.
 */
export function convertSpeed(
  value: number | null,
  from: string | null,
  to: SpeedUnit | undefined,
): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (!to || to === 'source') return value;

  const ms = toMetresPerSecond(value, from);
  return to === 'bft' ? beaufort(ms) : fromMetresPerSecond(ms, to);
}

/** What to print after the number. Beaufort is written Bft, not bft. */
export function speedUnitLabel(unit: SpeedUnit | undefined, fallback: string | null): string | null {
  if (!unit || unit === 'source') return fallback;
  return unit === 'bft' ? 'Bft' : unit;
}
