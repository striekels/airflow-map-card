import { LitElement, css, html, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { EDITOR_TYPE, DEFAULT_ZOOM } from './const';
import type { HomeAssistant } from './ha-types';
import type {
  AirflowMapCardConfig,
  FlowConfig,
  HouseConfig,
  LocationConfig,
  LovelaceCardEditor,
  MapConfig,
  RowConfig,
} from './types';
import { fireEvent } from './data/actions';
import { resolveWind } from './data/wind-source';
import { geocode, GeocodeError } from './data/geocode';
import { DEFAULT_SIDEWAYS_FROM, DEFAULT_WEAK_BELOW } from './data/airflow';
import {
  arrowSettingsSchema,
  cardSchema,
  EXACT_HOUSE_SCHEMA,
  EXACT_LOCATION_SCHEMA,
  flowSettingsSchema,
  mapSchema,
  rowSchema,
  SHOW_SCHEMA,
  TITLE_SCHEMA,
  type RowKind,
} from './editor/schema';
import './editor/facade-picker';
import { resolveFlow, type ResolvedFlow } from './data/flow';
import { DEFAULT_TILES } from './map/tiles';

@customElement(EDITOR_TYPE)
export class AirflowMapCardEditor extends LitElement implements LovelaceCardEditor {
  @state() private _config!: AirflowMapCardConfig;
  @state() private _addressQuery = '';
  @state() private _geocodeError = '';
  @state() private _geocoding = false;

  public hass?: HomeAssistant;

  setConfig(config: AirflowMapCardConfig): void {
    this._config = config;
  }

  override render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;

    return html`
      <div class="editor">
        ${this._renderWhere()}
        <ha-form
          .hass=${this.hass}
          .data=${this._formData}
          .schema=${cardSchema(this._config)}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._formChanged}
        ></ha-form>
        ${this._renderAppearance()} ${this._renderRows()}
      </div>
    `;
  }

  // ------------------------------------------------------------------ where

  /**
   * Location and facade angle are one task, not two. A bearing only means
   * anything for the building the map is showing, and they used to be separate
   * sections whose values were *also* duplicated as numeric fields further down
   * the form. Two controls for one value, several screens apart, is how a card
   * ends up pointing at one place with an angle describing another.
   */
  private _renderWhere(): TemplateResult {
    const location = this._config.location ?? {};
    const latitude = location.latitude ?? this.hass?.config.latitude;
    const longitude = location.longitude ?? this.hass?.config.longitude;
    const hasCoords = location.latitude !== undefined && location.longitude !== undefined;

    return html`
      <ha-expansion-panel outlined expanded .header=${'Where'} .secondary=${this._whereSummary}>
        <ha-icon slot="leading-icon" icon="mdi:map-marker"></ha-icon>
        <div class="panel-content">
          <div class="address-row">
            <!--
              A native input, for the same reason the buttons below are native.
              This was an ha-textfield, which is a Material Web Component; where
              that is not registered in the editor's context it renders as an
              empty inline box that still takes up its share of the row, so the
              search field was simply missing while the buttons beside it looked
              fine. An input that is invisible is worse than one that is plain.
            -->
            <input
              class="address-input"
              type="text"
              aria-label="Search an address"
              placeholder="Search an address"
              .value=${this._addressQuery}
              @input=${(event: Event) => {
                this._addressQuery = (event.target as HTMLInputElement).value;
              }}
              @keydown=${(event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void this._searchAddress();
                }
              }}
            />
            <button
              class="primary"
              ?disabled=${this._geocoding || this._addressQuery.trim() === ''}
              @click=${this._searchAddress}
            >
              ${this._geocoding ? 'Searching…' : 'Search'}
            </button>
            <button class="secondary" @click=${this._useHomeLocation}>Use home</button>
          </div>
          ${
            this._geocodeError
              ? html`<ha-alert alert-type="error">${this._geocodeError}</ha-alert>`
              : nothing
          }
          ${
            latitude === undefined || longitude === undefined
              ? html`<p class="hint">Search for an address above to place the map.</p>`
              : html`
                  <airflow-facade-picker
                    .hass=${this.hass}
                    .latitude=${latitude}
                    .longitude=${longitude}
                    .bearing=${this._config.house?.facade_bearing ?? 0}
                    .zoom=${location.zoom ?? DEFAULT_ZOOM}
                    .sidewaysFrom=${this._config.airflow?.sideways_from ?? DEFAULT_SIDEWAYS_FROM}
                    @bearing-changed=${this._bearingChanged}
                    @location-changed=${this._locationChanged}
                    @zoom-changed=${this._zoomChanged}
                    @footprint-changed=${this._footprintChanged}
                  ></airflow-facade-picker>
                `
          }
          ${this._renderFootprintStatus()}

          <ha-expansion-panel
            outlined
            .header=${'Exact values'}
            .secondary=${'Coordinates, zoom and facade angle'}
          >
            <ha-icon slot="leading-icon" icon="mdi:tune"></ha-icon>
            <div class="panel-content">
              <ha-form
                .hass=${this.hass}
                .data=${location}
                .schema=${EXACT_LOCATION_SCHEMA}
                .computeLabel=${this._computeLabel}
                @value-changed=${this._exactLocationChanged}
              ></ha-form>
              <ha-form
                .hass=${this.hass}
                .data=${this._config.house ?? {}}
                .schema=${EXACT_HOUSE_SCHEMA}
                .computeLabel=${this._computeLabel}
                @value-changed=${this._exactHouseChanged}
              ></ha-form>
            </div>
          </ha-expansion-panel>

          <p class="hint">
            ${
              hasCoords
                ? nothing
                : html`No coordinates set, falling back to your Home Assistant home location.`
            }
            Searching uses OpenStreetMap's Nominatim service once per search; the result is stored
            as coordinates, so nothing is looked up while the card is running.
          </p>
        </div>
      </ha-expansion-panel>
    `;
  }

  // ------------------------------------------------------------- appearance

  /**
   * Hand-rendered so each toggle can sit flat with its settings nested beneath
   * it. `ha-form` can only write into a nested key from inside a group of that
   * name, which would have buried both switches one click deep, and whether the
   * flow and the arrow are on is the first thing anyone wants to change.
   *
   * Every toggle reads the way it is labelled: on means the thing is on.
   */
  private _renderAppearance(): TemplateResult {
    const flow = this._flowConfig;
    const arrow = this._config.arrow ?? {};
    const summary = [flow.show ? 'flow' : null, arrow.show ? 'arrow' : null].filter(Boolean);

    return html`
      <ha-expansion-panel
        outlined
        .header=${'Appearance'}
        .secondary=${summary.length ? `Showing ${summary.join(' and ')}` : 'Map only'}
      >
        <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
        <div class="panel-content">
          <ha-form
            .hass=${this.hass}
            .data=${this._config}
            .schema=${TITLE_SCHEMA}
            .computeLabel=${this._computeLabel}
            @value-changed=${(event: CustomEvent<{ value: { title?: string } }>) => {
              event.stopPropagation();
              this._updateConfig({ title: event.detail.value.title });
            }}
          ></ha-form>

          ${this._renderToggleGroup({
            label: 'Animated wind flow',
            icon: 'mdi:weather-windy',
            on: Boolean(flow.show),
            data: flow,
            settings: flowSettingsSchema(flow),
            onToggle: (show) => this._updateFlow({ show }),
            onSettings: (value) => this._updateFlow(value),
          })}
          ${this._renderToggleGroup({
            label: 'Wind arrow',
            icon: 'mdi:arrow-up-bold',
            on: Boolean(arrow.show),
            data: arrow,
            settings: arrowSettingsSchema(arrow),
            onToggle: (show) => this._updateConfig({ arrow: { ...this._config.arrow, show } }),
            onSettings: (value) =>
              this._updateConfig({ arrow: { ...this._config.arrow, ...value } }),
          })}

          <ha-expansion-panel outlined .header=${'Map'}>
            <ha-icon slot="leading-icon" icon="mdi:map"></ha-icon>
            <div class="panel-content">
              <ha-form
                .hass=${this.hass}
                .data=${{ tiles: DEFAULT_TILES, ...(this._config.map ?? {}) }}
                .schema=${mapSchema(this._config.map)}
                .computeLabel=${this._computeLabel}
                @value-changed=${(event: CustomEvent<{ value: MapConfig }>) => {
                  event.stopPropagation();
                  this._updateConfig({ map: { ...this._config.map, ...event.detail.value } });
                }}
              ></ha-form>
            </div>
          </ha-expansion-panel>
        </div>
      </ha-expansion-panel>
    `;
  }

  /** A switch, then its settings behind a dropdown that only opens when it is on. */
  private _renderToggleGroup(options: {
    label: string;
    icon: string;
    on: boolean;
    data: object;
    settings: unknown[];
    onToggle: (show: boolean) => void;
    onSettings: (value: Record<string, unknown>) => void;
  }): TemplateResult {
    return html`
      <div class="toggle-group">
        <ha-form
          .hass=${this.hass}
          .data=${{ show: options.on }}
          .schema=${SHOW_SCHEMA}
          .computeLabel=${() => options.label}
          @value-changed=${(event: CustomEvent<{ value: { show?: boolean } }>) => {
            event.stopPropagation();
            options.onToggle(Boolean(event.detail.value.show));
          }}
        ></ha-form>

        ${
          options.on
            ? html`
                <ha-expansion-panel outlined .header=${`${options.label} settings`}>
                  <ha-icon slot="leading-icon" icon=${options.icon}></ha-icon>
                  <div class="panel-content">
                    <ha-form
                      .hass=${this.hass}
                      .data=${options.data}
                      .schema=${options.settings}
                      .computeLabel=${this._computeLabel}
                      @value-changed=${(event: CustomEvent<{ value: Record<string, unknown> }>) => {
                        event.stopPropagation();
                        options.onSettings(event.detail.value);
                      }}
                    ></ha-form>
                  </div>
                </ha-expansion-panel>
              `
            : nothing
        }
      </div>
    `;
  }

  /** `flow` accepts a bare boolean, so writing to it has to normalise first. */
  private _updateFlow(patch: Partial<FlowConfig>): void {
    this._updateConfig({ flow: { ...this._flowConfig, ...patch } });
  }

  private get _flowConfig(): ResolvedFlow {
    return resolveFlow(this._config.flow);
  }

  /**
   * Say whether an outline is stored, and offer a way to be rid of it.
   *
   * Detect writes `house.footprint` silently, and until this existed the only
   * way to stop the card drawing your building was to hand-edit the YAML, which
   * is a poor answer in a visual editor. Storing it is not a setting, so this is
   * a button rather than a toggle: there is no state to configure, only data to
   * keep or discard.
   */
  private _renderFootprintStatus(): TemplateResult {
    const points = this._config.house?.footprint?.length ?? 0;

    if (points === 0) {
      return html`<p class="hint">
        No building outline stored. Press Detect to read one from OpenStreetMap; the card draws it
        faintly under the arrow.
      </p>`;
    }

    return html`
      <div class="footprint-row">
        <span class="hint">
          Building outline stored, ${points} points. The card draws it under the arrow.
        </span>
        <button class="secondary" @click=${this._clearFootprint}>Clear outline</button>
      </div>
    `;
  }

  private _clearFootprint(): void {
    const house = { ...this._config.house };
    delete house.footprint;
    this._updateConfig({ house });
  }

  /** Collapsed-state summary, so the panel still says where the card points. */
  private get _whereSummary(): string {
    const { latitude, longitude } = this._config.location ?? {};
    const bearing = this._config.house?.facade_bearing;
    if (latitude === undefined || longitude === undefined) return 'Home Assistant home location';
    const coords = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    return bearing === undefined ? coords : `${coords} · facade ${bearing.toFixed(1)}°`;
  }

  /** The picker's map is the card's map, so the level chosen there is the one saved. */
  private _zoomChanged(event: CustomEvent<{ zoom: number }>): void {
    event.stopPropagation();
    this._updateConfig({ location: { ...this._config.location, zoom: event.detail.zoom } });
  }

  /** The detected outline, so the card can draw the building it describes. */
  private _footprintChanged(event: CustomEvent<{ footprint: Array<[number, number]> }>): void {
    event.stopPropagation();
    this._updateConfig({
      house: { ...this._config.house, footprint: event.detail.footprint },
    });
  }

  /**
   * A stored outline belongs to one building, so it cannot survive the card
   * being pointed somewhere else. Detection sets both together; every other way
   * of moving the card has to drop it, or the outline is drawn over whichever
   * house now happens to be under it.
   */
  private _movedWithoutDetecting(location: LocationConfig): void {
    const house = { ...this._config.house };
    delete house.footprint;
    this._updateConfig({ location, house });
  }

  private _exactLocationChanged(event: CustomEvent<{ value: LocationConfig }>): void {
    event.stopPropagation();
    const next = { ...this._config.location, ...event.detail.value };
    const moved =
      next.latitude !== this._config.location?.latitude ||
      next.longitude !== this._config.location?.longitude;
    if (moved) this._movedWithoutDetecting(next);
    else this._updateConfig({ location: next });
  }

  private _exactHouseChanged(event: CustomEvent<{ value: HouseConfig }>): void {
    event.stopPropagation();
    this._updateConfig({ house: { ...this._config.house, ...event.detail.value } });
  }

  private async _searchAddress(): Promise<void> {
    const query = this._addressQuery.trim();
    if (!query) return;

    this._geocoding = true;
    this._geocodeError = '';
    try {
      const result = await geocode(query, this.hass?.locale?.language ?? this.hass?.language);
      this._movedWithoutDetecting({
        ...this._config.location,
        latitude: Number(result.latitude.toFixed(6)),
        longitude: Number(result.longitude.toFixed(6)),
        zoom: this._config.location?.zoom ?? DEFAULT_ZOOM,
      });
      this._addressQuery = result.displayName;
    } catch (error) {
      this._geocodeError = error instanceof GeocodeError ? error.message : 'Address lookup failed.';
    } finally {
      this._geocoding = false;
    }
  }

  private _useHomeLocation(): void {
    if (!this.hass) return;
    this._geocodeError = '';
    this._movedWithoutDetecting({
      ...this._config.location,
      latitude: this.hass.config.latitude,
      longitude: this.hass.config.longitude,
      zoom: this._config.location?.zoom ?? DEFAULT_ZOOM,
    });
  }

  // ---------------------------------------------------------------- facade

  private _bearingChanged(event: CustomEvent<{ bearing: number }>): void {
    event.stopPropagation();
    this._updateConfig({
      house: { ...this._config.house, facade_bearing: event.detail.bearing },
    });
  }

  /**
   * Detection reports the building it settled on, and the card follows it.
   *
   * The picker's map can be panned, so detection runs wherever the user is
   * looking. Leaving the configured position untouched would produce a card
   * showing one place with a facade angle describing another.
   */
  private _locationChanged(event: CustomEvent<{ latitude: number; longitude: number }>): void {
    event.stopPropagation();
    this._updateConfig({
      location: {
        ...this._config.location,
        latitude: event.detail.latitude,
        longitude: event.detail.longitude,
      },
    });
  }

  // ------------------------------------------------------------------- form

  /**
   * The config with the airflow defaults filled in. Left blank, a number box
   * reads as unset and a slider sits at its minimum, both of which look like a
   * choice somebody made rather than a default.
   */
  private get _formData(): Record<string, unknown> {
    const { rows: _rows, ...rest } = this._config;
    const airflow = rest.airflow ?? {};
    return {
      ...rest,
      airflow: {
        mode: airflow.mode ?? 'compute',
        weak_below: airflow.weak_below ?? DEFAULT_WEAK_BELOW,
        sideways_from: airflow.sideways_from ?? DEFAULT_SIDEWAYS_FROM,
        ...(airflow.entity ? { entity: airflow.entity } : {}),
      },
    };
  }

  private _formChanged(event: CustomEvent<{ value: AirflowMapCardConfig }>): void {
    event.stopPropagation();
    const next = { ...event.detail.value, rows: this._config.rows };
    if (!next.rows) delete next.rows;
    this._config = next;
    fireEvent(this, 'config-changed', { config: this._config });
  }

  private _computeLabel = (schema: { name: string }): string => {
    const unit = this._windUnit;
    const labels: Record<string, string> = {
      title: 'Title',
      opacity: 'Opacity',
      speed: 'Speed',
      latitude: 'Latitude',
      longitude: 'Longitude',
      zoom: 'Zoom',
      entity: 'Entity',
      speed_entity: 'Wind speed override',
      bearing_entity: 'Wind bearing override',
      gust_entity: 'Wind gust override',
      facade_bearing: 'Direction the front of the house faces',
      facade_bearing_entity: 'Or take it from an entity',
      mode: 'Mode',
      weak_below: unit ? `Weak wind below (${unit})` : 'Weak wind below',
      sideways_from: 'Sideways from',
      size: 'Size (px)',
      color_mode: 'Colour mode',
      color: 'Colour (CSS)',
      tiles: 'Basemap',
      interactive: 'Allow pan and zoom',
      attribution: 'Show attribution',
      aspect_ratio: 'Aspect ratio',
      height: 'Fixed height (px)',
      tile_url: 'Custom tile URL',
    };
    return labels[schema.name] ?? schema.name;
  };

  /** Unit of the configured wind source, so thresholds can be labelled. */
  private get _windUnit(): string | null {
    if (!this.hass) return null;
    return resolveWind(this.hass, this._config.wind).speedUnit;
  }

  // ------------------------------------------------------------------- rows

  private _renderRows(): TemplateResult {
    const rows = this._config.rows ?? [];
    const summary =
      rows.length === 0
        ? 'Defaults: airflow, wind speed and bearing'
        : `${rows.length} row${rows.length === 1 ? '' : 's'}`;

    return html`
      <ha-expansion-panel outlined .header=${'Info rows'} .secondary=${summary}>
        <ha-icon slot="leading-icon" icon="mdi:format-list-bulleted"></ha-icon>
        <div class="panel-content">
          ${
            rows.length === 0
              ? html`<p class="hint">
                  No rows configured. The card falls back to airflow, wind speed and bearing.
                </p>`
              : nothing
          }
          ${rows.map((row, index) => this._renderRowEditor(row, index, rows.length))}
          <button class="secondary" @click=${this._addRow}>Add row</button>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderRowEditor(row: RowConfig, index: number, total: number): TemplateResult {
    const kind = rowKind(row);
    return html`
      <div class="row-editor">
        <div class="row-header">
          <span class="row-title">${rowSummary(row, index)}</span>
          <button
            class="icon-button"
            title="Move up"
            .disabled=${index === 0}
            @click=${() => this._moveRow(index, -1)}
          >
            <ha-icon icon="mdi:arrow-up"></ha-icon>
          </button>
          <button
            class="icon-button"
            title="Move down"
            .disabled=${index === total - 1}
            @click=${() => this._moveRow(index, 1)}
          >
            <ha-icon icon="mdi:arrow-down"></ha-icon>
          </button>
          <button class="icon-button" title="Remove" @click=${() => this._removeRow(index)}>
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
        </div>
        <ha-form
          .hass=${this.hass}
          .data=${{ ...row, kind }}
          .schema=${rowSchema(kind)}
          .computeLabel=${rowLabel}
          @value-changed=${(event: CustomEvent<{ value: RowConfig & { kind: RowKind } }>) =>
            this._rowChanged(event, index)}
        ></ha-form>
      </div>
    `;
  }

  private _rowChanged(
    event: CustomEvent<{ value: RowConfig & { kind: RowKind } }>,
    index: number,
  ): void {
    event.stopPropagation();
    const { kind, ...rest } = event.detail.value;
    const next: RowConfig = { ...rest };

    // Switching kind must drop the keys belonging to the previous kind,
    // otherwise a stale `entity` silently wins over the new `template`.
    if (kind !== 'source') delete next.source;
    if (kind !== 'entity') {
      delete next.entity;
      delete next.attribute;
    }
    if (kind !== 'template') delete next.template;
    if (kind === 'source' && !next.source) next.source = 'speed';
    if (kind === 'template' && next.template === undefined) next.template = '';

    const rows = [...(this._config.rows ?? [])];
    rows[index] = next;
    this._updateConfig({ rows });
  }

  private _addRow(): void {
    const rows = [...(this._config.rows ?? []), { source: 'speed' } as RowConfig];
    this._updateConfig({ rows });
  }

  private _removeRow(index: number): void {
    const rows = [...(this._config.rows ?? [])];
    rows.splice(index, 1);
    this._updateConfig({ rows });
  }

  private _moveRow(index: number, delta: number): void {
    const rows = [...(this._config.rows ?? [])];
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    this._updateConfig({ rows });
  }

  private _updateConfig(patch: Partial<AirflowMapCardConfig>): void {
    this._config = { ...this._config, ...patch };
    fireEvent(this, 'config-changed', { config: this._config });
  }

  static override styles = css`
    .editor {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /*
     * The editor's own groups are ha-expansion-panel, the same element ha-form
     * builds its expandables from, so hand-rolled sections and generated ones
     * read as one editor rather than two stacked visual languages.
     */
    ha-expansion-panel {
      display: block;
      --expansion-panel-content-padding: 0;
      border-radius: 8px;
    }

    .panel-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
    }

    ha-icon[slot='leading-icon'] {
      color: var(--secondary-text-color);
    }

    .address-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .address-input {
      flex: 1 1 200px;
      min-width: 0;
      font: inherit;
      padding: 8px 12px;
      border: 1px solid var(--divider-color);
      border-radius: 4px;
      /* Inherit the dashboard's colours: the editor is themed, and a hardcoded
         white field is unreadable on a dark dashboard. */
      background: var(--card-background-color, transparent);
      color: var(--primary-text-color);
    }

    .address-input::placeholder {
      color: var(--secondary-text-color);
      opacity: 1;
    }

    .address-input:focus-visible {
      outline: 2px solid var(--primary-color, #03a9f4);
      outline-offset: -1px;
    }

    .toggle-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .footprint-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .footprint-row .hint {
      flex: 1 1 200px;
    }

    .hint {
      margin: 0;
      font-size: 12px;
      color: var(--secondary-text-color);
    }

    /*
     * Native buttons rather than mwc-button. Home Assistant is retiring the
     * Material Web Components, and where mwc-button is not registered it falls
     * back to unstyled inline text that does not read as clickable at all.
     */
    .primary,
    .secondary {
      border-radius: 4px;
      padding: 8px 16px;
      font: inherit;
      font-weight: 500;
      cursor: pointer;
    }

    .primary {
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
      border: none;
    }

    .secondary {
      background: none;
      color: var(--primary-color, #03a9f4);
      border: 1px solid var(--divider-color);
    }

    .primary:hover:not(:disabled),
    .secondary:hover:not(:disabled) {
      filter: brightness(1.1);
    }

    .primary:disabled,
    .secondary:disabled {
      opacity: 0.55;
      cursor: default;
    }

    .row-editor {
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 8px;
    }

    .row-header {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 8px;
    }

    .row-title {
      flex: 1;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .icon-button {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--secondary-text-color);
      padding: 4px;
      border-radius: 50%;
      display: inline-flex;
    }

    .icon-button:hover:not(:disabled) {
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
    }

    .icon-button:disabled {
      opacity: 0.35;
      cursor: default;
    }
  `;
}

function rowKind(row: RowConfig): RowKind {
  if (row.template !== undefined) return 'template';
  if (row.entity !== undefined) return 'entity';
  return 'source';
}

function rowSummary(row: RowConfig, index: number): string {
  if (row.name) return String(row.name);
  if (row.template !== undefined) return 'Template';
  if (row.entity) return row.entity;
  if (row.source) return `Built-in: ${row.source}`;
  return `Row ${index + 1}`;
}

function rowLabel(schema: { name: string }): string {
  const labels: Record<string, string> = {
    kind: 'Row type',
    source: 'Value',
    entity: 'Entity',
    attribute: 'Attribute (optional)',
    template: 'Template',
    name: 'Label',
    icon: 'Icon',
    prefix: 'Prefix',
    suffix: 'Suffix',
    unit: 'Unit override',
    precision: 'Decimals',
    size: 'Size',
  };
  return labels[schema.name] ?? schema.name;
}

declare global {
  interface HTMLElementTagNameMap {
    [EDITOR_TYPE]: AirflowMapCardEditor;
  }
}
