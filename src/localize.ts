import type { AirflowBucket } from './data/airflow';

type Strings = {
  airflow: Record<AirflowBucket, string>;
  wind: string;
  from: string;
  gust: string;
  direction: string;
  airflow_label: string;
  no_wind_source: string;
  unknown_entity: string;
  template_error: string;
  aria: (speed: string, direction: string, airflow: string) => string;
};

const en: Strings = {
  airflow: {
    front_to_back: 'Front → Back',
    back_to_front: 'Back → Front',
    sideways: 'Sideways',
    weak: 'Weak wind',
    unknown: 'Unknown',
  },
  wind: 'Wind',
  from: 'from',
  gust: 'Gust',
  direction: 'Direction',
  airflow_label: 'Airflow',
  no_wind_source: 'No wind source configured',
  unknown_entity: 'Entity not found',
  template_error: 'Template error',
  aria: (speed, direction, airflow) =>
    `Wind ${speed} from the ${direction}. Airflow through the house: ${airflow}.`,
};

const nl: Strings = {
  airflow: {
    front_to_back: 'Voor → Achter',
    back_to_front: 'Achter → Voor',
    sideways: 'Zijwaarts',
    weak: 'Zwakke wind',
    unknown: 'Onbekend',
  },
  wind: 'Wind',
  from: 'uit',
  gust: 'Windstoot',
  direction: 'Richting',
  airflow_label: 'Luchtstroom',
  no_wind_source: 'Geen windbron ingesteld',
  unknown_entity: 'Entiteit niet gevonden',
  template_error: 'Template-fout',
  aria: (speed, direction, airflow) =>
    `Wind ${speed} uit het ${direction}. Luchtstroom door het huis: ${airflow}.`,
};

const LANGUAGES: Record<string, Strings> = { en, nl };

export function strings(language?: string): Strings {
  if (!language) return en;
  return LANGUAGES[language.toLowerCase().split('-')[0]] ?? en;
}
