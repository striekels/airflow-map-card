import { html, nothing, svg, type TemplateResult } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

export interface ArrowOptions {
  /** Rotation in degrees. The glyph points north at 0. */
  rotation: number;
  size: number;
  color: string;
  opacity: number;
  label: string;
  interactive: boolean;
  onTap?: (event: Event) => void;
  onHold?: (event: Event) => void;
}

// Points north at rotation 0: tip at the top, tail at the bottom.
const ARROW_PATH = 'M50 5 L78 46 L61 46 L61 95 L39 95 L39 46 L22 46 Z';

export function renderArrow(options: ArrowOptions): TemplateResult {
  const { rotation, size, color, opacity, label, interactive, onTap, onHold } = options;

  return html`
    <div
      class="arrow"
      role=${onTap ? 'button' : 'img'}
      tabindex=${onTap ? '0' : nothing}
      aria-label=${label}
      @click=${onTap}
      @keydown=${
        onTap
          ? (event: KeyboardEvent) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onTap(event);
            }
          : undefined
      }
      @contextmenu=${
        onHold
          ? (event: Event) => {
              event.preventDefault();
              onHold(event);
            }
          : undefined
      }
      style=${styleMap({
        left: '50%',
        top: '50%',
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
