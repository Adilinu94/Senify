import type { DomDocument } from "./dom.ts";

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

export const EDITOR_STYLES = `
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
  font-family: var(--font-body, system-ui, sans-serif);
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
  display: block;
  width: 100%;
  padding: 0.32rem 0.45rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
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
.senify-editor__frame {
  position: absolute;
  background: #ffffff;
  border-radius: 2px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
  overflow: hidden;
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

export function ensureEditorStyles(doc: DomDocument): void {
  if (doc.querySelector("style[data-senify-editor-styles]")) return;
  const style = doc.createElement("style");
  style.setAttribute("data-senify-editor-styles", "");
  style.textContent = EDITOR_STYLES;
  (doc.head ?? doc.body).appendChild(style);
}
