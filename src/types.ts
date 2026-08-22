import type { SpeedUnit } from './data/wind-speed';

import type { HomeAssistant } from './ha-types';

export type RowSize = 'small' | 'normal' | 'large';

/** Values the card can compute itself, without a backing entity. */
export type VirtualSource = 'airflow' | 'speed' | 'bearing' | 'gust' | 'cardinal';

export interface RowConfig {
  /** Built-in computed value. Mutually exclusive with `entity` / `template`. */
  source?: VirtualSource;
  entity?: string;
  /** Read an attribute of `entity` instead of its state. */
  attribute?: string;
  /** Jinja template, rendered over the websocket API. */
  template?: string;

  name?: string | false;
  icon?: string | false;
  prefix?: string;
  suffix?: string;
  unit?: string | false;
  precision?: number;
  size?: RowSize;
  tap_action?: ActionConfig;
}

export interface LocationConfig {
  latitude?: number;
  longitude?: number;
  zoom?: number;
  /** Editor-only convenience; resolved to lat/lon and not used at runtime. */
  address?: string;
}

export interface HouseConfig {
  facade_bearing?: number;
  facade_bearing_entity?: string;
  /**
   * The building outline, as [lat, lon] pairs, written by Detect in the editor.
   *
   * Stored rather than looked up: the card never queries OpenStreetMap at
   * runtime, and a handful of coordinate pairs costs nothing in a config.
   * Cleared whenever the location moves by any route other than detection,
   * because an outline drawn over the wrong house is worse than none.
   */
  footprint?: Array<[number, number]>;
}

export interface WindConfig {
  entity?: string;
  speed_entity?: string;
  bearing_entity?: string;
  gust_entity?: string;
  /**
   * Display unit for the speed and gust rows. `source` keeps whatever the
   * integration reports, which is the default and what the card has always
   * done. Anything else converts the reading rather than just relabelling it.
   */
  speed_unit?: SpeedUnit;
}

export interface AirflowLabels {
  front_to_back?: string;
  back_to_front?: string;
  sideways?: string;
  weak?: string;
  unknown?: string;
}

export interface AirflowConfig {
  mode?: 'compute' | 'entity' | 'off';
  entity?: string;
  /** In the wind source's own unit. No conversion is applied. */
  weak_below?: number;
  /** |angle to facade| at or above which airflow counts as sideways. 1..90 */
  sideways_from?: number;
  labels?: AirflowLabels;
}

/** How a colour is chosen: by airflow bucket, by wind speed, or pinned. */
export type ColorMode = 'airflow' | 'speed' | 'fixed';

export interface ArrowConfig {
  /** Off by default. The flow carries direction and speed together. */
  show?: boolean;
  size?: number;
  color_mode?: ColorMode;
  color?: string;
}

export interface FlowConfig {
  /** On by default. */
  show?: boolean;
  /** 0 to 1, scaling the drawn opacity. */
  opacity?: number;
  /** Multiplier on how fast the particles travel. 1 is the default pace. */
  speed?: number;
  /**
   * Unset follows `arrow.color_mode`, which is what the flow has always done
   * and keeps every existing card looking the same. Set it to colour the flow
   * on its own, which matters because the arrow is off by default: a card
   * showing only the flow should not have to configure a hidden arrow to
   * change the colour of the thing it does show.
   */
  color_mode?: ColorMode;
  color?: string;
}

export type TilePreset = 'auto' | 'osm' | 'carto-light' | 'carto-dark' | 'custom';

export interface MapConfig {
  tiles?: TilePreset;
  tile_url?: string;
  attribution?: boolean;
  interactive?: boolean;
  /** Raw CSS filter applied to the tile layer. Overrides the theme default. */
  filter?: string;
  /** Height of the map area in px. Ignored when `aspect_ratio` is set. */
  height?: number;
  aspect_ratio?: string;
}

export interface AirflowMapCardConfig {
  type: string;
  title?: string;
  location?: LocationConfig;
  house?: HouseConfig;
  wind?: WindConfig;
  airflow?: AirflowConfig;
  arrow?: ArrowConfig;
  map?: MapConfig;
  /**
   * Animated wind flow over the map, on by default.
   *
   * `flow: true` is accepted as shorthand for `flow: { show: true }`, since a
   * bare boolean is unambiguous against an object and the shorthand was the
   * whole surface before 2.0.
   */
  flow?: FlowConfig | boolean;
  rows?: RowConfig[];
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
}

export interface ActionConfig {
  action: 'more-info' | 'toggle' | 'call-service' | 'perform-action' | 'navigate' | 'url' | 'none';
  entity?: string;
  navigation_path?: string;
  url_path?: string;
  service?: string;
  perform_action?: string;
  target?: Record<string, unknown>;
  data?: Record<string, unknown>;
  service_data?: Record<string, unknown>;
}

export interface LovelaceCardEditor extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: AirflowMapCardConfig): void;
}
