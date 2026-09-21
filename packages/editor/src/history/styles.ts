// History dialog styles (ticket 03 point 5): the sheet from `ui-design.md`
// 3.12 / `ui-plan.md` section 14, rows 28px. Structure and colours from the
// one token source, like the spotlight sheet; the dialog never animates (a
// keyboard action animates nothing, ui-plan section 16).

import type { DomDocument } from "../dom.ts";
import { editorBaseCss } from "../ui/base.ts";
import { EDITOR_ROOT_ATTRIBUTE, editorTokensCss } from "../ui/tokens.ts";

export const HISTORY_STYLES = `
.senify-history {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: none;
}
.senify-history[data-open="true"] { display: block; }
.senify-history__backdrop {
  position: absolute;
  inset: 0;
  background: var(--ed-scrim);
  backdrop-filter: blur(var(--ed-blur-scrim));
}
.senify-history__sheet {
  position: relative;
  width: min(var(--ed-w-dialog), calc(100vw - 32px));
  margin: 12vh auto 0;
  border-radius: var(--ed-radius-md);
  background: var(--ed-surface-raised);
  box-shadow: var(--ed-shadow-dialog), var(--ed-edge-top);
  overflow: hidden;
}
.senify-history__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--ed-line-hairline);
}
.senify-history__title {
  color: var(--ed-ink-strong);
  font-family: var(--ed-font-display);
  font-size: var(--ed-text-15);
  font-weight: var(--ed-weight-semibold);
}
.senify-history__close {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--ed-radius-sm);
  background: transparent;
  color: var(--ed-ink-muted);
  font: inherit;
  cursor: pointer;
}
.senify-history__close:hover { background: var(--ed-fill-hover); color: var(--ed-ink-strong); }
.senify-history__list {
  max-height: 50vh;
  overflow: auto;
  padding: 4px;
}
.senify-history__row {
  display: flex;
  align-items: center;
  gap: var(--ed-space-2);
  height: 28px;
  padding: 0 8px;
  border-radius: var(--ed-radius-sm);
  color: var(--ed-ink-base);
  cursor: pointer;
}
.senify-history__row:hover { background: var(--ed-fill-hover); }
.senify-history__row[data-current="true"] {
  background: var(--ed-fill-select);
  color: var(--ed-ink-strong);
  box-shadow: inset 0 0 0 1px var(--ed-signal-select);
}
.senify-history__row[data-future="true"] { color: var(--ed-ink-faint); }
.senify-history__time {
  flex: none;
  min-width: 4.5rem;
  color: var(--ed-ink-muted);
  font-family: var(--ed-font-mono);
  font-size: var(--ed-text-11);
  font-variant-numeric: tabular-nums;
}
.senify-history__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ed-text-12);
}
.senify-history__mark {
  flex: none;
  margin-left: auto;
  color: var(--ed-signal-select);
  font-size: var(--ed-text-11);
}
.senify-history__empty {
  padding: 16px 8px;
  color: var(--ed-ink-muted);
  font-size: var(--ed-text-12);
}
`.trim();

export function ensureHistoryStyles(doc: DomDocument): void {
  if (doc.querySelector("style[data-senify-history-tokens]") === null) {
    const tokens = doc.createElement("style");
    tokens.setAttribute("data-senify-history-tokens", "");
    tokens.textContent = `${editorTokensCss(`[${EDITOR_ROOT_ATTRIBUTE}]`)}\n${editorBaseCss()}\n`;
    (doc.head ?? doc.body).appendChild(tokens);
  }
  if (doc.querySelector("style[data-senify-history-styles]") === null) {
    const style = doc.createElement("style");
    style.setAttribute("data-senify-history-styles", "");
    style.textContent = HISTORY_STYLES;
    (doc.head ?? doc.body).appendChild(style);
  }
}
