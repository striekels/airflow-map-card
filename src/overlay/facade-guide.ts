import { html, svg, type TemplateResult } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

export interface FacadeGuideOptions {
  /** Outward normal of the front facade, degrees. */
  facadeBearing: number;
  /** Half-angle of the front-on sector, degrees. */
  sidewaysFrom: number;
  /** [x%, y%] within the map area — matches the arrow. */
  anchor: [number, number];
  color: string;
  /** When set, the wall line becomes a grab handle for setting the bearing. */
  drag?: {
    active: boolean;
    onPointerDown: (event: PointerEvent) => void;
    onPointerMove: (event: PointerEvent) => void;
    onPointerUp: (event: PointerEvent) => void;
    onKeyDown: (event: KeyboardEvent) => void;
  };
}

const CENTRE = 50;
export const RADIUS = 46;

/**
 * Half-length of the wall line, in viewBox units.
 *
 * Deliberately far outside the 0..100 viewBox: the SVG is set to
 * `overflow: visible` so the line runs the full width of the map area and is
 * clipped by the map wrapper instead. Alignment error is easiest to see at the
 * ends of a long line, which is precisely where a line that stopped at the
 * guide circle gave you nothing to look at.
 */
export const WALL_HALF_LENGTH = 200;

/**
 * The rotation handle, on the outward normal at the rim.
 *
 * `HANDLE_R` is what you see, `HANDLE_HIT_R` is what you can hit. The gap is
 * for touch: a 6.5-unit grip is about 20px at the size the picker renders,
 * which is fine for a mouse and too small for a thumb.
 */
const HANDLE_Y = 6.2;
const HANDLE_R = 6.5;
const HANDLE_HIT_R = 11;

/**
 * Overlay for aligning `facade_bearing` with the actual building.
 *
 * Shows three things at once: a wall line to lay along the front of the house,
 * a chevron marking which side is the front, and the two sectors a wind has to
 * come from to blow through the house rather than across it. Getting the
 * sectors on screen is the point — the numeric threshold alone tells you
 * nothing about whether your house is oriented well for cross-ventilation.
 *
 * Every stroke here is kept to a hairline on purpose. This is a measuring tool
 * laid over a map: a line wide enough to cover a roof ridge at zoom 18 hides
 * the very edge you are trying to align it with.
 */
