import { describe, expect, it } from 'vitest';

import { cardSchema, rowSchema } from '../src/editor/schema';

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
 * nameless, and adding a name does not throw or warn — it just starts writing
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
  const paths = leafPaths(cardSchema() as Item[]);

  it('keeps the card title at the top level despite living in the Appearance panel', () => {
    expect(paths.title).toEqual([['title']]);
  });

  it('writes arrow and map settings under their own config keys', () => {
    expect(paths.size).toEqual([['arrow', 'size']]);
    expect(paths.show_gust).toEqual([['arrow', 'show_gust']]);
    expect(paths.tiles).toEqual([['map', 'tiles']]);
    expect(paths.tile_url).toEqual([['map', 'tile_url']]);
  });

  it('scopes wind and airflow settings correctly where a name is reused', () => {
    // `entity` appears in both groups; each must land in its own slice.
    expect(paths.entity).toEqual([
      ['wind', 'entity'],
      ['airflow', 'entity'],
    ]);
    expect(paths.weak_below).toEqual([['airflow', 'weak_below']]);
  });

  it('has no group for location or house, which the Where section owns', () => {
    // These were duplicated as form groups while the map above set the same
    // values, so the two could disagree.
    const names = (cardSchema() as Item[]).map((item) => item.name);
    expect(names).not.toContain('location');
    expect(names).not.toContain('house');
  });

  it('exposes exactly the wind, airflow and appearance groups', () => {
    const titles = (cardSchema() as Item[]).map((item) => item.title);
    expect(titles).toEqual(['Wind source', 'Airflow classification', 'Appearance']);
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
