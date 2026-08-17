import { describe, expect, it } from 'vitest';
import {
  angularDifference,
  cardinalName,
  normalizeAngle,
  parseBearing,
  pointerBearing,
  windTravelBearing,
} from '../src/data/bearing';

describe('normalizeAngle', () => {
  it('maps any angle into [0, 360)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(361)).toBe(1);
    expect(normalizeAngle(-1)).toBe(359);
    expect(normalizeAngle(-720)).toBe(0);
    expect(normalizeAngle(1080.5)).toBe(0.5);
  });
});

describe('parseBearing', () => {
  it('accepts numbers', () => {
    expect(parseBearing(0)).toBe(0);
    expect(parseBearing(247.5)).toBe(247.5);
    expect(parseBearing(-90)).toBe(270);
  });

  it('accepts numeric strings', () => {
    expect(parseBearing('45')).toBe(45);
    expect(parseBearing(' 180.5 ')).toBe(180.5);
  });

  it('accepts cardinal text in the forms integrations actually emit', () => {
    expect(parseBearing('N')).toBe(0);
    expect(parseBearing('nnw')).toBe(337.5);
    expect(parseBearing('SW')).toBe(225);
    expect(parseBearing('north-west')).toBe(315);
    expect(parseBearing('South East')).toBe(135);
    expect(parseBearing('north_north_east')).toBe(22.5);
  });

  it('returns null rather than a wrong angle for unusable input', () => {
    expect(parseBearing('unknown')).toBeNull();
    expect(parseBearing('unavailable')).toBeNull();
    expect(parseBearing('')).toBeNull();
    expect(parseBearing('   ')).toBeNull();
    expect(parseBearing(null)).toBeNull();
    expect(parseBearing(undefined)).toBeNull();
    expect(parseBearing(NaN)).toBeNull();
    expect(parseBearing(Infinity)).toBeNull();
    expect(parseBearing({})).toBeNull();
  });
});

describe('angularDifference', () => {
  it('returns the shortest signed path', () => {
    expect(angularDifference(10, 0)).toBe(10);
    expect(angularDifference(0, 10)).toBe(-10);
    expect(angularDifference(180, 0)).toBe(180);
    expect(angularDifference(0, 180)).toBe(180);
  });

  it('takes the short way round the wrap point', () => {
    expect(angularDifference(1, 359)).toBe(2);
    expect(angularDifference(359, 1)).toBe(-2);
    expect(angularDifference(350, 10)).toBe(-20);
  });

  it('stays within (-180, 180]', () => {
    for (let a = 0; a < 360; a += 7) {
      for (let b = 0; b < 360; b += 11) {
        const d = angularDifference(a, b);
        expect(d).toBeGreaterThan(-180);
        expect(d).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('windTravelBearing', () => {
  it('is the reciprocal of the from-direction', () => {
    // A northerly wind blows towards the south.
    expect(windTravelBearing(0)).toBe(180);
    expect(windTravelBearing(180)).toBe(0);
    expect(windTravelBearing(90)).toBe(270);
    expect(windTravelBearing(315)).toBe(135);
  });

  it('is its own inverse', () => {
    for (let deg = 0; deg < 360; deg += 15) {
      expect(windTravelBearing(windTravelBearing(deg))).toBe(deg);
    }
  });
});

describe('pointerBearing', () => {
  // Screen coordinates: y grows downwards, so north is negative y.
  it('reads screen coordinates as compass bearings', () => {
    expect(pointerBearing(100, 100, 100, 0)).toBe(0); // straight up
    expect(pointerBearing(100, 100, 200, 100)).toBe(90); // right
    expect(pointerBearing(100, 100, 100, 200)).toBe(180); // down
    expect(pointerBearing(100, 100, 0, 100)).toBe(270); // left
  });

  it('handles the diagonals', () => {
    expect(pointerBearing(0, 0, 10, -10)).toBeCloseTo(45, 6);
    expect(pointerBearing(0, 0, -10, 10)).toBeCloseTo(225, 6);
  });

  it('is independent of distance from the centre', () => {
    expect(pointerBearing(0, 0, 1, -1)).toBeCloseTo(pointerBearing(0, 0, 500, -500), 6);
  });
});

/*
 * `bearingFromDrag` was tested here until the guide's handle moved onto the
 * outward normal. Those four tests all pinned the same thing: that grabbing
 * either end of a symmetric line resolved to one normal rather than flipping
 * front and back. A handle on the normal cannot be grabbed from the wrong end,
 * so the bearing is now just the pointer angle, covered by `pointerBearing`
 * and `normalizeAngle` above.
 */

describe('cardinalName', () => {
  it('names the 16 compass points', () => {
    expect(cardinalName(0)).toBe('N');
    expect(cardinalName(22.5)).toBe('NNE');
    expect(cardinalName(90)).toBe('E');
    expect(cardinalName(337.5)).toBe('NNW');
  });

  it('rounds to the nearest point and wraps at north', () => {
    expect(cardinalName(11)).toBe('N');
    expect(cardinalName(12)).toBe('NNE');
    expect(cardinalName(359)).toBe('N');
    expect(cardinalName(360)).toBe('N');
  });
});
