# airflow-map-card, Implementation Plan

A configurable Home Assistant Lovelace card that renders your house on an OpenStreetMap
basemap and overlays the current wind direction, plus a configurable info footer.

Replaces a hand-built `picture-elements` card backed by a static PNG and `card_mod` CSS.

---

## 1. Decisions (locked)

| Decision    | Choice                                                                              | Why                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Deliverable | **Lovelace card only**, distributed via HACS                                        | No Python backend, no config flow, no HA release-cycle churn. Everything the card needs already exists as entities. |
| Map         | **Live Leaflet + OSM raster tiles**, SVG arrow overlay                              | Sharp at any zoom/DPI, no image regeneration when you move house or change zoom, no server-side tile fetching.      |
| Wind source | **`weather.*` entity attributes** (`wind_bearing`, `wind_speed`, `wind_gust_speed`) | One entity picker covers the common case. Per-field `sensor.*` overrides are supported but optional.                |
| Footer      | **Free-form rows**: any number, each an entity/attribute or a Jinja template        | Matches the flexibility of the current hand-tuned layout without hardcoding fields.                                 |

Non-goals for v1: forecast scrubbing, wind history, multiple houses per card, 3D/terrain,
any server-side component.

---

## 2. Feature-parity target

The current card, restated as config the new card must be able to express:

| Current mechanism                                       | New equivalent                                      |
| ------------------------------------------------------- | --------------------------------------------------- |
| `image: /local/airflow-map.png`                         | `location: {latitude, longitude, zoom}`: live tiles |
| `filter: brightness(0.62) contrast(1.05) saturate(0.7)` | `map.dim` / `map.theme: auto\|light\|dark`          |
| `state-icon` + `rotate({{ bearing }}deg)` in card_mod   | `arrow` block; rotation computed internally         |
| Color by `sensor.window_airflow_direction` state        | `arrow.color_mode: airflow` + threshold table       |
| `opacity: 0.3` when weak/unknown                        | Same threshold table (`weak` bucket)                |
| Three `state-label` elements at hand-tuned `top/left` % | `rows:` list, laid out by flexbox                   |
| `tap_action: more-info` on the arrow                    | `tap_action` / `hold_action` on arrow and each row  |

---

## 3. Configuration schema (target YAML)

```yaml
type: custom:airflow-map-card
title: Airflow

location:
  latitude: 51.2194 # defaults to hass.config.latitude/longitude
  longitude: 4.4025
  zoom: 18 # 1..19
  # `address` is an editor-only convenience; it is geocoded once and
  # written back as latitude/longitude. Never resolved at runtime.

house:
  facade_bearing: 45 # compass direction the front facade faces
  # facade_bearing_entity: input_number.house_facade_bearing   # alternative

wind:
  entity: weather.home
  # per-field overrides, all optional:
  speed_entity: sensor.home_current_wind_speed
  bearing_entity: sensor.home_current_wind_bearing
  gust_entity: sensor.home_current_wind_gust

airflow:
  mode: compute # compute | entity | off
  entity: sensor.window_airflow_direction # when mode: entity
  weak_below: 5 # speed unit-aware; below this => "weak"
  sideways_from: 45 # |angle to facade| >= this => sideways
  labels: # i18n defaults, overridable
    front_to_back: Front → Back
    back_to_front: Back → Front
    sideways: Sideways
    weak: Weak wind

arrow:
  size: 130 # px
  color_mode: airflow # airflow | speed | fixed
  color: '#4caf50' # when fixed
  anchor: [50, 42] # % of card, defaults to map centre
  show_gust: false # optional second, translucent arrow

map:
  theme: auto # auto | light | dark
  interactive: false # lock pan/zoom by default
  tile_url: null # override basemap (self-hosted, Carto, etc.)
  attribution: true # required on by default for OSM tiles

rows:
  - entity: sensor.window_airflow_direction
    size: large # large | normal | small
  - entity: sensor.home_current_wind_speed
    name: Wind
    icon: mdi:weather-windy
  - template: "from {{ state_attr('weather.home','wind_bearing') | round(0) }}°"

tap_action:
  action: more-info
```

Every block is optional. With only `type:` set, the card must render usefully:
HA's home coordinates, the first `weather.*` entity, computed airflow off.

---

## 4. Architecture

