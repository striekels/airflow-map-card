import type { MapConfig, TilePreset } from '../types';

export interface TileSpec {
  url: string;
  attribution: string;
  maxZoom: number;
  /** CSS filter applied to the tile pane when `map.filter` is not set. */
  filter: string;
}

const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
const CARTO_ATTRIBUTION = `${OSM_ATTRIBUTION} © CARTO`;

export const TILE_PRESETS: Record<Exclude<TilePreset, 'custom' | 'auto'>, TileSpec> = {
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
    // Muted so a saturated arrow reads clearly on top, echoing the
    // brightness/saturate treatment this card replaces.
    filter: 'saturate(0.7) brightness(0.95)',
  },
  'carto-light': {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
    maxZoom: 19,
    filter: 'none',
  },
  'carto-dark': {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
    maxZoom: 19,
    filter: 'none',
  },
};

/**
 * Pick the tile layer. A dark dashboard gets a genuinely dark basemap rather
 * than an inverted light one — inverting OSM turns green space magenta and
 * makes text unreadable.
 */
export function resolveTiles(config: MapConfig = {}, darkMode: boolean): TileSpec {
  let spec: TileSpec;
  // 'auto' and unset both mean "follow the dashboard", which is what makes it
  // possible to undo a basemap choice. Without that value the dropdown was a
  // one-way door: picking a preset permanently overrode the theme.
  const pinned = config.tiles && config.tiles !== 'custom' && config.tiles !== 'auto';

  if (config.tile_url) {
    spec = {
      url: config.tile_url,
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
      filter: 'none',
    };
  } else if (pinned) {
    spec = TILE_PRESETS[config.tiles as Exclude<TilePreset, 'custom' | 'auto'>];
  } else {
    spec = darkMode ? TILE_PRESETS['carto-dark'] : TILE_PRESETS.osm;
  }

  return config.filter ? { ...spec, filter: config.filter } : spec;
}
