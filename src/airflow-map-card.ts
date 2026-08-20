import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { leafletStyles } from './map/leaflet-styles';

import { CARD_TYPE, CARD_VERSION, DEFAULT_ARROW_SIZE, DEFAULT_ZOOM, EDITOR_TYPE } from './const';
import type { HomeAssistant } from './ha-types';
import type { AirflowMapCardConfig, FlowConfig, RowConfig } from './types';
import { MapController } from './map/leaflet-map';
import { resolveTiles } from './map/tiles';
import { aspectRatioPadding } from './map/aspect';
import { renderArrow } from './overlay/wind-arrow';
import { WindFlow } from './overlay/wind-flow';
import {
  BUCKET_COLORS,
  BUCKET_OPACITY,
  DEFAULT_SIDEWAYS_FROM,
  DEFAULT_WEAK_BELOW,
  computeAirflow,
  type AirflowResult,
} from './data/airflow';
import { angularDifference, cardinalName, parseBearing, windTravelBearing } from './data/bearing';
import { resolveWind, windEntityIds, type WindReading } from './data/wind-source';
import { resolveRow, rowEntityIds, rowTemplates, type ResolvedRow } from './data/rows';
import { TemplateSubscriber } from './data/templates';
import { handleAction } from './data/actions';
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

  @query('.map') private _mapElement?: HTMLElement;
  @query('.flow') private _flowElement?: HTMLCanvasElement;

  private _hass?: HomeAssistant;
  private _map?: MapController;
  private _flow?: WindFlow;
  private _templates = new TemplateSubscriber(() => this._renderTick++);
  /**
   * Rotation kept as an unbounded running total so a 359° -> 1° change turns
   * two degrees clockwise instead of spinning 358° the other way.
   */
  private _continuousRotation = 0;
  private _lastBearing: number | null = null;

  /**
   * The flow settings, with `flow: true` accepted as shorthand.
   *
   * On by default. The flow shows direction and speed at once, which is the
   * question the card exists to answer; the arrow says direction more precisely
   * and is opt-in beside it.
   */
  private get _flowConfig(): FlowConfig {
    const flow = this._config.flow;
    if (flow === undefined) return { show: true };
    if (typeof flow === 'boolean') return { show: flow };
    return { show: true, ...flow };
  }

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
    const footprint = config.house?.footprint;
    if (footprint !== undefined) {
      const valid =
        Array.isArray(footprint) &&
        footprint.every(
          (point) =>
            Array.isArray(point) &&
            point.length === 2 &&
            point.every((value) => typeof value === 'number' && Number.isFinite(value)),
        );
      if (!valid) throw new Error('house.footprint must be a list of [latitude, longitude] pairs');
    }

    const sideways = config.airflow?.sideways_from;
    if (sideways !== undefined && (sideways < 1 || sideways > 90)) {
      throw new Error('airflow.sideways_from must be between 1 and 90');
    }

    this._config = config;
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

    // Rebuild the flow, which disconnectedCallback tore down.
    //
    // Lit does not re-render on reconnect, so `updated` never runs again and
    // nothing else would ever restart it. The canvas survives the round trip
    // holding its last painted frame, so the symptom is not a blank card but an
    // animation that appears to freeze. Home Assistant detaches and reattaches
    // cards routinely, which is why this showed up the moment a card was saved.
    this._syncFlow();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._templates.disconnect();
    // Stop the animation with the card. Nothing else would: the observers hold
    // a reference to a canvas that is no longer on screen.
    this._flow?.detach();
    this._flow = undefined;
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
          class=${classMap({
            'map-wrapper': true,
            'fixed-height': !!mapConfig.height,
            // Anything drawn on the map contrasts with the map, not the card.
            'basemap-dark': tiles.dark,
          })}
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
          ${this._flowConfig.show ? html`<canvas class="flow" aria-hidden="true"></canvas>` : nothing}
          ${
            arrow.show
              ? renderArrow({
                  rotation: this._arrowRotation(wind.bearing),
                  size: arrow.size ?? DEFAULT_ARROW_SIZE,
                  color: this._arrowColor(airflow),
                  opacity: BUCKET_OPACITY[airflow.bucket],
                  label: this._ariaLabel(wind, airflowLabel, t),
                  interactive: true,
                  onTap: this._config.tap_action ? () => this._handleCardAction('tap') : undefined,
                  onHold: this._config.hold_action
                    ? () => this._handleCardAction('hold')
                    : undefined,
                })
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

    // The outline the editor detected, drawn from the config. Nothing is looked
    // up here: the card never queries OpenStreetMap at runtime, and a handful of
    // coordinate pairs costs nothing to store.
    const footprint = this._config.house?.footprint;
    this._map.setFootprints(footprint && footprint.length >= 3 ? [{ ring: footprint }] : [], -1);

    this._syncFlow();

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

  /**
   * Card-level `tap_action` and `hold_action`, on the arrow.
   *
   * The arrow rather than the whole card, because the card is mostly a map, and
   * a map you can pan is not a button. The arrow is the focal element, already
   * takes pointer events, and sits over the house the action is about.
   *
   * These were declared in the config type and documented in the README while
   * `handleAction` was only ever called from a row, so tapping did nothing at
   * all. Silently ignored configuration is worse than absent configuration,
   * which is why this had to be settled one way or the other before 1.0.
   */
  private _handleCardAction(kind: 'tap' | 'hold'): void {
    if (!this._hass) return;
    const action = kind === 'tap' ? this._config.tap_action : this._config.hold_action;
    if (!action) return;
    handleAction(this, this._hass, action, this._config.wind?.entity);
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
    const house = this._config.house ?? {};
    if (house.facade_bearing_entity && this._hass) {
      const parsed = parseBearing(this._hass.states[house.facade_bearing_entity]?.state);
      if (parsed !== null) return parsed;
    }
    return house.facade_bearing ?? 0;
  }

  private _airflow(wind: WindReading): AirflowResult {
    const config = this._config.airflow ?? {};
    if (config.mode === 'off') return { bucket: 'unknown', delta: null };

    // `mode: entity` still computes a bucket: the arrow needs one to pick its
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

  /**
   * Keep the flow overlay in step with the wind and the configuration.
   *
   * The colour and opacity are the arrow's, so the airflow classification reads
   * the same whichever you look at, and turning `flow` off tears the animation
   * down rather than leaving it running under a hidden canvas.
   */
  private _syncFlow(): void {
    const canvas = this._flowElement;
    // Also reached from connectedCallback, which runs before the first render
    // and before `hass` is set, so nothing here may assume either exists.
    if (!this._config || !this._flowConfig.show || !this._hass || !canvas) {
      this._flow?.detach();
      this._flow = undefined;
      return;
    }

    const wind = resolveWind(this._hass, this._config.wind);
    const airflow = this._airflow(wind);

    if (!this._flow) this._flow = new WindFlow();
    this._flow.attach(canvas);
    const flow = this._flowConfig;
    this._flow.update({
      bearing: wind.bearing === null ? null : windTravelBearing(wind.bearing),
      speed: wind.speed,
      unit: wind.speedUnit,
      color: this._arrowColor(airflow),
      opacity: BUCKET_OPACITY[airflow.bucket] * (flow.opacity ?? 1),
      pace: flow.speed ?? 1,
    });
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
    if (this._config.hold_action?.entity) ids.push(this._config.hold_action.entity);
    return ids;
  }

  static override styles = css`
    ${leafletStyles}

    :host {
      display: block;

      /*
       * Contain every z-index used inside this card.
       *
       * Leaflet's stylesheet gives its panes and controls z-index 200 to 1000.
       * With no stacking context here, those compete in whatever context the
       * host happens to sit in and paint over anything an ancestor lays on top
       * of the card. In Home Assistant's dashboard edit mode that meant the
       * edit scrim covered the header and the rows but not the map, which read
       * as a broken overlay.
       */
      isolation: isolate;

      /*
       * Home Assistant themes are inconsistent about which of these they set.
       * Reading only --ha-card-background means a theme that defines just
       * --card-background-color falls straight through to the literal, giving a
       * white pill with light text on a dark dashboard. Chain both before any
       * hard-coded colour, and never hard-code one outside this declaration.
       */
      --airflow-surface: var(--ha-card-background, var(--card-background-color, #fff));
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
    /*
     * The house outline, with its ink chosen against the basemap rather than
     * against the dashboard.
     *
     * This used the dashboard's primary text colour, while the outline is drawn
     * on tiles whose lightness map.tiles sets separately. A dark dashboard with
     * a pinned light basemap therefore drew a near-white outline on a near-white
     * map at 0.45 opacity, and it simply could not be seen. The two are
     * independent, so the colour follows the one the shape actually sits on.
     */
    .building-footprint {
      stroke: #10161d;
      stroke-opacity: 0.7;
      fill: #10161d;
      fill-opacity: 0.1;
      pointer-events: none;
    }

    .basemap-dark .building-footprint {
      stroke: #f2f5f8;
      stroke-opacity: 0.75;
      fill: #f2f5f8;
      fill-opacity: 0.12;
    }

    /* Over the tiles, under the arrow, and never in the way of a pan. */
    .flow {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
      pointer-events: none;
    }

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
      background: color-mix(in srgb, var(--airflow-surface) 75%, transparent);
      color: var(--secondary-text-color);
      font-size: 10px;
    }

    .leaflet-control-attribution a {
      color: var(--secondary-text-color);
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

console.info(
  `%c AIRFLOW-MAP-CARD %c ${CARD_VERSION} `,
  'color: white; background: #4caf50; font-weight: 700;',
  'color: #4caf50; background: white; font-weight: 700;',
);
