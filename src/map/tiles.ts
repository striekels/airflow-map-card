import type { MapConfig, TilePreset } from '../types';

export interface TileSpec {
  url: string;
  attribution: string;
  maxZoom: number;
  /** CSS filter applied to the tile pane when `map.filter` is not set. */
  filter: string;
  /**
   * Whether this basemap is dark.
   *
   * Anything drawn *on* the map has to contrast with the map, not with the
   * dashboard around it. Those are independent: a pinned `tiles` value means a
   * dark dashboard can carry a light basemap, and the house outline was styled
   * from the dashboard's text colour, so on exactly that combination it came out
   * near-white on a near-white map and vanished.
   */
  dark: boolean;
}

const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
const CARTO_ATTRIBUTION = `${OSM_ATTRIBUTION} © CARTO`;

/** The basemap a card gets when it does not ask for one. */
export const DEFAULT_TILES: Exclude<TilePreset, 'custom' | 'auto'> = 'osm';

export const TILE_PRESETS: Record<Exclude<TilePreset, 'custom' | 'auto'>, TileSpec> = {
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
    // Muted so a saturated arrow reads clearly on top, echoing the
    // brightness/saturate treatment this card replaces.
    filter: 'saturate(0.7) brightness(0.95)',
    dark: false,
  },
  'carto-light': {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
    maxZoom: 19,
    filter: 'none',
    dark: false,
  },
  'carto-dark': {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
    maxZoom: 19,
    filter: 'none',
    dark: true,
  },
};

/**
 * Pick the tile layer. A dark dashboard gets a genuinely dark basemap rather
 * than an inverted light one: inverting OSM turns green space magenta and
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
      // A custom server could be anything. Most are light, so assume light and
      // draw dark ink on it, which is the safer way to be wrong.
      dark: false,
    };
  } else if (pinned) {
    spec = TILE_PRESETS[config.tiles as Exclude<TilePreset, 'custom' | 'auto'>];
  } else if (config.tiles === 'auto') {
    spec = darkMode ? TILE_PRESETS['carto-dark'] : TILE_PRESETS.osm;
  } else {
    // Unset is OpenStreetMap light rather than theme-following. Following the
    // theme swapped the map out from under a card whose colours were chosen
    // against one basemap, and the outline and flow are tuned for the light one.
    spec = TILE_PRESETS[DEFAULT_TILES];
  }

  return config.filter ? { ...spec, filter: config.filter } : spec;
}
