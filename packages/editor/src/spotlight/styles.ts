// Spotlight styles (ticket 03, slice 1): the Cmd+K dialog. Structure only, all
// values from `ui/tokens.ts`; the dialog itself never animates (a keyboard
// action animates nothing, ui-plan section 16).

import type { DomDocument } from "../dom.ts";
import { editorBaseCss } from "../ui/base.ts";
import { EDITOR_ROOT_ATTRIBUTE, editorTokensCss } from "../ui/tokens.ts";

export const SPOTLIGHT_STYLES = `
.senify-spotlight {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: none;
}
.senify-spotlight[data-open="true"] { display: block; }
.senify-spotlight__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 0.55);
}
.senify-spotlight__dialog {
  position: relative;
  width: min(640px, calc(100vw - 32px));
  margin: 12vh auto 0;
  border-radius: var(--ed-radius-md);
  background: var(--ed-surface-raised);
  box-shadow: var(--ed-shadow-float);
  overflow: hidden;
}
.senify-spotlight__input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 0;
  border-bottom: 1px solid var(--ed-line-hairline);
  background: transparent;
  color: var(--ed-ink-strong);
  font-family: var(--ed-font-body);
  font-size: var(--ed-text-13);
  outline: none;
}
.senify-spotlight__input::placeholder { color: var(--ed-ink-faint); }
.senify-spotlight__input:focus { box-shadow: inset 0 -2px 0 var(--ed-signal-accent); }
.senify-spotlight__list {
  max-height: 50vh;
  overflow: auto;
  padding: 4px;
}
.senify-spotlight__group {
  padding: 8px 8px 4px;
  font-size: var(--ed-text-10);
  font-weight: var(--ed-weight-medium);
  letter-spacing: var(--ed-track-micro);
  text-transform: uppercase;
  color: var(--ed-ink-muted);
}
.senify-spotlight__row {
  display: flex;
  align-items: baseline;
  gap: var(--ed-space-2);
  min-height: 32px;
  padding: 4px 8px;
  border-radius: var(--ed-radius-sm);
  color: var(--ed-ink-base);
  cursor: pointer;
}
.senify-spotlight__row[data-active="true"] {
  background: var(--ed-fill-select);
  color: var(--ed-ink-strong);
}
.senify-spotlight__label { font-size: var(--ed-text-12); }
.senify-spotlight__description {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ed-text-11);
  color: var(--ed-ink-muted);
}
.senify-spotlight__empty {
  padding: 16px 8px;
  color: var(--ed-ink-muted);
  font-size: var(--ed-text-12);
}
`.trim();

export function ensureSpotlightStyles(doc: DomDocument): void {
  if (doc.querySelector("style[data-senify-spotlight-tokens]") === null) {
    const tokens = doc.createElement("style");
    tokens.setAttribute("data-senify-spotlight-tokens", "");
    tokens.textContent = `${editorTokensCss(`[${EDITOR_ROOT_ATTRIBUTE}]`)}\n${editorBaseCss()}\n`;
    (doc.head ?? doc.body).appendChild(tokens);
  }
  if (doc.querySelector("style[data-senify-spotlight-styles]") === null) {
    const style = doc.createElement("style");
    style.setAttribute("data-senify-spotlight-styles", "");
    style.textContent = SPOTLIGHT_STYLES;
    (doc.head ?? doc.body).appendChild(style);
  }
}