```
src/
  airflow-map-card.ts     # LitElement, config validation, layout, hass diffing
  editor.ts               # ha-form visual editor + map location picker
  map/
    leaflet-map.ts        # Leaflet lifecycle, tile layer, theme filter, resize
    tiles.ts              # tile presets + attribution strings
  overlay/
    wind-arrow.ts         # SVG arrow: rotation, size, colour, transitions
  data/
    wind-source.ts        # weather entity | sensor overrides -> {speed, bearing, gust, unit}
    bearing.ts            # PURE: compass math, sign conventions          <-- unit tested
    airflow.ts            # PURE: bearing + facade -> bucket + label      <-- unit tested
    rows.ts               # row resolution, formatting, template subscriptions
    actions.ts            # tap/hold action handling
  localize/               # en.json, nl.json
  types.ts                # AirflowMapCardConfig and friends
  const.ts                # CARD_VERSION, defaults
test/                     # vitest
dev/                      # standalone harness: mock `hass`, no HA needed
```

### 4.1 Bearing conventions, get this right once

`bearing.ts` owns the whole convention and nothing else may do trigonometry:

- `wind_bearing` (HA): degrees clockwise from **true north**, direction the wind blows **from**.
- Direction of travel: `windTo = (windFrom + 180) mod 360`.
- SVG arrow asset points **north (up)** at rotation 0 and is rotated by `windTo`.
  (The current card gets the same result by rotating a _south_-pointing glyph by
  `windFrom`: equivalent, but the new convention is the readable one.)
- `angularDifference(a, b)` returns the signed shortest delta in `(-180, 180]`.

Unit tests cover: 0/90/180/270, wraparound at 359→1, negative bearings, string
bearings (`"NNW"`: some integrations report cardinal text, which must be parsed),
`unknown`/`unavailable`, and non-numeric junk.

### 4.2 Airflow computation

`facade_bearing` is the outward normal of the front of the house: `45` means the front
faces north-east. The comparison is against `windFrom`, **not** `windTo`: wind arriving
_from_ the direction the facade faces is what hits the front.

```
delta = |angularDifference(windFrom, facadeBearing)|
```

| Condition                     | Bucket                                                    |
| ----------------------------- | --------------------------------------------------------- |
| `speed < weak_below`          | `weak`                                                    |
| `delta < sideways_from`       | `front_to_back` (wind arrives from where the front faces) |
| `delta > 180 - sideways_from` | `back_to_front`                                           |
| otherwise                     | `sideways`                                                |

Also exposed as an aria-label sentence: _"Wind 10 km/h from the north-east, blowing
front to back through the house."_

### 4.3 Leaflet integration

Bundle Leaflet as a pinned dependency (~42 KB gzipped) rather than reaching into the
HA frontend's private `<ha-map>` / `setupLeafletMap`. Those are internal APIs with no
compatibility guarantee across HA releases; a card that breaks every few months is
worse than 42 KB.

- Map instance created **once** in `firstUpdated`, never re-instantiated. State changes
  only mutate the arrow.
- `interactive: false` by default: `dragging`, `scrollWheelZoom`, `doubleClickZoom`,
  `keyboard` all off, and `tap_action` still works on the card.
- `ResizeObserver` → `map.invalidateSize()` for sections-layout resizes.
- Leaflet CSS inlined into the bundle (no external stylesheet fetch, CSP-friendly).
- Dark mode: CSS filter on the tile pane (`invert(1) hue-rotate(180deg) brightness(.9)`)
  driven by `map.theme` and `hass.themes.darkMode`, or a dark tile preset via `tile_url`.

**OSM tile usage policy.** Public OSM tiles come with conditions: attribution must be
visible, no bulk downloading/prefetching, and heavy use should move to a different
provider. A single dashboard card is well within acceptable use (HA's own map card does
the same), but the card must ship attribution on by default, cap zoom at 19, never
prefetch, and make `tile_url` a first-class option so anyone can point at their own
tile server.

### 4.4 Templates in rows

Lovelace cards can't evaluate Jinja themselves. Templates go through the WebSocket API:

```ts
hass.connection.subscribeMessage(cb, { type: 'render_template', template });
```

Same mechanism card-mod and Mushroom use. Requirements: one subscription per template
row, torn down in `disconnectedCallback`, re-subscribed on config change, errors
rendered inline in the row rather than blanking the card, and a `variables` passthrough
so rows can reference `config.entity`.

### 4.5 Rendering discipline

`shouldUpdate` compares only the entity IDs the config actually references (wind entity,
override sensors, airflow entity, every row entity, facade entity). A `hass` object
arrives on _every_ state change in the system; re-rendering on all of them is the classic
custom-card performance bug. Arrow rotation animates via CSS `transition` on `transform`,
gated by `prefers-reduced-motion`.

