import type { HomeAssistant } from '../ha-types';
import type { ActionConfig } from '../types';

/**
 * The schemes a `url` action may open.
 *
 * A card's configuration is written by the person whose dashboard it is, so
 * this is not a hole so much as a sharp edge: card YAML gets copied off forums
 * and out of blog posts, and `javascript:` in a `url_path` executes on the
 * dashboard when tapped.
 *
 * `mailto:` and `tel:` are left out because nothing has asked for them, not
 * because they are dangerous. Add them here if they ever come up.
 */
const ALLOWED_URL_SCHEMES = new Set(['http:', 'https:']);

/**
 * Resolve a `url_path` to something safe to open, or null to refuse.
 *
 * Relative paths are fine and resolve against the dashboard, which is what
 * `/local/...` links rely on. `base` is a parameter rather than read from
 * `window` so the rule can be tested without a DOM.
 */
export function safeUrl(path: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(path, base);
  } catch {
    return null;
  }
  return ALLOWED_URL_SCHEMES.has(url.protocol) ? url.href : null;
}

export function fireEvent<T>(node: HTMLElement | Window, type: string, detail?: T): void {
  node.dispatchEvent(
    new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable: false }),
  );
}

/**
 * Pointer capture keeps a drag alive when the cursor leaves the thin element it
 * started on. Both calls throw for a pointer id that is not currently active,
 * which a stray pointercancel can cause; that must not abort the drag, so the
 * failure is swallowed rather than allowed to escape the event handler.
 */
export function capturePointer(
  target: EventTarget | null,
  pointerId: number,
  capture: boolean,
): void {
  const element = target as Element | null;
  try {
    if (capture) element?.setPointerCapture?.(pointerId);
    else element?.releasePointerCapture?.(pointerId);
  } catch {
    /* not fatal */
  }
}

/**
 * Minimal re-implementation of the frontend's action handler. Importing the
 * real one would mean depending on `home-assistant-frontend` internals, which
 * move between releases.
 */
export function handleAction(
  node: HTMLElement,
  hass: HomeAssistant,
  action: ActionConfig | undefined,
  fallbackEntity?: string,
): void {
  const config: ActionConfig = action ?? { action: 'more-info' };

  switch (config.action) {
    case 'none':
      return;

    case 'more-info': {
      const entityId = config.entity ?? fallbackEntity;
      if (entityId) fireEvent(node, 'hass-more-info', { entityId });
      return;
    }

    case 'toggle': {
      const entityId = config.entity ?? fallbackEntity;
      if (!entityId) return;
      void hass.callService('homeassistant', 'toggle', { entity_id: entityId });
      return;
    }

    case 'navigate': {
      if (!config.navigation_path) return;
      history.pushState(null, '', config.navigation_path);
      fireEvent(window, 'location-changed', { replace: false });
      return;
    }

    case 'url': {
      if (!config.url_path) return;
      const url = safeUrl(config.url_path, window.location.href);
      if (url) window.open(url, '_blank', 'noreferrer');
      return;
    }

    case 'call-service':
    case 'perform-action': {
      const service = config.perform_action ?? config.service;
      if (!service) return;
      const [domain, serviceName] = service.split('.', 2);
      if (!domain || !serviceName) return;
      void hass.callService(
        domain,
        serviceName,
        config.data ?? config.service_data ?? {},
        config.target,
      );
      return;
    }
  }
}
