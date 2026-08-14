# Backlog

Prioritised improvements for `airflow-map-card`. Ordered within each section by
value-per-effort. Items marked **bug** are defects in shipped behaviour, not wishes.

---

## 0. Next up

Reassessed after the 0.2.x alignment work. These displace the older items below.

### 0.1 Commit the repository — **done**

Committed and pushed to `striekels/airflow-map-card`, currently private. CI passes on a
clean checkout, which is the first confirmation the project builds off this machine.

Still to do before the repository goes public: nothing blocking — the test fixture has been
sanitised (see Distribution) — but the HACS validation job needs a release to validate
against, so tag `v0.2.1` before running it.

### 0.2 Match the road by `addr:street`, not just proximity — **bug in waiting**

`detectFacadeBearing` faces the wall towards the *nearest* road. On a corner plot the
nearest road is frequently the side street, so the detected facade is the side of the house.

OSM already gives us both halves of the fix, in data we are fetching anyway: buildings carry
`addr:street` and roads carry `name`. Prefer a road whose name matches the building's
address, and fall back to nearest only when there is no match. This is a small change to
`detectFacadeBearing` plus passing road names through `parseFootprints`.

Not visible on a straight terrace like the test fixture, which is exactly why it needs
writing down rather than waiting to be noticed.

### 0.3 Buildings mapped as relations are invisible — **bug**

The Overpass query asks for `way(...)["building"]` only. A house mapped as a multipolygon
relation (courtyards, shared walls, complex outlines) returns nothing, and the user is told
"No building mapped here in OpenStreetMap", which is both wrong and unactionable. Add
`relation(...)["building"];` and assemble the outer ring.

### 0.4 Draw the house outline on the card itself

The editor shows the building; the live card does not. Storing the chosen ring in the config
(seven coordinate pairs, trivially small) would let the card draw it faintly with no runtime
lookup, so the arrow reads against the actual shape of the house rather than a generic map.
This is the natural payoff of the detection work and is mostly plumbing —
`MapController.setFootprints` already exists.

### 0.5 The editor has no tests at all

`facade-picker.ts` is now the most intricate component in the project: an async network
call, an abort path, a three-way `auto` / `fallback` / `clicked` state machine that changes
what the user is told, snapping, and map interaction. It has zero coverage. `parseFootprints`
is pure, exported and untested; the picker needs a mocked `fetch` and a DOM environment.

This sits alongside 3.1 (layout regression tests), which is still the single most valuable
testing item and still not done.

### 0.6 Localisation has drifted

Every string added since 0.1.3 is inline English that bypasses `localize.ts`: the picker's
status messages and hint, the bearing chip's "saved" / "not saved", and "Map failed to
load". The Dutch translation is now silently partial. Either route the new strings through
`strings()` or accept that the module is vestigial and remove it — the current halfway state
is the worst option.

### 0.7 Cool down the Detect button

Overpass rate-limits hard: two presses in quick succession return 429 and the friendly
"busy" message. Observed repeatedly during development. Disable the button for a few seconds
after a request so the limit is not discovered by trial.

---

## 1. Facade alignment guide

The guide's job is to let you lay a line along a roofline on a map tile. Everything
here serves that, and the current drawing is tuned for "looks nice" rather than "is
precise".

### 1.1 Thin the guide down — **done in 0.1.2**

Wall line dropped to a 0.6-unit hairline with a 1.6-unit halo, dashed, and extended to
±200 units so it spans the full map (SVG `overflow: visible`, clipped by `.map-wrapper`).
Rim arc 1.8 → 1.2, sector fills 0.2/0.1 → 0.12/0.06, chevron shrunk and moved to the rim.
The `drop-shadow` filter had to go: a filter establishes a region around the bounding box
and would have clipped the overrun.

Original analysis, kept for context — weights in a 100-unit viewBox rendered at roughly
250px (so ~2.5px per unit):

| Element | Now | Rendered | Problem |
|---|---|---|---|
| Wall line | `stroke-width: 2` + `4.2` white halo | ~5px + ~10px halo | The halo alone is wider than a roof ridge at zoom 18. You cannot tell which side of the line the wall is on. |
| Rim arc | `1.8` | ~4.5px | Fine, but competes with the wall line. |
| Chevron | 12 units tall | ~30px | Reads as decoration, not a marker. |

