# Airflow Map Card

A Home Assistant Lovelace card that draws your house on an OpenStreetMap basemap and
shows which way the wind is blowing across it — plus a configurable row of readings
underneath.

Replaces the usual `picture-elements` + static PNG + `card_mod` approach: the map is live,
so it stays sharp at any zoom and needs no regenerating when you change the position.

---

## Install

### HACS (custom repository)

1. HACS → Frontend → ⋮ → **Custom repositories**
2. Add this repository's URL, category **Dashboard** (older HACS calls it **Lovelace**/**Plugin**)
3. Install **Airflow Map Card**
4. Reload your browser

### Manual

Download `airflow-map-card.js` from the latest release into `config/www/`, then add it under
Settings → Dashboards → ⋮ → **Resources** as a **JavaScript module**:

```
/local/airflow-map-card.js
```

## Quick start

Add the card from the dashboard card picker and it works immediately: your Home Assistant
home coordinates, the first `weather.*` entity it finds, and three default rows. Everything
below is optional refinement, available in the visual editor.

```yaml
type: custom:airflow-map-card
title: Airflow
location:
  latitude: 51.2194
  longitude: 4.4025
  zoom: 18
house:
  facade_bearing: 45
wind:
  entity: weather.home
rows:
  - source: airflow
    size: large
  - source: speed
    name: Wind
  - source: bearing
    prefix: from
    name: false
```

## How the direction works

Home Assistant's `wind_bearing` is the direction the wind comes **from**. The arrow points
the way the air actually travels, i.e. the reciprocal.

`house.facade_bearing` is the direction the **front of your house faces**: `0` = north,
`90` = east. With that, the card classifies the flow:

| Angle between the wind's origin and the facade | Result |
| --- | --- |
| less than `sideways_from` (default 45°) | **Front → Back** |
| more than `180 - sideways_from` | **Back → Front** |
| anything in between | **Sideways** |
| speed below `weak_below` | **Weak wind** |

If you already have a template sensor doing this, keep it — set `airflow.mode: entity` and
point `airflow.entity` at it. The card still colours the arrow from its own calculation.

> **Units:** `airflow.weak_below` is read in whatever unit your wind source reports. No
> conversion is applied, so `5` means 5 km/h against a km/h sensor and 5 m/s against an m/s
> one. The visual editor shows the detected unit in the field label.

## Options

### Top level

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string | — | Card header. Omit for no header. |
| `rows` | list | airflow, speed, bearing | Info rows. See [Rows](#rows). |
| `tap_action` | action | `more-info` | Standard Lovelace action. |

### `location`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `latitude` | number | HA home latitude | |
| `longitude` | number | HA home longitude | |
| `zoom` | number | `18` | 1–19. 18–19 shows individual buildings. |

The editor has an address search box. It resolves the address once, when you press Search,
and stores the result as coordinates — nothing is looked up while the card is running.

### `house`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `facade_bearing` | number | `0` | Compass direction the front of the house faces. |
| `facade_bearing_entity` | entity | — | Take it from an entity instead, e.g. an `input_number` you can tune live. |
| `show_guide` | boolean | `false` | Draw the alignment overlay. See below. |
| `drag_to_align` | boolean | `true` | Allow dragging the guide line on the live card. Needs both `show_guide` and a settable `facade_bearing_entity`. |

#### Aligning the facade

Open the card editor and look for **Front of the house**. Press **Detect from
OpenStreetMap** and you are usually done.

Detection draws every building it found, labelled with its house number, and picks the one
containing your configured location. It then reads that outline's walls and faces the one
pointing at the nearest street.

**If it picked the wrong building, click yours on the map.** The detection re-runs against
that outline. This is worth doing whenever the highlighted house is not the right number:
the automatic choice depends on your coordinates landing inside the correct polygon, which
is the one part of the setup you cannot otherwise check.

If your building is not mapped at all, or detection picks the wrong *wall*, drag the line
onto the front of the house instead. It snaps to a wall whenever an outline is loaded, so
you get the building's real angle rather than an eyeballed one. Arrow keys nudge by 1° (5°
with Shift); hold Shift while dragging to turn snapping off.

The lookup runs once per button press and only in the editor. The result is stored as a
single number, so nothing is queried while the card is running.

#### The guide overlay

`house.show_guide: true` draws the same overlay on the card itself, which is useful for
sanity-checking an existing setup. It draws:

