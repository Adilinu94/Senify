import type { DomDocument } from "./dom.ts";
import { editorFontFaceCss } from "./ui/fonts.ts";
import { EDITOR_ICON_CSS } from "./ui/icons.ts";
import { editorBaseCss } from "./ui/base.ts";
import { EDITOR_SKIN_STYLES } from "./ui/skin.ts";
import { EDITOR_ROOT_ATTRIBUTE, editorTokensCss } from "./ui/tokens.ts";

// The editor chrome, shaped after the Elementor workbench (T17): top bar with
// device switcher, page name, structure, finder, preview and publish; one
// left panel that flips between the widget catalog and the element settings
// (Content/Style/Advanced); a gray stage with a white sheet per breakpoint,
// selection handle, "+" insert points and a zoom footer. This stylesheet is
// injected once per document via `ensureEditorStyles` so every host gets the
// same shell; the frame content stays untouched — each iframe owns its own
// document and its own (theme-driven) styles.
//
// The palette mirrors the reference measurements: panel 17.5rem (<1440px
// viewport) or 18.75rem (>=1440px), accent #d004d4, hover #e879f9, text
// #515962, borders #d5d8dc, top bar 3rem.

export const EDITOR_STYLES = `${editorFontFaceCss()}
.senify-editor {
  --ed-accent: #d004d4;
  --ed-accent-light: #f0abfc;
  --ed-accent-hover: #e879f9;
  --ed-text: #515962;
  --ed-text-strong: #0c0d0e;
  --ed-line: #d5d8dc;
  --ed-line-soft: #eceef0;
  --ed-surface: #ffffff;
  --ed-hover: #f1f2f3;
  --ed-canvas: #e0e0e0;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 24rem;
  overflow: hidden;
  background: var(--ed-canvas);
  color: var(--ed-text);
  /* The chrome uses Inter (bundled, see ui/fonts.ts); the theme variable
     already starts with Inter and stays as the fallback chain otherwise. */
  font-family: var(--font-body, "Inter", system-ui, sans-serif);
  font-size: 13px;
  line-height: 1.45;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 0.5rem;
}
.senify-editor *, .senify-editor *::before, .senify-editor *::after {
  box-sizing: border-box;
}

/* ---------------------------------------------------------------- top bar */

.senify-editor__topbar {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 3rem;
  padding: 0 0.5rem;
  background: var(--ed-surface);
  border-bottom: 1px solid var(--ed-line);
}
.senify-editor__menugroup { position: relative; display: flex; }
.senify-editor__spacer { flex: 1; }
.senify-editor__brand {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.2rem;
  padding: 0 0.55rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--ed-text-strong);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.senify-editor__brand:hover { background: var(--ed-hover); }
.senify-editor__brand-mark {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.35rem;
  background: linear-gradient(135deg, var(--ed-accent-light), var(--ed-accent));
  color: #ffffff;
  font-size: 0.72rem;
  font-weight: 800;
}
.senify-editor__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  min-height: 2.2rem;
  min-width: 2.2rem;
  padding: 0 0.6rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--ed-text);
  font: inherit;
  cursor: pointer;
}
.senify-editor__button:hover { background: var(--ed-hover); color: var(--ed-text-strong); }
.senify-editor__button[data-active="true"] {
  background: color-mix(in srgb, var(--ed-accent) 12%, transparent);
  color: #a21caf;
}
.senify-editor__button[data-enabled="false"] { opacity: 0.4; cursor: default; }
.senify-editor__button[data-enabled="false"]:hover { background: transparent; }
.senify-editor__button--primary {
  align-self: flex-start;
  justify-self: start;
  padding: 0 0.9rem;
  background: var(--ed-accent);
  color: #ffffff;
  font-weight: 600;
  min-height: 2rem;
}
.senify-editor__button--primary:hover { background: #b000b0; color: #ffffff; }
.senify-editor__group { display: flex; gap: 0.15rem; }
.senify-editor__devices {
  display: flex;
  gap: 0.1rem;
  margin: 0 0.2rem;
  padding: 0.15rem;
  border: 1px solid var(--ed-line);
  border-radius: 0.3rem;
}
.senify-editor__devices .senify-editor__button { min-height: 1.9rem; padding: 0 0.55rem; }
.senify-editor__devices .senify-editor__button[data-active="true"] {
  background: var(--ed-accent);
  color: #ffffff;
}
.senify-editor__sep { width: 1px; height: 1.7rem; margin: 0 0.25rem; background: var(--ed-line); }
.senify-editor__title {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 0.3rem;
  padding: 0 0.35rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.senify-editor__title:hover { background: var(--ed-hover); }
.senify-editor__title strong { color: var(--ed-text-strong); font-weight: 600; }
.senify-editor__title small { color: var(--ed-text); font-size: 0.78em; }
.senify-editor__publish-group { display: flex; align-items: stretch; margin-left: 0.2rem; }
.senify-editor__publish {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.3rem;
  padding: 0 1rem;
  border: 0;
  border-radius: 0.25rem 0 0 0.25rem;
  background: var(--ed-accent);
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.senify-editor__publish:hover { background: #b000b0; }
.senify-editor__publish-caret {
  min-width: 1.7rem;
  min-height: 2.3rem;
  padding: 0;
  border: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 0 0.25rem 0.25rem 0;
  background: var(--ed-accent);
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}
.senify-editor__publish-caret:hover { background: #b000b0; }
.senify-editor__menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  min-width: 15rem;
  max-height: 22rem;
  overflow: auto;
  padding: 0.3rem;
  background: var(--ed-surface);
  border: 1px solid var(--ed-line);
  border-radius: 0.35rem;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.16);
}
.senify-editor__menu[data-align="end"] { left: auto; right: 0; }
.senify-editor__menu-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.45rem 0.55rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--ed-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.senify-editor__menu-item:hover { background: var(--ed-hover); color: var(--ed-text-strong); }
.senify-editor__menu-item[data-active="true"] { color: var(--ed-text-strong); font-weight: 600; }
.senify-editor__menu-item[data-enabled="false"] { opacity: 0.4; cursor: default; }
.senify-editor__menu-item[data-enabled="false"]:hover { background: transparent; }
.senify-editor__menu-sep { height: 1px; margin: 0.25rem 0.3rem; background: var(--ed-line-soft); }
.senify-editor__menu-label {
  padding: 0.4rem 0.55rem 0.15rem;
  color: var(--ed-text);
  font-size: 0.78em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.senify-editor__history-time { margin-left: auto; color: var(--ed-text); opacity: 0.7; font-size: 0.85em; }

/* ------------------------------------------------------- panel and rail */

.senify-editor__main {
  display: grid;
  flex: 1;
  min-height: 0;
  grid-template-columns: 17.5rem minmax(8rem, 13rem) minmax(0, 1fr);
}
.senify-editor__main--norail { grid-template-columns: 17.5rem 0 minmax(0, 1fr); }
.senify-editor__main--norail .senify-editor__rail { display: none; }
/* Panel-Trennkanten (Aufgabe 29) gehoeren zur neuen Haut: ohne sie sind sie
   unsichtbar und ohne Wirkung, das alte Raster bleibt unveraendert. Die Haut
   (ui/skin.ts) blendet sie ein und verstellt die Spaltenbreite. */
.senify-editor__split { display: none; }
@media (min-width: 1440px) {
  .senify-editor__main { grid-template-columns: 18.75rem minmax(8rem, 13rem) minmax(0, 1fr); }
  .senify-editor__main--norail { grid-template-columns: 18.75rem 0 minmax(0, 1fr); }
}
.senify-editor__panels {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: auto;
  background: var(--ed-surface);
  border-right: 1px solid var(--ed-line);
}
.senify-editor__panel-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 3rem;
  padding: 0.25rem 0.55rem;
  background: var(--ed-surface);
  border-bottom: 1px solid var(--ed-line);
}
.senify-editor__panel-heading {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ed-text-strong);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.senify-editor__iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.9rem;
  min-height: 1.9rem;
  padding: 0 0.35rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--ed-text);
  font: inherit;
  cursor: pointer;
}
.senify-editor__iconbtn:hover { background: var(--ed-hover); color: var(--ed-text-strong); }
.senify-editor__ptabs {
  display: flex;
  border-bottom: 1px solid var(--ed-line);
}
.senify-editor__ptab {
  flex: 1;
  padding: 0.6rem 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ed-text);
  font: inherit;
  cursor: pointer;
}
.senify-editor__ptab:hover { color: var(--ed-text-strong); }
.senify-editor__ptab[data-active="true"] {
  color: var(--ed-text-strong);
  border-bottom-color: var(--ed-accent);
  font-weight: 600;
}
.senify-editor__rail {
  overflow: auto;
  background: var(--ed-surface);
  border-right: 1px solid var(--ed-line);
}
.senify-editor__tabs {
  display: flex;
  gap: 0.1rem;
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0.3rem;
  background: var(--ed-surface);
  border-bottom: 1px solid var(--ed-line);
}
.senify-editor__tab {
  flex: 1;
  padding: 0.3rem 0;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--ed-text);
  font: inherit;
  cursor: pointer;
}
.senify-editor__tab:hover { background: var(--ed-hover); }
.senify-editor__tab[data-active="true"] {
  background: color-mix(in srgb, var(--ed-accent) 12%, transparent);
  color: #a21caf;
  font-weight: 600;
}
.senify-editor__list { padding: 0.3rem; }
.senify-editor__row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  width: 100%;
  padding: 0.32rem 0.45rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.senify-editor__row-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
}
.senify-editor__eye {
  padding: 0 0.2rem;
  opacity: 0.4;
  cursor: pointer;
}
.senify-editor__eye:hover { opacity: 1; color: var(--ed-accent); }
.senify-editor__row[data-drop="before"] { box-shadow: inset 0 2px 0 var(--ed-accent); }
.senify-editor__row[data-drop="after"] { box-shadow: inset 0 -2px 0 var(--ed-accent); }
.senify-editor__row[data-dragging="true"] { opacity: 0.45; }
.senify-editor__row:hover { background: var(--ed-hover); }
.senify-editor__row[data-active="true"] {
  background: color-mix(in srgb, var(--ed-accent) 14%, transparent);
  color: #a21caf;
}
.senify-editor__row[data-hidden="true"] { opacity: 0.5; }
.senify-editor__section {
  padding: 0.5rem 0.45rem 0.15rem;
  color: var(--ed-text);
  font-size: 0.78em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.senify-editor__search {
  width: calc(100% - 0.9rem);
  margin: 0.45rem;
  padding: 0.42rem 0.55rem;
  border: 1px solid var(--ed-line);
  border-radius: 0.25rem;
  background: var(--ed-surface);
  color: inherit;
  font: inherit;
}
.senify-editor__search:focus {
  border-color: var(--ed-accent);
  outline: 1px solid var(--ed-accent);
}

/* ------------------------------------------------------------- widget catalog */

.senify-editor__widgets { padding: 0 0.65rem 0.9rem; }
.senify-editor__hint {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.55rem 0 0;
  padding: 0.45rem 0.55rem;
  border-radius: 0.3rem;
  background: color-mix(in srgb, var(--ed-accent) 10%, transparent);
  color: #86198f;
}
.senify-editor__hint span { flex: 1; min-width: 0; }
.senify-editor__widget-category {
  margin: 0.8rem 0 0.35rem;
  color: var(--ed-text);
  font-size: 0.78em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.senify-editor__widget-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
}
.senify-editor__widget-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.7rem 0.35rem;
  border: 1px solid var(--ed-line);
  border-radius: 0.35rem;
  background: var(--ed-surface);
  color: var(--ed-text);
  font: inherit;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.senify-editor__widget-card:hover {
  border-color: var(--ed-accent);
  box-shadow: 0 6px 18px rgba(208, 4, 212, 0.14);
}
.senify-editor__widget-card[data-dragging="true"] {
  opacity: 0.5;
  border-style: dashed;
}
.senify-editor__widget-icon {
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 0.3rem;
  background: linear-gradient(135deg, var(--ed-accent-light), var(--ed-accent));
  opacity: 0.85;
}
.senify-editor__widget-label {
  width: 100%;
  overflow: hidden;
  font-size: 0.82em;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ------------------------------------------------------------ settings panels */

.senify-editor__panel {
  padding: 0.65rem 0.65rem 0.45rem;
  border-bottom: 1px solid var(--ed-line-soft);
}
.senify-editor__panel-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  margin: 0 0 0.45rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ed-text-strong);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.senify-editor__panel-title:hover { color: var(--ed-accent); }
.senify-editor__panel[data-collapsed="true"] { padding-bottom: 0.35rem; }
.senify-editor__field {
  display: grid;
  grid-template-columns: 5.8rem minmax(0, 1fr);
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.45rem;
}
.senify-editor__label {
  color: var(--ed-text);
  overflow: hidden;
  text-overflow: ellipsis;
}
.senify-editor__control {
  min-width: 0;
  padding: 0.32rem 0.45rem;
  border: 1px solid var(--ed-line);
  border-radius: 0.25rem;
  background: var(--ed-surface);
  color: inherit;
  font: inherit;
}
.senify-editor__control:focus {
  border-color: var(--ed-accent);
  outline: 1px solid var(--ed-accent);
}
textarea.senify-editor__control { min-height: 3.4rem; resize: vertical; }
input[type="checkbox"].senify-editor__control { justify-self: start; }
.senify-editor__badge {
  grid-column: 2;
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ed-accent) 12%, transparent);
  color: #a21caf;
  font-size: 0.75em;
}
.senify-editor__device-dots {
  grid-column: 2;
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.senify-editor__device-dot {
  width: 0.55rem;
  height: 0.55rem;
  border: 1px solid var(--ed-line);
  border-radius: 999px;
  background: var(--ed-surface);
  cursor: pointer;
}
.senify-editor__device-dot[data-dot="tablet"] { border-color: #7c3aed; background: #ede9fe; }
.senify-editor__device-dot[data-dot="mobile"] { border-color: #0ea5e9; background: #e0f2fe; }
.senify-editor__inline-bar {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.3rem;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 0.25rem;
  background: rgba(12, 13, 14, 0.88);
  color: #ffffff;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
  pointer-events: auto;
}
.senify-editor__inline-bar button {
  min-height: 1.5rem;
  padding: 0 0.5rem;
  border: 0;
  border-radius: 0.2rem;
  background: transparent;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}
.senify-editor__inline-bar button:hover { background: rgba(255, 255, 255, 0.22); }
.senify-editor__reset {
  grid-column: 2;
  justify-self: start;
  padding: 0.12rem 0.45rem;
  border: 1px solid var(--ed-line);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.senify-editor__reset:hover { border-color: var(--ed-accent); color: var(--ed-accent); }
.senify-editor__warning {
  grid-column: 2;
  color: #b45309;
  font-size: 0.85em;
}
.senify-editor__empty { padding: 0.9rem 0.7rem; color: var(--ed-text); }
.senify-editor__page-form { padding: 0.7rem 0.65rem; }
.senify-editor__page-form .senify-editor__field { grid-template-columns: 4.6rem minmax(0, 1fr); }

/* ------------------------------------------------------------- stage and frames */

.senify-editor__stage {
  position: relative;
  overflow: auto;
  background: var(--ed-canvas);
}
/* Live mode (M4 Stufe 1): the sheet sits in the layout flow at stage size and
   the stage itself never scrolls — only the frame document scrolls, like the
   release page. */
.senify-editor__stage[data-mode="live"] { overflow: hidden; }
.senify-editor__stage[data-mode="live"] .senify-editor__frames { display: contents; }
.senify-editor__frame {
  position: absolute;
  background: #ffffff;
  border-radius: 2px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
  overflow: hidden;
}
/* Live mode (M4 Stufe 1): the single sheet sits in the layout flow at real
   size and the frame document scrolls natively — no zoom, no transformed
   overlay. The token marker raises this rule above the skin's frame
   shadow/border (the skin scope counts four class-level parts); the edit
   chrome stays quiet and the content owns its hover states like the release. */
.senify-editor[data-senify-editor] .senify-editor__stage[data-mode="live"] .senify-editor__frame {
  position: relative;
  left: 0;
  top: 0;
  box-shadow: none;
  border-radius: 0;
}
.senify-editor__stage[data-mode="live"] [data-node-id]:hover {
  outline-color: transparent;
}
.senify-editor__stage[data-mode="live"] [data-node-id][data-selected="true"] {
  outline: none;
}
.senify-editor__iframe { display: block; background: #ffffff; }
.senify-editor__overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}
.senify-editor__handle {
  position: absolute;
  display: flex;
  gap: 0.1rem;
  padding: 0.15rem;
  border-radius: 0.25rem;
  background: var(--ed-accent);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
  pointer-events: auto;
}
.senify-editor__handle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.55rem;
  height: 1.55rem;
  border: 0;
  border-radius: 0.2rem;
  background: transparent;
  color: #ffffff;
  font: inherit;
  font-size: 0.95em;
  cursor: pointer;
}
.senify-editor__handle-btn:hover { background: rgba(255, 255, 255, 0.24); }
.senify-editor__handle-grip { cursor: grab; }
.senify-editor__insert {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border: 0;
  border-radius: 999px;
  background: var(--ed-accent);
  color: #ffffff;
  font: inherit;
  font-size: 1.05rem;
  line-height: 1;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  pointer-events: auto;
}
.senify-editor__insert:hover { background: var(--ed-accent-hover); }

/* --------------------------------------------------------------- context menu */

.senify-editor__context {
  position: absolute;
  z-index: 30;
  min-width: 13rem;
  padding: 0.25rem;
  background: var(--ed-surface);
  border: 1px solid var(--ed-line);
  border-radius: 0.35rem;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.2);
  pointer-events: auto;
}
.senify-editor__context-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.4rem 0.55rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--ed-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.senify-editor__context-item:hover { background: var(--ed-hover); color: var(--ed-text-strong); }
.senify-editor__context-item[data-danger="true"]:hover { background: #fef2f2; color: #b91c1c; }

/* ------------------------------------------------------------------- footer */

.senify-editor__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.3rem;
  padding: 0.2rem 0.6rem;
  background: var(--ed-surface);
  border-top: 1px solid var(--ed-line);
}
.senify-editor__zoom {
  display: flex;
  align-items: center;
  gap: 0.1rem;
  padding: 0.1rem;
  border: 1px solid var(--ed-line);
  border-radius: 0.3rem;
}
.senify-editor__zoom .senify-editor__button { min-height: 1.7rem; min-width: 1.7rem; }
.senify-editor__status-message {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ed-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.senify-editor__status[data-tone="error"] .senify-editor__status-message { color: #dc2626; }
.senify-editor__reload {
  padding: 0.12rem 0.55rem;
  border: 1px solid var(--ed-line);
  border-radius: 999px;
  background: var(--ed-surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.senify-editor__reload:hover { border-color: var(--ed-accent); color: var(--ed-accent); }

/* ------------------------------------------------------------------ spotlight */

.senify-editor__spotlight {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding-top: 12vh;
  background: rgba(12, 12, 16, 0.45);
}
.senify-editor__spotlight[hidden] { display: none; }
.senify-editor__spotlight-input {
  width: min(34rem, 86vw);
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--ed-line);
  border-radius: 0.6rem;
  background: #ffffff;
  color: var(--ed-text-strong);
  font: inherit;
  font-size: 1rem;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.3);
}
.senify-editor__spotlight-list {
  width: min(34rem, 86vw);
  max-height: 50vh;
  overflow: auto;
  border-radius: 0.6rem;
  background: #ffffff;
  color: var(--ed-text-strong);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.3);
}
.senify-editor__spotlight-row {
  display: block;
  width: 100%;
  padding: 0.5rem 0.8rem;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.senify-editor__spotlight-row:hover { background: var(--ed-hover); }
`;

