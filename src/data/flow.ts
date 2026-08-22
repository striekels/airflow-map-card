import type { FlowConfig } from '../types';

/**
 * Half strength. The flow is drawn over a map that still has to be readable,
 * and at full opacity the particles win that argument.
 */
export const DEFAULT_FLOW_OPACITY = 0.5;

/** 1 is the pace the overlay was tuned at; the setting multiplies it. */
export const DEFAULT_FLOW_SPEED = 1;

/**
 * `show`, `opacity` and `speed` always have a value; the colour keys do not,
 * because unset means "follow the arrow" and only the card knows what the arrow
 * is set to.
 */
export type ResolvedFlow = Required<Pick<FlowConfig, 'show' | 'opacity' | 'speed'>> &
  Pick<FlowConfig, 'color_mode' | 'color'>;

/**
 * The flow settings with every default filled in, and `flow: true` accepted as
 * shorthand for turning it on.
 *
 * On by default. The flow shows direction and speed at once, which is the
 * question the card exists to answer; the arrow says direction more precisely
 * and is opt-in beside it.
 *
 * Shared because the card and the editor both need it and had it twice. They
 * drifting apart would show up as an editor whose sliders disagree with the
 * card sitting next to it.
 */
export function resolveFlow(flow: FlowConfig | boolean | undefined): ResolvedFlow {
  const defaults = {
    show: true,
    opacity: DEFAULT_FLOW_OPACITY,
    speed: DEFAULT_FLOW_SPEED,
  };

  if (flow === undefined) return defaults;
  if (typeof flow === 'boolean') return { ...defaults, show: flow };

  // Spreading would let an explicit `undefined` overwrite a default, which is
  // what a form sends when a field is cleared.
  return {
    show: flow.show ?? defaults.show,
    opacity: flow.opacity ?? defaults.opacity,
    speed: flow.speed ?? defaults.speed,
    // Passed through rather than defaulted: undefined here means "follow the
    // arrow", which is a different thing from any value this could pick.
    color_mode: flow.color_mode,
    color: flow.color,
  };
}
