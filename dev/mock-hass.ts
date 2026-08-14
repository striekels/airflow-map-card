import type { HassEntity, HomeAssistant } from '../src/ha-types';

function entity(
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity {
  return {
    entity_id,
    state,
    attributes,
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  };
}

export interface MockOptions {
  bearing: number;
  speed: number;
  gust: number;
  darkMode: boolean;
}

/**
 * A `hass` object with just enough shape to drive the card outside Home
 * Assistant. Lets the map, arrow and rows be developed without a running HA
 * instance or a dashboard reload for every change.
 */
export function mockHass(options: MockOptions): HomeAssistant {
  const states: Record<string, HassEntity> = {};

  for (const e of [
    entity('weather.home', 'partlycloudy', {
      friendly_name: 'Home',
      wind_speed: options.speed,
      wind_bearing: options.bearing,
      wind_gust_speed: options.gust,
      wind_speed_unit: 'km/h',
      temperature: 14.2,
      humidity: 71,
    }),
    entity('sensor.home_current_wind_speed', String(options.speed), {
      friendly_name: 'Wind speed',
      unit_of_measurement: 'km/h',
      device_class: 'wind_speed',
    }),
    entity('sensor.home_current_wind_bearing', String(options.bearing), {
      friendly_name: 'Wind bearing',
      unit_of_measurement: '°',
    }),
    entity('sensor.outside_temperature', '14.2', {
      friendly_name: 'Outside temperature',
      unit_of_measurement: '°C',
      device_class: 'temperature',
    }),
  ]) {
    states[e.entity_id] = e;
  }

  return {
    states,
    config: {
      latitude: 51.2194,
      longitude: 4.4025,
      location_name: 'Home',
      language: 'en',
      unit_system: { length: 'km', mass: 'kg', temperature: '°C', volume: 'L' },
    },
    themes: { darkMode: options.darkMode },
    language: 'en',
    locale: { language: 'en' },
    connection: {
      // Templates render as a literal echo; the real websocket API is not
      // available outside Home Assistant.
      subscribeMessage: async (callback: (message: unknown) => void, message: any) => {
        setTimeout(() => callback({ result: `«${message.template}»` }), 150);
        return () => undefined;
      },
    },
    callService: async (domain: string, service: string, data?: unknown) => {
      console.info('callService', domain, service, data);
    },
    formatEntityState: (stateObj: HassEntity) => {
      const unit = stateObj.attributes.unit_of_measurement;
      return unit ? `${stateObj.state} ${unit}` : stateObj.state;
    },
  } as unknown as HomeAssistant;
}
