import '../src/airflow-map-card';
import { mockHass } from './mock-hass';
import type { AirflowMapCardConfig } from '../src/types';
import { computeAirflow } from '../src/data/airflow';

const host = document.getElementById('card-host')!;
const card = document.createElement('airflow-map-card') as HTMLElement & {
  hass: unknown;
  setConfig(config: AirflowMapCardConfig): void;
};
host.appendChild(card);

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const out = (id: string) => document.getElementById(id)!;

function config(): AirflowMapCardConfig {
  return {
    type: 'custom:airflow-map-card',
    title: 'Airflow',
    location: { latitude: 51.2194, longitude: 4.4025, zoom: 18 },
    house: {
      facade_bearing: Number(input('facade').value),
      show_guide: input('guide').checked,
    },
    wind: { entity: 'weather.home' },
    airflow: { mode: 'compute', weak_below: 5, sideways_from: 45 },
    arrow: { size: 130, show_gust: input('gust').checked },
    map: { interactive: input('interactive').checked },
    rows: [
      { source: 'airflow', size: 'large' },
      { source: 'speed', name: 'Wind' },
      { source: 'bearing', prefix: 'from', name: false },
      { entity: 'sensor.outside_temperature' },
    ],
  };
}

function render(): void {
  const bearing = Number(input('bearing').value);
  const speed = Number(input('speed').value);
  const facade = Number(input('facade').value);

  out('bearing-out').textContent = `${bearing}°`;
  out('speed-out').textContent = `${speed} km/h`;
  out('facade-out').textContent = `${facade}°`;

  document.body.classList.toggle('dark', input('dark').checked);

  card.setConfig(config());
  card.hass = mockHass({
    bearing,
    speed,
    gust: speed * 1.6,
    darkMode: input('dark').checked,
  });

  const result = computeAirflow({
    windFrom: bearing,
    speed,
    facadeBearing: facade,
    weakBelow: 5,
    sidewaysFrom: 45,
  });
  out('airflow-out').textContent = `bucket=${result.bucket} delta=${result.delta?.toFixed(1)}°`;
}

for (const id of ['bearing', 'speed', 'facade', 'dark', 'interactive', 'gust', 'guide']) {
  input(id).addEventListener('input', render);
}

render();
