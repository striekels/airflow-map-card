import { describe, expect, it } from 'vitest';

import { SPEED_STOPS, speedColor, speedColorAt } from '../src/data/speed-color';

/** Rough luminance, for asserting the ramp gets warmer rather than exact hexes. */
function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

describe('speedColorAt', () => {
  it('hits each stop exactly on its own speed', () => {
    for (const stop of SPEED_STOPS) {
      const [r, g, b] = channels(speedColorAt(stop.ms));
      expect([r, g, b]).toEqual(stop.color);
    }
  });

  it('holds the end colours outside the scale', () => {
    // A storm is not a different question from a gale, and a negative reading
    // is a broken sensor rather than a wind blowing backwards.
    expect(speedColorAt(-5)).toBe(speedColorAt(0));
    expect(speedColorAt(200)).toBe(speedColorAt(SPEED_STOPS[SPEED_STOPS.length - 1].ms));
  });

  it('interpolates between stops rather than stepping', () => {
    const low = SPEED_STOPS[1];
    const high = SPEED_STOPS[2];
    const middle = channels(speedColorAt((low.ms + high.ms) / 2));

    // Strictly between the two, on every channel that differs. A banded scale
    // would return one end or the other, and a particle crossing the edge
    // would change colour mid-flight.
    for (let i = 0; i < 3; i += 1) {
      if (low.color[i] === high.color[i]) continue;
      const [min, max] = [low.color[i], high.color[i]].sort((a, b) => a - b);
      expect(middle[i]).toBeGreaterThan(min);
      expect(middle[i]).toBeLessThan(max);
    }
  });

  it('gets redder and less blue as the wind rises', () => {
    const calm = channels(speedColorAt(0));
    const gale = channels(speedColorAt(20.8));
    expect(gale[0]).toBeGreaterThan(calm[0]);
    expect(gale[2]).toBeLessThan(calm[2]);
  });

  it('always returns a six digit hex, whatever the rounding', () => {
    for (let ms = 0; ms <= 25; ms += 0.37) {
      expect(speedColorAt(ms)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('speedColor', () => {
  it('reads the unit, so the same wind is the same colour', () => {
    // 36 km/h, 10 m/s and 19.4 kn are one wind. Treating a unit as km/h by
    // mistake is the failure that looks plausible: it just paints a gale as a
    // breeze.
    expect(speedColor(36, 'km/h')).toBe(speedColor(10, 'm/s'));
    expect(speedColor(10, 'm/s')).toBe(speedColor(19.4384, 'kn'));
  });

  it('treats an unreadable speed as calm, not as a gale', () => {
    expect(speedColor(null, 'km/h')).toBe(speedColorAt(0));
    expect(speedColor(Number.NaN, 'km/h')).toBe(speedColorAt(0));
  });

  it('defaults an unknown unit to km/h, as the rest of the card does', () => {
    expect(speedColor(36, null)).toBe(speedColor(36, 'km/h'));
    expect(speedColor(36, 'furlongs per fortnight')).toBe(speedColor(36, 'km/h'));
  });
});
