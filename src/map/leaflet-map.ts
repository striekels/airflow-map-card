import L from 'leaflet';
import type { TileSpec } from './tiles';
import { MAX_ZOOM, MIN_ZOOM } from '../const';

export interface FootprintLayer {
  ring: Array<[number, number]>;
  /** House number or similar, drawn on the polygon. */
  label?: string;
}

export interface MapOptions {
  latitude: number;
  longitude: number;
  zoom: number;
  interactive: boolean;
  tiles: TileSpec;
  attribution: boolean;
}

/**
 * Owns the Leaflet instance for one card.
 *
 * The map is created once and then mutated. Re-creating it on every state
 * change is the classic way to make a custom card flash and hammer the tile
 * server, so nothing here tears the map down except `destroy()`.
 */
export class MapController {
  private map?: L.Map;
  private layer?: L.TileLayer;
  private footprints?: L.LayerGroup;
  private resizeObserver?: ResizeObserver;
  private current?: MapOptions;

  constructor(private readonly container: HTMLElement) {}

  init(options: MapOptions): void {
    if (this.map) {
      this.update(options);
      return;
    }

    this.map = L.map(this.container, {
      attributionControl: options.attribution,
      zoomControl: false,
      dragging: options.interactive,
      scrollWheelZoom: options.interactive,
      doubleClickZoom: options.interactive,
      boxZoom: options.interactive,
      keyboard: options.interactive,
      touchZoom: options.interactive,
      // The arrow overlay sits above the map; fading tiles under it looks
      // like the arrow is flickering.
      fadeAnimation: false,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    });

    this.map.setView([options.latitude, options.longitude], clampZoom(options.zoom));
    this.applyTiles(options.tiles, options.attribution);

    if (options.interactive) {
      L.control.zoom({ position: 'topright' }).addTo(this.map);
    }

    // Cards get resized by the sections layout and by sidebar toggles, neither
    // of which fire a window resize event.
    this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize({ animate: false }));
    this.resizeObserver.observe(this.container);

    this.current = options;
  }

  update(options: MapOptions): void {
    if (!this.map || !this.current) return;
    const previous = this.current;
    this.current = options;

    if (
      previous.latitude !== options.latitude ||
      previous.longitude !== options.longitude ||
      previous.zoom !== options.zoom
    ) {
      this.map.setView([options.latitude, options.longitude], clampZoom(options.zoom), {
        animate: false,
      });
    }

    if (previous.tiles.url !== options.tiles.url || previous.attribution !== options.attribution) {
      this.applyTiles(options.tiles, options.attribution);
    }

    if (previous.interactive !== options.interactive) {
      // Handlers can be toggled in place; the map itself never needs rebuilding.
      const handlers = [
        this.map.dragging,
        this.map.scrollWheelZoom,
        this.map.doubleClickZoom,
        this.map.boxZoom,
        this.map.keyboard,
        this.map.touchZoom,
      ];
      for (const handler of handlers) {
        if (options.interactive) handler?.enable();
        else handler?.disable();
      }
    }
  }

  /** Recompute size after the container becomes visible or changes shape. */
  invalidate(): void {
    this.map?.invalidateSize({ animate: false });
  }

  /**
   * Where the map is actually looking, which stops matching the configured
   * position the moment the user pans. Anything acting on what the user can
   * currently see has to ask this rather than trusting the config.
   */
  getCentre(): { lat: number; lon: number } | null {
    if (!this.map) return null;
    const centre = this.map.getCenter();
    return { lat: centre.lat, lon: centre.lng };
  }

  /**
   * Outline candidate buildings on the map, labelled and clickable.
   *
   * Every returned building is drawn, not just the chosen one, so the user can
   * point at their own house instead of relying on the configured coordinate
   * landing inside the right polygon.
   */
  setFootprints(
    footprints: FootprintLayer[],
    selectedIndex: number,
    onSelect?: (index: number) => void,
  ): void {
    if (!this.map) return;

    if (this.footprints) {
      this.map.removeLayer(this.footprints);
      this.footprints = undefined;
    }
    if (footprints.length === 0) return;

    const group = L.layerGroup();

    footprints.forEach((footprint, index) => {
      if (footprint.ring.length < 3) return;
      const selected = index === selectedIndex;

      // Styled by CSS class, not by Leaflet's `color` option: Leaflet writes
      // that into the SVG `stroke` presentation attribute, where
      // `var(--primary-color)` is not a valid value and renders as black.
      const polygon = L.polygon(footprint.ring, {
        className: selected ? 'building-footprint selected' : 'building-footprint',
        weight: selected ? 2 : 1,
        interactive: true,
      });

      if (footprint.label) {
        polygon.bindTooltip(footprint.label, {
          permanent: true,
          direction: 'center',
          className: selected ? 'building-label selected' : 'building-label',
        });
      }

      if (onSelect) polygon.on('click', () => onSelect(index));
      group.addLayer(polygon);
    });

    this.footprints = group;
    group.addTo(this.map);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.map?.remove();
    this.map = undefined;
    this.layer = undefined;
    this.footprints = undefined;
    this.current = undefined;
  }

  private applyTiles(tiles: TileSpec, attribution: boolean): void {
    if (!this.map) return;
    if (this.layer) this.map.removeLayer(this.layer);

    this.layer = L.tileLayer(tiles.url, {
      attribution: attribution ? tiles.attribution : '',
      maxZoom: tiles.maxZoom,
      // `{r}` only resolves to `@2x` when retina detection is on, and only
      // providers that advertise it get it.
      detectRetina: tiles.url.includes('{r}'),
      crossOrigin: true,
    });
    this.layer.addTo(this.map);
  }
}

function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MAX_ZOOM - 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom)));
}
