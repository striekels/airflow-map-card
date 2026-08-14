export const DEFAULT_PADDING = '75%';

/**
 * Convert a CSS aspect-ratio string into a percentage-padding value.
 *
 * The map area cannot get its height from the `aspect-ratio` property: inside
 * Home Assistant's sections grid the map wrapper is a flex item whose height is
 * still being resolved when `aspect-ratio` is evaluated, and it collapses to
 * zero. Percentage padding always resolves against the element's own *width*,
 * so it yields a definite height in any layout context.
 *
 * Accepts "4 / 3", "4/3", and bare numbers ("1.5" = width is 1.5x the height).
 */
export function aspectRatioPadding(ratio?: string): string {
  if (!ratio) return DEFAULT_PADDING;

  const parts = ratio.split('/').map((part) => Number(part.trim()));

  if (parts.length === 1) {
    const [value] = parts;
    return isPositive(value) ? toPercent(1 / value) : DEFAULT_PADDING;
  }

  if (parts.length === 2) {
    const [width, height] = parts;
    return isPositive(width) && isPositive(height) ? toPercent(height / width) : DEFAULT_PADDING;
  }

  return DEFAULT_PADDING;
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function toPercent(fraction: number): string {
  // Clamp so a wild ratio cannot produce a card kilometres tall or invisible.
  const clamped = Math.min(4, Math.max(0.2, fraction));
  return `${Math.round(clamped * 10000) / 100}%`;
}
