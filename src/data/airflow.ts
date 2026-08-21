import { angularDifference, normalizeAngle } from './bearing';

export type AirflowBucket = 'front_to_back' | 'back_to_front' | 'sideways' | 'weak' | 'unknown';

export interface AirflowInput {
  /** Direction the wind comes from, degrees. Null when unknown. */
  windFrom: number | null;
  /** Wind speed in the source's own unit. Null when unknown. */
  speed: number | null;
  /** Outward normal of the front facade, degrees. */
  facadeBearing: number;
  /** Speeds strictly below this count as "weak". Same unit as `speed`. */
  weakBelow: number;
  /** |delta| at or above which airflow counts as sideways. 1..90. */
  sidewaysFrom: number;
}

export interface AirflowResult {
  bucket: AirflowBucket;
  /** Absolute angle between the wind's origin and the facade normal, 0..180. */
  delta: number | null;
}

export const DEFAULT_WEAK_BELOW = 5;
export const DEFAULT_SIDEWAYS_FROM = 75;

/**
 * Classify how the wind moves through the house.
 *
 * The comparison is against the direction the wind comes *from*, not the
 * direction it travels: wind arriving out of the same quarter the front facade
 * faces is what pushes air front-to-back.
 */
export function computeAirflow(input: AirflowInput): AirflowResult {
  const { windFrom, speed, facadeBearing, weakBelow, sidewaysFrom } = input;

  if (windFrom === null) return { bucket: 'unknown', delta: null };

  const delta = Math.abs(angularDifference(windFrom, normalizeAngle(facadeBearing)));

  // A speed we cannot read is not the same as no wind: keep the direction, but
  // do not claim the flow is weak.
  if (speed !== null && speed < weakBelow) return { bucket: 'weak', delta };

  const sideways = clampSideways(sidewaysFrom);
  if (delta < sideways) return { bucket: 'front_to_back', delta };
  if (delta > 180 - sideways) return { bucket: 'back_to_front', delta };
  return { bucket: 'sideways', delta };
}

function clampSideways(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIDEWAYS_FROM;
  return Math.min(90, Math.max(1, value));
}

/** Default colour per bucket, used when `arrow.color_mode: airflow`. */
export const BUCKET_COLORS: Record<AirflowBucket, string> = {
  front_to_back: '#4caf50',
  back_to_front: '#4caf50',
  sideways: '#ff9800',
  weak: '#9e9e9e',
  unknown: '#9e9e9e',
};

/** Default arrow opacity per bucket. */
export const BUCKET_OPACITY: Record<AirflowBucket, number> = {
  front_to_back: 0.9,
  back_to_front: 0.9,
  sideways: 0.9,
  weak: 0.3,
  unknown: 0.3,
};
