# CLAUDE.md

Guidance for Claude Code (and anyone else) working in this repository.

## What this is

A single Home Assistant Lovelace card, distributed through HACS as one self-contained
JavaScript file. There is no backend, no Python, no custom integration. Everything the card
needs comes from entities that already exist in the user's instance.

## Commands

```bash
npm install
npm run dev        # Vite dev server: card harness at /, facade picker at /picker.html
npm test           # vitest, ~96 tests
npm run lint
npm run build      # tsc --noEmit, then esbuild -> dist/airflow-map-card.js
```

Always run `npm test` and `npx tsc --noEmit` before committing. CI runs typecheck, lint,
tests and build on every push.

## Architecture

```
src/
  airflow-map-card.ts   Card element: config validation, layout, hass diffing
  editor.ts             Visual editor (ha-form) + address search + row list
  editor/facade-picker.ts  Map, building detection, drag-to-align. Editor only.
  map/                  Leaflet lifecycle, tile presets, aspect-ratio maths
  overlay/              Wind arrow and facade guide, as pure render functions
  data/                 All logic. Pure and unit-tested wherever possible.
```

The rule that matters: **`src/data/` holds the thinking, everything else holds the drawing.**
Compass and geometry maths live in `data/bearing.ts` and `data/footprint.ts` and nowhere
else.

## Conventions that are not obvious

**Bearings.** `data/bearing.ts` owns every trigonometric operation in the project. Home
Assistant's `wind_bearing` is the direction wind comes *from*; the arrow points the way air
travels. `facade_bearing` is the outward normal of the front wall. A sign error here produces
an answer that looks entirely plausible and is 180° wrong, which is why the module is
isolated and exhaustively tested. Do not do angle arithmetic anywhere else.

**A card cannot write its own configuration.** This is the constraint that shapes the whole
editor design. Anything that needs to persist a value belongs in `editor/`, which can fire
`config-changed`. The card may only write to entities, via `callService`.

**`hass` is reassigned on every state change in the system.** The card diffs the entities its
config actually references before re-rendering (`_trackedStateChanged`). Do not add a plain
`@state() hass`.

**Leaflet is bundled, not borrowed.** Home Assistant ships its own Leaflet, but through
private internals with no compatibility guarantee. Forty kilobytes is cheaper than a card
that breaks every few releases.

**Leaflet styling goes through CSS classes, never the `color` option.** Leaflet writes that
into the SVG `stroke` presentation attribute, where `var(--primary-color)` is not a valid
value and silently renders black. Use `className` and style it in CSS.

**Layout: percentage padding, not `aspect-ratio`.** The map's height comes from a
`::before` spacer. `aspect-ratio` on a flex item whose height is still being resolved
collapses to zero inside Home Assistant's sections grid; that shipped once and rendered a
blank card.

**External lookups are editor-only and user-triggered.** Nominatim for addresses, Overpass
for building outlines. One request per button press, result stored in the config as plain
numbers. Nothing is ever fetched while the card is running. Do not add runtime lookups.

**Never put backticks in a `css` tagged template**, including inside comments. They terminate
the template literal.

## Testing

Pure logic is well covered; rendering is not. Two gaps have each already produced a shipped
bug:

- No tests for how the card behaves inside real container layouts.
- No tests for the editor at all.

`test/footprint.test.ts` uses real OpenStreetMap geometry, shifted in longitude so it does
not identify a home. The shift is longitude-only and applied uniformly, so every derived
angle is numerically identical to the original. If you regenerate that fixture, preserve
that property.

## Style

- TypeScript strict, no `any` in new code without reason.
- Prettier and ESLint are configured; run them.
- Comments explain *why*, especially where the code looks odd. Most of the odd-looking code
  here is odd because of a specific bug; say which.
- Conventional Commits.
- No em dashes in generated text.

## Releasing

Versions must agree in three places: `package.json`, `CARD_VERSION` in `src/const.ts`, and
the git tag. The release workflow enforces this and refuses to publish a mismatch. Tagging
`v*` builds the bundle and attaches it to a GitHub release, which is what HACS downloads.

## Pending decisions

See [BACKLOG.md](BACKLOG.md). Section 0 is the current priority list.
