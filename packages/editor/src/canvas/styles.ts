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
export const CANVAS_TOKEN_CSS = editorTokensCss(`[${EDITOR_ROOT_ATTRIBUTE}]`);

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
.senify-canvas__select { min-height: 1.9rem; border: 0; background: transparent; font: inherit; }
.senify-canvas__zoom-label { min-width: 3rem; text-align: center; }
.senify-canvas__status { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.senify-canvas__stage {
  position: relative;
  flex: 1;
  overflow: auto;
  padding: 24px;
}
/* The paper carries the page content: neutral white, the one literal here. */
.senify-canvas__frame {
  position: absolute;
  background: #ffffff;
  overflow: hidden;
  transform-origin: 0 0;
}
.senify-canvas__iframe { display: block; border: 0; background: #ffffff; }
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
