import { toMetresPerSecond } from './wind-speed';

/**
 * Colour from wind speed, for the arrow and the flow.
 *
 * The airflow palette answers "which way is the air moving through the house",
 * which is three colours and deliberately few. This answers a different
 * question, "how hard is it blowing", and wants a continuum.
 *
 * The stops are anchored to the Beaufort scale rather than picked to look nice,
 * so the colour changes where the description of the wind changes: calm, light
 * breeze, fresh breeze, strong breeze, gale. Speeds are metres per second
 * because that is the only unit the scale can be defined in once.
 */
export interface SpeedStop {
  /** Metres per second at which this colour is reached exactly. */
  ms: number;
  color: [number, number, number];
}

export const SPEED_STOPS: SpeedStop[] = [
  { ms: 0, color: [120, 160, 200] }, // calm, a flat grey blue
  { ms: 3.4, color: [67, 160, 71] }, // light breeze, Beaufort 3
  { ms: 8, color: [251, 192, 45] }, // fresh breeze, Beaufort 5
  { ms: 13.9, color: [245, 124, 0] }, // strong breeze, Beaufort 7
  { ms: 20.8, color: [211, 47, 47] }, // gale, Beaufort 9
];

function channel(value: number): number {
  return Math.round(Math.min(255, Math.max(0, value)));
}

function hex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => channel(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Interpolate the ramp at a given speed.
 *
 * Interpolated rather than banded because the flow animates: a particle
 * crossing a band edge would change colour mid-flight, and a card refreshing
 * from 7.9 to 8.1 m/s would jump from yellow to orange for a difference nobody
 * can feel. Blending in sRGB is not perceptually even, which for a ramp this
 * short is invisible and saves carrying a colour space around.
 *
 * Below the first stop and above the last, the end colours hold. A gale is the
 * top of the scale; a storm is not a different question.
 */
export function speedColorAt(metresPerSecond: number): string {
  if (!Number.isFinite(metresPerSecond)) return hex(SPEED_STOPS[0].color);

  const first = SPEED_STOPS[0];
  const last = SPEED_STOPS[SPEED_STOPS.length - 1];
  if (metresPerSecond <= first.ms) return hex(first.color);
  if (metresPerSecond >= last.ms) return hex(last.color);

  for (let i = 0; i < SPEED_STOPS.length - 1; i += 1) {
    const from = SPEED_STOPS[i];
    const to = SPEED_STOPS[i + 1];
    if (metresPerSecond > to.ms) continue;

    const span = to.ms - from.ms;
    const t = span === 0 ? 0 : (metresPerSecond - from.ms) / span;
    return hex([
      from.color[0] + (to.color[0] - from.color[0]) * t,
      from.color[1] + (to.color[1] - from.color[1]) * t,
      from.color[2] + (to.color[2] - from.color[2]) * t,
    ]);
  }

  return hex(last.color);
}

/**
 * The colour for a reading in its own unit.
 *
 * A speed the card cannot read is the bottom of the scale rather than a
 * failure: an unknown wind is not a strong one, and painting it red would be a
 * confident lie.
 */
export function speedColor(speed: number | null, unit: string | null): string {
  if (speed === null || !Number.isFinite(speed)) return hex(SPEED_STOPS[0].color);
  return speedColorAt(toMetresPerSecond(Math.max(0, speed), unit));
}