---

## 5. Milestones

> **Status:** M0–M4 are built and verified in the dev harness. M5 is partly done
> (theming, reduced motion, error states, README, CHANGELOG); what remains is
> screenshots, a real Home Assistant install test, and the HACS default-repo
> submission. M6 is untouched.
>
> One change against the original design: `facade_bearing` gained an on-map alignment
> guide (`house.show_guide`), because tuning a compass bearing against a number alone
> turned out to be the worst part of setting the card up.

**M0, Scaffolding** (~half a day)
TypeScript + Lit 3 + Rollup (or Vite lib mode), ESLint/Prettier, vitest, `dev/` harness
with a mocked `hass` so the card runs in a browser without HA. `hacs.json`, MIT licence,
README skeleton, GitHub Actions: lint+test on PR, build+attach `dist/*.js` on tag.

**M1, Parity** (the real milestone)
Card renders: Leaflet map at configured coords/zoom, dimming filter, north-up SVG arrow
rotated from the weather entity, three hardcoded footer rows. Registers in
`window.customCards`, implements `setConfig` validation, `getCardSize`, `getGridOptions`.
Success criterion: visually replaces the current picture-elements card on your dashboard.

**M2, Configurable footer**
`rows:` with entity/attribute/template variants, icons, names, units, precision, sizes,
per-row tap actions. Template subscription layer.

**M3, Airflow logic**
`bearing.ts` + `airflow.ts` with full unit tests, threshold config, colour/opacity
modes, i18n label overrides (en + nl), aria-label sentence. `mode: entity` path so an
existing `sensor.window_airflow_direction` still works.

**M4, Visual editor**
`ha-form` schema: entity selectors filtered to `domain: weather`, number/select
selectors, collapsible sections. Location picker: a small Leaflet map with a draggable
pin, "use home coordinates" button, and an address search box hitting Nominatim
**in the editor only**: one request per submit (never per keystroke), results written
back as lat/lon so runtime never geocodes. `getStubConfig` for a working card straight
from the picker.

**M5, Polish & release**
HA theme variables throughout (`--ha-card-*`, `--primary-text-color`), dark tiles,
responsive breakpoints for narrow columns, `prefers-reduced-motion`, error/unavailable
states, README with screenshots + full option table, CHANGELOG, HACS custom-repo install
docs, then submit to the HACS default repository.

**M6, Optional extras**
Map rotation so the house front points up (Leaflet can't rotate natively; done with a
CSS transform on an oversized container plus a counter-rotated attribution layer, the
reason it's deferred). Gust arrow, wind-speed sparkline, forecast scrubber, multiple
arrows for multiple facades.

---

## 6. Risks

| Risk                                                              | Mitigation                                                                                                                                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bearing sign errors (arrow 180° wrong)                            | All math in one pure module with exhaustive unit tests; visual check against a known wind direction.                                                                                                      |
| Integrations reporting cardinal text (`"NNW"`) instead of degrees | Parser handles both; unknown values render a neutral state, not a wrong arrow.                                                                                                                            |
| Unit mismatch (m/s vs km/h vs mph) for `weak_below`               | Threshold is interpreted in the wind source's own unit, no hidden conversion. The editor renders the detected unit into the field label, and the README states it.                                        |
| OSM tile policy / rate limits                                     | Attribution on, zoom capped, no prefetch, `tile_url` override documented and prominent.                                                                                                                   |
| Nominatim usage policy                                            | Editor-only, submit-triggered, results cached into config; documented alternative of entering coordinates directly.                                                                                       |
| HA frontend API drift                                             | Depend only on documented card APIs (`setConfig`, `hass`, `getCardSize`, `getConfigElement`) plus `ha-form`; avoid private internals. Leaflet bundled, not borrowed.                                      |
| Bundle size                                                       | **Actual: 216 KB raw / 64 KB gzipped.** Leaflet is 68% of it. Note that Vite's lib mode did not apply minification here (390 KB output); the build runs esbuild directly via `scripts/build.mjs` instead. |

---

## 7. Repository conventions

- Semantic versioning; `CARD_VERSION` logged to console on load (standard for HACS cards
  and the first thing anyone asks for in a bug report).
- Conventional Commits → auto-generated CHANGELOG.
- `dist/airflow-map-card.js` **not** committed; built by CI and attached to the GitHub
  release, which is what HACS downloads.
- Issue templates: bug report asks for HA version, card version, and the YAML config.
