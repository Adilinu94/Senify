// Inspector styles (ticket 02, slice 1).
//
// The field family of the preview (`ui-preview/index.html`, `ui-plan.md`
// 5.1-5.5) brought into the editor: field, number with stepper, slider with
// unit, switch, select and the colour picker. Every value is a `var(--ed-*)`
// reference — `ui/tokens.ts` stays the only place a colour or a measure is
// written down, exactly like the canvas sheet. The structure lives here, the
// paint comes from the tokens the root carries (`data-senify-editor`).

import type { DomDocument } from "../dom.ts";
import { editorFontFaceCss } from "../ui/fonts.ts";
import { EDITOR_ICON_CSS } from "../ui/icons.ts";
import { editorBaseCss } from "../ui/base.ts";
import { EDITOR_ROOT_ATTRIBUTE, editorTokensCss } from "../ui/tokens.ts";

export const INSPECTOR_ICON_CSS = `
.senify-inspector .ic {
  display: inline-block;
  width: 14px;
  height: 14px;
  flex: none;
  background-color: currentColor;
  -webkit-mask: var(--m) center / contain no-repeat;
  mask: var(--m) center / contain no-repeat;
}
.senify-inspector .ic--10 { width: 10px; height: 10px; }
.senify-inspector .ic--12 { width: 12px; height: 12px; }
${EDITOR_ICON_CSS}
`.trim();

