import { describe, expect, it } from 'vitest';
import {
  bearingBetween,
  detectFacadeBearing,
  stitchRing,
  distanceToPolyline,
  outwardNormals,
  pointInPolygon,
  ringCentre,
  selectBuilding,
  snapToWalls,
  toLocalMetres,
  type LatLon,
} from '../src/data/footprint';

/**
 * Real OpenStreetMap geometry for a semi-detached house, with its longitude
 * shifted so the fixture does not identify anyone's home.
 *
 * The shift is longitude-only and applied equally to the house, the street and
 * the reference point. `toLocalMetres` scales longitude by `cos(latitude)` and
 * nothing else, so with the latitude untouched every distance, wall normal and
 * derived bearing is numerically identical to the original location.
 *
 * Kept as real geometry because synthetic squares cannot show whether detection
 * survives an actual footprint: this one has six walls of very different
 * lengths, including a 1.4 m step in the side wall that a naive "longest wall"
 * heuristic trips over.
 */
const HOUSE: LatLon[] = [
  { lat: 51.059439, lon: 8.278447 },
  { lat: 51.0594525, lon: 8.2785385 },
  { lat: 51.0593619, lon: 8.2785708 },
  { lat: 51.0593577, lon: 8.278542 },
  { lat: 51.0593453, lon: 8.278547 },
  { lat: 51.0593363, lon: 8.2784851 },
  { lat: 51.059439, lon: 8.278447 },
];

/** The nearest segment of the residential street the house is addressed to. */
const STREET: LatLon[] = [
  { lat: 51.059198, lon: 8.2782569 },
  { lat: 51.0592739, lon: 8.2787399 },
];

const HOME: LatLon = { lat: 51.059365, lon: 8.278536 };

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
      { lat: 51.0592, lon: 8.2781 },
      { lat: 51.0596, lon: 8.2781 },
      { lat: 51.0596, lon: 8.2789 },
      { lat: 51.0592, lon: 8.2789 },
      { lat: 51.0592, lon: 8.2781 },
    ];
    expect(selectBuilding([terrace, HOUSE], HOME)!.building).toBe(HOUSE);
    expect(selectBuilding([HOUSE, terrace], HOME)!.building).toBe(HOUSE);
  });

  it('flags a fallback to the nearest building instead of hiding it', () => {
    // A borrowed footprint from the house next door yields a plausible-looking
    // angle that is simply wrong, so the caller has to be able to say so.
    const outside: LatLon = { lat: 51.05, lon: 8.27 };
    const choice = selectBuilding([HOUSE], outside)!;
    expect(choice.building).toBe(HOUSE);
    expect(choice.contained).toBe(false);
    expect(choice.distance).toBeGreaterThan(100);
  });

  it('returns null when there are no buildings at all', () => {
    expect(selectBuilding([], { lat: 51.05, lon: 8.27 })).toBeNull();
  });
});

describe('ringCentre', () => {
  it('averages the vertices', () => {
    const centre = ringCentre([
      { lat: 0, lon: 0 },
      { lat: 0, lon: 2 },
      { lat: 2, lon: 2 },
      { lat: 2, lon: 0 },
    ])!;
    expect(centre.lat).toBeCloseTo(1, 9);
    expect(centre.lon).toBeCloseTo(1, 9);
  });

  it('is unaffected by a duplicated closing point', () => {
    const open = ringCentre(HOUSE.slice(0, -1))!;
    const closed = ringCentre(HOUSE)!;
    expect(closed.lat).toBeCloseTo(open.lat, 12);
    expect(closed.lon).toBeCloseTo(open.lon, 12);
  });

  it('lands inside its own building', () => {
    const centre = ringCentre(HOUSE)!;
    const ring = HOUSE.map((p) => toLocalMetres(centre, p));
    expect(pointInPolygon(ring, { x: 0, y: 0 })).toBe(true);
  });

  it('returns null for an empty ring', () => {
    expect(ringCentre([])).toBeNull();
  });
});

/** Roads are named segments now; most tests do not care about the name. */
const road = (points: LatLon[], name?: string) => (name ? { points, name } : { points });

