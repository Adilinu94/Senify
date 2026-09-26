// Canvas shell styles (Phase 0, fourth slice).
//
// The outer chrome around the frames — top bar, stage, frame sheets. The marker
// chrome *inside* the frames is part of the frame stylesheet
// (`rules.ts`, `CANVAS_CHROME_CSS`); this file is only the editor surface.
//
// Two sheets, one appearance source. This file holds the *structure* only
// (flex, sizes, the neutral white paper). Everything that is colour, type or
// elevation comes from the one source the editor also uses — `ui/tokens.ts`
// (the `--ed-*` vocabulary), `ui/fonts.ts` (Inter / Inter Display / Sora) and
// `ui/icons.ts` (the Phosphor set) — and is injected by `ensureCanvasStyles`
// next to it. The skin itself (`ui/skin.ts`, `EDITOR_CANVAS_SKIN_STYLES`) paints
// the canvas with those tokens, scoped to the canvas root. The canvas sheet
// therefore carries no colour of its own; the only literal is the neutral white
// of the paper (`.senify-canvas__frame` / `__iframe`), which must stay a sheet
// of content and never a control surface.

import type { DomDocument } from "../dom.ts";
import { editorFontFaceCss } from "../ui/fonts.ts";
import { EDITOR_ICON_CSS } from "../ui/icons.ts";
import { editorBaseCss } from "../ui/base.ts";
import { EDITOR_CANVAS_SKIN_STYLES } from "../ui/skin.ts";
import { EDITOR_ROOT_ATTRIBUTE, editorTokensCss } from "../ui/tokens.ts";

export const CANVAS_ICON_CSS = `
.senify-canvas .ic {
  display: inline-block;
  width: 18px;
  height: 18px;
  flex: none;
  background-color: currentColor;
  -webkit-mask: var(--m) center / contain no-repeat;
  mask: var(--m) center / contain no-repeat;
}
.senify-canvas .ic--14 { width: 14px; height: 14px; }
.senify-canvas .ic--12 { width: 12px; height: 12px; }
${EDITOR_ICON_CSS}
`.trim();

// The new chrome tokens, scoped to the same marker the editor uses
// (`data-senify-editor`). The canvas root sets it too, so the canvas carries
// every `--ed-*` variable from the one source (`ui/tokens.ts`) — no second list.
// The shared chrome base (E16 P0) rides along: one injection point per path.
export const CANVAS_TOKEN_CSS = `${editorTokensCss(`[${EDITOR_ROOT_ATTRIBUTE}]`)}\n${editorBaseCss()}\n`;