export const INSPECTOR_STYLES = `
.senify-inspector {
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
.senify-inspector * { box-sizing: border-box; }
.senify-inspector__header {
  display: flex;
  align-items: center;
  gap: var(--ed-space-2);
  min-height: var(--ed-h-topbar, 40px);
  padding: 0 var(--ed-space-3);
  border-bottom: 1px solid var(--ed-line-hairline);
  background: var(--ed-surface-raised);
}
.senify-inspector__title {
  font-family: var(--ed-font-display);
  font-size: var(--ed-text-13);
  font-weight: var(--ed-weight-semibold);
  letter-spacing: var(--ed-track-display);
  color: var(--ed-ink-strong);
}
.senify-inspector__id {
  margin-left: auto;
  font-family: var(--ed-font-mono);
  font-size: var(--ed-text-10);
  color: var(--ed-ink-faint);
}
.senify-inspector__tabs {
  display: flex;
  align-items: stretch;
  gap: var(--ed-space-4);
  height: var(--ed-h-tabrow, 36px);
  padding: 0 var(--ed-space-3);
  border-bottom: 1px solid var(--ed-line-hairline);
}
.senify-inspector__tab {
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ed-ink-muted);
  font: inherit;
  font-weight: var(--ed-weight-medium);
  cursor: pointer;
  box-shadow: inset 0 -2px 0 transparent;
}
.senify-inspector__tab:hover { color: var(--ed-ink-strong); }
.senify-inspector__tab[data-active="true"] {
  color: var(--ed-ink-strong);
  box-shadow: inset 0 -2px 0 var(--ed-signal-accent);
}
.senify-inspector__tab:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: -2px; }
.senify-inspector__reset:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: 1px; }
.senify-inspector__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--ed-space-2) var(--ed-space-3) var(--ed-space-4);
}
.senify-inspector__empty {
  padding: var(--ed-space-4) 0;
  color: var(--ed-ink-muted);
}
.senify-inspector__group { margin-bottom: var(--ed-space-3); }
.senify-inspector__group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ed-ink-muted);
  font: inherit;
  font-size: var(--ed-text-11);
  font-weight: var(--ed-weight-medium);
  letter-spacing: var(--ed-track-micro);
  text-transform: uppercase;
  cursor: pointer;
}
.senify-inspector__group-title:hover { color: var(--ed-ink-base); }
.senify-inspector__group-title .ic { transition: transform var(--ed-t-1) var(--ed-ease-standard); }
.senify-inspector__group[data-collapsed="true"] .senify-inspector__group-title .ic { transform: rotate(-90deg); }
.senify-inspector__field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) auto;
  align-items: center;
  gap: var(--ed-space-2);
  min-height: 32px;
}
.senify-inspector__field-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ed-ink-muted);
  font-size: var(--ed-text-12);
  font-weight: var(--ed-weight-medium);
}
.senify-inspector__field-control { display: flex; align-items: center; gap: 6px; min-width: 0; }
.senify-inspector__field-side { display: flex; align-items: center; gap: 4px; }
.senify-inspector__warning {
  grid-column: 2 / -1;
  color: var(--ed-signal-warning);
  font-size: var(--ed-text-11);
}
.senify-inspector__dots { display: flex; align-items: center; gap: 3px; }
.senify-inspector__dot {
  width: 6px; height: 6px; border-radius: var(--ed-radius-full);
  background: var(--ed-ink-faint);
  cursor: pointer;
}
.senify-inspector__dot[data-override="true"] { background: var(--ed-signal-accent); }
.senify-inspector__dot[data-active="true"] {
  box-shadow: 0 0 0 2px var(--ed-surface-panel), 0 0 0 3px var(--ed-signal-accent);
}
.senify-inspector__reset {
  min-height: 22px; padding: 0 6px; border: 0; border-radius: var(--ed-radius-sm);
  background: transparent; color: var(--ed-ink-muted); font: inherit; font-size: var(--ed-text-10);
  cursor: pointer;
}
.senify-inspector__reset:hover { background: var(--ed-fill-hover); color: var(--ed-ink-strong); }

/* --------------------------------------------------- states and open props */
.senify-inspector__states {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px 10px 2px;
}
.senify-inspector__state {
  min-height: 22px; padding: 0 8px; border: 0; border-radius: var(--ed-radius-sm);
  background: var(--ed-fill-hover); color: var(--ed-ink-muted);
  font: inherit; font-size: var(--ed-text-10); cursor: pointer;
}
.senify-inspector__state[data-active="true"] {
  background: var(--ed-fill-select); color: var(--ed-ink-strong);
}
.senify-inspector__state:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: 1px; }
.senify-inspector__addprop {
  display: flex; align-items: center; gap: 4px; padding: 6px 10px 10px;
}
.senify-inspector__addprop input {
  width: 100%; min-width: 0; height: var(--ed-h-field); padding: 0 8px; border: 0;
  background-color: var(--ed-surface-inset); color: var(--ed-ink-base);
  font: inherit; font-size: var(--ed-text-12);
  box-shadow: inset 0 0 0 1px var(--ed-line-control);
}
.senify-inspector__addprop input:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: -1px; }
.senify-inspector__addbtn {
  min-height: var(--ed-h-field); padding: 0 8px; border: 0; border-radius: var(--ed-radius-sm);
  background: var(--ed-fill-hover); color: var(--ed-ink-muted); font: inherit;
  font-size: var(--ed-text-10); cursor: pointer; white-space: nowrap;
}
.senify-inspector__addbtn:hover { background: var(--ed-fill-select); color: var(--ed-ink-strong); }

/* ------------------------------------------------------------ field family */
.ed-field {
  display: flex; align-items: center; gap: 6px;
  width: 100%; height: var(--ed-h-field); padding: 0 8px;
  background-color: var(--ed-surface-inset);
  --base-line: var(--ed-line-control);
  color: var(--ed-ink-base); font-size: var(--ed-text-12);
  font-variant-numeric: tabular-nums;
  box-shadow: inset 0 0 0 1px var(--base-line);
}
.ed-field--value { color: var(--ed-ink-strong); }
.ed-field:focus-within { box-shadow: inset 0 0 0 2px var(--ed-focus); }
.ed-field input, .ed-field textarea, .ed-field select {
  width: 100%; min-width: 0; border: 0; background: transparent; outline: none;
  color: inherit; font: inherit; font-variant-numeric: tabular-nums; padding: 0;
}
.ed-field select { cursor: pointer; }
.ed-field textarea { min-height: 3.2rem; resize: vertical; padding: 4px 0; }
.ed-field input::placeholder { color: var(--ed-ink-faint); }
.ed-field__unit { color: var(--ed-ink-muted); font-size: var(--ed-text-11); flex: none; }
.ed-stepper { display: flex; flex-direction: column; gap: 1px; flex: none; }
.ed-stepper button {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 13px; padding: 0; border: 0; cursor: pointer;
  background: var(--ed-fill-hover); color: var(--ed-ink-muted);
}
.ed-stepper button:hover { background: var(--ed-fill-select); color: var(--ed-ink-strong); }
.ed-stepper button:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: -1px; }
.ed-stepper button:first-child { border-radius: 4px 4px 0 0; }
.ed-stepper button:last-child { border-radius: 0 0 4px 4px; }
.ed-slider { display: flex; align-items: center; gap: var(--ed-space-2); width: 100%; min-width: 0; }
.ed-slider input[type="range"] {
  -webkit-appearance: none; appearance: none; width: 100%; min-width: 40px;
  height: var(--ed-hit-min); margin: 0; background: transparent; cursor: pointer;
}
.ed-slider input[type="range"]::-webkit-slider-runnable-track {
  height: 4px; border-radius: 0; background: rgb(154 201 226 / 0.22);
}
.ed-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 12px; height: 12px; margin-top: -4px; border-radius: 0;
  background: var(--ed-ink-strong); box-shadow: inset 0 0 0 1px var(--ed-line-control);
}
.ed-slider input[type="range"]:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: 1px; }
.ed-switch {
  display: inline-flex; align-items: center; border: 0; background: transparent;
  cursor: pointer; padding: 0;
}
.ed-switch__track {
  position: relative; width: 32px; height: 18px; flex: none;
  border-radius: var(--ed-radius-full); background: rgb(154 201 226 / 0.26);
  transition: background-color var(--ed-t-1) var(--ed-ease-standard);
}
.ed-switch__knob {
  position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
  border-radius: var(--ed-radius-full); background: var(--ed-ink-strong);
  box-shadow: inset 0 0 0 1px rgb(1 40 60 / 0.35);
  transition: transform var(--ed-t-2) var(--ed-ease-standard);
}
.ed-switch[aria-checked="true"] .ed-switch__track { background: var(--ed-signal-accent); }
.ed-switch[aria-checked="true"] .ed-switch__knob { transform: translateX(14px); }
.ed-switch:hover .ed-switch__track { background: rgb(154 201 226 / 0.34); }
.ed-switch[aria-checked="true"]:hover .ed-switch__track { background: var(--ed-fill-accent-hover); }
.ed-switch:focus-visible .ed-switch__track { outline: 2px solid var(--ed-focus); outline-offset: 1px; }
.ed-swatch {
  width: 16px; height: 16px; flex: none; border-radius: var(--ed-radius-sm);
  box-shadow: inset 0 0 0 1px var(--ed-line-control);
}
.ed-color { display: flex; flex-direction: column; gap: var(--ed-space-2); width: 100%; }
.ed-color__row { display: flex; align-items: center; gap: 6px; }
.ed-color__panel {
  padding: var(--ed-space-3);
  border-radius: var(--ed-radius-md);
  background: var(--ed-surface-raised);
  box-shadow: var(--ed-shadow-float);
  display: flex; flex-direction: column; gap: var(--ed-space-2);
}
.ed-color__palette { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; }
.ed-color__tile {
  width: 20px; height: 20px; padding: 0; border: 0; cursor: pointer;
  border-radius: var(--ed-radius-sm);
  box-shadow: inset 0 0 0 1px var(--ed-line-control);
}
.ed-color__tile:hover { box-shadow: inset 0 0 0 2px var(--ed-signal-select, var(--ed-focus)); }
.ed-color__tile:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: 1px; }
.ed-color__tile[data-token="true"] { box-shadow: inset 0 0 0 2px var(--ed-signal-accent); }
.ed-color__meta { display: flex; align-items: center; gap: var(--ed-space-2); }
.ed-color__token-name {
  font-family: var(--ed-font-mono); font-size: var(--ed-text-10); color: var(--ed-ink-muted);
}
.ed-token__list { display: flex; flex-direction: column; gap: 2px; max-height: 180px; overflow: auto; }
.ed-token__tile {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ed-space-2);
  min-height: 22px; padding: 0 6px; border: 0; cursor: pointer;
  border-radius: var(--ed-radius-sm); background: transparent;
  color: var(--ed-ink-base); font: inherit; font-size: var(--ed-text-11);
}
.ed-token__tile:hover { background: var(--ed-fill-hover); }
.ed-token__tile:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: 1px; }
.ed-token__tile[data-token="true"] { background: var(--ed-fill-select); color: var(--ed-ink-strong); }
.ed-token__value {
  font-family: var(--ed-font-mono); font-size: var(--ed-text-10); color: var(--ed-ink-muted);
}
.ed-fourow { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--ed-space-1); width: 100%; }
.ed-divfield {
  display: flex; align-items: center; gap: 4px; height: var(--ed-h-field); padding: 0 6px;
  background: var(--ed-surface-inset); box-shadow: inset 0 0 0 1px var(--ed-line-control);
}
.ed-divfield .ic { color: var(--ed-ink-muted); }
.ed-divfield input { border: 0; background: transparent; outline: none; width: 100%; min-width: 0; color: inherit; font: inherit; }
.ed-linkbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; flex: none; padding: 0; border: 0; border-radius: var(--ed-radius-sm);
  background: transparent; color: var(--ed-ink-muted); cursor: pointer;
}
.ed-linkbtn:hover { background: var(--ed-fill-hover); color: var(--ed-ink-strong); }
.ed-linkbtn:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: 1px; }
.ed-linkbtn[aria-pressed="true"] { color: var(--ed-signal-accent); }
`.trim();

