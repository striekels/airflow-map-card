import { describe, expect, it } from 'vitest';
import { TILE_PRESETS, resolveTiles } from '../src/map/tiles';

const host = (url: string) => url.replace('https://', '').split('/')[0];

describe('resolveTiles', () => {
  it('follows the dashboard when nothing is pinned', () => {
    expect(host(resolveTiles({}, true).url)).toBe('{s}.basemaps.cartocdn.com');
    expect(host(resolveTiles({}, false).url)).toBe('tile.openstreetmap.org');
  });

  it('treats auto exactly like unset', () => {
    // The whole point of the auto value: it is the way back out of a pinned
    // basemap. Without it, choosing a preset in the editor permanently
    // overrode the theme and there was no option to undo it.
    for (const dark of [true, false]) {
      expect(resolveTiles({ tiles: 'auto' }, dark)).toEqual(resolveTiles({}, dark));
    }
  });

  it('honours an explicit theme while the basemap is automatic', () => {
    expect(host(resolveTiles({ theme: 'dark' }, false).url)).toBe('{s}.basemaps.cartocdn.com');
    expect(host(resolveTiles({ theme: 'light' }, true).url)).toBe('tile.openstreetmap.org');
    expect(host(resolveTiles({ theme: 'dark', tiles: 'auto' }, false).url)).toBe(
      '{s}.basemaps.cartocdn.com',
    );
  });

  it('lets a pinned basemap win over the theme, which is why auto has to exist', () => {
    // This combination is what made a dark dashboard show a light map: the
    // pinned preset is deliberate and wins, so the escape hatch is choosing
    // auto rather than fighting it with the theme.
    expect(host(resolveTiles({ tiles: 'osm', theme: 'dark' }, true).url)).toBe(
      'tile.openstreetmap.org',
    );
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
});