Changes:

- Drop the wall line to a **hairline** (~0.6 units, ~1.5px) with a 1.5-unit halo, so it
  sits *on* the roofline instead of covering it.
- **Extend the wall line edge to edge** across the whole map area rather than stopping at
  the guide circle. A long line is far easier to sight along — misalignment shows up at
  the ends, which is exactly where the current line stops.
- Replace the solid line with a **fine dashed line**, so the map underneath stays visible
  through it.
- Shrink the chevron and move it to sit just outside the rim.
- Drop the sector fills from 0.2/0.1 opacity to roughly 0.12/0.06 — they currently tint
  half the map.

### 1.0 Detect the facade automatically — **done in 0.2.0**

The editor reads the building outline from OpenStreetMap, picks the wall facing the nearest
street, and writes `facade_bearing`. Verified against a real semi-detached house:
detection returns 166.97° where the owner had hand-tuned 166.52°. The outline is drawn on
the editor map, and a dragged guide snaps to wall normals within 8°.

Remaining rough edges:

- Detection needs the location to be *inside* the building. When it is not, the nearest
  building is used and the status says so in red, but a location picker (2.5) would prevent
  the situation instead of reporting it.
- Overpass rate-limits aggressively. Two presses in quick succession get a 429 and the
  friendly "busy" message. A short client-side cooldown on the button would be kinder than
  letting the user discover it.
- Only the nearest road is considered. A corner plot with roads on two sides will pick
  whichever is closer, which is not always the address side.

### 1.2 Drag the guide to set the bearing — **done in 0.1.3, moved into the editor in 0.2.0**

The wall line is a grab handle (transparent 9-unit stroke, `pointer-events: stroke`, so the
rest of the map stays pannable). Keyboard operable via `role="slider"` and arrow keys.

The original plan said "writing `facade_bearing` back to config on release", which turned
out to be impossible: a card cannot write its own Lovelace config, and events from the
edit-dialog preview do not reach the editor element. Persistence therefore goes through
`facade_bearing_entity` (`set_value` on an `input_number`/`number`); without one the value
is session-only and the readout says so.

Resolved in 0.2.0: alignment moved into the editor, which *can* write config, so no helper
entity is needed. View-mode dragging now requires a settable `facade_bearing_entity`, so
the "copy this number by hand" dead end no longer exists.

### 1.3 Degree ticks while aligning

The live numeric readout shipped with 1.2. Still open: fine tick marks every 10° around the
rim, so the bearing can be read off the guide without looking at the chip.

### 1.4 Guide styling options

`house.guide_color` and `house.guide_width`, because the right contrast depends entirely on
the basemap under it. Dark tiles want a light guide, OSM standard wants a dark one.

---

## 2. Bugs and design warts

### 2.1 Card-level `tap_action` / `hold_action` do nothing — **bug**

`AirflowMapCardConfig` declares both, the README documents `tap_action`, and
`_trackedEntities()` even tracks the referenced entity, but `handleAction` is only ever
called from a row. Tapping the card or the arrow does nothing. Either wire them up (the
arrow already sets `pointer-events: auto` for this) or remove them from the types and the
docs. Silently ignored config is worse than absent config.

### 2.2 `arrow.anchor` moves the arrow off the house — wart

The map is always centred on `location`, so the default anchor `[50, 50]` puts the arrow
over the house. Moving the anchor slides the arrow away from the thing it describes.
Either make the anchor shift the map centre by the inverse amount, or rename it to
something that admits it is a composition offset.

### 2.3 `resolveTiles` runs twice per render

Called once in `render()` and again in `updated()`. Harmless but sloppy; compute once and
stash it.

### 2.4 `_arrowRotation()` mutates instance state during `render()`

It is idempotent, so it works, but render should not be where the continuous-rotation
accumulator advances. Move to `willUpdate`.

### 2.5 Editor cannot pick a location on the map — now the weakest link

Address search plus lat/lon boxes work, but there is still no draggable pin. This matters
more since 0.2.0: facade detection depends on the configured point falling *inside* your
building, and a pin would make that trivially checkable. The editor already renders a
Leaflet map in the facade picker, so the remaining work is a marker and a drag handler.

