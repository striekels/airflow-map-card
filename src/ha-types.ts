/**
 * Minimal structural types for the parts of the Home Assistant frontend this
 * card touches. Deliberately hand-written rather than pulled from
 * `home-assistant-frontend`: that package is huge, unversioned for external
 * use, and would couple releases of this card to HA's own release cycle.
 */

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HassConfig {
  latitude: number;
  longitude: number;
  unit_system: { length: string; mass: string; temperature: string; volume: string };
  location_name: string;
  language: string;
}

export type UnsubscribeFunc = () => void;

export interface HassConnection {
  subscribeMessage<T>(
    callback: (message: T) => void,
    subscribeMessage: Record<string, unknown>,
  ): Promise<UnsubscribeFunc>;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  config: HassConfig;
  themes: { darkMode?: boolean };
  language: string;
  locale?: { language: string; number_format?: string };
  connection: HassConnection;
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
  formatEntityState?(entity: HassEntity, state?: string): string;
  formatEntityAttributeValue?(entity: HassEntity, attribute: string): string;
}

export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  getCardSize(): number | Promise<number>;
  setConfig(config: unknown): void;
}

/**
 * Read an entity attribute as a string.
 *
 * Home Assistant attribute values are untyped, so `attributes` is
 * `Record<string, unknown>` and every read has to say what it expects. This is
 * not only about satisfying the compiler: `friendly_name` and
 * `unit_of_measurement` are conventions, not guarantees, and a non-string value
 * previously flowed on as though it were one.
 */
export function stringAttribute(stateObj: HassEntity | undefined, key: string): string | undefined {
  const value = stateObj?.attributes[key];
  return typeof value === 'string' ? value : undefined;
}
