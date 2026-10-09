// Explorer styles (ticket 03, slice 1): the layer tree of the rebuild editor.
// Structure only; every colour and measure is a `var(--ed-*)` reference from
// `ui/tokens.ts`, so the panel paints from the same source as canvas and
// inspector.

import type { DomDocument } from "../dom.ts";
import { EDITOR_ICON_CSS } from "../ui/icons.ts";
import { editorBaseCss } from "../ui/base.ts";
import { EDITOR_ROOT_ATTRIBUTE, editorTokensCss } from "../ui/tokens.ts";

export const EXPLORER_ICON_CSS = `
.senify-explorer .ic {
  display: inline-block;
  width: 12px;
  height: 12px;
  flex: none;
  background-color: currentColor;
  -webkit-mask: var(--m) center / contain no-repeat;
  mask: var(--m) center / contain no-repeat;
}
.senify-explorer .ic--10 { width: 10px; height: 10px; }
.senify-explorer .ic--20 { width: 20px; height: 20px; }
${EDITOR_ICON_CSS}
`.trim();

export const EXPLORER_STYLES = `
.senify-explorer {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--ed-surface-canvas);
  color: var(--ed-ink-base);
  font-family: var(--ed-font-body);
  font-size: var(--ed-text-12);
}
.senify-explorer * { box-sizing: border-box; }
.senify-explorer__header {
  display: flex;
  align-items: center;
  gap: var(--ed-space-2);
  min-height: var(--ed-h-topbar, 40px);
  padding: 0 var(--ed-space-3);
  border-bottom: 1px solid var(--ed-line-hairline);
  background: var(--ed-surface-raised);
}
.senify-explorer__title {
  font-family: var(--ed-font-display);
  font-size: var(--ed-text-13);
  font-weight: var(--ed-weight-semibold);
  letter-spacing: var(--ed-track-display);
  color: var(--ed-ink-strong);
}
.senify-explorer__count {
  margin-left: auto;
  font-family: var(--ed-font-mono);
  font-size: var(--ed-text-10);
  color: var(--ed-ink-muted);
}
.senify-explorer__body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--ed-space-1) 0 var(--ed-space-3);
}
.senify-explorer__tree { display: flex; flex-direction: column; }
.senify-explorer__item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  padding-right: 6px;
  cursor: default;
  color: var(--ed-ink-base);
  white-space: nowrap;
}
.senify-explorer__item:hover { background: var(--ed-fill-hover); }
.senify-explorer__item[data-selected="true"] {
  background: var(--ed-fill-select);
  color: var(--ed-ink-strong);
  box-shadow: inset 2px 0 0 var(--ed-signal-accent);
}
.senify-explorer__item:focus-visible {
  outline: 2px solid var(--ed-focus);
  outline-offset: -2px;
}
.senify-explorer__item[data-hidden="true"] .senify-explorer__label { opacity: 0.55; }
.senify-explorer__caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ed-ink-muted);
  cursor: pointer;
}
.senify-explorer__caret .ic { transition: transform var(--ed-t-1) var(--ed-ease-standard); }
.senify-explorer__caret:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: -2px; }
.senify-explorer__item[aria-expanded="true"] .senify-explorer__caret .ic { transform: rotate(0deg); }
.senify-explorer__item[aria-expanded="false"] .senify-explorer__caret .ic { transform: rotate(-90deg); }
.senify-explorer__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.senify-explorer__badges {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  color: var(--ed-ink-muted);
}
.senify-explorer__badge {
  display: inline-flex;
  align-items: center;
  height: 14px;
  padding: 0 4px;
  border-radius: var(--ed-radius-sm);
  background: var(--ed-surface-inset);
  font-family: var(--ed-font-mono);
  font-size: var(--ed-text-10);
  color: var(--ed-ink-muted);
}
.senify-explorer__badge--drift {
  background: var(--ed-signal-warning);
  color: var(--ed-ink-on-lime);
}
.senify-explorer__rename { flex: 1; min-width: 0; }
.senify-explorer__rename-input {
  width: 100%;
  height: 22px;
  padding: 0 6px;
  border: 0;
  background: var(--ed-surface-inset);
  box-shadow: inset 0 0 0 2px var(--ed-focus);
  color: var(--ed-ink-strong);
  font: inherit;
  outline: none;
}
.senify-explorer__menu {
  position: fixed;
  z-index: 40;
  min-width: 180px;
  padding: 4px;
  border-radius: var(--ed-radius-md);
  background: var(--ed-surface-raised);
  box-shadow: var(--ed-shadow-float);
  display: flex;
  flex-direction: column;
}
.senify-explorer__menu-item {
  display: flex;
  align-items: center;
  gap: var(--ed-space-2);
  min-height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--ed-radius-sm);
  background: transparent;
  color: var(--ed-ink-base);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.senify-explorer__menu-item:hover { background: var(--ed-fill-hover); color: var(--ed-ink-strong); }
.senify-explorer__menu-item:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: -2px; }
.senify-explorer__menu-item[data-danger="true"] { color: var(--ed-signal-danger-ink); }
.senify-explorer__menu-hint {
  margin-left: auto;
  font-family: var(--ed-font-mono);
  font-size: var(--ed-text-10);
  color: var(--ed-ink-faint);
}
/* Site-Tabs (Ticket 03 Punkt 1): Ebenen, Seiten, Medien — die Daten liefert
   die Shell. */
.senify-explorer__tabs {
  display: flex;
  gap: 2px;
  padding: 4px 6px 0;
  border-bottom: 1px solid var(--ed-line-hairline);
  overflow-x: auto;
  scrollbar-width: thin;
}
.senify-explorer__tab {
  flex: none;
  min-height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--ed-radius-sm) var(--ed-radius-sm) 0 0;
  background: transparent;
  color: var(--ed-ink-muted);
  font: inherit;
  font-size: var(--ed-text-11);
  cursor: pointer;
}
.senify-explorer__tab:hover { background: var(--ed-fill-hover); color: var(--ed-ink-strong); }
.senify-explorer__tab[data-active="true"] {
  background: var(--ed-surface-inset);
  color: var(--ed-ink-strong);
  box-shadow: inset 0 -2px 0 var(--ed-signal-select);
}
.senify-explorer__tab:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: -2px; }
.senify-explorer__tablist {
  display: flex;
  flex-direction: column;
  padding: 4px;
}
.senify-explorer__tabitem {
  display: flex;
  align-items: center;
  gap: var(--ed-space-2);
  min-height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--ed-radius-sm);
  background: transparent;
  color: var(--ed-ink-base);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.senify-explorer__tabitem:hover { background: var(--ed-fill-hover); color: var(--ed-ink-strong); }
.senify-explorer__tabitem[data-active="true"] {
  background: var(--ed-fill-select);
  color: var(--ed-ink-strong);
  box-shadow: inset 0 0 0 1px var(--ed-signal-select);
}
.senify-explorer__tabitem:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: -2px; }
.senify-elements {
  display: flex;
  flex-direction: column;
  gap: var(--ed-space-2);
  padding: var(--ed-space-2);
}
.senify-elements__search {
  box-sizing: border-box;
  width: 100%;
  min-height: 28px;
  padding: 0 var(--ed-space-2);
  border: 1px solid var(--ed-line-hairline);
  border-radius: var(--ed-radius-sm);
  background: var(--ed-surface-inset);
  color: var(--ed-ink-strong);
  font: inherit;
  font-size: var(--ed-text-12);
}
.senify-elements__search::placeholder { color: var(--ed-ink-faint); }
.senify-elements__search:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: -2px; }
.senify-elements__head {
  display: flex;
  align-items: center;
  gap: var(--ed-space-2);
  width: 100%;
  min-height: 28px;
  padding: 0 var(--ed-space-1);
  border: 0;
  border-radius: var(--ed-radius-sm);
  background: transparent;
  color: var(--ed-ink-strong);
  font: inherit;
  font-size: var(--ed-text-11);
  font-weight: var(--ed-weight-semibold);
  text-align: left;
  cursor: pointer;
}
.senify-elements__head:hover { background: var(--ed-fill-hover); }
.senify-elements__head:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: -2px; }
.senify-elements__group[data-open="false"] .senify-elements__head .ic { transform: rotate(-90deg); }
.senify-elements__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ed-space-1);
  padding: var(--ed-space-1) 0 var(--ed-space-2);
}
.senify-elements__grid[hidden] { display: none; }
.senify-elements__tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ed-space-1);
  min-height: 64px;
  padding: var(--ed-space-2) var(--ed-space-1);
  border: 1px solid var(--ed-line-hairline);
  border-radius: var(--ed-radius-md);
  background: transparent;
  color: var(--ed-ink-base);
  font: inherit;
  font-size: var(--ed-text-11);
  cursor: grab;
}
.senify-elements__tile:hover { background: var(--ed-fill-hover); color: var(--ed-ink-strong); }
.senify-elements__tile:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: -2px; }
.senify-elements__label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.senify-elements__empty { padding: var(--ed-space-3); color: var(--ed-ink-muted); font-size: var(--ed-text-12); }
.senify-explorer__tabhint {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ed-font-mono);
  font-size: var(--ed-text-10);
  color: var(--ed-ink-faint);
}
.senify-explorer__tabempty {
  padding: 12px 8px;
  color: var(--ed-ink-muted);
  font-size: var(--ed-text-12);
}
/* Ziehen (Ticket 03 Punkt 1): die Einfuegemarke zeigt vor/nach/hinein, rot
   bleibt der abgelehnte Zyklus-Fall. */
.senify-explorer__item[data-drop="before"] { box-shadow: inset 0 2px 0 var(--ed-signal-select); }
.senify-explorer__item[data-drop="after"] { box-shadow: inset 0 -2px 0 var(--ed-signal-select); }
.senify-explorer__item[data-drop="into"] { box-shadow: inset 0 0 0 1px var(--ed-signal-select); }
.senify-explorer__item[data-drop="rejected"] { box-shadow: inset 0 0 0 1px var(--ed-signal-danger); }
`.trim();

export function ensureExplorerStyles(doc: DomDocument): void {
  if (doc.querySelector("style[data-senify-explorer-tokens]") === null) {
    const tokens = doc.createElement("style");
    tokens.setAttribute("data-senify-explorer-tokens", "");
    tokens.textContent = `${editorTokensCss(`[${EDITOR_ROOT_ATTRIBUTE}]`)}\n${editorBaseCss()}\n`;
    (doc.head ?? doc.body).appendChild(tokens);
  }
  if (doc.querySelector("style[data-senify-explorer-icons]") === null) {
    const icons = doc.createElement("style");
    icons.setAttribute("data-senify-explorer-icons", "");
    icons.textContent = EXPLORER_ICON_CSS;
    (doc.head ?? doc.body).appendChild(icons);
  }
  if (doc.querySelector("style[data-senify-explorer-styles]") === null) {
    const style = doc.createElement("style");
    style.setAttribute("data-senify-explorer-styles", "");
    style.textContent = EXPLORER_STYLES;
    (doc.head ?? doc.body).appendChild(style);
  }
}
