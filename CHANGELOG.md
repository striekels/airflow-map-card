# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Changes land under **Unreleased** as they are made. Versions are cut deliberately, not once
per change; see the release steps in [CLAUDE.md](CLAUDE.md).

## [Unreleased]

_Nothing yet._

## [0.3.4] — 2026-08-15

### Changed

- **The editor's map is always light, and the light/dark toggle added in 0.3.2 is gone.**
  That map exists to align a line against a roof edge, and the light basemap renders building
  outlines with far more contrast than the dark one, so there was nothing to choose between.
  One fewer control beats a control nobody needs to touch.

  The card's own basemap is unaffected and still follows `map.tiles`.

## [0.3.3] — 2026-08-15

### Fixed

- **The saved card always used a light basemap, and the theme setting appeared to do
  nothing.** `map.tiles` and `map.theme` were two controls over one outcome, and a pinned
  `tiles` value silently overrode the theme. Selecting a basemap in the editor was also a
  one-way door: the dropdown had no value meaning "follow the theme", so once a preset was
  chosen the theme control was inert with no way back.

  `tiles` now accepts `auto`, which is the default and means follow the dashboard, and the
  editor offers it as the first option. The two dropdowns are collapsed into one: `theme` is
  deprecated, still honoured while `tiles` is `auto`, and no longer shown in the editor.

  If your card is stuck light, set the basemap to **Follow the dashboard theme**.

### Notes

`src/map/tiles.ts` had no tests despite deciding what every user sees. It has seven now,
including one pinning the interaction that caused this.

## [0.3.2] — 2026-08-15

### Added

- **A light/dark toggle for the editor's map.** It followed the Home Assistant theme with no
  way to override it, but a dark dashboard does not make a dark basemap the easier one to
  align a roofline against. The toggle swaps the tile layer outright rather than filtering
  it, and affects the editor only: the card's own basemap is still set by `map.theme` and
  `map.tiles`.

## [0.3.1] — 2026-08-15

### Fixed

- **Detection failed inside Home Assistant with an unhelpful CORS error.** The lookup was a
  POST; Overpass answers a POST whose content type it will not accept with `406 Not
  Acceptable` **and no `Access-Control-Allow-Origin` header**, so the browser reports an
  opaque CORS failure rather than the rejection it actually is. The card then said it could
  not reach OpenStreetMap, which sent the diagnosis in the wrong direction entirely.

  Reproduced directly against the service: POST as `text/plain` gives 406 with no CORS
  header, POST as form-urlencoded gives 200, and GET gives 200. The lookup is now a GET with
  the query in the URL. A GET has no body, so there is no content type to negotiate and no
  preflight, which removes the whole class of failure. The query is a couple of hundred
  characters, far short of any URL length limit.

  The `Origin` header was ruled out along the way: Overpass returns
  `Access-Control-Allow-Origin: *` for a plain-HTTP origin such as `http://ha.local:8123`.

## [0.3.0] — 2026-08-15

### Fixed

- **Detect ignored where you had panned the map.** The picker's map is pannable, but
  detection ran at the configured coordinates rather than the map centre, so scrolling to a
  different street and pressing Detect silently re-analysed the original position. It now
  reads the map centre, which is the only defensible behaviour for a control sitting under a
  map the user can move.

### Changed

- **Detection now moves the card's position to the building it settled on.** This is
  required for the fix above to make sense: detecting after panning would otherwise leave
  the card showing one place while its facade angle described another. Clicking a different
  building moves it too.

  Between them, these turn the picker into the location picker the card has been missing:
  pan to your house, press Detect, and both the position and the facade angle are set.

- **A toggle beside the bearing readout hides the guide.** Its grab handle spans the full
  width of the map, which is what makes the line sightable and also what puts it in the way
  of every pan. Hiding it is quicker than fighting it.

### Removed

- **The alignment guide is gone from the card**, along with `house.show_guide` and
  `house.drag_to_align`. Alignment is a setup activity: the guide belongs in the editor,
  where the result can be saved, and a saved dashboard has no use for it. Existing configs
  carrying either option keep working; the options are simply ignored.

  This removes the whole drag-on-card path with it — around 200 lines of interaction,
  persistence and styling, and 4 kB off the bundle. That path only ever worked when
  `facade_bearing_entity` pointed at a settable entity, which made it a narrow feature with
  a wide failure surface.

  `facade_bearing_entity` remains, now purely as a way to read the bearing from an entity.

