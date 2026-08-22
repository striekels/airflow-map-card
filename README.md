# Airflow Map Card

[![Release](https://img.shields.io/github/v/release/striekels/airflow-map-card?style=flat-square)](https://github.com/striekels/airflow-map-card/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/striekels/airflow-map-card/ci.yml?branch=main&style=flat-square)](https://github.com/striekels/airflow-map-card/actions/workflows/ci.yml)
[![HACS](https://img.shields.io/badge/HACS-custom-41BDF5.svg?style=flat-square)](https://hacs.xyz/)
[![License](https://img.shields.io/github/license/striekels/airflow-map-card?style=flat-square)](LICENSE)

**Should you open the windows?** Everyone answers this by licking a finger and holding it up.
This Home Assistant card does slightly better: it draws your actual house on a live map,
animates the wind blowing across it, and tells you plainly whether that air will run front to
back, back to front, or just wash past the front door doing nothing for you.

<p align="center">
  <img src="images/card.png" alt="The card on a dashboard: a wind arrow over a mapped house, with the verdict Front to Back underneath" width="420">
</p>

It works out which way your house faces by reading its outline from OpenStreetMap, so you are
not squinting at a compass in the garden. Press one button and it finds the building, picks
the wall facing the street, and sets the angle for you.

Particles stream across the map, faster and denser when it blows harder, so speed is
something you see rather than a number you read. Underneath, configurable rows show built-in
values, any entity or attribute, or Jinja templates.

## Requirements

- Home Assistant **2024.11** or newer (the card uses the sections-layout grid API).
- A `weather` entity reporting `wind_bearing` and `wind_speed`, or sensors that do.
- Browser access to a tile server. The defaults are the public OpenStreetMap and CARTO
  endpoints; see [Attribution](#attribution-and-fair-use).

## Install

**HACS:** ⋮ → **Custom repositories** → add this repository with category **Dashboard**
(older HACS calls it **Lovelace** or **Plugin**) → install → hard-refresh your browser with
Ctrl+Shift+R. A normal reload will not pick up a newly registered resource.

**Manual:** download `airflow-map-card.js` from the
[latest release](https://github.com/striekels/airflow-map-card/releases) into `config/www/`,
then add it under Settings → Dashboards → ⋮ → **Resources** as a **JavaScript module**:

```
/local/airflow-map-card.js?v=3.0.0
```

The version query stops the browser serving a cached build when you update.

## Quick start

Add the card from the picker and it already works: your Home Assistant home coordinates, the
first `weather.*` entity it finds, and three sensible rows. Everything below is optional, and
all of it is in the visual editor if you would rather not write YAML.

```yaml
type: custom:airflow-map-card
location: { latitude: 51.2194, longitude: 4.4025, zoom: 18 }
house: { facade_bearing: 45 }
wind: { entity: weather.home }
rows:
  - source: airflow
    size: large
  - source: speed
    name: Wind
```

## How the direction works

Home Assistant's `wind_bearing` is the direction the wind comes **from**, which is a
meteorological convention and a reliable source of off-by-180 mistakes. The card points
everything the way the air actually travels, which is the reciprocal.

`house.facade_bearing` is the direction the **front of your house faces**: `0` = north,
`90` = east. With that:

| Angle between the wind's origin and the facade | Result           |
| ---------------------------------------------- | ---------------- |
| less than `sideways_from` (default 75°)        | **Front → Back** |
| more than `180 - sideways_from`                | **Back → Front** |
| anything in between                            | **Sideways**     |
| speed below `weak_below`                       | **Weak wind**    |

Already have a template sensor doing this? Set `airflow.mode: entity` and point
`airflow.entity` at it. The card still colours the arrow from its own calculation.

## Aligning the facade

<p align="center">
  <img src="images/editor.png" alt="The editor's Where section: address search, a map with the alignment guide, and the Detect button" width="380">
</p>

Open the card editor, find **Where**, pan the map to your house and press **Detect from
OpenStreetMap**. Detection runs at whatever the map is centred on, so panning is how you tell
it where to look. It picks the building under the centre, faces the wall pointing at the
street, moves the card's position onto that building, and stores the outline so the card can
draw it under the arrow.

**If it picked the wrong building, click yours on the map** and detection re-runs against it.
If your building is not mapped, or the wrong _wall_ was chosen, drag the guide line onto the
front of the house instead; it snaps to a wall within 8°, and arrow keys (1°, or 5° with
Shift) and the rotate buttons (0.1°) take it from there.

The guide's two shaded sectors show where wind blows through the house rather than across it,
so `sideways_from` is visible rather than abstract. The **eye button** hides the guide while
you pan. All of it is editor-only, and every lookup happens on a button press: nothing is
queried while the card runs.

Anything that moves the card without detecting again, an address search, **Use home**, or
typed coordinates, clears the stored outline, because it belongs to one building.

## Options

### Top level

| Option        | Type   | Default                 | Description                                           |
| ------------- | ------ | ----------------------- | ----------------------------------------------------- |
| `title`       | string | -                       | Card header. Omit for no header.                      |
| `rows`        | list   | airflow, speed, bearing | Info rows. See [Rows](#rows).                         |
| `tap_action`  | action | -                       | Standard Lovelace action, fired by tapping the arrow. |
| `hold_action` | action | -                       | The same, on long press or right click.               |

The rest of the configuration is grouped: `location`, `house`, `wind`, `airflow`, `arrow`,
`flow` and `map`, each with its own section below.

### `location`

| Option      | Type   | Default           | Description                             |
| ----------- | ------ | ----------------- | --------------------------------------- |
| `latitude`  | number | HA home latitude  |                                         |
| `longitude` | number | HA home longitude |                                         |
| `zoom`      | number | `18`              | 1–19. 18–19 shows individual buildings. |

The editor's address search resolves once, when you press Search, and stores coordinates.

### `house`

| Option                  | Type   | Default | Description                                                                   |
| ----------------------- | ------ | ------- | ----------------------------------------------------------------------------- |
| `facade_bearing`        | number | `0`     | Compass direction the front of the house faces.                               |
| `facade_bearing_entity` | entity | -       | Take it from an entity instead, e.g. an `input_number` you can tune live.     |
| `footprint`             | list   | -       | Building outline as `[lat, lon]` pairs. Written by Detect; drawn on the card. |

### `wind`

| Option           | Type        | Default  | Description                                                         |
| ---------------- | ----------- | -------- | ------------------------------------------------------------------- |
| `entity`         | `weather.*` | -        | Source for speed, bearing and gust.                                 |
| `speed_entity`   | `sensor.*`  | -        | Override just the speed.                                            |
| `bearing_entity` | `sensor.*`  | -        | Override just the bearing. Accepts degrees or compass text (`NNW`). |
| `gust_entity`    | `sensor.*`  | -        | Override just the gust.                                             |
| `speed_unit`     | see below   | `source` | Unit to show speed and gust in.                                     |

An override always wins over the weather entity. One that is `unavailable` reads as no data
rather than silently falling back.

**`speed_unit`** takes `source`, `km/h`, `m/s`, `mph`, `kn` or `bft`. `source` keeps whatever
your integration reports; the rest **convert** the reading, so `36 km/h`, `10 m/s`,
`22.4 mph`, `19.4 kn` and `5 Bft` are all the same wind. Converted values round to one
decimal; Beaufort rounds down into the force the wind is in and is always whole.

This is not a row's `unit`, which only relabels: `unit: mph` on a km/h source prints a km/h
number beside the word mph, which is the trap `speed_unit` exists to close.

### `airflow`

| Option          | Type                           | Default                 | Description                                                                      |
| --------------- | ------------------------------ | ----------------------- | -------------------------------------------------------------------------------- |
| `mode`          | `compute` \| `entity` \| `off` | `compute`               |                                                                                  |
| `entity`        | entity                         | -                       | Label source when `mode: entity`.                                                |
| `weak_below`    | number                         | `5`                     | In the displayed unit. See below.                                                |
| `sideways_from` | number                         | `75`                    | Degrees, 1–90.                                                                   |
| `labels`        | map                            | English/Dutch built-ins | Override any of `front_to_back`, `back_to_front`, `sideways`, `weak`, `unknown`. |

`weak_below` is read in whatever unit the card **displays**, so the number you type is the
number you see. Changing `wind.speed_unit` does not rewrite it: `bft` with `weak_below: 5`
means below force 5, not below 5 km/h. The editor shows the unit in the field label.

### `arrow`

Off by default. The flow already shows direction and speed together; the arrow states
direction more precisely, and some people want both.

| Option       | Type                            | Default    | Description                               |
| ------------ | ------------------------------- | ---------- | ----------------------------------------- |
| `show`       | boolean                         | `false`    | Turn the arrow on.                        |
| `size`       | number                          | `130`      | Pixels.                                   |
| `color_mode` | `airflow` \| `speed` \| `fixed` | `airflow`  | See [Colour](#colour).                    |
| `color`      | CSS colour                      | per bucket | Overrides the mode. Required for `fixed`. |

### `flow`

Particles carried by the wind, drawn over the map. On by default, because it is the fastest
way to see what the wind is doing without reading a single number.

| Option       | Type                            | Default         | Description                                     |
| ------------ | ------------------------------- | --------------- | ----------------------------------------------- |
| `show`       | boolean                         | `true`          | Turn the animation off if it distracts you.     |
| `opacity`    | number                          | `0.5`           | 0.1 to 1, scaling how strongly it is drawn.     |
| `speed`      | number                          | `1`             | 0.25 to 3, multiplying how fast particles move. |
| `color_mode` | `airflow` \| `speed` \| `fixed` | follows `arrow` | See [Colour](#colour).                          |
| `color`      | CSS colour                      | follows `arrow` | Overrides the mode.                             |

`flow: true` is shorthand for `flow: { show: true }`.

**It is a uniform flow, not a wind field.** Windy and similar maps advect particles through a
grid of vectors from a weather model, which is where their swirls come from. A Home Assistant
weather entity reports one vector at one point, so every particle here moves the same
direction at the same speed. It does not bend around your house, and any resemblance to how
air really moves around a building would be invented. What it adds is speed: the arrow looks
identical at 4 km/h and 40 km/h, and particle velocity and density do not.

It pauses when scrolled out of view, when the tab is hidden and when the card is removed, and
draws a single still frame if you have reduced motion enabled.

### Colour

Both the arrow and the flow take a `color_mode`:

| Mode      | What the colour means                                                               |
| --------- | ----------------------------------------------------------------------------------- |
| `airflow` | Which way the air moves through the house: green through, orange across, grey weak. |
| `speed`   | How hard it is blowing, on a continuous scale.                                      |
| `fixed`   | Nothing. Set `color` and it stays there.                                            |

`speed` runs blue-grey through green, yellow and orange to red, anchored to the Beaufort
scale so the colour changes where the description of the wind does, and blending between
stops so a refresh from 7.9 to 8.1 m/s does not jump a whole colour.

**The flow follows the arrow unless given its own `color_mode`.** That matters because the
arrow is off by default: a card showing only the flow should not have to configure a hidden
arrow to colour the thing it does show. Using one mode for each is reasonable: an arrow
coloured by airflow tells you whether to open the windows, while a flow coloured by speed
tells you how hard it is blowing.

### `map`

| Option         | Type                                             | Default     | Description                                                                                          |
| -------------- | ------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------- |
| `tiles`        | `auto` \| `osm` \| `carto-light` \| `carto-dark` | `osm`       | `auto` follows the dashboard's light/dark theme. Anything else pins the basemap regardless of theme. |
| `tile_url`     | string                                           | -           | Your own tile server. Overrides `tiles`.                                                             |
| `attribution`  | boolean                                          | `true`      |                                                                                                      |
| `interactive`  | boolean                                          | `false`     | Allow pan and zoom.                                                                                  |
| `filter`       | CSS filter                                       | per basemap | e.g. `brightness(0.62) contrast(1.05)`.                                                              |
| `aspect_ratio` | string                                           | `4 / 3`     |                                                                                                      |
| `height`       | number                                           | -           | Fixed pixel height; overrides `aspect_ratio`.                                                        |

### Rows

Each row is one of three kinds:

```yaml
rows:
  - source: airflow # built-in: airflow | speed | gust | bearing | cardinal
    size: large
  - entity: sensor.outside_temperature
    attribute: humidity # optional: read an attribute instead of the state
  - template: "{{ states('sensor.window_airflow_direction') }}"
    icon: mdi:window-open
```

Shared options: `name` (or `false` to hide), `icon` (or `false`), `prefix`, `suffix`, `unit`
(or `false`), `precision`, `size` (`small` / `normal` / `large`), `tap_action`. A `large` row
takes a full line; `normal` and `small` share one.

## Troubleshooting

**"Custom element doesn't exist: airflow-map-card"**
The resource did not load. Check the file is at `config/www/airflow-map-card.js`, that it is
registered as a **JavaScript module** and not "JavaScript file", and hard-refresh.

**The card renders but the map area is blank**
Almost always the map container having no height. The card reports map failures on its own
face, so if it says nothing, check the browser console. Setting `map.height` to a fixed pixel
value confirms it quickly.

**The arrow points the opposite way to what I expect**
`wind_bearing` is the direction the wind comes _from_; the arrow points the way the air
travels. If it is still wrong, your integration may report a travel direction instead.
Override it with `wind.bearing_entity`.

**Airflow says Sideways when it looks head-on**
Re-check `house.facade_bearing` with the alignment guide. The common mistake is aligning to a
side wall rather than the front.

**Detect says "No building mapped here"**
Your building may not be mapped in OpenStreetMap yet. Check
[openstreetmap.org](https://www.openstreetmap.org/) for your address, and drag the guide
handle to set the angle by hand meanwhile.

**Detect says OpenStreetMap is busy**
Overpass rate-limits aggressively. Wait a minute and try again.

## Attribution and fair use

The default basemaps come from OpenStreetMap and CARTO under their public tile usage
policies. Attribution is shown by default; please leave it on. If you run this on many
dashboards or on kiosk displays that reload constantly, point `tile_url` at your own tile
server. Address search uses Nominatim, one request per search, from the editor only.

## Development

```bash
npm install
npm run dev     # card at /, picker at /picker.html, editor at /editor.html,
                # screenshot gallery at /demo.html
npm test
npm run lint
npm run build   # produces dist/airflow-map-card.js
```

Every harness runs against a mock `hass`, with no Home Assistant instance needed. The
frontend elements the editor needs are stubbed in `dev/ha-stubs.ts`.

`npm run screenshots` regenerates every image in this README from `demo.html`, so a picture
cannot quietly stop being true. It needs `npx playwright install chromium` once. Each shot is
of the Rietveld Schroder House in Utrecht: a museum rather than anyone's home, so no
screenshot can leak an address, and still a real house on a real street.

## Contributing

Issues and pull requests are welcome. `main` is protected, so work on a branch and open a PR;
`npm test`, `npm run lint` and `npm run build` should all pass, and commits follow
Conventional Commits.

Most useful right now:

- **Reports from other weather integrations.** The airflow maths has been checked against a
  small number of setups. Wind units and `wind_bearing` conventions differ, and a mismatch
  produces a plausible wrong answer rather than an obvious failure. Include your Home
  Assistant version, the card version from the browser console, and your YAML.
- **Buildings the facade detection gets wrong.** An OpenStreetMap link plus what it should
  have picked is enough to turn into a test.
- **Screenshots from other setups.** Different themes, integrations and house shapes.

Keep compass and geometry maths in `src/data/bearing.ts` and `src/data/footprint.ts` and add
tests there. A sign error in that domain produces an answer that looks entirely plausible and
is 180 degrees wrong, which is why it is isolated and heavily tested. Most of the other
odd-looking code is odd because of a specific bug, and the comments say which.

What changed in each version is in the
[releases](https://github.com/striekels/airflow-map-card/releases), built from commit
subjects. Known problems and planned work are in
[issues](https://github.com/striekels/airflow-map-card/issues).

## Credits

Basemaps © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors and
[CARTO](https://carto.com/attributions). Geocoding by [Nominatim](https://nominatim.org/);
building outlines via the [Overpass API](https://overpass-api.de/). Mapping by
[Leaflet](https://leafletjs.com/).

## License

[MIT](LICENSE)
