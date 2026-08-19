# CLAUDE.md

Guidance for Claude Code (and anyone else) working in this repository.

## What this is

A single Home Assistant Lovelace card, distributed through HACS as one self-contained
JavaScript file. There is no backend, no Python, no custom integration. Everything the card
needs comes from entities that already exist in the user's instance.

## Commands

```bash
npm install
npm run dev        # Vite dev server: card at /, facade picker at /picker.html,
                   # visual editor at /editor.html
npm test           # vitest, 155 tests
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
  editor/schema.ts      ha-form schemas. Pure data, so they can be tested.
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
Assistant's `wind_bearing` is the direction wind comes _from_; the arrow points the way air
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

**Overpass needs `referrerPolicy: 'origin'`, and nothing local will tell you so.** Its
Apache rejects a browser `User-Agent` with no `Referer`, answering 406 with no
`Access-Control-Allow-Origin`, which the browser reports as an opaque CORS failure. Home
Assistant serves `Referrer-Policy: no-referrer`, so a card is refererless by default;
`User-Agent` cannot be set from a page at all. This reproduces only inside Home Assistant,
never in the dev harness or the tests, which is why `test/overpass.test.ts` asserts the
option is present.

**A nameless `ha-form` group is a pass-through, and that is load-bearing.** `ha-form` decides
nesting from the schema, using

```js
getValue = (obj, item) => (obj ? (!item.name || item.flatten ? obj : obj[item.name]) : undefined);
```

with a matching rule on the way back up. A group **with** a name scopes its children to
`config[name]`; a group **without** one hands the whole object through. That is the only
reason one panel can hold `title`, `arrow` and `map`, which are three different top-level
keys, or why a row's styling fields stay flat on the row.

Adding a `name` to one of those groups does not throw or warn. It quietly starts writing to
`config.appearance.arrow.size`, which the card reads as unset. `test/editor-schema.test.ts`
asserts the resulting paths for exactly this reason.

**Never put backticks in a `css` tagged template**, including inside comments. They terminate
the template literal.

## Testing

Pure logic is well covered; rendering is not. These gaps have each already produced a shipped
bug:

- No tests for how the card behaves inside real container layouts.
- The editor's schemas are tested, but its rendering and event wiring are not.

`dev/ha-stubs.ts` stands in for the Home Assistant frontend elements the editor uses so
`/editor.html` works outside Home Assistant. The `ha-form` stub reproduces the real
component's data semantics deliberately rather than approximating them — an approximation
would hide exactly the nesting mistakes the harness exists to catch. If you change it, copy
the behaviour from the frontend source rather than guessing.

`test/footprint.test.ts` uses real OpenStreetMap geometry, shifted in longitude so it does
not identify a home. The shift is longitude-only and applied uniformly, so every derived
angle is numerically identical to the original. If you regenerate that fixture, preserve
that property.

## Style

- TypeScript strict, no `any` in new code without reason.
- Prettier and ESLint are configured; run them.
- Comments explain _why_, especially where the code looks odd. Most of the odd-looking code
  here is odd because of a specific bug; say which.
- Conventional Commits.
- No em dashes in generated text.

## Branch protection

`main` is governed by a repository **ruleset** (not the older branch-protection API), which
requires a pull request with one code-owner approval and a passing `build` check, and blocks
force pushes and branch deletion.

Two things to know before changing it:

- Only `build` is a required check. The `hacs` job reports as _skipped_ because it runs on
  manual dispatch, and a required check that never runs blocks every merge permanently.
- Repository admins are listed as a bypass actor, so the maintainer can still push directly.
  Unlike the old `enforce_admins` flag, rulesets do not exempt admins implicitly; remove the
  bypass actor and the rules bind everyone, including the owner.

## Releasing

**Do not bump the version as part of an ordinary change, and do not tag one.** Releases are
cut deliberately, when someone decides a set of changes is worth shipping. A version per
change makes the numbers meaningless and buries the releases that mattered.

An ordinary change is therefore: edit, test, write the entry under `## [Unreleased]` in
`CHANGELOG.md`, commit, push. Nothing else.

Releasing, only when explicitly asked for:

1. Move the `## [Unreleased]` entries under a new `## [x.y.z] — date` heading and add the
   compare link at the foot of the file.
2. Set the same version in `package.json` and in `CARD_VERSION` in `src/const.ts`.
3. Commit, then `git tag -a vx.y.z` and push the tag.

The three versions must agree; the release workflow refuses to publish a mismatch. Pushing a
`v*` tag builds the bundle and attaches it to a GitHub release, which is what HACS
downloads.

Unreleased work cannot be tried through HACS. It lists the default branch only for
repositories that have no releases, so once tags exist the version list is tags only, and the
next tag is also the first test on a real instance. Weigh that when choosing a version
number.