## [0.2.5] — 2026-08-15

### Changed

- **Detection now retries and caches.** The public Overpass endpoint is intermittently
  overloaded rather than down: measured directly, a request returning HTTP 504 succeeded on
  the next attempt seconds later. Lookups now retry twice with backoff, and a successful
  result is cached per position so pressing Detect again costs the service nothing.
- The two failure messages were saying the same thing for different problems. A busy service
  now says so and mentions that it retried; a `fetch` that throws before any response says
  the browser could not connect to `overpass-api.de`, which points at a content-security
  policy, DNS, or an extension rather than at OpenStreetMap being down.

### Notes

No mirror endpoints are shipped, and that is deliberate. The obvious candidates were tested:
`overpass.osm.ch` only carries Switzerland (five buildings for Zurich, zero for Brussels),
and two others were unreachable. Shipping an endpoint that has not been verified is worse
than retrying one that has.

## [0.2.4] — 2026-08-15

### Changed

- The rotate buttons in the facade picker now step **0.1°** instead of 1°, for the last
  fraction of a degree once dragging has got you close. One decimal is what the config
  stores, so it is the smallest step that survives a round trip.
- The picker's help text is down to one line about rotating. It had grown into a paragraph
  documenting every modifier key, which is not what someone reads while dragging a line onto
  a roof. The three levels of adjustment are in the README instead.

## [0.2.3] — 2026-08-15

### Fixed

