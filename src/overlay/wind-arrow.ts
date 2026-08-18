import { html, svg, type TemplateResult } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

export interface ArrowOptions {
  /** Rotation in degrees. The glyph points north at 0. */
  rotation: number;
  size: number;
  color: string;
  opacity: number;
  /** [x%, y%] within the map area. */
  anchor: [number, number];
  label: string;
  interactive: boolean;
}

// Points north at rotation 0: tip at the top, tail at the bottom.
const ARROW_PATH = 'M50 5 L78 46 L61 46 L61 95 L39 95 L39 46 L22 46 Z';

export function renderArrow(options: ArrowOptions): TemplateResult {
  const { rotation, size, color, opacity, anchor, label, interactive } = options;

  return html`
    <div
      class="arrow"
      role="img"
      aria-label=${label}
      style=${styleMap({
        left: `${anchor[0]}%`,
        top: `${anchor[1]}%`,
        width: `${size}px`,
        height: `${size}px`,
        opacity: String(opacity),
        pointerEvents: interactive ? 'auto' : 'none',
      })}
    >
      ${renderGlyph(rotation, color)}
    </div>
  `;
}

function renderGlyph(rotation: number, color: string): TemplateResult {
  return html`
    <svg
      class="glyph"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style=${styleMap({
        transform: `rotate(${rotation}deg)`,
      })}
    >
      ${svg`
        <path
          d=${ARROW_PATH}
          fill=${color}
          stroke="rgba(255, 255, 255, 0.85)"
          stroke-width="4"
          stroke-linejoin="round"
        />
      `}
    </svg>
  `;
}
