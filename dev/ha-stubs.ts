/**
 * Stand-ins for the Home Assistant frontend elements the editor uses, so the
 * editor can be developed outside Home Assistant.
 *
 * `ha-form` is the one that matters. It reproduces the real component's data
 * semantics exactly, copied from `src/components/ha-form/ha-form.ts`:
 *
 *   getValue  = (obj, item) => obj ? (!item.name || item.flatten ? obj : obj[item.name]) : undefined
 *   newValue  = !schema.name || schema.flatten ? detail.value : { [schema.name]: detail.value }
 *
 * The `!item.name` branch is what makes a nameless schema item a pass-through
 * group, which the editor relies on to put settings from several config keys
 * behind one panel. Getting that wrong silently writes config to the wrong
 * nesting level, so it is worth mirroring rather than approximating.
 *
 * Styling is deliberately crude. This harness is for structure and data flow,
 * not for judging how the editor looks in Home Assistant.
 */
import { LitElement, css, html, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

interface SchemaItem {
  name?: string;
  flatten?: boolean;
  type?: string;
  title?: string;
  icon?: string;
  schema?: SchemaItem[];
  selector?: Record<string, any>;
}

type Data = Record<string, any>;

const getValue = (obj: Data | undefined, item: SchemaItem): any =>
  obj ? (!item.name || item.flatten ? obj : obj[item.name]) : undefined;

@customElement('ha-expansion-panel')
export class HaExpansionPanel extends LitElement {
  @property({ type: Boolean, reflect: true }) expanded = false;
  @property({ type: Boolean, reflect: true }) outlined = false;
  @property() header?: string;
  @property() secondary?: string;

  override render(): TemplateResult {
    return html`
      <div class="top" @click=${() => (this.expanded = !this.expanded)}>
        <slot name="leading-icon"></slot>
        <div class="titles">
          <div class="header"><slot name="header">${this.header}</slot></div>
          ${this.secondary ? html`<div class="secondary">${this.secondary}</div>` : nothing}
        </div>
        <div class="chevron">${this.expanded ? '▲' : '▼'}</div>
      </div>
      ${this.expanded ? html`<div class="content"><slot></slot></div>` : nothing}
    `;
  }

  static override styles = css`
    :host {
      display: block;
      border: 1px solid var(--divider-color, #ddd);
      border-radius: 8px;
      overflow: hidden;
    }
    .top {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      cursor: pointer;
      user-select: none;
    }
    .titles {
      flex: 1;
      min-width: 0;
    }
    .header {
      font-weight: 500;
    }
    .secondary {
      font-size: 12px;
      color: var(--secondary-text-color, #777);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chevron {
      font-size: 10px;
      color: var(--secondary-text-color, #777);
    }
    .content {
      border-top: 1px solid var(--divider-color, #ddd);
    }
  `;
}

@customElement('ha-form')
export class HaForm extends LitElement {
  @property({ attribute: false }) hass?: unknown;
  @property({ attribute: false }) data: Data = {};
  @property({ attribute: false }) schema: SchemaItem[] = [];
  @property({ attribute: false }) computeLabel?: (item: SchemaItem) => string;

  private _label(item: SchemaItem): string {
    return this.computeLabel?.(item) ?? item.name ?? '';
  }

  /** Mirrors the real component's merge-and-refire behaviour. */
  private _emit(item: SchemaItem, value: any): void {
    const newValue = !item.name || item.flatten ? value : { [item.name]: value };
    this.data = { ...this.data, ...newValue };
    this.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: this.data },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render(): TemplateResult {
    return html`${this.schema.map((item) => this._renderItem(item))}`;
  }

  private _renderItem(item: SchemaItem): TemplateResult {
    if (item.type === 'expandable') {
      return html`
        <ha-expansion-panel outlined .header=${item.title ?? item.name} class="nested">
          ${item.icon ? html`<ha-icon slot="leading-icon" .icon=${item.icon}></ha-icon>` : nothing}
          <div class="nested-content">
            <ha-form
              .data=${getValue(this.data, item)}
              .schema=${item.schema ?? []}
              .computeLabel=${this.computeLabel}
              @value-changed=${(event: CustomEvent) => {
                event.stopPropagation();
                this._emit(item, event.detail.value);
              }}
            ></ha-form>
          </div>
        </ha-expansion-panel>
      `;
    }

    if (item.type === 'grid') {
      return html`
        <div class="grid">
          <ha-form
            .data=${getValue(this.data, item)}
            .schema=${item.schema ?? []}
            .computeLabel=${this.computeLabel}
            @value-changed=${(event: CustomEvent) => {
              event.stopPropagation();
              this._emit(item, event.detail.value);
            }}
          ></ha-form>
        </div>
      `;
    }

    const value = getValue(this.data, item);
    const selector = item.selector ?? {};
    const kind = Object.keys(selector)[0] ?? 'text';

    if (kind === 'boolean') {
      return html`
        <label class="field row">
          <input
            type="checkbox"
            .checked=${Boolean(value)}
            @change=${(e: Event) => this._emit(item, (e.target as HTMLInputElement).checked)}
          />
          <span>${this._label(item)}</span>
        </label>
      `;
    }

    if (kind === 'select') {
      const options: { value: string; label: string }[] = selector.select.options ?? [];
      return html`
        <label class="field">
          <span>${this._label(item)}</span>
          <select @change=${(e: Event) => this._emit(item, (e.target as HTMLSelectElement).value)}>
            <option value="">(unset)</option>
            ${options.map(
              (option) => html`
                <option value=${option.value} ?selected=${value === option.value}>
                  ${option.label}
                </option>
              `,
            )}
          </select>
        </label>
      `;
    }

    const numeric = kind === 'number';
    return html`
      <label class="field">
        <span>${this._label(item)}<em>${item.name}</em></span>
        <input
          type=${numeric ? 'number' : 'text'}
          step=${numeric ? (selector.number?.step ?? 'any') : nothing}
          .value=${value === undefined || value === null ? '' : String(value)}
          @change=${(e: Event) => {
            const raw = (e.target as HTMLInputElement).value;
            if (raw === '') return this._emit(item, undefined);
            this._emit(item, numeric ? Number(raw) : raw);
          }}
        />
      </label>
    `;
  }

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .grid ha-form {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 13px;
    }
    .field.row {
      flex-direction: row;
      align-items: center;
      gap: 6px;
    }
    .field em {
      color: #999;
      font-size: 10px;
      font-style: normal;
      margin-left: 6px;
    }
    input[type='text'],
    input[type='number'],
    select {
      font: inherit;
      padding: 4px 6px;
      border: 1px solid var(--divider-color, #ccc);
      border-radius: 4px;
      min-width: 0;
    }
    .nested-content {
      padding: 10px;
    }
    ha-expansion-panel.nested {
      margin: 4px 0;
    }
  `;
}

/*
 * There was an `ha-textfield` stub here. It is gone because the editor no
 * longer uses that element, and the stub was actively harmful: it rendered a
 * working input in the harness while the real element was not registered in
 * Home Assistant, so the search field was missing in production and present
 * here. A stub for an element we do not use hides exactly that class of bug.
 */

@customElement('ha-icon')
export class HaIcon extends LitElement {
  @property() icon = '';
  override render(): TemplateResult {
    return html`<span title=${this.icon}>◆</span>`;
  }
  static override styles = css`
    :host {
      display: inline-flex;
      font-size: 12px;
      opacity: 0.6;
    }
  `;
}

@customElement('ha-alert')
export class HaAlert extends LitElement {
  override render(): TemplateResult {
    return html`<slot></slot>`;
  }
  static override styles = css`
    :host {
      display: block;
      padding: 8px;
      border-radius: 4px;
      background: #fdecea;
      font-size: 13px;
    }
  `;
}
