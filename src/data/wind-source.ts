import { stringAttribute } from '../ha-types';
import type { HassEntity, HomeAssistant } from '../ha-types';
import type { WindConfig } from '../types';
import { parseBearing } from './bearing';

export interface WindReading {
  /** Direction the wind comes from, degrees. */
  bearing: number | null;
  speed: number | null;
  gust: number | null;
  /** Unit of `speed`, as reported by the source. */
  speedUnit: string | null;
  /** True when the configured source could not be resolved at all. */
  missing: boolean;
}

const UNAVAILABLE = new Set(['unknown', 'unavailable', 'none', '']);

function isUsable(entity: HassEntity | undefined): entity is HassEntity {
  return !!entity && !UNAVAILABLE.has(entity.state.toLowerCase());
}

function numericState(entity: HassEntity | undefined): number | null {
  if (!isUsable(entity)) return null;
  const value = Number(entity.state);
  return Number.isFinite(value) ? value : null;
}

/**
 * Resolve the current wind from a weather entity's attributes, with optional
 * per-field sensor overrides. An override always wins, including when the
 * weather entity also provides that field.
 */
export function resolveWind(hass: HomeAssistant, config: WindConfig = {}): WindReading {
  const weather = config.entity ? hass.states[config.entity] : undefined;
  const speedOverride = config.speed_entity ? hass.states[config.speed_entity] : undefined;
  const bearingOverride = config.bearing_entity ? hass.states[config.bearing_entity] : undefined;
  const gustOverride = config.gust_entity ? hass.states[config.gust_entity] : undefined;

  const missing = !weather && !speedOverride && !bearingOverride && !gustOverride;

  const speed = speedOverride
    ? numericState(speedOverride)
    : isUsable(weather)
      ? toNumber(weather.attributes.wind_speed)
      : null;

  const speedUnit = speedOverride
    ? (stringAttribute(speedOverride, 'unit_of_measurement') ?? null)
    : (stringAttribute(weather, 'wind_speed_unit') ?? null);

  const bearing = bearingOverride
    ? isUsable(bearingOverride)
      ? parseBearing(bearingOverride.state)
      : null
    : isUsable(weather)
      ? parseBearing(weather.attributes.wind_bearing)
      : null;

  const gust = gustOverride
    ? numericState(gustOverride)
    : isUsable(weather)
      ? toNumber(weather.attributes.wind_gust_speed)
      : null;

  return { bearing, speed, gust, speedUnit, missing };
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Entity ids the wind config depends on, for change tracking. */
export function windEntityIds(config: WindConfig = {}): string[] {
  return [config.entity, config.speed_entity, config.bearing_entity, config.gust_entity].filter(
    (id): id is string => !!id,
  );
}
