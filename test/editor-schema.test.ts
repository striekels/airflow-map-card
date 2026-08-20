import { describe, expect, it } from 'vitest';

import {
  FLOW_SETTINGS_SCHEMA,
  SHOW_SCHEMA,
  arrowSettingsSchema,
  cardSchema,
  mapSchema,
  rowSchema,
} from '../src/editor/schema';

interface Item {
  name?: string;
  flatten?: boolean;
  type?: string;
  title?: string;
  schema?: Item[];
  selector?: unknown;
}

/**
 * Where `ha-form` would write each leaf, derived by the same rule the real
 * component uses: a group contributes its `name` to the path unless it has no
 * name (or is flattened), in which case it passes the data object straight
 * through.
 *
 * This is the whole point of the test. Grouping settings that live under
 * different config keys behind one panel depends on those groups being
 * nameless, and adding a name does not throw or warn; it just starts writing
 * to `config.appearance.arrow.size` instead of `config.arrow.size`, which the
 * card reads as unset.
 */
function leafPaths(schema: Item[], prefix: string[] = []): Record<string, string[][]> {
  const found: Record<string, string[][]> = {};

  for (const item of schema) {
    const passthrough = !item.name || item.flatten;
    const path = passthrough ? prefix : [...prefix, item.name!];

    if (item.schema) {
      for (const [leaf, paths] of Object.entries(leafPaths(item.schema, path))) {
        found[leaf] = [...(found[leaf] ?? []), ...paths];
      }
    } else if (item.name) {
      found[item.name] = [...(found[item.name] ?? []), path];
    }
  }

  return found;
}

describe('cardSchema', () => {
  const paths = leafPaths(cardSchema({ airflow: { mode: 'entity' } }) as Item[]);

  it('holds only the two groups the main form still owns', () => {
    // Appearance left this schema when its toggles had to sit flat above their
    // own settings, which `ha-form` cannot express: writing into a nested key
    // requires being inside a group of that name, and that buries the switch.
    const titles = (cardSchema() as Item[]).map((item) => item.title);
    expect(titles).toEqual(['Wind source', 'Airflow classification']);
  });

  it('scopes wind and airflow settings correctly where a name is reused', () => {
    expect(paths.entity).toEqual([
      ['wind', 'entity'],
      ['airflow', 'entity'],
    ]);
    expect(paths.weak_below).toEqual([['airflow', 'weak_below']]);
  });

  it('offers the airflow entity only when the mode reads from one', () => {
    const compute = leafPaths(cardSchema({ airflow: { mode: 'compute' } }) as Item[]);
    expect(compute.entity).toEqual([['wind', 'entity']]);
  });

  it('has no group for anything the hand-rendered panels own', () => {
    const names = (cardSchema() as Item[]).map((item) => item.name);
    for (const owned of ['location', 'house', 'arrow', 'map', 'flow', 'title']) {
      expect(names, owned).not.toContain(owned);
    }
  });
});

describe('the show toggles', () => {
  it('are a single positive boolean, so on means on', () => {
    // `arrow.hide` inverted this: ticking a box turned the arrow off. Every
    // toggle now reads the way it is labelled.
    expect(SHOW_SCHEMA).toHaveLength(1);
    expect(SHOW_SCHEMA[0].name).toBe('show');
    expect(SHOW_SCHEMA[0].selector).toEqual({ boolean: {} });
  });

  it('writes flat into whichever slice it is bound to', () => {
    expect(leafPaths(SHOW_SCHEMA as Item[])).toEqual({ show: [['show']] });
  });
});

describe('arrowSettingsSchema', () => {
  const named = (arrow: Parameters<typeof arrowSettingsSchema>[0]) =>
    Object.keys(leafPaths(arrowSettingsSchema(arrow) as Item[]));

  it('offers size and colour mode, and no hide', () => {
    expect(named({})).toEqual(expect.arrayContaining(['size', 'color_mode']));
    expect(named({})).not.toContain('hide');
  });

  it('offers a fixed colour only when the mode uses one', () => {
    expect(named({ color_mode: 'fixed' })).toContain('color');
    expect(named({ color_mode: 'airflow' })).not.toContain('color');
    expect(named({})).not.toContain('color');
  });
});

describe('FLOW_SETTINGS_SCHEMA', () => {
  it('offers the two things that were asked for by hand', () => {
    // Opacity and speed are here because both were tuned by hand more than
    // once. Nothing else about the flow has ever needed changing.
    expect(Object.keys(leafPaths(FLOW_SETTINGS_SCHEMA as Item[]))).toEqual(['opacity', 'speed']);
  });
});

describe('mapSchema', () => {
  const named = (map: Parameters<typeof mapSchema>[0]) =>
    Object.keys(leafPaths(mapSchema(map) as Item[]));

  it('offers a custom tile URL only when the basemap is set to custom', () => {
    expect(named({ tiles: 'custom' })).toContain('tile_url');
    expect(named({ tiles: 'osm' })).not.toContain('tile_url');
  });

  it('keeps a tile URL reachable when an older config already set one', () => {
    expect(named({ tiles: 'osm', tile_url: 'https://example.com/{z}/{x}/{y}.png' })).toContain(
      'tile_url',
    );
  });
});

describe('rowSchema', () => {
  it('keeps styling fields flat on the row behind the Appearance panel', () => {
    const paths = leafPaths(rowSchema('source') as Item[]);
    for (const field of ['name', 'icon', 'prefix', 'suffix', 'unit', 'precision', 'size']) {
      expect(paths[field], field).toEqual([[field]]);
    }
  });

  it('collapses styling behind one group, leaving the row kind visible', () => {
    for (const kind of ['source', 'entity', 'template'] as const) {
      const top = rowSchema(kind) as Item[];
      const groups = top.filter((item) => item.type === 'expandable');
      expect(groups.map((item) => item.title)).toEqual(['Appearance']);
      // The kind selector and its one or two dependent fields stay in view.
      expect(top.filter((item) => item.selector).length).toBeLessThanOrEqual(3);
    }
  });

  it('offers the fields belonging to each row kind', () => {
    expect(Object.keys(leafPaths(rowSchema('source') as Item[]))).toContain('source');
    expect(Object.keys(leafPaths(rowSchema('entity') as Item[]))).toContain('attribute');
    expect(Object.keys(leafPaths(rowSchema('template') as Item[]))).toContain('template');
  });
});