export function ensureInspectorStyles(doc: DomDocument): void {
  if (doc.querySelector("style[data-senify-inspector-fonts]") === null) {
    const fonts = doc.createElement("style");
    fonts.setAttribute("data-senify-inspector-fonts", "");
    fonts.textContent = editorFontFaceCss();
    (doc.head ?? doc.body).appendChild(fonts);
  }
  if (doc.querySelector("style[data-senify-inspector-tokens]") === null) {
    const tokens = doc.createElement("style");
    tokens.setAttribute("data-senify-inspector-tokens", "");
    tokens.textContent = `${editorTokensCss(`[${EDITOR_ROOT_ATTRIBUTE}]`)}\n${editorBaseCss()}\n`;
    (doc.head ?? doc.body).appendChild(tokens);
  }
  if (doc.querySelector("style[data-senify-inspector-icons]") === null) {
    const icons = doc.createElement("style");
    icons.setAttribute("data-senify-inspector-icons", "");
    icons.textContent = INSPECTOR_ICON_CSS;
    (doc.head ?? doc.body).appendChild(icons);
  }
  if (doc.querySelector("style[data-senify-inspector-styles]") === null) {
    const style = doc.createElement("style");
    style.setAttribute("data-senify-inspector-styles", "");
    style.textContent = INSPECTOR_STYLES;
    (doc.head ?? doc.body).appendChild(style);
  }
}
