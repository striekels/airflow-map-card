import { describe, expect, it } from 'vitest';
import { TILE_PRESETS, resolveTiles } from '../src/map/tiles';

const host = (url: string) => url.replace('https://', '').split('/')[0];

describe('resolveTiles', () => {
  it('gives an unset basemap OpenStreetMap light, whatever the dashboard theme', () => {
    expect(host(resolveTiles({}, true).url)).toBe('tile.openstreetmap.org');
    expect(host(resolveTiles({}, false).url)).toBe('tile.openstreetmap.org');
  });

  it('follows the theme only when auto is asked for', () => {
    // auto is still the way back out of a pinned basemap; it is no longer what
    // you get by saying nothing.
    expect(host(resolveTiles({ tiles: 'auto' }, true).url)).toBe('{s}.basemaps.cartocdn.com');
    expect(host(resolveTiles({ tiles: 'auto' }, false).url)).toBe('tile.openstreetmap.org');
    expect(resolveTiles({ tiles: 'auto' }, true)).not.toEqual(resolveTiles({}, true));
  });

  it('has no theme option, which was a second control over one outcome', () => {
    // `map.theme` was deprecated in 0.3.3 and removed for 1.0. It duplicated
    // what `tiles` already decided, and an explicit `tiles` silently won, so the
    // theme could be set and quietly ignored. Pinning a basemap is now the only
    // way to override the dashboard, which is the whole point of `auto`.
    expect(host(resolveTiles({ tiles: 'carto-dark' }, false).url)).toBe(
      '{s}.basemaps.cartocdn.com',
    );
    expect(host(resolveTiles({ tiles: 'osm' }, true).url)).toBe('tile.openstreetmap.org');
  });

  it('lets a pinned basemap win over the theme, which is why auto has to exist', () => {
    // This combination is what made a dark dashboard show a light map: the
    // pinned preset is deliberate and wins, so the escape hatch is choosing
    // auto rather than fighting it with the theme.
    expect(host(resolveTiles({ tiles: 'osm' }, true).url)).toBe('tile.openstreetmap.org');
    expect(host(resolveTiles({ tiles: 'carto-dark' }, false).url)).toBe(
      '{s}.basemaps.cartocdn.com',
    );
  });

  it('lets a custom tile URL beat everything', () => {
    const spec = resolveTiles(
      { tile_url: 'https://tiles.example/{z}/{x}/{y}.png', tiles: 'osm' },
      true,
    );
    expect(host(spec.url)).toBe('tiles.example');
  });

  it('applies a custom filter over whichever preset was chosen', () => {
    expect(resolveTiles({ filter: 'grayscale(1)' }, false).filter).toBe('grayscale(1)');
    expect(resolveTiles({ tiles: 'carto-dark', filter: 'none' }, false).filter).toBe('none');
  });

  it('credits CARTO only where CARTO tiles are used', () => {
    expect(resolveTiles({ tiles: 'osm' }, false).attribution).not.toContain('CARTO');
    expect(resolveTiles({ tiles: 'carto-dark' }, false).attribution).toContain('CARTO');
    for (const spec of Object.values(TILE_PRESETS)) {
      expect(spec.attribution).toContain('OpenStreetMap');
      expect(spec.maxZoom).toBeGreaterThanOrEqual(19);
    }
  });

  it('reports whether the basemap is dark, which is not the dashboard theme', () => {
    // Anything drawn on the map contrasts with the map. These are independent:
    // a pinned basemap means a dark dashboard can carry a light map, and styling
    // the house outline from the dashboard's text colour drew it near-white on a
    // near-white map, where it could not be seen at all.
    expect(resolveTiles({ tiles: 'osm' }, true).dark).toBe(false);
    expect(resolveTiles({ tiles: 'carto-light' }, true).dark).toBe(false);
    expect(resolveTiles({ tiles: 'carto-dark' }, false).dark).toBe(true);
  });

  it('follows the dashboard only when the basemap is automatic', () => {
    expect(resolveTiles({}, true).dark).toBe(false);
    expect(resolveTiles({}, false).dark).toBe(false);
    expect(resolveTiles({ tiles: 'auto' }, true).dark).toBe(true);
  });

  it('assumes a custom tile server is light, the safer way to be wrong', () => {
    expect(resolveTiles({ tile_url: 'https://example.com/{z}/{x}/{y}.png' }, true).dark).toBe(
      false,
    );
  });
});
