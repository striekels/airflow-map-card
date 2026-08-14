import type { HomeAssistant, UnsubscribeFunc } from '../ha-types';

interface RenderTemplateResult {
  result: string;
  listeners?: unknown;
}

export interface TemplateState {
  value?: string;
  error?: string;
}

/**
 * Renders Jinja templates through the websocket API, because a Lovelace card
 * has no template engine of its own. This is the same `render_template`
 * subscription card-mod and Mushroom use.
 *
 * One subscription per distinct template string. Subscriptions are torn down
 * when the card disconnects and rebuilt on reconnect, so a card scrolled out
 * of a dashboard does not keep the connection busy.
 */
export class TemplateSubscriber {
  private subscriptions = new Map<string, Promise<UnsubscribeFunc>>();
  private results = new Map<string, TemplateState>();
  private hass?: HomeAssistant;
  private connected = false;

  constructor(private readonly onChange: () => void) {}

  setHass(hass: HomeAssistant): void {
    const first = !this.hass;
    this.hass = hass;
    if (first && this.connected) void this.resubscribeAll();
  }

  connect(): void {
    this.connected = true;
    void this.resubscribeAll();
  }

  disconnect(): void {
    this.connected = false;
    for (const pending of this.subscriptions.values()) {
      pending.then((unsub) => unsub()).catch(() => undefined);
    }
    this.subscriptions.clear();
  }

  /**
   * Declare the full set of templates currently in the config. Templates no
   * longer present are unsubscribed; new ones are subscribed.
   */
  sync(templates: string[]): void {
    const wanted = new Set(templates);

    for (const [template, pending] of this.subscriptions) {
      if (!wanted.has(template)) {
        pending.then((unsub) => unsub()).catch(() => undefined);
        this.subscriptions.delete(template);
        this.results.delete(template);
      }
    }

    if (!this.connected) return;
    for (const template of wanted) {
      if (!this.subscriptions.has(template)) this.subscribe(template);
    }
  }

  get(template: string): TemplateState | undefined {
    return this.results.get(template);
  }

  private async resubscribeAll(): Promise<void> {
    const templates = [...this.subscriptions.keys()];
    this.subscriptions.clear();
    for (const template of templates) this.subscribe(template);
  }

  private subscribe(template: string): void {
    const hass = this.hass;
    if (!hass?.connection) return;

    const pending = hass.connection
      .subscribeMessage<RenderTemplateResult>(
        (message) => {
          this.results.set(template, { value: message.result });
          this.onChange();
        },
        { type: 'render_template', template, report_errors: false },
      )
      .catch((error: unknown) => {
        // A bad template must degrade to an inline message on one row, never
        // take down the whole card.
        this.results.set(template, { error: errorMessage(error) });
        this.onChange();
        return () => undefined;
      });

    this.subscriptions.set(template, pending);
  }
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
