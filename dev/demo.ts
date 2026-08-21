import '../src/airflow-map-card';
import { mockHass } from './mock-hass';
import type { AirflowMapCardConfig } from '../src/types';

/**
 * The building every screenshot is taken of: the Rietveld Schroder House in
 * Utrecht.
 *
 * A deliberate choice, not a placeholder. It is a museum rather than anyone's
 * home, so no screenshot of it can leak an address, and it is a real house on
 * a real street, so the outline, the facade angle and the neighbours all look
 * like what a user will actually see. The footprint is the genuine OpenStreetMap
 * way, which is also what the editor's Detect button would return.
 */
const HOUSE = {
  latitude: 52.085327,
  longitude: 5.147578,
  // Outward normal of the long street-facing wall.
  facadeBearing: 118.2,
  footprint: [
    [52.085307, 5.147492],
    [52.085386, 5.147561],
    [52.085376, 5.147589],
    [52.085379, 5.147592],
    [52.085375, 5.147602],
    [52.085374, 5.147601],
    [52.085354, 5.14766],
    [52.085297, 5.147607],
    [52.085295, 5.147613],
    [52.085293, 5.147611],
    [52.085297, 5.1476],
    [52.085277, 5.147582],
    [52.085294, 5.147535],
    [52.085292, 5.147533],
  ] as Array<[number, number]>,
};

interface Scene {
  id: string;
  label: string;
  note: string;
  bearing: number;
  speed: number;
  dark: boolean;
  arrow: boolean;
  flow: boolean;
}

/**
 * One scene per thing worth showing. Wind directions are chosen against the
 * facade above, so each card lands in the bucket its label claims: a screenshot
 * that says "sideways" and renders green is worse than no screenshot.
 */
const SCENES: Scene[] = [
  {
    id: 'front-to-back',
    label: 'Front to back',
    note: 'Wind onto the front wall, flow only.',
    bearing: 118,
    speed: 24,
    dark: false,
    arrow: false,
    flow: true,
  },
  {
    id: 'sideways',
    label: 'Sideways',
    note: 'Across the house, arrow and flow together.',
    bearing: 208,
    speed: 19,
    dark: false,
    arrow: true,
    flow: true,
  },
  {
    id: 'back-to-front',
    label: 'Back to front',
    note: 'Dark dashboard, arrow only.',
    bearing: 298,
    speed: 31,
    dark: true,
    arrow: true,
    flow: false,
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

function config(scene: Scene): AirflowMapCardConfig {
  return {
    type: 'custom:airflow-map-card',
    location: { latitude: HOUSE.latitude, longitude: HOUSE.longitude, zoom: 18 },
    house: { facade_bearing: HOUSE.facadeBearing, footprint: HOUSE.footprint },
    wind: { entity: 'weather.home' },
    arrow: { show: scene.arrow, size: 130 },
    flow: { show: scene.flow },
    map: { interactive: false },
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
