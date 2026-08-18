import { describe, expect, it } from 'vitest';
import { resolveWind, windEntityIds } from '../src/data/wind-source';
import type { HassEntity, HomeAssistant } from '../src/ha-types';

function entity(
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity {
  return { entity_id, state, attributes, last_changed: '', last_updated: '' };
}

function hassWith(states: HassEntity[]): HomeAssistant {
  return {
    states: Object.fromEntries(states.map((s) => [s.entity_id, s])),
  } as unknown as HomeAssistant;
}

const weather = entity('weather.home', 'cloudy', {
  wind_speed: 10,
  wind_bearing: 45,
  wind_gust_speed: 18,
  wind_speed_unit: 'km/h',
});

describe('resolveWind', () => {
  it('reads a weather entity’s attributes', () => {
    const result = resolveWind(hassWith([weather]), { entity: 'weather.home' });
    expect(result).toMatchObject({
      speed: 10,
      bearing: 45,
      gust: 18,
      speedUnit: 'km/h',
      missing: false,
    });
  });

  it('parses cardinal bearings from a weather entity', () => {
    const cardinal = entity('weather.home', 'cloudy', { wind_bearing: 'NNW', wind_speed: 3 });
    expect(resolveWind(hassWith([cardinal]), { entity: 'weather.home' }).bearing).toBe(337.5);
  });

  it('lets a sensor override win over the weather entity', () => {
    const sensor = entity('sensor.speed', '7.5', { unit_of_measurement: 'm/s' });
    const result = resolveWind(hassWith([weather, sensor]), {
      entity: 'weather.home',
      speed_entity: 'sensor.speed',
    });
    expect(result.speed).toBe(7.5);
    expect(result.speedUnit).toBe('m/s');
    // Fields without an override still come from the weather entity.
    expect(result.bearing).toBe(45);
  });

  it('treats an unavailable override as no reading, not as a fallback', () => {
    const sensor = entity('sensor.speed', 'unavailable');
    const result = resolveWind(hassWith([weather, sensor]), {
      entity: 'weather.home',
      speed_entity: 'sensor.speed',
    });
    expect(result.speed).toBeNull();
  });

  it('survives an unavailable weather entity', () => {
    const dead = entity('weather.home', 'unavailable');
    const result = resolveWind(hassWith([dead]), { entity: 'weather.home' });
    expect(result).toMatchObject({ speed: null, bearing: null, gust: null, missing: false });
  });

  it('flags a config that names no source at all', () => {
    expect(resolveWind(hassWith([]), {}).missing).toBe(true);
    expect(resolveWind(hassWith([weather]), { entity: 'weather.home' }).missing).toBe(false);
  });

  it('flags a config whose entities do not exist', () => {
    expect(resolveWind(hassWith([]), { entity: 'weather.gone' }).missing).toBe(true);
  });
});

describe('windEntityIds', () => {
  it('lists every configured entity for change tracking', () => {
    expect(
      windEntityIds({
        entity: 'weather.home',
        speed_entity: 'sensor.a',
        bearing_entity: 'sensor.b',
      }),
    ).toEqual(['weather.home', 'sensor.a', 'sensor.b']);
    expect(windEntityIds({})).toEqual([]);
    expect(windEntityIds()).toEqual([]);
  });
});