// Aufgabe 1 ("Tokens in den Editor bringen"): the new chrome token set as CSS,
// scoped to the editor root node (`data-senify-editor`). Generated by
// `editorTokensCss()` from `src/ui/tokens.ts`, so the values are never written
// twice. Mounting the editor therefore makes the whole `--ed-*` vocabulary
// available inside the host without touching the running chrome rules above.
export const EDITOR_TOKEN_STYLES = editorTokensCss(`[${EDITOR_ROOT_ATTRIBUTE}]`);

// Aufgabe 3 ("Symbolbezug"): the editor draws Phosphor mask icons instead of
// placeholder glyphs. The base rule and the size/rotation steps live here —
// independent of the skin, so the symbols also render under the old chrome.
// The per-name `--m` data-URIs come from `ui/icons.ts`, the one source the
// preview mirrors (`vorschau-paritaet.test.ts`).
export const EDITOR_ICON_BASE_CSS = `
.senify-editor .ic {
  display: inline-block;
  width: 18px;
  height: 18px;
  flex: none;
  background-color: currentColor;
  -webkit-mask: var(--m) center / contain no-repeat;
  mask: var(--m) center / contain no-repeat;
}
.senify-editor .ic--16 { width: 16px; height: 16px; }
.senify-editor .ic--14 { width: 14px; height: 14px; }
.senify-editor .ic--12 { width: 12px; height: 12px; }
.senify-editor .ic--10 { width: 10px; height: 10px; }
.senify-editor .ic--back { transform: rotate(180deg); }
.senify-editor .ic--collapsed { transform: rotate(-90deg); }
`;
export const EDITOR_ICON_STYLES = `${EDITOR_ICON_BASE_CSS}\n${EDITOR_ICON_CSS}\n`;