export function renderFacadeGuide(options: FacadeGuideOptions): TemplateResult {
  const { facadeBearing, sidewaysFrom, anchor, color, drag } = options;
  const wallStart = CENTRE - WALL_HALF_LENGTH;
  const wallEnd = CENTRE + WALL_HALF_LENGTH;

  return html`
    <!--
      Not aria-hidden. It was, which put a focusable slider inside a hidden
      subtree: invalid, and it hid the one control here that carries meaning.
      The shapes around it are unlabelled SVG primitives and are ignored by
      assistive technology on their own.
    -->
    <div class="guide" style=${styleMap({ left: `${anchor[0]}%`, top: `${anchor[1]}%` })}>
      <svg
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        style=${styleMap({ transform: `rotate(${facadeBearing}deg)` })}
      >
        ${svg`
          <circle
            cx="50" cy="50" r=${RADIUS}
            fill="none"
            stroke=${color}
            stroke-width="0.5"
            stroke-dasharray="2 3"
            opacity="0.45"
          />

          <!-- Wind out of either sector blows through the house rather than
               across it. The front sector is the stronger of the two. Kept
               faint: these tint a large area of the map. -->
          <path d=${sectorPath(sidewaysFrom)} fill=${color} opacity="0.12" />
          <path d=${sectorPath(sidewaysFrom, 180)} fill=${color} opacity="0.06" />

          <!-- Rim marker for the front sector, outside the arrow's reach. -->
          <path
            d=${arcPath(sidewaysFrom)}
            fill="none"
            stroke=${color}
            stroke-width="1.2"
            stroke-linecap="round"
          />

          <!-- The front wall. Rotate until this lies along the front of the
               house. Dashed so the roofline stays visible through it, and
               haloed so it reads on both light and dark basemaps. -->
          <line
            x1=${wallStart} y1="50" x2=${wallEnd} y2="50"
            stroke="#ffffff"
            stroke-width="1.6"
            stroke-dasharray="2.5 2"
            opacity="0.55"
          />
          <line
            x1=${wallStart} y1="50" x2=${wallEnd} y2="50"
            stroke=${color}
            stroke-width="0.6"
            stroke-dasharray="2.5 2"
          />

        `}
        ${
          drag
            ? svg`
            <!-- Grip behind the chevron, so the handle looks like something you
                 can take hold of. Discoverability is the whole point: the
                 previous handle was invisible and spanned the entire map, so
                 there was no way to tell a rotate gesture from a pan. -->
            <circle
              cx="50" cy=${HANDLE_Y} r=${HANDLE_R}
              fill=${color}
              opacity=${drag.active ? '0.34' : '0.18'}
              stroke=${color}
              stroke-width="0.7"
              pointer-events="none"
            />
          `
            : ''
        }
        ${svg`
          <!-- Outward normal: this side is the front. -->
          <path
            d="M50 2 L54.5 10.5 L50 8.2 L45.5 10.5 Z"
            fill=${color}
            stroke="rgba(255,255,255,0.9)"
            stroke-width="0.9"
            stroke-linejoin="round"
            pointer-events="none"
          />
        `}
        ${
          drag
            ? svg`
            <!-- The only interactive part of the guide, and deliberately small
                 and local: everywhere else the map pans. Drawn last so it wins
                 hit testing, and larger than the visible grip so it stays
                 comfortable on a touch screen.

                 It sits on the outward normal rather than on the wall line,
                 which is what makes the drag unambiguous: a line reads the same
                 from both ends and needed the previous bearing to disambiguate,
                 whereas the normal points one way only. -->
            <circle
              class=${drag.active ? 'facade-handle dragging' : 'facade-handle'}
              cx="50" cy=${HANDLE_Y} r=${HANDLE_HIT_R}
              fill="transparent"
              pointer-events="all"
              tabindex="0"
              role="slider"
              aria-label="Direction the front of the house faces"
              aria-valuemin="0"
              aria-valuemax="359.9"
              aria-valuenow=${Math.round(facadeBearing)}
              aria-valuetext=${`${facadeBearing.toFixed(1)} degrees`}
              @pointerdown=${drag.onPointerDown}
              @pointermove=${drag.onPointerMove}
              @pointerup=${drag.onPointerUp}
              @pointercancel=${drag.onPointerUp}
              @keydown=${drag.onKeyDown}
            />
          `
            : ''
        }
      </svg>
    </div>
  `;
}

/**
 * Wedge of `±halfAngle` around `centreAngle`, measured clockwise from north.
 * Exported for testing: the arc flags are easy to get subtly wrong and the
 * failure looks like a plausible shape rather than an error.
 */
export function sectorPath(halfAngle: number, centreAngle = 0): string {
  const clamped = clampHalfAngle(halfAngle);
  const start = pointAt(centreAngle - clamped);
  const end = pointAt(centreAngle + clamped);
  const largeArc = clamped * 2 > 180 ? 1 : 0;

  return [
    `M ${CENTRE} ${CENTRE}`,
    `L ${start}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end}`,
    'Z',
  ].join(' ');
}

/**
 * Rim arc spanning the same sweep as `sectorPath`, without the wedge sides.
 * Shares the clamping so the arc and the fill can never disagree.
 */
export function arcPath(halfAngle: number, centreAngle = 0): string {
  const clamped = clampHalfAngle(halfAngle);
  const start = pointAt(centreAngle - clamped);
  const end = pointAt(centreAngle + clamped);
  const largeArc = clamped * 2 > 180 ? 1 : 0;
  return `M ${start} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end}`;
}

function clampHalfAngle(halfAngle: number): number {
  return Math.min(90, Math.max(0.5, halfAngle));
}

/** Point on the circle at `angle` degrees clockwise from north. */
function pointAt(angle: number): string {
  const radians = (angle * Math.PI) / 180;
  const x = CENTRE + RADIUS * Math.sin(radians);
  const y = CENTRE - RADIUS * Math.cos(radians);
  return `${round(x)} ${round(y)}`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
