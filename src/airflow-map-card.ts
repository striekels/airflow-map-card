import {
  LitElement,
  css,
  html,
  nothing,
  unsafeCSS,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import leafletCss from 'leaflet/dist/leaflet.css?inline';

import { CARD_TYPE, CARD_VERSION, DEFAULT_ARROW_SIZE, DEFAULT_ZOOM, EDITOR_TYPE } from './const';
import type { HomeAssistant } from './ha-types';
import type { AirflowMapCardConfig, RowConfig } from './types';
import { MapController } from './map/leaflet-map';
import { resolveTiles } from './map/tiles';
import { aspectRatioPadding } from './map/aspect';
import { renderArrow } from './overlay/wind-arrow';
import { renderFacadeGuide } from './overlay/facade-guide';
import {
  BUCKET_COLORS,
  BUCKET_OPACITY,
  DEFAULT_SIDEWAYS_FROM,
  DEFAULT_WEAK_BELOW,
  computeAirflow,
  type AirflowResult,
} from './data/airflow';
import {
  angularDifference,
  bearingFromDrag,
  cardinalName,
  normalizeAngle,
  parseBearing,
  pointerBearing,
  windTravelBearing,
} from './data/bearing';
import { resolveWind, windEntityIds, type WindReading } from './data/wind-source';
import { resolveRow, rowEntityIds, rowTemplates, type ResolvedRow } from './data/rows';
import { TemplateSubscriber } from './data/templates';
import { capturePointer, handleAction } from './data/actions';
import { strings } from './localize';
import './editor';

const DEFAULT_ROWS: RowConfig[] = [
  { source: 'airflow', size: 'large' },
  { source: 'speed' },
  { source: 'bearing', prefix: 'from' },
];

@customElement(CARD_TYPE)
export class AirflowMapCard extends LitElement {
  @state() private _config!: AirflowMapCardConfig;
  @state() private _renderTick = 0;
  @state() private _mapError = '';
  /** Bearing set by dragging that has not been written anywhere durable yet. */
  @state() private _dragBearing: number | null = null;
  @state() private _dragging = false;
  @state() private _dragStatus: 'idle' | 'saved' | 'unsaved' | 'error' = 'idle';
  @state() private _dragMessage = '';

  @query('.map') private _mapElement?: HTMLElement;
  @query('.guide') private _guideElement?: HTMLElement;

  private _hass?: HomeAssistant;
  private _map?: MapController;
  private _templates = new TemplateSubscriber(() => this._renderTick++);
  /**
   * Rotation kept as an unbounded running total so a 359° -> 1° change turns
   * two degrees clockwise instead of spinning 358° the other way.
   */
  private _continuousRotation = 0;
  private _lastBearing: number | null = null;

  static getConfigElement(): HTMLElement {
    return document.createElement(EDITOR_TYPE);
  }

  static getStubConfig(hass: HomeAssistant): AirflowMapCardConfig {
    const weatherEntity = Object.keys(hass.states).find((id) => id.startsWith('weather.'));
    return {
      type: `custom:${CARD_TYPE}`,
      location: {
        latitude: hass.config.latitude,
        longitude: hass.config.longitude,
        zoom: DEFAULT_ZOOM,
      },
      house: { facade_bearing: 0 },
      wind: weatherEntity ? { entity: weatherEntity } : {},
      rows: DEFAULT_ROWS,
    };
  }

  set hass(hass: HomeAssistant) {
    const previous = this._hass;
    this._hass = hass;
    this._templates.setHass(hass);

    if (!previous || this._trackedStateChanged(previous, hass)) {
      this.requestUpdate();
    }
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  setConfig(config: AirflowMapCardConfig): void {
    if (!config) throw new Error('Invalid configuration');

    const zoom = config.location?.zoom;
    if (zoom !== undefined && (typeof zoom !== 'number' || zoom < 1 || zoom > 19)) {
      throw new Error('location.zoom must be a number between 1 and 19');
    }
    for (const key of ['latitude', 'longitude'] as const) {
      const value = config.location?.[key];
      if (value !== undefined && typeof value !== 'number') {
        throw new Error(`location.${key} must be a number`);
      }
    }
    if (config.rows && !Array.isArray(config.rows)) {
      throw new Error('rows must be a list');
    }
    for (const row of config.rows ?? []) {
      if (!row.source && !row.entity && !row.template) {
        throw new Error('each row needs one of: source, entity, template');
      }
    }
    const sideways = config.airflow?.sideways_from;
    if (sideways !== undefined && (sideways < 1 || sideways > 90)) {
      throw new Error('airflow.sideways_from must be between 1 and 90');
    }

    this._config = config;
    // A new config supersedes any unsaved drag; keeping the override would make
    // the card disagree with the YAML the user just edited.
    this._dragBearing = null;
    this._dragStatus = 'idle';
    this._dragMessage = '';
    this._templates.sync(rowTemplates(config.rows ?? DEFAULT_ROWS));
  }

  getCardSize(): number {
    return 6;
  }

  getGridOptions(): Record<string, number> {
    return { columns: 12, rows: 6, min_columns: 6, min_rows: 4 };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._templates.connect();
    this._templates.sync(rowTemplates(this._config?.rows ?? DEFAULT_ROWS));
    // Leaflet measures a zero-sized container as zero; re-measure once the
    // card is actually laid out again.
    this._map?.invalidate();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._templates.disconnect();
  }

  override render(): TemplateResult | typeof nothing {
    if (!this._config || !this._hass) return nothing;

    const t = strings(this._language);
    const wind = resolveWind(this._hass, this._config.wind);
    const airflow = this._airflow(wind);
    const airflowLabel = this._airflowLabel(airflow);
    const arrow = this._config.arrow ?? {};
    const mapConfig = this._config.map ?? {};

    const rows = (this._config.rows ?? DEFAULT_ROWS).map((row, index) =>
      resolveRow(
        {
          hass: this._hass!,
          wind,
          airflow,
          airflowLabel,
          templates: this._templates,
          language: this._language,
        },
        row,
        index,
      ),
    );

    const tiles = resolveTiles(mapConfig, !!this._hass.themes?.darkMode);

    return html`
      <ha-card>
        ${this._config.title ? html`<h1 class="card-header">${this._config.title}</h1>` : nothing}
        <div
          class=${classMap({ 'map-wrapper': true, 'fixed-height': !!mapConfig.height })}
          style=${styleMap(
            mapConfig.height
              ? { height: `${mapConfig.height}px` }
              : { '--airflow-map-ratio': aspectRatioPadding(mapConfig.aspect_ratio) },
          )}
        >
          <!-- position is set inline deliberately: Leaflet reads el.style.position
               before the computed style, so this stops it pinning its own
               position: relative when the card renders while detached. -->
          <div class="map" style=${styleMap({ position: 'absolute', filter: tiles.filter })}></div>
          ${
            this._config.house?.show_guide
              ? renderFacadeGuide({
                  facadeBearing: this._facadeBearing(),
                  sidewaysFrom: this._config.airflow?.sideways_from ?? DEFAULT_SIDEWAYS_FROM,
                  anchor: arrow.anchor ?? [50, 50],
                  color: 'var(--primary-color, #03a9f4)',
                  drag: this._dragEnabled
                    ? {
                        active: this._dragging,
                        onPointerDown: this._onGuidePointerDown,
                        onPointerMove: this._onGuidePointerMove,
                        onPointerUp: this._onGuidePointerUp,
                        onKeyDown: this._onGuideKeyDown,
                      }
                    : undefined,
                })
              : nothing
          }
          ${
            arrow.hide
              ? nothing
              : renderArrow({
                  rotation: this._arrowRotation(wind.bearing),
                  size: arrow.size ?? DEFAULT_ARROW_SIZE,
                  color: this._arrowColor(airflow),
                  opacity: BUCKET_OPACITY[airflow.bucket],
                  anchor: arrow.anchor ?? [50, 50],
                  gustRotation:
                    arrow.show_gust && wind.gust !== null && wind.bearing !== null
                      ? this._continuousRotation
                      : undefined,
                  label: this._ariaLabel(wind, airflowLabel, t),
                  interactive: true,
                })
          }
          ${
            this._config.house?.show_guide
              ? this._renderBearingChip(this._facadeBearing())
              : nothing
          }
          ${
            this._mapError
              ? html`<div class="warning">Map failed to load: ${this._mapError}</div>`
              : wind.missing
                ? html`<div class="warning">${t.no_wind_source}</div>`
                : nothing
          }
        </div>
        ${rows.length ? html`<div class="rows">${rows.map((row) => this._renderRow(row))}</div>` : nothing}
      </ha-card>
    `;
  }

  override updated(changed: PropertyValues): void {
    super.updated(changed);
    if (!this._config || !this._hass || !this._mapElement) return;

    const location = this._config.location ?? {};
    const mapConfig = this._config.map ?? {};
    const options = {
      latitude: location.latitude ?? this._hass.config.latitude,
      longitude: location.longitude ?? this._hass.config.longitude,
      zoom: location.zoom ?? DEFAULT_ZOOM,
      interactive: mapConfig.interactive ?? false,
      attribution: mapConfig.attribution ?? true,
      tiles: resolveTiles(mapConfig, !!this._hass.themes?.darkMode),
    };

    try {
      if (!this._map) this._map = new MapController(this._mapElement);
      this._map.init(options);
      if (this._mapError) this._mapError = '';
    } catch (error) {
      // A failed map must say so on the card face. Silently rendering an empty
      // rectangle is indistinguishable from a zero-height container, which is
      // exactly the bug that made this guard necessary.
      const message = error instanceof Error ? error.message : String(error);
      if (this._mapError !== message) this._mapError = message;
      return;
    }

    // Belt and braces for layouts that give the card its height a frame late:
    // Leaflet caches the container size at init and draws nothing if it was
    // zero. The ResizeObserver covers later changes; this covers the first one.
    requestAnimationFrame(() => this._map?.invalidate());
  }

  private _renderRow(row: ResolvedRow): TemplateResult {
    const clickable = !!row.entityId || !!row.tapAction;
    return html`
      <div
        class=${classMap({ row: true, [`size-${row.size}`]: true, clickable, error: row.error })}
        role=${clickable ? 'button' : 'presentation'}
        tabindex=${clickable ? '0' : '-1'}
        @click=${() => this._handleRowAction(row)}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this._handleRowAction(row);
          }
        }}
      >
        ${
          row.stateObj
            ? html`<ha-state-icon .hass=${this._hass} .stateObj=${row.stateObj}></ha-state-icon>`
            : row.icon
              ? html`<ha-icon .icon=${row.icon}></ha-icon>`
              : nothing
        }
        ${row.name ? html`<span class="name">${row.name}</span>` : nothing}
        <span class="value">${row.value}</span>
      </div>
    `;
  }

  private _handleRowAction(row: ResolvedRow): void {
    if (!this._hass) return;
    if (!row.entityId && !row.tapAction) return;
    handleAction(this, this._hass, row.tapAction, row.entityId);
  }

  private get _language(): string {
    return this._hass?.locale?.language ?? this._hass?.language ?? 'en';
  }

  private _facadeBearing(): number {
    // An unsaved drag wins: it is the user's current intent, and reverting under
    // their finger would make the guide unusable.
    if (this._dragBearing !== null) return this._dragBearing;

    const house = this._config.house ?? {};
    if (house.facade_bearing_entity && this._hass) {
      const parsed = parseBearing(this._hass.states[house.facade_bearing_entity]?.state);
      if (parsed !== null) return parsed;
    }
    return house.facade_bearing ?? 0;
  }

  /**
   * Dragging on the live dashboard requires somewhere to put the result.
   * Without a settable entity the value could only be held for the session,
   * which is a dead end: the user aligns the house and is then told to copy a
   * number by hand. Alignment belongs in the editor, where it persists.
   */
  private get _dragEnabled(): boolean {
    const house = this._config.house ?? {};
    if (!house.show_guide || house.drag_to_align === false) return false;

    const domain = house.facade_bearing_entity?.split('.')[0];
    return domain === 'input_number' || domain === 'number';
  }

  private _onGuidePointerDown = (event: PointerEvent): void => {
    if (!this._dragEnabled) return;
    capturePointer(event.currentTarget, event.pointerId, true);
    this._dragging = true;
    this._dragStatus = 'idle';
    this._dragMessage = '';
    // Stop the map from starting a pan under the handle.
    event.preventDefault();
    event.stopPropagation();
  };

  private _onGuidePointerMove = (event: PointerEvent): void => {
    if (!this._dragging || !this._guideElement) return;
    const rect = this._guideElement.getBoundingClientRect();
    const pointer = pointerBearing(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      event.clientX,
      event.clientY,
    );
    this._dragBearing = bearingFromDrag(pointer, this._facadeBearing());
    event.preventDefault();
  };

  private _onGuidePointerUp = (event: PointerEvent): void => {
    if (!this._dragging) return;
    this._dragging = false;
    capturePointer(event.currentTarget, event.pointerId, false);
    void this._persistFacadeBearing();
  };

  private _onGuideKeyDown = (event: KeyboardEvent): void => {
    if (!this._dragEnabled) return;
    const step = event.shiftKey ? 5 : 1;
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? step
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -step
          : 0;
    if (delta === 0) return;

    event.preventDefault();
    this._dragBearing = normalizeAngle(this._facadeBearing() + delta);
    void this._persistFacadeBearing();
  };

  /**
   * A card cannot write its own Lovelace config, so a dragged bearing is made
   * durable through the configured entity. `_dragEnabled` guarantees there is
   * a settable one, which is why there is no "nowhere to put it" branch here.
   */
  private async _persistFacadeBearing(): Promise<void> {
    const entityId = this._config.house?.facade_bearing_entity;
    const value = this._dragBearing;
    if (value === null || !this._hass || !entityId) return;

    const domain = entityId.split('.')[0];
    if (domain !== 'input_number' && domain !== 'number') return;

    try {
      await this._hass.callService(domain, 'set_value', {
        entity_id: entityId,
        value: Math.round(value * 10) / 10,
      });
      // The entity now drives the bearing; drop the local override so the two
      // cannot drift apart.
      this._dragBearing = null;
      this._dragStatus = 'saved';
    } catch (error) {
      this._dragStatus = 'error';
      this._dragMessage = error instanceof Error ? error.message : String(error);
    }
  }

  private _renderBearingChip(bearing: number): TemplateResult {
    const rounded = (Math.round(bearing * 10) / 10).toFixed(1);
    const suffix =
      this._dragStatus === 'saved'
        ? 'saved'
        : this._dragStatus === 'error'
          ? `not saved: ${this._dragMessage}`
          : '';

    return html`
      <div class="bearing-chip" title=${suffix}>
        <span class="value">${rounded}°</span>
        ${suffix ? html`<span class="hint">${suffix}</span>` : nothing}
      </div>
    `;
  }

  private _airflow(wind: WindReading): AirflowResult {
    const config = this._config.airflow ?? {};
    if (config.mode === 'off') return { bucket: 'unknown', delta: null };

    // `mode: entity` still computes a bucket — the arrow needs one to pick its
    // colour. Only the displayed label comes from the external entity.
    return computeAirflow({
      windFrom: wind.bearing,
      speed: wind.speed,
      facadeBearing: this._facadeBearing(),
      weakBelow: config.weak_below ?? DEFAULT_WEAK_BELOW,
      sidewaysFrom: config.sideways_from ?? DEFAULT_SIDEWAYS_FROM,
    });
  }

  private _airflowLabel(airflow: AirflowResult): string {
    const config = this._config.airflow ?? {};
    const t = strings(this._language);

    if (config.mode === 'entity' && config.entity && this._hass) {
      const stateObj = this._hass.states[config.entity];
      if (stateObj) return stateObj.state;
    }

    return config.labels?.[airflow.bucket] ?? t.airflow[airflow.bucket];
  }

  private _arrowColor(airflow: AirflowResult): string {
    const arrow = this._config.arrow ?? {};
    if (arrow.color_mode === 'fixed') return arrow.color ?? BUCKET_COLORS.front_to_back;
    return arrow.color ?? BUCKET_COLORS[airflow.bucket];
  }

  private _arrowRotation(bearing: number | null): number {
    if (bearing === null) return this._continuousRotation;

    const target = windTravelBearing(bearing);
    if (this._lastBearing === null) {
      this._continuousRotation = target;
    } else {
      this._continuousRotation += angularDifference(target, this._continuousRotation);
    }
    this._lastBearing = bearing;
    return this._continuousRotation;
  }

  private _ariaLabel(
    wind: WindReading,
    airflowLabel: string,
    t: ReturnType<typeof strings>,
  ): string {
    const speed =
      wind.speed === null ? '—' : `${wind.speed}${wind.speedUnit ? ` ${wind.speedUnit}` : ''}`;
    const direction = wind.bearing === null ? '—' : cardinalName(wind.bearing);
    return t.aria(speed, direction, airflowLabel);
  }

  /**
   * `hass` is reassigned on every state change anywhere in the system.
   * Re-rendering on all of them would redraw the card hundreds of times a
   * minute, so only the entities this config actually reads are compared.
   */
  private _trackedStateChanged(previous: HomeAssistant, next: HomeAssistant): boolean {
    if (previous.themes?.darkMode !== next.themes?.darkMode) return true;
    if (previous.locale?.language !== next.locale?.language) return true;

    for (const entityId of this._trackedEntities()) {
      if (previous.states[entityId] !== next.states[entityId]) return true;
    }
    return false;
  }

  private _trackedEntities(): string[] {
    if (!this._config) return [];
    const ids = [
      ...windEntityIds(this._config.wind),
      ...rowEntityIds(this._config.rows ?? DEFAULT_ROWS),
    ];
    if (this._config.house?.facade_bearing_entity)
      ids.push(this._config.house.facade_bearing_entity);
    if (this._config.airflow?.entity) ids.push(this._config.airflow.entity);
    if (this._config.tap_action?.entity) ids.push(this._config.tap_action.entity);
    return ids;
  }

  static override styles = css`
    ${unsafeCSS(leafletCss)}

    :host {
      display: block;
    }

    ha-card {
      overflow: hidden;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .card-header {
      font-size: var(--ha-card-header-font-size, 24px);
      font-weight: 400;
      margin: 0;
      padding: 12px 16px 8px;
      color: var(--ha-card-header-color, var(--primary-text-color));
    }

    .map-wrapper {
      position: relative;
      flex: 1 1 auto;
      min-height: 160px;
      background: var(--secondary-background-color);
      /* The facade guide's wall line deliberately overruns its own box so it
         spans the whole map; this is what stops it reaching the rows below. */
      overflow: hidden;
    }

    /*
     * Height comes from a percentage-padding spacer, not the aspect-ratio
     * property. Percentage padding resolves against this element's own width in
     * every layout context. aspect-ratio does not: as a flex item inside HA's
     * sections grid it collapsed to zero height, Leaflet measured a 448x0
     * viewport, and the map rendered nothing at all.
     */
    .map-wrapper::before {
      content: '';
      display: block;
      padding-top: var(--airflow-map-ratio, 75%);
    }

    .map-wrapper.fixed-height::before {
      display: none;
    }

    /*
     * The !important is load-bearing, not laziness.
     *
     * Leaflet reads the container's computed position on init and, seeing
     * static, pins position: relative as an INLINE style. It reads static
     * whenever the card first renders while detached from the document, which
     * is what Home Assistant's card pipeline does. Under position: relative,
     * inset: 0 stretches nothing and the map silently collapses to zero height,
     * which looks exactly like a map that failed to load.
     *
     * An author !important declaration is the only thing that outranks a
     * third-party inline style. Percentage sizing is not an alternative here:
     * the wrapper's height comes from a padding spacer so its specified height
     * is auto, against which height: 100% also resolves to zero.
     */
    .map {
      position: absolute !important;
      inset: 0;
      z-index: 0;
    }

    /* Leaflet ships its own font stack; keep the dashboard's. */
    .map.leaflet-container {
      font-family: inherit;
      background: var(--secondary-background-color);
    }

    /* Leaflet hardcodes a white attribution bar, which glares on a dark map. */
    .leaflet-control-attribution {
      background: color-mix(in srgb, var(--ha-card-background, #fff) 75%, transparent);
      color: var(--secondary-text-color);
      font-size: 10px;
    }

    .leaflet-control-attribution a {
      color: var(--secondary-text-color);
    }

    /*
     * Above the arrow on purpose: the guide is a transient tuning aid, and the
     * arrow would otherwise cover exactly the middle you are trying to align.
     */
    .guide {
      position: absolute;
      z-index: 3;
      transform: translate(-50%, -50%);
      width: 78%;
      height: 78%;
      pointer-events: none;
    }

    /*
     * The box is not square, but the SVG's default preserveAspectRatio letterboxes
     * the 100x100 drawing to the shorter side and centres it — so the guide stays
     * circular on any card shape and still lines up with the arrow's anchor.
     */
    .guide svg {
      width: 100%;
      height: 100%;
      transform-origin: 50% 50%;
      transition: transform 0.3s ease;
      /*
       * The wall line is drawn far outside the viewBox so it spans the full map.
       * No drop-shadow filter here: a filter establishes a region roughly the
       * size of the bounding box, which would clip that overrun. The line's own
       * white halo stroke provides the contrast instead.
       */
      overflow: visible;
    }

    @media (prefers-reduced-motion: reduce) {
      .guide svg {
        transition: none;
      }
    }

    /*
     * The only interactive part of the guide. The guide itself keeps
     * pointer-events: none so the map underneath stays pannable; a child may
     * still opt back in.
     */
    .wall-handle {
      pointer-events: stroke;
      cursor: grab;
      touch-action: none;
      outline: none;
    }

    .wall-handle.dragging {
      cursor: grabbing;
    }

    .wall-handle:focus-visible {
      stroke: var(--primary-color, #03a9f4);
      stroke-opacity: 0.35;
    }

    /* While dragging, the guide must track the pointer without lag. */
    .guide:has(.wall-handle.dragging) svg {
      transition: none;
    }

    .bearing-chip {
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 4;
      display: flex;
      align-items: baseline;
      gap: 6px;
      max-width: calc(100% - 16px);
      padding: 4px 10px;
      border: none;
      border-radius: 14px;
      background: color-mix(in srgb, var(--ha-card-background, #fff) 85%, transparent);
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      cursor: default;
      text-align: left;
    }

    .bearing-chip.unsaved {
      cursor: pointer;
    }

    .bearing-chip .value {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .bearing-chip .hint {
      color: var(--secondary-text-color);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .arrow {
      position: absolute;
      z-index: 2;
      transform: translate(-50%, -50%);
      transition: opacity 0.4s ease;
      cursor: default;
    }

    .glyph {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45));
      transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
      transform-origin: 50% 50%;
    }

    @media (prefers-reduced-motion: reduce) {
      .glyph {
        transition: none;
      }
    }

    .warning {
      position: absolute;
      inset: auto 8px 8px 8px;
      z-index: 2;
      padding: 6px 10px;
      border-radius: 6px;
      background: var(--warning-color, #ffa726);
      color: #000;
      font-size: 13px;
      text-align: center;
    }

    .rows {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-around;
      gap: 4px 16px;
      padding: 12px 16px;
    }

    .row {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--primary-text-color);
      border-radius: 8px;
      padding: 2px 4px;
    }

    .row.clickable {
      cursor: pointer;
    }

    .row.clickable:hover,
    .row.clickable:focus-visible {
      background: var(--secondary-background-color);
      outline: none;
    }

    .row .name {
      color: var(--secondary-text-color);
    }

    .row.error .value {
      color: var(--error-color, #db4437);
    }

    .row ha-icon,
    .row ha-state-icon {
      --mdc-icon-size: 20px;
      color: var(--state-icon-color, var(--secondary-text-color));
    }

    .size-large {
      flex-basis: 100%;
      justify-content: center;
      font-size: 22px;
      font-weight: 500;
    }

    .size-large ha-icon,
    .size-large ha-state-icon {
      --mdc-icon-size: 26px;
    }

    .size-normal {
      font-size: 15px;
    }

    .size-small {
      font-size: 13px;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    [CARD_TYPE]: AirflowMapCard;
  }
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: CARD_TYPE,
  name: 'Airflow Map Card',
  description: 'Wind direction over your house on an OpenStreetMap basemap.',
  preview: true,
  documentationURL: 'https://github.com/striekels/airflow-map-card',
});

/* eslint-disable no-console */
console.info(
  `%c AIRFLOW-MAP-CARD %c ${CARD_VERSION} `,
  'color: white; background: #4caf50; font-weight: 700;',
  'color: #4caf50; background: white; font-weight: 700;',
);
