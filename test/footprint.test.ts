import { describe, expect, it } from 'vitest';
import {
  bearingBetween,
  detectFacadeBearing,
  distanceToPolyline,
  outwardNormals,
  pointInPolygon,
  selectBuilding,
  snapToWalls,
  toLocalMetres,
  type LatLon,
} from '../src/data/footprint';

/**
 * Real OpenStreetMap geometry for a semi-detached house, way 1290424365,
 * "Panisdries 55". Kept as a fixture because synthetic squares cannot show
 * whether the detection survives a real footprint: this one has six walls of
 * very different lengths, including a 1.4 m step in the side wall that a naive
 * "longest wall" heuristic would trip over.
 */
const HOUSE: LatLon[] = [
  { lat: 51.059439, lon: 5.278447 },
  { lat: 51.0594525, lon: 5.2785385 },
  { lat: 51.0593619, lon: 5.2785708 },
  { lat: 51.0593577, lon: 5.278542 },
  { lat: 51.0593453, lon: 5.278547 },
  { lat: 51.0593363, lon: 5.2784851 },
  { lat: 51.059439, lon: 5.278447 },
];

/** The nearest segment of Panisdries, OSM way 979831196. */
const STREET: LatLon[] = [
  { lat: 51.059198, lon: 5.2782569 },
  { lat: 51.0592739, lon: 5.2787399 },
];

const HOME: LatLon = { lat: 51.059365, lon: 5.278536 };

const square: LatLon[] = [
  { lat: 0, lon: 0 },
  { lat: 0, lon: 0.001 },
  { lat: 0.001, lon: 0.001 },
  { lat: 0.001, lon: 0 },
  { lat: 0, lon: 0 },
];

describe('toLocalMetres', () => {
  it('projects to metres with x east and y north', () => {
    const north = toLocalMetres({ lat: 51, lon: 5 }, { lat: 51.001, lon: 5 });
    expect(north.y).toBeCloseTo(111.32, 1);
    expect(north.x).toBeCloseTo(0, 6);

    const east = toLocalMetres({ lat: 51, lon: 5 }, { lat: 51, lon: 5.001 });
    expect(east.x).toBeGreaterThan(60);
    expect(east.x).toBeLessThan(80); // shrinks with latitude
    expect(east.y).toBeCloseTo(0, 6);
  });
});

