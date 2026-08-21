import '../src/airflow-map-card';
import { mockHass } from './mock-hass';
import type { AirflowMapCardConfig } from '../src/types';
import { DEMO_HOUSE } from './demo-house';

interface Scene {
  id: string;
  label: string;
  note: string;
  bearing: number;
  speed: number;
  dark: boolean;
  arrow: boolean;
  flow: boolean;
  /** Pins a basemap. Unset follows the card's own default, which is light. */
  tiles?: 'carto-dark';
  /** Output filename, when it differs from the id. */
  file?: string;
}

/**
 * Smaller than the shipped default of 130. At full size the arrow covers the
 * house outline completely, so a screenshot meant to show both showed one.
 */
const ARROW_SIZE = 88;

/**
 * One scene per thing worth showing. Wind directions are chosen against the
 * facade above, so each card lands in the bucket its label claims: a screenshot
 * that says "sideways" and renders green is worse than no screenshot.
 */
const SCENES: Scene[] = [
  {
    id: 'front-to-back',
    label: 'Front to back',
    note: 'The hero shot: arrow, flow and outline together.',
    bearing: 118,
    speed: 24,
    dark: false,
    arrow: true,
    flow: true,
    // The README links this one, and has done since before the gallery
    // existed. Renaming the file would break the image on every fork and in
    // every copy of the page GitHub has already rendered.
    file: 'card',
  },
  {
    id: 'sideways',
    label: 'Sideways',
    note: 'Flow on its own, with the arrow turned off.',
    bearing: 208,
    speed: 19,
    dark: false,
    arrow: false,
    flow: true,
  },
  {
    id: 'back-to-front',
    label: 'Back to front',
    note: 'Dark dashboard on a dark basemap, arrow only.',
    bearing: 298,
    speed: 31,
    dark: true,
    arrow: true,
    flow: false,
    // Pinned, because the card's default basemap is light whatever the
    // dashboard theme. A dark card around a light map reads as a bug in a
    // screenshot even though it is the documented default.
    tiles: 'carto-dark',
  },
  {
    id: 'weak',
    label: 'Weak wind',
    note: 'Below the threshold, so the verdict is grey.',
    bearing: 60,
    speed: 3,
    dark: false,
    arrow: true,
    flow: true,
  },
];

// The capture script reads the list from here rather than repeating it. Two
// copies would drift, and the failure is a screenshot that silently stops
// being regenerated.
(window as unknown as { scenes?: Array<{ id: string; file: string }> }).scenes = SCENES.map(
  (s) => ({ id: s.id, file: s.file ?? s.id }),
);

function config(scene: Scene): AirflowMapCardConfig {
  return {
    type: 'custom:airflow-map-card',
    location: { latitude: DEMO_HOUSE.latitude, longitude: DEMO_HOUSE.longitude, zoom: DEMO_HOUSE.zoom },
    house: { facade_bearing: DEMO_HOUSE.facadeBearing, footprint: DEMO_HOUSE.footprint },
    wind: { entity: 'weather.home' },
    arrow: { show: scene.arrow, size: ARROW_SIZE },
    flow: { show: scene.flow },
    map: { interactive: false, ...(scene.tiles ? { tiles: scene.tiles } : {}) },
    rows: [
      { source: 'airflow', size: 'large' },
      { source: 'speed', name: 'Wind' },
      { source: 'bearing', prefix: 'from', name: false },
      { source: 'gust', name: 'Gusting' },
    ],
  };
}

function card(scene: Scene): HTMLElement {
  const element = document.createElement('airflow-map-card') as HTMLElement & {
    hass: unknown;
    setConfig(config: AirflowMapCardConfig): void;
  };
  element.setConfig(config(scene));
  element.hass = mockHass({
    bearing: scene.bearing,
    speed: scene.speed,
    gust: Math.round(scene.speed * 1.4),
    darkMode: scene.dark,
  });
  return element;
}

/**
 * `?solo=<id>` renders one card alone on a bare page, sized exactly as it will
 * be captured. Cropping a screenshot out of the gallery is how you end up with
 * a stray shadow down one edge, or with the OpenStreetMap credit cut off, which
 * the tile licence requires stay visible.
 */
const solo = new URLSearchParams(location.search).get('solo');
const width = Number(new URLSearchParams(location.search).get('width') ?? 420);

const root = document.getElementById('demo')!;

if (solo) {
  const scene = SCENES.find((s) => s.id === solo);
  if (!scene) {
    root.textContent = `No scene called "${solo}". Try: ${SCENES.map((s) => s.id).join(', ')}`;
  } else {
    document.body.classList.add('solo');
    document.body.classList.toggle('dark', scene.dark);
    const frame = document.createElement('div');
    frame.className = 'card-frame';
    frame.style.width = `${width}px`;
    frame.appendChild(card(scene));
    root.appendChild(frame);
  }
} else {
  for (const scene of SCENES) {
    const figure = document.createElement('figure');
    figure.className = scene.dark ? 'scene dark' : 'scene';

    const frame = document.createElement('div');
    frame.className = 'card-frame';
    frame.style.width = `${width}px`;
    frame.appendChild(card(scene));

    const caption = document.createElement('figcaption');
    caption.innerHTML =
      `<strong>${scene.label}</strong><span>${scene.note}</span>` +
      `<a href="?solo=${scene.id}">capture this one</a>`;

    figure.append(frame, caption);
    root.appendChild(figure);
  }
}
