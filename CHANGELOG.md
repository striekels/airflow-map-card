# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/striekels/airflow-map-card/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/striekels/airflow-map-card/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/striekels/airflow-map-card/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/striekels/airflow-map-card/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/striekels/airflow-map-card/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/striekels/airflow-map-card/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/striekels/airflow-map-card/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/striekels/airflow-map-card/releases/tag/v0.1.0
