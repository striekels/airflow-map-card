import { stringAttribute } from '../ha-types';
import type { HassEntity, HomeAssistant } from '../ha-types';
import type { ActionConfig, RowConfig, RowSize } from '../types';
import type { AirflowResult } from './airflow';
import type { WindReading } from './wind-source';
import { cardinalName } from './bearing';
import { strings } from '../localize';
import type { TemplateSubscriber } from './templates';
import { convertSpeed, speedUnitLabel, type SpeedUnit } from './wind-speed';

export interface ResolvedRow {
  key: string;
  icon?: string;
  /** Set when the icon should come from the entity's own state. */
  stateObj?: HassEntity;
  name?: string;
  value: string;
  size: RowSize;
  entityId?: string;
  tapAction?: ActionConfig;
  error: boolean;
}

export interface RowContext {
  hass: HomeAssistant;
  wind: WindReading;
  airflow: AirflowResult;
  airflowLabel: string;
  templates: TemplateSubscriber;
  language: string;
  /** Display unit for speed and gust. Unset leaves the reading alone. */
  speedUnit?: SpeedUnit;
}

const VIRTUAL_ICONS: Record<string, string> = {
  airflow: 'mdi:air-filter',
  speed: 'mdi:weather-windy',
  gust: 'mdi:weather-windy-variant',
  bearing: 'mdi:compass-outline',
  cardinal: 'mdi:compass-outline',
};

export function resolveRow(ctx: RowContext, row: RowConfig, index: number): ResolvedRow {
  const t = strings(ctx.language);
  const size = row.size ?? 'normal';
  const base = { key: `row-${index}`, size, tapAction: row.tap_action, error: false };

  if (row.template !== undefined) {
    const state = ctx.templates.get(row.template);
    return {
      ...base,
      icon: iconOf(row),
      name: nameOf(row),
      value: state?.error ? `${t.template_error}: ${state.error}` : (state?.value ?? '…'),
      error: !!state?.error,
    };
  }

  if (row.source) {
    // `false` suppresses; `undefined` falls back to the built-in default.
    return {
      ...base,
      icon: row.icon === false ? undefined : (iconOf(row) ?? VIRTUAL_ICONS[row.source]),
      name:
        row.name === false
          ? undefined
          : (nameOf(row) ?? defaultVirtualName(row.source, ctx.language)),
      value: decorate(row, virtualValue(ctx, row)),
      entityId: virtualEntity(row),
    };
  }

  if (row.entity) {
    const stateObj = ctx.hass.states[row.entity];
    if (!stateObj) {
      return {
        ...base,
        icon: iconOf(row) ?? 'mdi:alert-circle-outline',
        name: nameOf(row) ?? row.entity,
        value: t.unknown_entity,
        error: true,
      };
    }
    const explicitIcon = iconOf(row);
    return {
      ...base,
      icon: explicitIcon,
      stateObj: explicitIcon === undefined && row.icon !== false ? stateObj : undefined,
      name:
        row.name === false
          ? undefined
          : (nameOf(row) ?? stringAttribute(stateObj, 'friendly_name') ?? row.entity),
      value: decorate(row, entityValue(ctx.hass, stateObj, row)),
      entityId: row.entity,
    };
  }

  return { ...base, value: '', error: true, name: 'Row has no source, entity or template' };
}

function iconOf(row: RowConfig): string | undefined {
  if (row.icon === false || row.icon === '') return undefined;
  return row.icon;
}

function nameOf(row: RowConfig): string | undefined {
  if (row.name === false) return undefined;
  return row.name;
}

function defaultVirtualName(source: string, language: string): string | undefined {
  const t = strings(language);
  switch (source) {
    case 'speed':
      return t.wind;
    case 'gust':
      return t.gust;
    case 'bearing':
    case 'cardinal':
      return t.direction;
    default:
      return undefined;
  }
}

function virtualEntity(row: RowConfig): string | undefined {
  // A computed row has no entity of its own; tapping it only does something
  // when the action names one explicitly.
  return row.tap_action?.entity;
}

