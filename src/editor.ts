import { LitElement, css, html, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { EDITOR_TYPE, DEFAULT_ZOOM } from './const';
import type { HomeAssistant } from './ha-types';
import type { AirflowMapCardConfig, LovelaceCardEditor, RowConfig } from './types';
import { fireEvent } from './data/actions';
import { resolveWind } from './data/wind-source';
import { geocode, GeocodeError } from './data/geocode';
import { DEFAULT_SIDEWAYS_FROM } from './data/airflow';
import './editor/facade-picker';

type RowKind = 'source' | 'entity' | 'template';

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
        ${this._renderAddressSearch()} ${this._renderFacadePicker()}
        <ha-form
          .hass=${this.hass}
          .data=${this._formData}
          .schema=${this._schema()}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._formChanged}
        ></ha-form>
        ${this._renderRows()}
      </div>
    `;
  }

  // ---------------------------------------------------------------- address

  private _renderAddressSearch(): TemplateResult {
    const location = this._config.location ?? {};
    const hasCoords = location.latitude !== undefined && location.longitude !== undefined;

    return html`
      <div class="section">
        <div class="section-title">Location</div>
        <div class="address-row">
          <ha-textfield
            .label=${'Search an address'}
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
          ></ha-textfield>
          <mwc-button
            .disabled=${this._geocoding || this._addressQuery.trim() === ''}
            @click=${this._searchAddress}
          >
            ${this._geocoding ? 'Searching…' : 'Search'}
          </mwc-button>
          <mwc-button @click=${this._useHomeLocation}>Use home</mwc-button>
        </div>
        ${
          this._geocodeError
            ? html`<ha-alert alert-type="error">${this._geocodeError}</ha-alert>`
            : nothing
        }
        <p class="hint">
          ${
            hasCoords
              ? html`Using
                  <code>${location.latitude?.toFixed(5)}, ${location.longitude?.toFixed(5)}</code>.`
              : html`No coordinates set — falling back to your Home Assistant home location.`
          }
          Searching uses OpenStreetMap's Nominatim service once per search; the result is stored as
          coordinates, so nothing is looked up while the card is running.
        </p>
      </div>
    `;
  }

  private async _searchAddress(): Promise<void> {
    const query = this._addressQuery.trim();
    if (!query) return;

    this._geocoding = true;
    this._geocodeError = '';
    try {
      const result = await geocode(query, this.hass?.locale?.language ?? this.hass?.language);
      this._updateConfig({
        location: {
          ...this._config.location,
          latitude: Number(result.latitude.toFixed(6)),
          longitude: Number(result.longitude.toFixed(6)),
          zoom: this._config.location?.zoom ?? DEFAULT_ZOOM,
        },
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
    this._updateConfig({
      location: {
        ...this._config.location,
        latitude: this.hass.config.latitude,
        longitude: this.hass.config.longitude,
        zoom: this._config.location?.zoom ?? DEFAULT_ZOOM,
      },
    });
  }

  // ---------------------------------------------------------------- facade

  private _renderFacadePicker(): TemplateResult {
    const location = this._config.location ?? {};
    const latitude = location.latitude ?? this.hass?.config.latitude;
    const longitude = location.longitude ?? this.hass?.config.longitude;

    return html`
      <div class="section">
        <div class="section-title">Front of the house</div>
        ${
          latitude === undefined || longitude === undefined
            ? html`<p class="hint">Set a location above first.</p>`
            : html`
                <airflow-facade-picker
                  .hass=${this.hass}
                  .latitude=${latitude}
                  .longitude=${longitude}
                  .bearing=${this._config.house?.facade_bearing ?? 0}
                  .sidewaysFrom=${this._config.airflow?.sideways_from ?? DEFAULT_SIDEWAYS_FROM}
                  @bearing-changed=${this._bearingChanged}
                ></airflow-facade-picker>
              `
        }
      </div>
    `;
  }

  private _bearingChanged(event: CustomEvent<{ bearing: number }>): void {
    event.stopPropagation();
    this._updateConfig({
      house: { ...this._config.house, facade_bearing: event.detail.bearing },
    });
  }

  // ------------------------------------------------------------------- form

  private get _formData(): Record<string, unknown> {
    const { rows: _rows, ...rest } = this._config;
    return rest;
  }

  private _formChanged(event: CustomEvent<{ value: AirflowMapCardConfig }>): void {
    event.stopPropagation();
    const next = { ...event.detail.value, rows: this._config.rows };
    if (!next.rows) delete next.rows;
    this._config = next;
    fireEvent(this, 'config-changed', { config: this._config });
  }

  private _schema(): unknown[] {
    return [
      { name: 'title', selector: { text: {} } },
      {
        name: 'location',
        type: 'expandable',
        title: 'Map position',
        icon: 'mdi:map-marker',
        schema: [
          {
            type: 'grid',
            schema: [
              { name: 'latitude', selector: { number: { mode: 'box', step: 'any' } } },
              { name: 'longitude', selector: { number: { mode: 'box', step: 'any' } } },
            ],
          },
          { name: 'zoom', selector: { number: { min: 1, max: 19, mode: 'slider' } } },
        ],
      },
      {
        name: 'wind',
        type: 'expandable',
        title: 'Wind source',
        icon: 'mdi:weather-windy',
        schema: [
          { name: 'entity', selector: { entity: { domain: 'weather' } } },
          {
            type: 'grid',
            schema: [
              { name: 'speed_entity', selector: { entity: { domain: 'sensor' } } },
              { name: 'bearing_entity', selector: { entity: { domain: 'sensor' } } },
              { name: 'gust_entity', selector: { entity: { domain: 'sensor' } } },
            ],
          },
        ],
      },
      {
        name: 'house',
        type: 'expandable',
        title: 'House orientation',
        icon: 'mdi:home-outline',
        schema: [
          {
            name: 'facade_bearing',
            selector: { number: { min: 0, max: 359, mode: 'slider', unit_of_measurement: '°' } },
          },
          {
            name: 'facade_bearing_entity',
            selector: { entity: { domain: ['input_number', 'sensor', 'number'] } },
          },
          { name: 'show_guide', selector: { boolean: {} } },
          { name: 'drag_to_align', selector: { boolean: {} } },
        ],
      },
      {
        name: 'airflow',
        type: 'expandable',
        title: 'Airflow classification',
        icon: 'mdi:air-filter',
        schema: [
          {
            name: 'mode',
            selector: {
              select: {
                mode: 'dropdown',
                options: [
                  { value: 'compute', label: 'Compute from bearing' },
                  { value: 'entity', label: 'Take the label from an entity' },
                  { value: 'off', label: 'Off' },
                ],
              },
            },
          },
          { name: 'entity', selector: { entity: {} } },
          {
            type: 'grid',
            schema: [
              { name: 'weak_below', selector: { number: { mode: 'box', step: 'any', min: 0 } } },
              {
                name: 'sideways_from',
                selector: { number: { min: 1, max: 90, mode: 'slider', unit_of_measurement: '°' } },
              },
            ],
          },
        ],
      },
      {
        name: 'arrow',
        type: 'expandable',
        title: 'Arrow',
        icon: 'mdi:arrow-up-bold',
        schema: [
          {
            type: 'grid',
            schema: [
              { name: 'size', selector: { number: { min: 20, max: 400, mode: 'slider' } } },
              {
                name: 'color_mode',
                selector: {
                  select: {
                    mode: 'dropdown',
                    options: [
                      { value: 'airflow', label: 'By airflow direction' },
                      { value: 'fixed', label: 'Fixed colour' },
                    ],
                  },
                },
              },
              { name: 'color', selector: { text: {} } },
              { name: 'show_gust', selector: { boolean: {} } },
              { name: 'hide', selector: { boolean: {} } },
            ],
          },
        ],
      },
      {
        name: 'map',
        type: 'expandable',
        title: 'Map appearance',
        icon: 'mdi:map',
        schema: [
          {
            type: 'grid',
            schema: [
              {
                name: 'theme',
                selector: {
                  select: {
                    mode: 'dropdown',
                    options: [
                      { value: 'auto', label: 'Follow dashboard' },
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark' },
                    ],
                  },
                },
              },
              {
                name: 'tiles',
                selector: {
                  select: {
                    mode: 'dropdown',
                    options: [
                      { value: 'osm', label: 'OpenStreetMap' },
                      { value: 'carto-light', label: 'CARTO light' },
                      { value: 'carto-dark', label: 'CARTO dark' },
                    ],
                  },
                },
              },
              { name: 'interactive', selector: { boolean: {} } },
              { name: 'attribution', selector: { boolean: {} } },
              { name: 'aspect_ratio', selector: { text: {} } },
              { name: 'height', selector: { number: { min: 100, max: 1000, mode: 'box' } } },
            ],
          },
          { name: 'tile_url', selector: { text: {} } },
        ],
      },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    const unit = this._windUnit;
    const labels: Record<string, string> = {
      title: 'Title',
      latitude: 'Latitude',
      longitude: 'Longitude',
      zoom: 'Zoom',
      entity: 'Entity',
      speed_entity: 'Wind speed override',
      bearing_entity: 'Wind bearing override',
      gust_entity: 'Wind gust override',
      facade_bearing: 'Direction the front of the house faces',
      facade_bearing_entity: 'Or take it from an entity',
      show_guide: 'Show alignment guide on the map (turn off when done)',
      drag_to_align: 'Drag the guide line on the map to set the bearing',
      mode: 'Mode',
      weak_below: unit ? `Weak wind below (${unit})` : 'Weak wind below',
      sideways_from: 'Sideways from',
      size: 'Size (px)',
      color_mode: 'Colour mode',
      color: 'Colour (CSS)',
      show_gust: 'Show gust arrow',
      hide: 'Hide arrow',
      theme: 'Theme',
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

    return html`
      <div class="section">
        <div class="section-title">Info rows</div>
        ${
          rows.length === 0
            ? html`<p class="hint">
                No rows configured — the card falls back to airflow, wind speed and bearing.
              </p>`
            : nothing
        }
        ${rows.map((row, index) => this._renderRowEditor(row, index, rows.length))}
        <mwc-button outlined @click=${this._addRow}>Add row</mwc-button>
      </div>
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

    .section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
    }

    .section-title {
      font-weight: 500;
      color: var(--primary-text-color);
    }

    .address-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .address-row ha-textfield {
      flex: 1 1 200px;
    }

    .hint {
      margin: 0;
      font-size: 12px;
      color: var(--secondary-text-color);
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

function rowSchema(kind: RowKind): unknown[] {
  const kindSelect = {
    name: 'kind',
    selector: {
      select: {
        mode: 'dropdown',
        options: [
          { value: 'source', label: 'Built-in value' },
          { value: 'entity', label: 'Entity' },
          { value: 'template', label: 'Template' },
        ],
      },
    },
  };

  const specific =
    kind === 'source'
      ? [
          {
            name: 'source',
            selector: {
              select: {
                mode: 'dropdown',
                options: [
                  { value: 'airflow', label: 'Airflow direction' },
                  { value: 'speed', label: 'Wind speed' },
                  { value: 'gust', label: 'Wind gust' },
                  { value: 'bearing', label: 'Wind bearing (degrees)' },
                  { value: 'cardinal', label: 'Wind bearing (compass point)' },
                ],
              },
            },
          },
        ]
      : kind === 'entity'
        ? [
            { name: 'entity', selector: { entity: {} } },
            { name: 'attribute', selector: { text: {} } },
          ]
        : [{ name: 'template', selector: { template: {} } }];

  return [
    kindSelect,
    ...specific,
    {
      type: 'grid',
      schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
        { name: 'prefix', selector: { text: {} } },
        { name: 'suffix', selector: { text: {} } },
        { name: 'unit', selector: { text: {} } },
        { name: 'precision', selector: { number: { min: 0, max: 5, mode: 'box' } } },
        {
          name: 'size',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'small', label: 'Small' },
                { value: 'normal', label: 'Normal' },
                { value: 'large', label: 'Large' },
              ],
            },
          },
        },
      ],
    },
  ];
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