- **The bearing chip ignored the dashboard theme**, staying a white pill with light,
  near-illegible text on a dark dashboard. It read `--ha-card-background` with a hard-coded
  white fallback, but that variable is frequently undefined at document level: Home
  Assistant's own `ha-card` resolves `var(--ha-card-background, var(--card-background-color,
  white))`, and a theme setting only the latter fell straight through to the literal.

  All surface colours now resolve through a single `--airflow-surface` variable using the
  same chain `ha-card` itself uses. This also affected the map attribution bar, the editor's
  bearing readout and the house-number labels, which had the identical fallback.

## [0.2.2] — 2026-08-14

### Fixed

- **The map never rendered inside Home Assistant.** Leaflet reads its container's computed
  position on init and, seeing `static`, pins `position: relative` as an inline style. It
  reads `static` whenever the card first renders while still detached from the document,
  which is what Home Assistant's card pipeline does. Under `position: relative` the
  container's `inset: 0` stretches nothing, so the map collapsed to zero height and looked
  identical to a map that had failed to load.

  The container's position is now declared `!important` — the only thing that outranks a
  third-party inline style — and also set inline, since Leaflet checks `el.style.position`
  before the computed value and leaves an already-positioned element alone.

  The earlier 0.1.1 fix, which replaced `aspect-ratio` with a padding spacer, addressed a
  real robustness problem in the wrapper but was not the cause of the blank map. The
  wrapper had been sizing correctly all along.

- **Editor buttons rendered as plain text.** Home Assistant is retiring the Material Web
  Components; where `mwc-button` is no longer registered it falls back to unstyled inline
  text, so "Detect from OpenStreetMap", "Search", "Use home" and "Add row" did not look
  clickable. All four are now native buttons styled from Home Assistant theme variables,
  with no dependency on frontend internals.

## [0.2.1] — 2026-08-11

### Added

- **Click your house.** Detection now draws every building it found, labelled with its house
  number, and any of them can be clicked to use that outline. Previously the choice came
  solely from whether the configured coordinate happened to fall inside a polygon, which is
  the one part of setup a user cannot see or check.
- Clicking a building is treated as better information than the coordinate, so it does not
  raise the "not inside any mapped building" warning that an automatic fallback does.

## [0.2.0] — 2026-08-11

Facade alignment reworked around the observation that nobody should be typing an angle.

### Added

- **Detect from OpenStreetMap.** The editor reads the building outline at the configured
  position, works out which wall faces the nearest street, and sets `facade_bearing` from
  the geometry. Validated against a real semi-detached house whose owner had hand-tuned the
  value to 166.52°: detection returns 166.97° with no input beyond the coordinates.
- **Building outline drawn on the editor map**, so the chosen wall can be confirmed rather
  than trusted. This is what catches the common mistake of aligning to a side wall.
- **Snapping.** With an outline loaded, a dragged guide snaps to the nearest wall normal
  within 8°, giving the building's real angle instead of an eyeballed one. Hold Shift to
  drag freely.
- **`airflow-facade-picker`**, an editor-side map with the guide, detection, snapping,
  keyboard nudges and a live readout. Alignment now happens where it can be saved.

### Changed

- Dragging the guide on the live card now requires `facade_bearing_entity` to point at a
  settable entity. Previously it would accept a drag it could not persist and ask the user
  to copy a number by hand; that dead end is gone rather than merely signposted.

## [0.1.3] — 2026-08-11

### Added

- The facade guide's wall line can be dragged on the map to set `facade_bearing`, which
  removes the slider from the alignment loop entirely. Grabbing either end gives the same
  result: the normal nearest the current bearing is chosen, so dragging past a right angle
  never swaps front and back.
- Keyboard operation for the same control (`role="slider"`, arrow keys for 1°, Shift for
  5°), so alignment is not mouse-only.
- A live bearing readout while the guide is shown.
- `house.drag_to_align` to turn the interaction off.

### Notes

A card cannot write its own Lovelace config. A dragged bearing is persisted with
`set_value` when `facade_bearing_entity` points at an `input_number` or `number`; otherwise
it is held for the session and the readout says it is unsaved rather than implying
otherwise.

## [0.1.2] — 2026-08-11

### Changed

- Facade guide reworked for alignment rather than decoration: the wall line is now a
  dashed hairline spanning the full width of the map instead of a thick line stopping at
  the guide circle. Alignment error is easiest to judge at the ends of a long line, and
  the dashes keep the roofline visible underneath. Rim arc, chevron and sector fills all
  toned down to match.

## [0.1.1] — 2026-08-11

### Fixed

- Map rendered as an empty rectangle inside Home Assistant's sections grid. The map area
  took its height from the `aspect-ratio` property, which collapses to zero on a flex item
  whose height is still being resolved; Leaflet then measured a 448x0 viewport and drew
  nothing. Height now comes from a percentage-padding spacer, which resolves against the
  element's own width in any layout context.
- A failed map now reports the error on the card face instead of leaving a blank area that
  is indistinguishable from a sizing bug.

## [0.1.0] — 2026-08-11

First working version.

### Added

- Live Leaflet map of a configurable position, with OpenStreetMap and CARTO basemaps and
  automatic light/dark selection.
- Wind arrow driven by a `weather.*` entity, with optional per-field `sensor.*` overrides
  for speed, bearing and gust. Bearings accept degrees or compass text (`NNW`).
- Airflow classification (Front → Back, Back → Front, Sideways, Weak wind) computed from
  the wind bearing and the house's facade bearing, with configurable thresholds and labels.
  Can also take its label from an existing sensor.
- Facade alignment guide overlay for tuning `facade_bearing` against the building on the
  map, showing the front wall line, the front-facing side, and the through-flow sectors.
- Configurable info rows: built-in values, entity states or attributes, and Jinja templates
  rendered over the websocket API.
- Visual editor covering every option, with address search (Nominatim, on submit only) and
  a reorderable row list.
- English and Dutch strings.
- Accessibility: the arrow carries a spoken description of the current wind and airflow,
  rows are keyboard-operable, and transitions respect `prefers-reduced-motion`.

[unreleased]: https://github.com/striekels/airflow-map-card/compare/v0.3.4...HEAD
[0.3.4]: https://github.com/striekels/airflow-map-card/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/striekels/airflow-map-card/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/striekels/airflow-map-card/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/striekels/airflow-map-card/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/striekels/airflow-map-card/compare/v0.2.5...v0.3.0
[0.2.5]: https://github.com/striekels/airflow-map-card/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/striekels/airflow-map-card/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/striekels/airflow-map-card/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/striekels/airflow-map-card/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/striekels/airflow-map-card/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/striekels/airflow-map-card/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/striekels/airflow-map-card/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/striekels/airflow-map-card/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/striekels/airflow-map-card/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/striekels/airflow-map-card/releases/tag/v0.1.0
