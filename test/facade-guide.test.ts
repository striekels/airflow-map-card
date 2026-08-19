import { describe, expect, it } from 'vitest';
import { RADIUS, WALL_HALF_LENGTH, arcPath, sectorPath } from '../src/overlay/facade-guide';

/**
 * Pull the two arc endpoints out of a sector path. Matched positionally rather
 * than by scanning for number pairs: the arc command's radii would otherwise
 * be mistaken for a coordinate.
 */
function points(path: string): [[number, number], [number, number]] {
  const match = path.match(/^M \S+ \S+ L (\S+) (\S+) A \S+ \S+ \S+ \S+ \S+ (\S+) (\S+) Z$/);
  if (!match) throw new Error(`unexpected path shape: ${path}`);
  const [, x1, y1, x2, y2] = match;
  return [
    [Number(x1), Number(y1)],
    [Number(x2), Number(y2)],
  ];
}

describe('sectorPath', () => {
  it('starts at the centre and closes', () => {
    const path = sectorPath(45);
    expect(path.startsWith('M 50 50')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
  });

  it('opens symmetrically about north', () => {
    const [start, end] = points(sectorPath(45));
    // Mirrored across the vertical centre line, and both above it.
    expect(start[0]).toBeLessThan(50);
    expect(end[0]).toBeGreaterThan(50);
    expect(start[0] + end[0]).toBeCloseTo(100, 3);
    expect(start[1]).toBeCloseTo(end[1], 3);
    expect(start[1]).toBeLessThan(50);
  });

  it('opens symmetrically about south when centred on 180', () => {
    const [start, end] = points(sectorPath(45, 180));
    expect(start[1]).toBeGreaterThan(50);
    expect(end[1]).toBeGreaterThan(50);
    expect(start[0] + end[0]).toBeCloseTo(100, 3);
  });

  it('uses the short arc for every valid half-angle', () => {
    // halfAngle is capped at 90, so the sweep never exceeds 180 degrees.
    for (const halfAngle of [1, 30, 45, 89, 90, 200]) {
      expect(sectorPath(halfAngle)).toContain('A 46 46 0 0 1');
    }
  });

  it('clamps a nonsensical half-angle instead of drawing nothing', () => {
    expect(() => sectorPath(0)).not.toThrow();
    expect(() => sectorPath(-10)).not.toThrow();
    expect(sectorPath(999)).toBe(sectorPath(90));
  });

  it('places a 90 degree sector edge on the horizontal', () => {
    const [start, end] = points(sectorPath(90));
    expect(start).toEqual([4, 50]);
    expect(end).toEqual([96, 50]);
  });
});

describe('wall line extent', () => {
  it('overruns the guide circle far enough to reach the edges of a wide card', () => {
    // The line is what you sight along, and misalignment shows up at its ends.
    // A future tidy-up that pulls it back inside the 0..100 viewBox would look
    // harmless and quietly undo the whole point of the guide.
    expect(WALL_HALF_LENGTH).toBeGreaterThan(RADIUS * 3);
  });
});

describe('arcPath', () => {
  it('traces the same sweep as the sector it outlines', () => {
    for (const halfAngle of [10, 45, 90]) {
      const [sectorStart, sectorEnd] = points(sectorPath(halfAngle));
      const arc = arcPath(halfAngle);
      expect(arc).toContain(`M ${sectorStart[0]} ${sectorStart[1]}`);
      expect(arc.endsWith(`${sectorEnd[0]} ${sectorEnd[1]}`)).toBe(true);
    }
  });

  it('has no wedge sides and never closes', () => {
    const arc = arcPath(45);
    expect(arc).not.toContain('L');
    expect(arc).not.toContain('Z');
  });

  it('clamps identically to the sector, so fill and outline cannot disagree', () => {
    expect(arcPath(999)).toBe(arcPath(90));
    expect(arcPath(0)).toBe(arcPath(0.5));
  });
});