describe('detectFacadeBearing', () => {
  it('reproduces a hand-tuned facade bearing from OSM geometry alone', () => {
    const detection = detectFacadeBearing(HOUSE, [road(STREET)], HOME);
    expect(detection).not.toBeNull();

    // The owner of this house had independently arrived at 166.52 degrees by
    // eye. Detection must land within a degree of that without being told.
    expect(detection!.bearing).toBeGreaterThan(165.5);
    expect(detection!.bearing).toBeLessThan(168);
  });

  it('reports the street it reasoned from', () => {
    const detection = detectFacadeBearing(HOUSE, [road(STREET)], HOME)!;
    expect(detection.streetDistance).toBeGreaterThan(10);
    expect(detection.streetDistance).toBeLessThan(25);
    expect(detection.offStreet).toBeLessThan(5);
  });

  it('does not pick the long side wall over the short front one', () => {
    // The side walls are 10.3 m and 11.7 m; the front is 4.4 m. Sorting by
    // length alone would get this wrong, which is exactly the mistake a human
    // makes when dragging by eye.
    const detection = detectFacadeBearing(HOUSE, [road(STREET)], HOME)!;
    const longest = detection.walls[0];
    expect(longest.length).toBeGreaterThan(10);
    expect(Math.round(detection.bearing)).not.toBe(Math.round(longest.normal));
  });

  it('returns null when there is nothing to reason from', () => {
    expect(detectFacadeBearing(HOUSE, [], HOME)).toBeNull();
    expect(detectFacadeBearing([], [road(STREET)], HOME)).toBeNull();
  });

  it('follows the street when the street moves to the other side', () => {
    const behind: LatLon[] = [
      { lat: 51.0597, lon: 8.2782 },
      { lat: 51.0597, lon: 8.2788 },
    ];
    const detection = detectFacadeBearing(HOUSE, [road(behind)], HOME)!;
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

describe('detectFacadeBearing on a corner plot', () => {
  /*
   * The house sits on a corner. Its address is on the road to the south, but a
   * side street runs closer, to the west. Facing the nearest road puts the
   * front on the side of the house, which is the whole bug: it looks entirely
   * plausible and is wrong, and a straight terrace like the fixture above can
   * never show it.
   */
  const addressStreet = road(
    [
      { lat: 51.0593, lon: 8.2782 },
      { lat: 51.0593, lon: 8.2792 },
    ],
    'Panisdries',
  );
  const sideStreet = road(
    [
      { lat: 51.0594, lon: 8.27855 },
      { lat: 51.0598, lon: 8.27855 },
    ],
    'Zijstraat',
  );

  it('faces the road the house is numbered on, not the closer one', () => {
    const nearest = detectFacadeBearing(HOUSE, [sideStreet, addressStreet], HOME)!;
    const matched = detectFacadeBearing(HOUSE, [sideStreet, addressStreet], HOME, {
      street: 'Panisdries',
    })!;

    // Without the street name the side street wins on distance.
    expect(nearest.streetDistance).toBeLessThan(matched.streetDistance);
    // With it, the front comes back to the south-facing wall.
    expect(matched.bearing).toBeGreaterThan(150);
    expect(matched.bearing).toBeLessThan(200);
    expect(Math.round(matched.bearing)).not.toBe(Math.round(nearest.bearing));
  });

  it('compares street names the way a person would', () => {
    const spaced = detectFacadeBearing(HOUSE, [sideStreet, addressStreet], HOME, {
      street: '  panisdries  ',
    })!;
    const exact = detectFacadeBearing(HOUSE, [sideStreet, addressStreet], HOME, {
      street: 'Panisdries',
    })!;
    expect(spaced.bearing).toBe(exact.bearing);
  });

  it('falls back to the nearest road when no name matches', () => {
    const unmatched = detectFacadeBearing(HOUSE, [sideStreet, addressStreet], HOME, {
      street: 'Somewhere Else',
    })!;
    const nearest = detectFacadeBearing(HOUSE, [sideStreet, addressStreet], HOME)!;
    expect(unmatched.bearing).toBe(nearest.bearing);
  });

  it('ignores the street name when the roads are unnamed', () => {
    const unnamed = [road(sideStreet.points), road(addressStreet.points)];
    const detection = detectFacadeBearing(HOUSE, unnamed, HOME, { street: 'Panisdries' })!;
    expect(detection.bearing).toBe(detectFacadeBearing(HOUSE, unnamed, HOME)!.bearing);
  });
});

describe('stitchRing', () => {
  // A multipolygon stores its outline as several ways, in arbitrary order and
  // direction. Concatenating them as they arrive gives a self-crossing shape
  // whose outward normals are nonsense.
  const a: LatLon[] = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 1 },
  ];
  const b: LatLon[] = [
    { lat: 0, lon: 1 },
    { lat: 1, lon: 1 },
  ];
  const c: LatLon[] = [
    { lat: 1, lon: 1 },
    { lat: 0, lon: 0 },
  ];

  it('joins segments given in order', () => {
    expect(stitchRing([a, b, c])).toEqual([
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 1, lon: 1 },
      { lat: 0, lon: 0 },
    ]);
  });

  it('joins segments given out of order', () => {
    expect(stitchRing([b, c, a])).toHaveLength(4);
    expect(stitchRing([c, a, b])).toHaveLength(4);
  });

  it('reverses a segment that joins end to end', () => {
    const reversed = [...b].reverse();
    const ring = stitchRing([a, reversed, c])!;
    expect(ring).toHaveLength(4);
    // Still a genuine ring: it comes back to where it started.
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('keeps what it can join rather than splicing unrelated outlines', () => {
    const disjoint: LatLon[] = [
      { lat: 9, lon: 9 },
      { lat: 9, lon: 8 },
    ];
    const ring = stitchRing([a, b, disjoint])!;
    expect(ring).toHaveLength(3);
    expect(ring).not.toContainEqual({ lat: 9, lon: 9 });
  });

  it('returns null when there is not enough to form a ring', () => {
    expect(stitchRing([])).toBeNull();
    expect(stitchRing([[{ lat: 0, lon: 0 }]])).toBeNull();
    expect(stitchRing([a])).toBeNull();
  });
});
