/**
 * `ha-form` schemas for the visual editor. Pure data, kept out of `editor.ts`
 * so it can be tested in the node environment the rest of the suite runs in.
 *
 * The load-bearing detail here is which groups carry a `name` and which do not,
 * because that alone decides where a value is written in the config.
 * `ha-form`'s getValue is:
 *
 *   obj ? (!item.name || item.flatten ? obj : obj[item.name]) : undefined
 *
 * and its change handler mirrors it. So a group **with** a name scopes its
 * children to `config[name]`, and a group **without** one passes the whole
 * object through, letting a single panel hold fields from several config keys.
 * Adding a `name` to a pass-through group does not fail loudly; it quietly
 * starts writing settings one level too deep. See editor-schema.test.ts.
 */

import type { AirflowMapCardConfig } from '../types';

export type RowKind = 'source' | 'entity' | 'template';

/**
 * The typed-in equivalents of what the map sets by dragging. Bound to their
 * config slices directly rather than through the main form, because one panel
 * holds fields from two different config keys.
 */
export const EXACT_LOCATION_SCHEMA = [
  {
    type: 'grid',
    schema: [
      { name: 'latitude', selector: { number: { mode: 'box', step: 'any' } } },
      { name: 'longitude', selector: { number: { mode: 'box', step: 'any' } } },
    ],
  },
  { name: 'zoom', selector: { number: { min: 1, max: 19, mode: 'slider' } } },
];

export const EXACT_HOUSE_SCHEMA = [
  {
    name: 'facade_bearing',
    // Step matches the picker's nudge buttons. A whole-degree slider silently
    // rounded away the fractional bearing detection produces.
    selector: {
      number: { min: 0, max: 359.9, step: 0.1, mode: 'slider', unit_of_measurement: '°' },
    },
  },
  {
    name: 'facade_bearing_entity',
    selector: { entity: { domain: ['input_number', 'sensor', 'number'] } },
  },
];

/**
 * Fields that do nothing in the current mode are left out rather than shown
 * inert. A control that is visible, editable and ignored is worse than one that
 * is absent: it invites you to set it and then silently disagrees with whatever
 * is actually deciding the outcome.
 */
export function cardSchema(config: Partial<AirflowMapCardConfig> = {}): unknown[] {
  const airflowMode = config.airflow?.mode ?? 'compute';

  return [
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
            {
              name: 'speed_unit',
              selector: {
                select: {
                  mode: 'dropdown',
                  options: [
                    { value: 'source', label: 'As the source reports it' },
                    { value: 'km/h', label: 'km/h' },
                    { value: 'm/s', label: 'm/s' },
                    { value: 'mph', label: 'mph' },
                    { value: 'kn', label: 'knots' },
                    { value: 'bft', label: 'Beaufort' },
                  ],
                },
              },
            },
          ],
        },
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
        ...(airflowMode === 'entity' ? [{ name: 'entity', selector: { entity: {} } }] : []),
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
  ];
}

export function rowSchema(kind: RowKind): unknown[] {
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
      // Pass-through group, so these stay flat on the row rather than nesting
      // under an `appearance` key. Seven styling fields per row, always
      // expanded, meant four rows put twenty-eight controls on screen before
      // you could reach the Add button.
      type: 'expandable',
      title: 'Appearance',
      icon: 'mdi:tune',
      schema: [
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
      ],
    },
  ];
}

/** Just the card title, which the Appearance panel renders above the toggles. */
export const TITLE_SCHEMA = [{ name: 'title', selector: { text: {} } }];

/**
 * One boolean, rendered flat in the Appearance panel above its own settings.
 *
 * A toggle always reads the way it is labelled: on means the thing is on. The
 * arrow used to be controlled by `arrow.hide`, so ticking a box turned the
 * arrow off, which is the sort of thing you only misread once but misread every
 * time after.
 */
export const SHOW_SCHEMA = [{ name: 'show', selector: { boolean: {} } }];

/**
 * The colour options, shared by the arrow and the flow so the two cannot drift
 * apart in either the labels or the values.
 */
const COLOR_MODE_OPTIONS = [
  { value: 'airflow', label: 'By airflow direction' },
  { value: 'speed', label: 'By wind speed' },
  { value: 'fixed', label: 'Fixed colour' },
];

function colorModeField(name = 'color_mode') {
  return { name, selector: { select: { mode: 'dropdown', options: COLOR_MODE_OPTIONS } } };
}

export function flowSettingsSchema(flow: { color_mode?: string } = {}): unknown[] {
  return [
    {
      type: 'grid',
      schema: [
        {
          name: 'opacity',
          selector: { number: { min: 0.1, max: 1, step: 0.05, mode: 'slider' } },
        },
        {
          name: 'speed',
          selector: { number: { min: 0.25, max: 3, step: 0.25, mode: 'slider' } },
        },
        colorModeField(),
        ...(flow.color_mode === 'fixed' ? [{ name: 'color', selector: { text: {} } }] : []),
      ],
    },
  ];
}

export function arrowSettingsSchema(arrow: Partial<AirflowMapCardConfig['arrow']> = {}): unknown[] {
  const colorMode = arrow?.color_mode ?? 'airflow';
  return [
    {
      type: 'grid',
      schema: [
        { name: 'size', selector: { number: { min: 20, max: 400, mode: 'slider' } } },
        colorModeField(),
        ...(colorMode === 'fixed' ? [{ name: 'color', selector: { text: {} } }] : []),
      ],
    },
  ];
}

export function mapSchema(map: Partial<AirflowMapCardConfig['map']> = {}): unknown[] {
  // `tile_url` overrides the basemap preset wherever it is set, so it is only
  // offered under the Custom option. Configs written before that option existed
  // keep it visible, otherwise the field that is winning would be unreachable.
  const showTileUrl = map?.tiles === 'custom' || Boolean(map?.tile_url);
  return [
    {
      type: 'grid',
      schema: [
        {
          name: 'tiles',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'auto', label: 'Follow the dashboard theme' },
                { value: 'osm', label: 'OpenStreetMap (light)' },
                { value: 'carto-light', label: 'CARTO light' },
                { value: 'carto-dark', label: 'CARTO dark' },
                { value: 'custom', label: 'Custom tile URL' },
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
    ...(showTileUrl ? [{ name: 'tile_url', selector: { text: {} } }] : []),
  ];
}