export function ensureEditorStyles(doc: DomDocument): void {
  // Aufgabe 1: the new chrome tokens reach the editor host. `editorTokensCss()`
  // is the one source (`src/ui/tokens.ts`); it is emitted once per document and
  // scoped to the editor root node, so the root carries every `--ed-*` variable
  // and every descendant can read them. This is a separate style element on
  // purpose: the running (T17) chrome below keeps its own `--ed-accent`,
  // `--ed-text`, `--ed-line`, … names, which do not collide with the new
  // `--ed-surface-*`, `--ed-ink-*`, `--ed-signal-*`, … set, so the old editor
  // looks and behaves exactly as before.
  if (!doc.querySelector("style[data-senify-editor-tokens]")) {
    const tokens = doc.createElement("style");
    tokens.setAttribute("data-senify-editor-tokens", "");
    tokens.textContent = EDITOR_TOKEN_STYLES;
    (doc.head ?? doc.body).appendChild(tokens);
  }
  // The shared chrome base (E16 P0): selection, scrollbars, press/disabled
  // states and reduced-motion, scoped to the token marker.
  if (!doc.querySelector("style[data-senify-editor-base]")) {
    const base = doc.createElement("style");
    base.setAttribute("data-senify-editor-base", "");
    base.textContent = editorBaseCss();
    (doc.head ?? doc.body).appendChild(base);
  }
  // Aufgabe 3: the symbol rules (base mask + Phosphor data-URIs).
  if (!doc.querySelector("style[data-senify-editor-icons]")) {
    const icons = doc.createElement("style");
    icons.setAttribute("data-senify-editor-icons", "");
    icons.textContent = EDITOR_ICON_STYLES;
    (doc.head ?? doc.body).appendChild(icons);
  }
  // Hautumstellung: the skin sheet, scoped to the token marker plus
  // `data-editor-skin="tiefwasser"`. Under `data-editor-skin="alt"` it is simply
  // not matched, so the light chrome below shows through untouched.
  if (!doc.querySelector("style[data-senify-editor-skin]")) {
    const skin = doc.createElement("style");
    skin.setAttribute("data-senify-editor-skin", "");
    skin.textContent = EDITOR_SKIN_STYLES;
    (doc.head ?? doc.body).appendChild(skin);
  }
  if (doc.querySelector("style[data-senify-editor-styles]")) return;
  const style = doc.createElement("style");
  style.setAttribute("data-senify-editor-styles", "");
  style.textContent = EDITOR_STYLES;
  (doc.head ?? doc.body).appendChild(style);
}