describe('bearingBetween', () => {
  it('measures clockwise from north', () => {
    expect(bearingBetween({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(0);
    expect(bearingBetween({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(90);
    expect(bearingBetween({ x: 0, y: 0 }, { x: 0, y: -1 })).toBe(180);
    expect(bearingBetween({ x: 0, y: 0 }, { x: -1, y: 0 })).toBe(270);
  });
});

describe('pointInPolygon', () => {
  const ring = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('separates inside from outside', () => {
    expect(pointInPolygon(ring, { x: 5, y: 5 })).toBe(true);
    expect(pointInPolygon(ring, { x: 15, y: 5 })).toBe(false);
    expect(pointInPolygon(ring, { x: -1, y: -1 })).toBe(false);
  });

  it('locates the home point inside its own building', () => {
    const ring = HOUSE.map((p) => toLocalMetres(HOME, p));
    expect(pointInPolygon(ring, { x: 0, y: 0 })).toBe(true);
  });
});

describe('outwardNormals', () => {
  it('points normals away from the building whichever way the ring winds', () => {
    const ccw = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const cw = [...ccw].reverse();

    for (const ring of [ccw, cw]) {
      const normals = outwardNormals(ring).map((w) => Math.round(w.normal));
      expect(normals.sort((a, b) => a - b)).toEqual([0, 90, 180, 270]);
    }
  });

  it('returns walls longest first and drops slivers', () => {
    const walls = outwardNormals(HOUSE.map((p) => toLocalMetres(HOME, p)));
    expect(walls.length).toBeGreaterThan(3);
    for (let i = 1; i < walls.length; i++) {
      expect(walls[i - 1].length).toBeGreaterThanOrEqual(walls[i].length);
    }
    expect(
      outwardNormals(
        HOUSE.map((p) => toLocalMetres(HOME, p)),
        5,
      ).length,
    ).toBeLessThan(walls.length);
  });

  it('ignores a duplicated closing point', () => {
    const closed = HOUSE.map((p) => toLocalMetres(HOME, p));
    const open = closed.slice(0, -1);
    expect(outwardNormals(closed)).toEqual(outwardNormals(open));
  });

  it('gives up on degenerate rings rather than inventing walls', () => {
    expect(outwardNormals([])).toEqual([]);
    expect(
      outwardNormals([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([]);
  });
});

describe('distanceToPolyline', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ];

  it('measures perpendicular distance to the segment interior', () => {
    expect(distanceToPolyline({ x: 5, y: 4 }, line)?.distance).toBeCloseTo(4, 6);
  });

  it('clamps to the endpoints rather than the infinite line', () => {
    expect(distanceToPolyline({ x: -3, y: 4 }, line)?.distance).toBeCloseTo(5, 6);
  });

  it('needs at least two points', () => {
    expect(distanceToPolyline({ x: 0, y: 0 }, [{ x: 1, y: 1 }])).toBeNull();
  });
});

describe('selectBuilding', () => {
  it('prefers the building containing the point', () => {
    const far: LatLon[] = square;
    const choice = selectBuilding([far, HOUSE], HOME)!;
    expect(choice.building).toBe(HOUSE);
    expect(choice.contained).toBe(true);
  });

  it('picks the smallest ring when several contain the point', () => {
    // Overpass returns terrace outlines and building:parts alongside the
    // individual house. Taking whichever came back first aligns the guide to
    // the whole block: observed live, where it produced a wall angle that did
    // not exist on this building at all.
    const terrace: LatLon[] = [
      { lat: 51.0592, lon: 5.2781 },
      { lat: 51.0596, lon: 5.2781 },
      { lat: 51.0596, lon: 5.2789 },
      { lat: 51.0592, lon: 5.2789 },
      { lat: 51.0592, lon: 5.2781 },
    ];
    expect(selectBuilding([terrace, HOUSE], HOME)!.building).toBe(HOUSE);
    expect(selectBuilding([HOUSE, terrace], HOME)!.building).toBe(HOUSE);
  });

  it('flags a fallback to the nearest building instead of hiding it', () => {
    // A borrowed footprint from the house next door yields a plausible-looking
    // angle that is simply wrong, so the caller has to be able to say so.
    const outside: LatLon = { lat: 51.05, lon: 5.27 };
    const choice = selectBuilding([HOUSE], outside)!;
    expect(choice.building).toBe(HOUSE);
    expect(choice.contained).toBe(false);
    expect(choice.distance).toBeGreaterThan(100);
  });

  it('returns null when there are no buildings at all', () => {
    expect(selectBuilding([], { lat: 51.05, lon: 5.27 })).toBeNull();
  });
});

describe('detectFacadeBearing', () => {
  it('reproduces a hand-tuned facade bearing from OSM geometry alone', () => {
    const detection = detectFacadeBearing(HOUSE, [STREET], HOME);
    expect(detection).not.toBeNull();

    // The owner of this house had independently arrived at 166.52 degrees by
    // eye. Detection must land within a degree of that without being told.
    expect(detection!.bearing).toBeGreaterThan(165.5);
    expect(detection!.bearing).toBeLessThan(168);
  });

  it('reports the street it reasoned from', () => {
    const detection = detectFacadeBearing(HOUSE, [STREET], HOME)!;
    expect(detection.streetDistance).toBeGreaterThan(10);
    expect(detection.streetDistance).toBeLessThan(25);
    expect(detection.offStreet).toBeLessThan(5);
  });

  it('does not pick the long side wall over the short front one', () => {
    // The side walls are 10.3 m and 11.7 m; the front is 4.4 m. Sorting by
    // length alone would get this wrong, which is exactly the mistake a human
    // makes when dragging by eye.
    const detection = detectFacadeBearing(HOUSE, [STREET], HOME)!;
    const longest = detection.walls[0];
    expect(longest.length).toBeGreaterThan(10);
    expect(Math.round(detection.bearing)).not.toBe(Math.round(longest.normal));
  });

  it('returns null when there is nothing to reason from', () => {
    expect(detectFacadeBearing(HOUSE, [], HOME)).toBeNull();
    expect(detectFacadeBearing([], [STREET], HOME)).toBeNull();
  });

  it('follows the street when the street moves to the other side', () => {
    const behind: LatLon[] = [
      { lat: 51.0597, lon: 5.2782 },
      { lat: 51.0597, lon: 5.2788 },
    ];
    const detection = detectFacadeBearing(HOUSE, [behind], HOME)!;
    // Now the nearest road is north of the house, so the front flips.
    expect(detection.bearing).toBeGreaterThan(300);
  });
});

describe('snapToWalls', () => {
  const walls = [
    { normal: 167, length: 4.4 },
    { normal: 77, length: 10.3 },
    { normal: 257, length: 11.7 },
  ];

  it('snaps onto a wall that is close enough', () => {
    expect(snapToWalls(170, walls)).toBe(167);
    expect(snapToWalls(80, walls)).toBe(77);
  });

  it('leaves a bearing alone when no wall is near', () => {
    expect(snapToWalls(120, walls)).toBe(120);
  });

  it('picks the nearest wall when two are in range', () => {
    expect(
      snapToWalls(172, [
        { normal: 167, length: 1 },
        { normal: 178, length: 1 },
      ]),
    ).toBe(167);
    expect(
      snapToWalls(175, [
        { normal: 167, length: 1 },
        { normal: 178, length: 1 },
      ]),
    ).toBe(178);
  });

  it('respects the tolerance and the wrap point', () => {
    expect(snapToWalls(170, walls, 1)).toBe(170);
    expect(snapToWalls(2, [{ normal: 358, length: 1 }])).toBe(358);
  });
});
