import { LitElement, css, html, nothing, unsafeCSS, type TemplateResult } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import leafletCss from 'leaflet/dist/leaflet.css?inline';

import { MapController } from '../map/leaflet-map';
import { resolveTiles } from '../map/tiles';
import { renderFacadeGuide } from '../overlay/facade-guide';
import { bearingFromDrag, normalizeAngle, pointerBearing } from '../data/bearing';
import {
  detectFacadeBearing,
  selectBuilding,
  snapToWalls,
  type LatLon,
  type WallEdge,
} from '../data/footprint';
import {
  OverpassError,
  describeBuilding,
  fetchFootprints,
  type BuildingFootprint,
} from '../data/overpass';
import { capturePointer, fireEvent } from '../data/actions';
import { DEFAULT_SIDEWAYS_FROM } from '../data/airflow';
import type { HomeAssistant } from '../ha-types';

/**
 * Interactive facade alignment, for use inside the card editor.
 *
 * This lives in the editor rather than the card because the editor is the only
 * place a chosen bearing can be made durable: a Lovelace card cannot write its
 * own configuration. Everything here emits `bearing-changed`, which the editor
 * turns into a config write.
 *
 * The intended path is that nobody drags anything: press Detect, confirm the
 * highlighted wall is the front of the house, done.
 */
