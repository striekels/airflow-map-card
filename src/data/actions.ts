import type { HomeAssistant } from '../ha-types';
import type { ActionConfig } from '../types';

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
      if (config.url_path) window.open(config.url_path, '_blank', 'noreferrer');
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