export const CANVAS_STYLES = `
.senify-canvas {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 20rem;
  overflow: hidden;
}
.senify-canvas * { box-sizing: border-box; }
.senify-canvas__topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.8rem;
  padding: 0.3rem 0.5rem;
}
.senify-canvas__group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1rem;
  border-radius: 0.3rem;
}
.senify-canvas__group[hidden] { display: none; }
.senify-canvas__button {
  min-height: 1.9rem;
  padding: 0 0.55rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.senify-canvas__catalog-label {
  color: var(--ed-ink-muted);
  font-size: var(--ed-text-11);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.senify-canvas__select {
  min-height: 1.9rem;
  max-width: 12rem;
  padding: 0 0.35rem;
  border: 1px solid var(--ed-line-control);
  border-radius: var(--ed-radius-sm);
  background: var(--ed-surface-inset);
  color: var(--ed-ink-strong);
  font: inherit;
  font-size: var(--ed-text-12);
}
.senify-canvas__zoom-label {
  min-width: 3.5rem;
  min-height: 1.9rem;
  padding: 0 0.3rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.senify-canvas__zoom-label:disabled { cursor: default; }
/* Der Scrub-Regler (Ticket 19, M6): nur im Live-Modus aktiv, faehrt die
   Scroll-Position der echten Seite an. */
.senify-canvas__scrub-label {
  color: var(--ed-ink-muted);
  font-size: var(--ed-text-11);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.senify-canvas__scrub {
  width: 9rem;
  accent-color: var(--ed-signal-accent);
}
.senify-canvas__scrub:disabled { opacity: 0.4; }
.senify-canvas__status { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Der Fuss (Ticket 03 Punkt 6): Meldung links, Zoom rechts — der Zoom gehoert
   zur Arbeitsflaeche, nicht in die Werkzeugleiste. */
.senify-canvas__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.2rem;
  padding: 0 0.5rem;
}
/* Der Katalog-Streifen (Ticket 12): Chips zum Ziehen, Klick fuegt ein.
   Ganzzahlige Hoehen (28px Chip, 5px Fuss): der Rahmen darunter muss auf einem
   ganzen Pixel sitzen, sonst rastert die Arbeitsflaeche die Schriften auf
   halben Pixeln und das Paritaets-Tor (Phase 1) misst Glaettungsunterschiede. */
.senify-canvas__cataloghost { padding: 0 0.5rem 5px; }
.senify-canvas__catalog {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
}
.senify-canvas__catalog-heading {
  margin-right: 0.2rem;
  color: var(--ed-ink-muted);
  font-size: var(--ed-text-11);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.senify-canvas__chip {
  min-height: 28px;
  padding: 0 0.5rem;
  border: 0;
  border-radius: 0.25rem;
  background: var(--ed-surface-inset);
  box-shadow: inset 0 0 0 1px var(--ed-line-control);
  color: var(--ed-ink-base);
  font: inherit;
  font-size: var(--ed-text-11);
  cursor: grab;
}
.senify-canvas__chip:hover { background: var(--ed-fill-hover); color: var(--ed-ink-strong); }
.senify-canvas__chip:active { cursor: grabbing; }
.senify-canvas__button:focus-visible,
.senify-canvas__chip:focus-visible,
.senify-canvas__select:focus-visible,
.senify-canvas__plus:focus-visible {
  outline: 2px solid var(--ed-focus);
  outline-offset: 1px;
}
.senify-canvas__stage {
  position: relative;
  flex: 1;
  overflow: auto;
  padding: 24px;
}
/* Paper carries the page content: neutral white, the one literal here. */
.senify-canvas__frame {
  position: absolute;
  background: #ffffff;
  overflow: hidden;
  transform-origin: 0 0;
}
.senify-canvas__iframe { display: block; border: 0; background: #ffffff; }
/* Das Frame-Label (Ticket 03 Punkt 6): Name und Breite des Blattes. Es sitzt im
   skalierten Blatt und wird per JS gegenskaliert, damit es lesbar bleibt. */
.senify-canvas__frame-label {
  position: absolute;
  left: 0;
  top: -1.7rem;
  padding: 0.05rem 0.4rem;
  border-radius: 0.2rem 0.2rem 0 0;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
  transform-origin: left bottom;
  pointer-events: none;
}
/* Inaktive Blätter dimmen (Ticket 03 Punkt 6): der aktive Breakpoint ist hell,
   die anderen warten auf ihre Aktivierung (Klick in das Blatt). */
.senify-canvas__frame[data-active="false"] .senify-canvas__iframe { opacity: 0.55; }
.senify-canvas__frame[data-active="false"]:hover .senify-canvas__iframe { opacity: 0.8; }
/* Live (M4 Stufe 1): ein Blatt, randlos, nativer Scroll — die echte Seite. */
.senify-canvas__stage[data-mode="live"] { padding: 0; overflow: hidden; }
.senify-canvas__frame[data-mode="live"] { border-radius: 0; box-shadow: none; }
.senify-canvas__frame[data-mode="live"] .senify-canvas__frame-label { display: none; }
.senify-canvas__frame[data-mode="live"] .senify-canvas__iframe { opacity: 1; }
/* Das Editor-Overlay (Ticket 12): Linie und Plus-Punkte ueber der Flaeche,
   nie im Inhaltsrahmen. Nur die Plus-Knoepfe nehmen Zeigerereignisse an. */
.senify-canvas__overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}
.senify-canvas__dropline {
  position: absolute;
  height: 2px;
  background: var(--ed-snap-line);
  box-shadow: 0 0 0 1px rgb(1 20 32 / 0.35);
}
.senify-canvas__dropline[data-state="hidden"] { display: none; }
.senify-canvas__dropline[data-state="rejected"] { background: var(--ed-signal-danger-ink); }
.senify-canvas__plus {
  position: absolute;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--ed-radius-full);
  background: transparent;
  color: transparent;
  font: inherit;
  font-size: 0;
  line-height: 1;
  cursor: pointer;
  pointer-events: auto;
}
.senify-canvas__plus::before {
  content: "+";
  position: absolute;
  inset: 3px;
  display: grid;
  place-items: center;
  border-radius: var(--ed-radius-full);
  background: var(--ed-snap-line);
  color: var(--ed-ink-on-lime);
  font-size: 13px;
  line-height: 1;
  box-shadow: 0 1px 2px rgb(1 20 32 / 0.35);
}
.senify-canvas__plus[data-state="hidden"] { display: none; }
.senify-canvas__plus:hover::before { background: var(--ed-fill-accent-hover); }
/* Das Marker-Portal (Ticket 16): Auswahl und Hover liegen als eigene Schicht
   ueber der Buehne, nie im Inhaltsrahmen — der Inhalt bleibt token-frei. Je
   Blatt eine Schicht, damit der Ring an der Blattkante abschneidet; die
   Doppelkante und das Plaetzchen faerbt die Haut (ui/skin.ts). */
.senify-canvas__marker-layer {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
}
.senify-canvas__hover-ring,
.senify-canvas__select-ring {
  position: absolute;
  display: none;
  box-sizing: border-box;
  pointer-events: none;
}
/* Die Live-Mitverfolgung (Ticket 05): ein weicher Lime-Ring ueber jedem
   ferngesteuert geaenderten Knoten; er blendet sich selbst aus (1200 ms). */
.senify-canvas__flash-ring {
  position: absolute;
  display: none;
  box-sizing: border-box;
  border: 2px solid var(--ed-lime);
  border-radius: var(--ed-radius-sm);
  background: color-mix(in srgb, var(--ed-lime) 12%, transparent);
  pointer-events: none;
  animation: senify-flash 1200ms var(--ed-ease-standard) both;
}
@keyframes senify-flash {
  0% { opacity: 0; }
  15% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; }
}
.senify-canvas__select-label,
.senify-canvas__select-size {
  position: absolute;
  display: none;
  height: 18px;
  padding: 0 6px;
  box-sizing: border-box;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
  pointer-events: none;
}
.senify-canvas__select-size {
  font-family: var(--ed-font-mono);
  font-variant-numeric: tabular-nums;
}
/* Vier Eckgriffe: 8px sichtbar, 24x24px Trefferflaeche (WCAG 2.5.8,
   ui-plan.md Abschnitt 8). Das Ziehen kommt mit B7; hier stehen die Ziele. */
.senify-canvas__handle {
  position: absolute;
  display: none;
  width: 24px;
  height: 24px;
  pointer-events: none;
}
.senify-canvas__handle-dot {
  position: absolute;
  left: 8px;
  top: 8px;
  width: 8px;
  height: 8px;
  box-sizing: border-box;
}
`.trim();