Nominatim also only ever takes the first result — no candidate list when the address is
ambiguous, which is precisely when the point lands on the wrong building.

---

## 3. Testing

### 3.1 Layout regression tests — highest value item in this file

The zero-height bug shipped with 60 passing unit tests, because no unit test can catch
"the container computed to 448×0 inside a flex parent". A headless-browser test that
mounts the card in several container contexts (definite height, auto height, flex column,
CSS grid cell, narrow column) and asserts the map has non-zero size and requested tiles
would have caught it before it reached Home Assistant.

This is the test suite the project actually needs. Everything else is well covered.

### 3.2 Bundle smoke test in CI

Import `dist/airflow-map-card.js` in a headless browser and assert
`customElements.get('airflow-map-card')` is defined. Catches build-configuration breakage
of the kind that produced the unminified 390 KB output.

### 3.3 Editor round-trip test

Feed a config through the editor's form schema and assert it comes back unchanged. The
editor writes nested objects via `ha-form` expandables; a typo in one schema `name` would
silently drop a whole section.

---

## 4. Distribution

- **Test fixture sanitised** — done. `test/footprint.test.ts` and `dev/picker.html` no longer
  carry a real home location. The fixture's longitude was shifted uniformly with the latitude
  held constant: the local projection scales longitude by `cos(latitude)` and nothing else, so
  detection still returns 166.9747553 and every wall normal is identical to six decimals.
  Preserve that property if the fixture is ever regenerated.
- Screenshots in the README (light, dark, guide-on). HACS renders the README as the store
  page, so this is the product page.
- Tag `v0.2.1` and confirm the release workflow's version-consistency check actually fires.
- Submit to the HACS default repository once it has been running for a while.
- Add `info.md` for the HACS install panel.

---

## 5. Features

### 5.1 Map rotation so the house front points up

Deferred from the original plan (M6). Leaflet cannot rotate natively; the workaround is a
CSS transform on an oversized container with a counter-rotated attribution layer. Worth it
because a north-up map is not how anyone thinks about their own house.

### 5.2 Multiple facades

A house with cross-ventilation on more than one axis needs more than one `facade_bearing`.
Generalise to a list, and report which pair is currently open to the wind.

### 5.3 Forecast scrubber, and answering the real question

`weather.*` entities expose forecasts. A slider that scrubs the arrow through the next 24
hours answers "when should I open the windows", which is the actual question behind this
card — the current card answers "which way is the wind blowing", and leaves the user to do
the last step themselves.

The fuller version combines the airflow bucket with indoor and outdoor temperature (and CO2,
if there is a sensor) into a plain verdict: *good time to ventilate*, *too warm outside*,
*not enough wind*. That is a different and more opinionated card, so it deserves a decision
rather than being slipped in: it changes the product from an instrument into an adviser.

### 5.4 Wind history sparkline

A row type backed by `history` for the last N hours of bearing or speed.

### 5.5 Better gust rendering

The gust arrow at 1.25 scale and 0.35 opacity reads as a shadow. Consider an outline-only
arrow, or a shaded arc showing the gust/lull spread instead of a second arrow.

---

## 6. Smaller polish

- `weak_below` is in the wind source's unit with no conversion. Add an explicit unit
  selector, or convert against `wind_speed_unit`, so switching integrations cannot silently
  change the threshold's meaning.
- Localisation is two hardcoded objects. Move to HA's own translation loading so
  contributors can add languages without touching TypeScript.
- `getGridOptions()` returns fixed rows; derive them from the configured aspect ratio so
  the card lands the right height in the sections grid by default.
- Surface in the editor that an explicit `tiles` preset overrides `theme` — the two
  controls sit next to each other and silently disagree.
- Bundle is 64.6 KB gzipped, 68% Leaflet. Revisit only if it becomes a complaint; using
  HA's bundled Leaflet was rejected deliberately and that call still looks right.
- Version lives in `src/const.ts`, `package.json`, and `CHANGELOG.md`. The release workflow
  checks they agree; generating `const.ts` from `package.json` would remove the check.
