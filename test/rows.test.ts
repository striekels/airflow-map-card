import { describe, expect, it } from 'vitest';
import { resolveRow, rowEntityIds, rowTemplates, type RowContext } from '../src/data/rows';
import type { HassEntity, HomeAssistant } from '../src/ha-types';
import type { TemplateSubscriber } from '../src/data/templates';

function entity(
  entity_id: string,
  state: string,
  attributes: Record<string, any> = {},
): HassEntity {
  return { entity_id, state, attributes, last_changed: '', last_updated: '' };
}

const templates = {
  get: (template: string) =>
    template === 'boom' ? { error: 'undefined variable' } : { value: 'rendered' },
} as unknown as TemplateSubscriber;

function context(overrides: Partial<RowContext> = {}): RowContext {
  return {
    hass: {
      states: {
        'sensor.temp': entity('sensor.temp', '21.348', { unit_of_measurement: '°C' }),
      },
    } as unknown as HomeAssistant,
    wind: { bearing: 247.5, speed: 12.34, gust: 20, speedUnit: 'km/h', missing: false },
    airflow: { bucket: 'front_to_back', delta: 10 },
    airflowLabel: 'Front → Back',
    templates,
    language: 'en',
    ...overrides,
  };
}

describe('resolveRow — built-in sources', () => {
  it('renders the airflow label', () => {
    const row = resolveRow(context(), { source: 'airflow', size: 'large' }, 0);
    expect(row.value).toBe('Front → Back');
    expect(row.size).toBe('large');
  });

  it('renders speed with the source unit', () => {
    expect(resolveRow(context(), { source: 'speed' }, 0).value).toBe('12.34 km/h');
  });

  it('applies precision and unit overrides', () => {
    expect(resolveRow(context(), { source: 'speed', precision: 1 }, 0).value).toBe('12.3 km/h');
    expect(resolveRow(context(), { source: 'speed', unit: 'kph' }, 0).value).toBe('12.34 kph');
    expect(resolveRow(context(), { source: 'speed', unit: false }, 0).value).toBe('12.34');
  });

  it('renders bearing tight against the degree sign, rounded by default', () => {
    expect(resolveRow(context(), { source: 'bearing' }, 0).value).toBe('248°');
  });

  it('renders the compass point', () => {
    expect(resolveRow(context(), { source: 'cardinal' }, 0).value).toBe('WSW');
  });

  it('applies prefix and suffix', () => {
    const row = resolveRow(context(), { source: 'bearing', prefix: 'from' }, 0);
    expect(row.value).toBe('from 248°');
  });

  it('shows a dash rather than a zero when a reading is missing', () => {
    const ctx = context({
      wind: { bearing: null, speed: null, gust: null, speedUnit: null, missing: false },
    });
    expect(resolveRow(ctx, { source: 'speed' }, 0).value).toBe('—');
    expect(resolveRow(ctx, { source: 'bearing' }, 0).value).toBe('—');
    expect(resolveRow(ctx, { source: 'cardinal' }, 0).value).toBe('—');
  });

  it('gives built-in rows a default icon and label', () => {
    const row = resolveRow(context(), { source: 'speed' }, 0);
    expect(row.icon).toBe('mdi:weather-windy');
    expect(row.name).toBe('Wind');
  });

  it('honours name: false and icon: false', () => {
    const row = resolveRow(context(), { source: 'speed', name: false, icon: false }, 0);
    expect(row.name).toBeUndefined();
    expect(row.icon).toBeUndefined();
  });
});

describe('resolveRow — entities', () => {
  it('falls back to state plus unit when the frontend formatter is absent', () => {
    expect(resolveRow(context(), { entity: 'sensor.temp' }, 0).value).toBe('21.348 °C');
  });

  it('uses the frontend formatter when available', () => {
    const ctx = context();
    ctx.hass.formatEntityState = () => '21.3 °C';
    expect(resolveRow(ctx, { entity: 'sensor.temp' }, 0).value).toBe('21.3 °C');
  });

  it('applies precision without the frontend formatter', () => {
    const ctx = context();
    ctx.hass.formatEntityState = () => '21.3 °C';
    expect(resolveRow(ctx, { entity: 'sensor.temp', precision: 1 }, 0).value).toBe('21.3 °C');
  });

  it('flags a missing entity instead of rendering an empty row', () => {
    const row = resolveRow(context(), { entity: 'sensor.gone' }, 0);
    expect(row.error).toBe(true);
    expect(row.value).toBe('Entity not found');
  });

  it('defers icon choice to the entity when none is configured', () => {
    const row = resolveRow(context(), { entity: 'sensor.temp' }, 0);
    expect(row.stateObj?.entity_id).toBe('sensor.temp');
    expect(row.icon).toBeUndefined();
  });

  it('honours name: false against the friendly name', () => {
    const row = resolveRow(context(), { entity: 'sensor.temp', name: false }, 0);
    expect(row.name).toBeUndefined();
  });

  it('reads an attribute when asked', () => {
    const ctx = context();
    ctx.hass.states['weather.home'] = entity('weather.home', 'sunny', { humidity: 62 });
    expect(
      resolveRow(ctx, { entity: 'weather.home', attribute: 'humidity', unit: '%' }, 0).value,
    ).toBe('62 %');
  });
});

describe('resolveRow — templates', () => {
  it('renders the subscription result', () => {
    expect(resolveRow(context(), { template: 'anything' }, 0).value).toBe('rendered');
  });

  it('keeps a broken template inside its own row', () => {
    const row = resolveRow(context(), { template: 'boom' }, 0);
    expect(row.error).toBe(true);
    expect(row.value).toContain('undefined variable');
  });
});

describe('row tracking helpers', () => {
  it('collects entity ids, including those only named by an action', () => {
    expect(
      rowEntityIds([
        { source: 'speed' },
        { entity: 'sensor.temp' },
        { source: 'airflow', tap_action: { action: 'more-info', entity: 'sensor.other' } },
      ]),
    ).toEqual(['sensor.temp', 'sensor.other']);
  });

  it('deduplicates templates so one subscription serves repeated rows', () => {
    expect(
      rowTemplates([{ template: 'a' }, { template: 'a' }, { template: 'b' }, { source: 'speed' }]),
    ).toEqual(['a', 'b']);
  });
});