export function ensureCanvasStyles(doc: DomDocument): void {
  // The one source: the bundled @font-face rules (Inter, Inter Display, Sora).
  if (doc.querySelector("style[data-senify-canvas-fonts]") === null) {
    const fonts = doc.createElement("style");
    fonts.setAttribute("data-senify-canvas-fonts", "");
    fonts.textContent = editorFontFaceCss();
    (doc.head ?? doc.body).appendChild(fonts);
  }
  // The one source: the `--ed-*` tokens, scoped to the marker both roots carry.
  if (doc.querySelector("style[data-senify-canvas-tokens]") === null) {
    const tokens = doc.createElement("style");
    tokens.setAttribute("data-senify-canvas-tokens", "");
    tokens.textContent = CANVAS_TOKEN_CSS;
    (doc.head ?? doc.body).appendChild(tokens);
  }
  // The one source: the Phosphor mask set (base rule + every data-URI).
  if (doc.querySelector("style[data-senify-canvas-icons]") === null) {
    const icons = doc.createElement("style");
    icons.setAttribute("data-senify-canvas-icons", "");
    icons.textContent = CANVAS_ICON_CSS;
    (doc.head ?? doc.body).appendChild(icons);
  }
  // Structure first, then the skin that paints it — both from the one source.
  if (doc.querySelector("style[data-senify-canvas-styles]") === null) {
    const style = doc.createElement("style");
    style.setAttribute("data-senify-canvas-styles", "");
    style.textContent = CANVAS_STYLES;
    (doc.head ?? doc.body).appendChild(style);
  }
  if (doc.querySelector("style[data-senify-canvas-skin]") === null) {
    const skin = doc.createElement("style");
    skin.setAttribute("data-senify-canvas-skin", "");
    skin.textContent = EDITOR_CANVAS_SKIN_STYLES;
    (doc.head ?? doc.body).appendChild(skin);
  }
}