@customElement('airflow-facade-picker')
export class FacadePicker extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: Number }) latitude = 0;
  @property({ type: Number }) longitude = 0;
  @property({ type: Number }) bearing = 0;
  @property({ type: Number }) sidewaysFrom = DEFAULT_SIDEWAYS_FROM;

  @state() private _walls: WallEdge[] = [];
  @state() private _dragging = false;
  @state() private _busy = false;
  @state() private _status = '';
  @state() private _statusKind: 'info' | 'error' = 'info';
  @state() private _snapped = false;
  /** Every building the last lookup returned, so any of them can be clicked. */
  @state() private _buildings: BuildingFootprint[] = [];
  @state() private _roads: LatLon[][] = [];

  @query('.picker-map') private _mapElement?: HTMLElement;
  @query('.guide') private _guideElement?: HTMLElement;

  private _map?: MapController;
  private _abort?: AbortController;
  private _shiftHeld = false;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._abort?.abort();
    this._map?.destroy();
    this._map = undefined;
  }

  override render(): TemplateResult {
    return html`
      <div class="picker">
        <div class="map-frame">
          <!-- Inline position for the same reason as the card: Leaflet reads
               el.style.position before the computed style and will otherwise
               pin its own position: relative, collapsing the map to zero. -->
          <div class="picker-map" style="position: absolute"></div>
          ${renderFacadeGuide({
            facadeBearing: this.bearing,
            sidewaysFrom: this.sidewaysFrom,
            anchor: [50, 50],
            color: 'var(--primary-color, #03a9f4)',
            drag: {
              active: this._dragging,
              onPointerDown: this._onPointerDown,
              onPointerMove: this._onPointerMove,
              onPointerUp: this._onPointerUp,
              onKeyDown: this._onKeyDown,
            },
          })}
          <div class="readout">
            <span class="value">${this.bearing.toFixed(1)}°</span>
            ${this._snapped ? html`<span class="snap">snapped to wall</span>` : nothing}
          </div>
        </div>

        <div class="controls">
          <button class="primary" ?disabled=${this._busy} @click=${this._detect}>
            ${this._busy ? 'Looking up…' : 'Detect from OpenStreetMap'}
          </button>
          <button class="nudge" title="Rotate anticlockwise" @click=${() => this._nudge(-1)}>
            <ha-icon icon="mdi:rotate-left"></ha-icon>
          </button>
          <button class="nudge" title="Rotate clockwise" @click=${() => this._nudge(1)}>
            <ha-icon icon="mdi:rotate-right"></ha-icon>
          </button>
        </div>

        ${
          this._status
            ? html`<ha-alert alert-type=${this._statusKind === 'error' ? 'error' : 'info'}>
                ${this._status}
              </ha-alert>`
            : nothing
        }

        <p class="hint">
          ${
            this._buildings.length > 1
              ? html`<strong>Click your house on the map</strong> to use its outline instead. `
              : nothing
          }
          Press Detect to read building outlines from OpenStreetMap and face the front wall towards
          the nearest street. You can also drag the line onto the front of the house; it snaps to a
          wall when it gets close. Arrow keys nudge by 1°, Shift for 5°, and holding Shift while
          dragging turns snapping off.
        </p>
      </div>
    `;
  }

  override updated(): void {
    if (!this._mapElement || !this.hass) return;

    const options = {
      latitude: this.latitude,
      longitude: this.longitude,
      zoom: 19,
      // Pannable so the building can be brought into view when the configured
      // point is slightly off.
      interactive: true,
      attribution: true,
      tiles: resolveTiles({ theme: 'auto' }, !!this.hass.themes?.darkMode),
    };

    if (!this._map) this._map = new MapController(this._mapElement);
    this._map.init(options);
  }

  // ------------------------------------------------------------- detection

  private async _detect(): Promise<void> {
    if (!Number.isFinite(this.latitude) || !Number.isFinite(this.longitude)) {
      this._fail('Set a location first.');
      return;
    }

    this._abort?.abort();
    this._abort = new AbortController();
    this._busy = true;
    this._status = '';

    try {
      const { buildings, roads } = await fetchFootprints(
        this.latitude,
        this.longitude,
        this._abort.signal,
      );

      if (buildings.length === 0) {
        this._fail('No building mapped here in OpenStreetMap. Drag the line instead.');
        return;
      }

      const point: LatLon = { lat: this.latitude, lon: this.longitude };
      const rings = buildings.map((b) => b.ring);
      const choice = selectBuilding(rings, point);
      if (!choice) {
        this._fail('Could not work out which building is yours. Drag the line instead.');
        return;
      }

      this._buildings = buildings;
      this._roads = roads;

      if (roads.length === 0) {
        this._walls = [];
        this._drawFootprints(rings.indexOf(choice.building));
        this._fail('Found the building but no nearby street, so the front cannot be guessed.');
        return;
      }

      this._applyBuilding(rings.indexOf(choice.building), choice.contained ? 'auto' : 'fallback');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this._fail(error instanceof OverpassError ? error.message : 'OpenStreetMap lookup failed.');
    } finally {
      this._busy = false;
    }
  }

  /**
   * Adopt one of the fetched buildings as the house and derive the bearing.
   *
   * `origin` matters for the wording only. An automatic choice that fell back
   * to a neighbour has to be called out, but the same geometry chosen by
   * clicking the building is not a fallback at all: the user has just told us
   * which house is theirs, which is better information than the coordinate.
   */
  private _applyBuilding(index: number, origin: 'auto' | 'fallback' | 'clicked'): void {
    const building = this._buildings[index];
    if (!building) return;

    this._drawFootprints(index);

    const point: LatLon = { lat: this.latitude, lon: this.longitude };
    const detection = detectFacadeBearing(building.ring, this._roads, point);
    if (!detection) {
      this._fail('Could not read that building outline. Drag the line instead.');
      return;
    }

    this._walls = detection.walls;
    this._emit(detection.bearing);

    const label = describeBuilding(building) ?? 'that building';
    const facing =
      `Front wall of ${label} faces ${detection.bearing.toFixed(1)}°, towards the ` +
      `street ${Math.round(detection.streetDistance)} m away.`;

    if (origin === 'fallback') {
      // Neighbouring houses in a row sit at slightly different angles, so a
      // borrowed footprint looks entirely plausible while being wrong.
      this._status =
        `Your location is not inside any mapped building, so this guessed the nearest one. ` +
        `${facing} If that is not your house, click the right one on the map.`;
      this._statusKind = 'error';
    } else {
      this._status =
        origin === 'clicked'
          ? `${facing} Drag the line if it picked the wrong wall.`
          : `${facing} Click a different building if this is not yours, or drag the line if it ` +
            `picked the wrong wall.`;
      this._statusKind = 'info';
    }
  }

  private _drawFootprints(selectedIndex: number): void {
    this._map?.setFootprints(
      this._buildings.map((building) => ({
        ring: building.ring.map((p) => [p.lat, p.lon] as [number, number]),
        label: building.address?.housenumber,
      })),
      selectedIndex,
      (index) => this._applyBuilding(index, 'clicked'),
    );
  }

  private _fail(message: string): void {
    this._status = message;
    this._statusKind = 'error';
  }

  // ------------------------------------------------------------ interaction

  private _onPointerDown = (event: PointerEvent): void => {
    capturePointer(event.currentTarget, event.pointerId, true);
    this._dragging = true;
    this._status = '';
    event.preventDefault();
    event.stopPropagation();
  };

  private _onPointerMove = (event: PointerEvent): void => {
    if (!this._dragging || !this._guideElement) return;
    this._shiftHeld = event.shiftKey;

    const rect = this._guideElement.getBoundingClientRect();
    const pointer = pointerBearing(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      event.clientX,
      event.clientY,
    );
    const raw = bearingFromDrag(pointer, this.bearing);
    const snapped = this._shiftHeld ? raw : snapToWalls(raw, this._walls);

    this._snapped = snapped !== raw;
    this._emit(snapped);
    event.preventDefault();
  };

  private _onPointerUp = (event: PointerEvent): void => {
    if (!this._dragging) return;
    this._dragging = false;
    capturePointer(event.currentTarget, event.pointerId, false);
  };

  private _onKeyDown = (event: KeyboardEvent): void => {
    const step = event.shiftKey ? 5 : 1;
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? step
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -step
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    this._nudge(delta);
  };

  private _nudge(delta: number): void {
    this._snapped = false;
    this._emit(normalizeAngle(this.bearing + delta));
  }

  private _emit(bearing: number): void {
    const rounded = Math.round(normalizeAngle(bearing) * 10) / 10;
    if (rounded === this.bearing) return;
    this.bearing = rounded;
    fireEvent(this, 'bearing-changed', { bearing: rounded });
  }

  static override styles = css`
    ${unsafeCSS(leafletCss)}

    :host {
      /*
       * Declared here as well as on the card: custom properties inherit down the
       * DOM, but the editor is a sibling tree rather than a descendant of the
       * card, so it does not pick up the card's definition. See the note there
       * for why both theme variables have to be tried.
       */
      --airflow-surface: var(--ha-card-background, var(--card-background-color, #fff));
    }

    .picker {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .map-frame {
      position: relative;
      width: 100%;
      overflow: hidden;
      border-radius: 8px;
      background: var(--secondary-background-color);
    }

    .map-frame::before {
      content: '';
      display: block;
      padding-top: 75%;
    }

    /* !important for the same reason as the card: see the note there. */
    .picker-map {
      position: absolute !important;
      inset: 0;
      z-index: 0;
    }

    .picker-map.leaflet-container {
      font-family: inherit;
      background: var(--secondary-background-color);
    }

    /* CSS properties, unlike SVG presentation attributes, resolve var(). */
    .building-footprint {
      stroke: var(--primary-color, #03a9f4);
      stroke-opacity: 0.5;
      fill: var(--primary-color, #03a9f4);
      fill-opacity: 0.05;
      cursor: pointer;
    }

    .building-footprint:hover {
      stroke-opacity: 0.9;
      fill-opacity: 0.15;
    }

    .building-footprint.selected {
      stroke-opacity: 1;
      fill-opacity: 0.25;
    }

    .building-label {
      background: none;
      border: none;
      box-shadow: none;
      padding: 0;
      color: var(--primary-text-color);
      font-size: 11px;
      font-weight: 500;
      opacity: 0.6;
      text-shadow:
        0 0 3px var(--airflow-surface),
        0 0 3px var(--airflow-surface);
    }

    .building-label.selected {
      opacity: 1;
      font-weight: 700;
    }

    /* Leaflet draws a callout arrow on tooltips; a centred label has no anchor. */
    .building-label::before {
      display: none;
    }

    .guide {
      position: absolute;
      z-index: 2;
      transform: translate(-50%, -50%);
      width: 78%;
      height: 78%;
      pointer-events: none;
    }

    .guide svg {
      width: 100%;
      height: 100%;
      transform-origin: 50% 50%;
      overflow: visible;
    }

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

    .readout {
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 3;
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--airflow-surface) 85%, transparent);
      font-size: 13px;
    }

    .readout .value {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .readout .snap {
      font-size: 11px;
      color: var(--primary-color, #03a9f4);
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    /*
     * A native button, not mwc-button. Home Assistant is retiring the Material
     * Web Components; where mwc-button is no longer registered it renders as
     * unstyled inline text that does not look clickable at all.
     */
    .primary {
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      font: inherit;
      font-weight: 500;
      cursor: pointer;
    }

    .primary:hover:not(:disabled) {
      filter: brightness(1.1);
    }

    .primary:disabled {
      opacity: 0.55;
      cursor: default;
    }

    .nudge {
      background: none;
      border: 1px solid var(--divider-color);
      border-radius: 50%;
      cursor: pointer;
      color: var(--secondary-text-color);
      padding: 6px;
      display: inline-flex;
    }

    .nudge:hover {
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
    }

    .hint {
      margin: 0;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'airflow-facade-picker': FacadePicker;
  }
}
