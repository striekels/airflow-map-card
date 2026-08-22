import { describe, expect, it } from 'vitest';

import { toMetresPerSecond } from '../src/data/wind-speed';

/**
 * The flow's speed and density are both derived from this, and getting it wrong
 * does not fail loudly: the animation just moves at the wrong rate, which looks
 * entirely plausible. Home Assistant weather integrations report whatever unit
 * they like, so every one the card is likely to meet is pinned here.
 */
describe('toMetresPerSecond', () => {
  it('passes metres per second straight through', () => {
    expect(toMetresPerSecond(7, 'm/s')).toBe(7);
  });

  it('treats km/h as the default, including for an unknown unit', () => {
    // 36 km/h is 10 m/s exactly.
    expect(toMetresPerSecond(36, 'km/h')).toBeCloseTo(10, 10);
    expect(toMetresPerSecond(36, null)).toBeCloseTo(10, 10);
    expect(toMetresPerSecond(36, 'furlongs per fortnight')).toBeCloseTo(10, 10);
  });

  it('converts the imperial and nautical units', () => {
    expect(toMetresPerSecond(10, 'mph')).toBeCloseTo(4.4704, 4);
    expect(toMetresPerSecond(10, 'kn')).toBeCloseTo(5.14444, 4);
    expect(toMetresPerSecond(10, 'ft/s')).toBeCloseTo(3.048, 4);
  });

  it('is case insensitive, since units arrive as free text', () => {
    expect(toMetresPerSecond(10, 'M/S')).toBe(10);
    expect(toMetresPerSecond(10, 'MPH')).toBeCloseTo(4.4704, 4);
  });

  it('orders the units correctly relative to each other', () => {
    // A sanity net that survives someone editing a single factor: for the same
    // number, knots outrun mph, which outrun km/h.
    const kmh = toMetresPerSecond(20, 'km/h');
    const mph = toMetresPerSecond(20, 'mph');
    const kn = toMetresPerSecond(20, 'kn');
    expect(kmh).toBeLessThan(mph);
    expect(mph).toBeLessThan(kn);
  });
});