function virtualValue(ctx: RowContext, row: RowConfig): string {
  const { wind, airflowLabel } = ctx;

  switch (row.source) {
    case 'airflow':
      return airflowLabel;

    case 'speed':
      return formatSpeed(ctx, row, wind.speed);

    case 'gust':
      return formatSpeed(ctx, row, wind.gust);

    case 'bearing':
      return formatNumber(wind.bearing, row.precision ?? 0, unitFor(row, '°'), true);

    case 'cardinal':
      return wind.bearing === null ? '—' : cardinalName(wind.bearing);

    default:
      return '—';
  }
}

/**
 * A speed, converted into the configured unit and labelled with it.
 *
 * `row.unit` still wins, because it always has, but it only relabels: setting
 * it to mph on a km/h source prints a km/h number next to the word mph. That is
 * the trap `wind.speed_unit` exists to close, so the two do not overlap.
 *
 * Beaufort is a whole number by nature. Printing force 4.7 would suggest a
 * precision the scale does not have.
 */
function formatSpeed(ctx: RowContext, row: RowConfig, value: number | null): string {
  const converted = convertSpeed(value, ctx.wind.speedUnit, ctx.speedUnit);
  const label = speedUnitLabel(ctx.speedUnit, ctx.wind.speedUnit);
  return formatNumber(converted, speedPrecision(ctx.speedUnit, row.precision), unitFor(row, label));
}

/**
 * Converting turns a tidy reading into a long one: 50 km/h becomes
 * 13.88888888888889 m/s, and the card printed all of it. An unconverted
 * reading arrives already rounded by the integration, so this only bites once
 * a unit is chosen, and only in the rendered card rather than in any of the
 * maths.
 *
 * One decimal for real units. Beaufort is a whole number by nature, and force
 * 4.7 would claim a precision the scale does not have.
 */
function speedPrecision(
  unit: SpeedUnit | undefined,
  configured: number | undefined,
): number | undefined {
  if (configured !== undefined) return unit === 'bft' ? 0 : configured;
  if (!unit || unit === 'source') return undefined;
  return unit === 'bft' ? 0 : 1;
}

function unitFor(row: RowConfig, fallback: string | null): string {
  if (row.unit === false) return '';
  if (typeof row.unit === 'string') return row.unit;
  return fallback ?? '';
}

function formatNumber(
  value: number | null,
  precision: number | undefined,
  unit: string,
  joinTight = false,
): string {
  if (value === null) return '—';
  const rounded = precision === undefined ? value : Number(value.toFixed(precision));
  const text = String(rounded);
  if (!unit) return text;
  return joinTight ? `${text}${unit}` : `${text} ${unit}`;
}

function entityValue(hass: HomeAssistant, stateObj: HassEntity, row: RowConfig): string {
  if (row.attribute) {
    const raw = stateObj.attributes[row.attribute];
    if (raw === undefined || raw === null) return '—';
    if (typeof raw === 'number') {
      return formatNumber(raw, row.precision, unitFor(row, null));
    }
    if (hass.formatEntityAttributeValue && row.unit === undefined) {
      return hass.formatEntityAttributeValue(stateObj, row.attribute);
    }
    return `${String(raw)}${row.unit ? ` ${row.unit}` : ''}`.trim();
  }

  const numeric = Number(stateObj.state);
  if (Number.isFinite(numeric) && (row.precision !== undefined || row.unit !== undefined)) {
    return formatNumber(
      numeric,
      row.precision,
      unitFor(row, stringAttribute(stateObj, 'unit_of_measurement') ?? null),
    );
  }

  // Prefer the frontend's own formatter: it applies the user's locale, display
  // precision, and translated state names.
  if (hass.formatEntityState) return hass.formatEntityState(stateObj);

  const unit = stateObj.attributes.unit_of_measurement;
  return unit ? `${stateObj.state} ${unit}` : stateObj.state;
}

function decorate(row: RowConfig, value: string): string {
  const prefix = row.prefix ? `${row.prefix} ` : '';
  const suffix = row.suffix ? ` ${row.suffix}` : '';
  return `${prefix}${value}${suffix}`;
}

/** Entity ids referenced by the row list, for change tracking. */
export function rowEntityIds(rows: RowConfig[] = []): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (row.entity) ids.push(row.entity);
    if (row.tap_action?.entity) ids.push(row.tap_action.entity);
  }
  return ids;
}

/** Distinct template strings in the row list. */
export function rowTemplates(rows: RowConfig[] = []): string[] {
  return [...new Set(rows.map((row) => row.template).filter((t): t is string => !!t))];
}