- a **thin dashed line spanning the whole map** — rotate the bearing until it lies along
  the front wall of your house. It runs edge to edge on purpose: alignment error shows up
  at the ends of a long line, and it is dashed so the roofline stays visible underneath;
- a **chevron on the rim** marking which side of that line is the front;
- **two shaded sectors** — wind arriving from either one blows through the house rather
  than across it. The solid-edged sector is the front. Their width is `sideways_from`, so
  you can see what that threshold actually means for your building.

Turn it off when you are done; it is meant for tuning, not for everyday display.

#### Dragging on the live card

Alignment normally belongs in the editor, because that is the only place a value can be
written to the card's configuration. A Lovelace card cannot write its own config.

Dragging the guide on the live dashboard is therefore enabled **only** when
`facade_bearing_entity` points at an `input_number` or `number` entity, which gives the
value somewhere durable to go: releasing the drag calls `set_value`. Without such an entity
the guide is display-only on the card, and the editor is where you align it.

Set `drag_to_align: false` to turn the interaction off even when an entity is configured.

### `wind`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | `weather.*` | — | Source for speed, bearing and gust. |
| `speed_entity` | `sensor.*` | — | Override just the speed. |
| `bearing_entity` | `sensor.*` | — | Override just the bearing. Accepts degrees or compass text (`NNW`). |
| `gust_entity` | `sensor.*` | — | Override just the gust. |

An override always wins over the weather entity. An override that is `unavailable` reads as
no data rather than silently falling back.

### `airflow`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `mode` | `compute` \| `entity` \| `off` | `compute` | |
| `entity` | entity | — | Label source when `mode: entity`. |
| `weak_below` | number | `5` | In the wind source's unit. |
| `sideways_from` | number | `45` | Degrees, 1–90. |
| `labels` | map | English/Dutch built-ins | Override any of `front_to_back`, `back_to_front`, `sideways`, `weak`, `unknown`. |

### `arrow`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | number | `130` | Pixels. |
| `color_mode` | `airflow` \| `fixed` | `airflow` | |
| `color` | CSS colour | per bucket | |
| `anchor` | `[x%, y%]` | `[50, 50]` | Position over the map. |
| `show_gust` | boolean | `false` | Adds a larger translucent arrow behind. |
| `hide` | boolean | `false` | |

### `map`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `theme` | `auto` \| `light` \| `dark` | `auto` | Follows the dashboard by default. |
| `tiles` | `osm` \| `carto-light` \| `carto-dark` | theme-dependent | |
| `tile_url` | string | — | Your own tile server. Overrides `tiles`. |
| `attribution` | boolean | `true` | |
| `interactive` | boolean | `false` | Allow pan and zoom. |
| `filter` | CSS filter | per basemap | e.g. `brightness(0.62) contrast(1.05)`. |
| `aspect_ratio` | string | `4 / 3` | |
| `height` | number | — | Fixed pixel height; overrides `aspect_ratio`. |

### Rows

Each row is one of three kinds.

**Built-in value** — no entity needed:

```yaml
- source: airflow   # airflow | speed | gust | bearing | cardinal
  size: large
```

**Entity:**

```yaml
- entity: sensor.outside_temperature
  attribute: humidity   # optional: read an attribute instead of the state
  precision: 1
```

**Template** — rendered over the websocket API, same as any other template card:

```yaml
- template: "{{ states('sensor.window_airflow_direction') }}"
  icon: mdi:window-open
```

Shared options: `name` (or `false` to hide), `icon` (or `false`), `prefix`, `suffix`,
`unit` (or `false`), `precision`, `size` (`small` / `normal` / `large`), `tap_action`.

A `large` row takes the full width on its own line; `normal` and `small` rows share a line.

## Attribution and fair use

The default basemaps are served by OpenStreetMap and CARTO under their public tile usage
policies. Attribution is shown by default — please leave it on. If you embed this card on
many dashboards or run kiosk displays that reload constantly, point `tile_url` at your own
tile server.

Address search uses OpenStreetMap's Nominatim service, one request per search, from the
editor only.

## Development

```bash
npm install
npm run dev
```

The dev harness at `http://localhost:5173` runs the card against a mock `hass` object with
sliders for wind bearing, speed and facade orientation — no Home Assistant instance needed.

```bash
npm test          # unit tests for the compass and airflow logic
npm run build     # produces dist/airflow-map-card.js
```

## License

MIT
