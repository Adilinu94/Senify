// Canvas shell styles (Phase 0, fourth slice).
//
// The outer chrome around the frames — top bar, stage, frame sheets. The marker
// chrome *inside* the frames is part of the frame stylesheet
// (`rules.ts`, `CANVAS_CHROME_CSS`); this file is only the editor surface.

import type { DomDocument } from "../dom.ts";
import { EDITOR_ICON_CSS } from "../ui/icons.ts";

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

export const CANVAS_STYLES = `
.senify-canvas {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 20rem;
  overflow: hidden;
  background: #e0e0e0;
  color: #515962;
  font: 13px/1.45 system-ui, sans-serif;
}
.senify-canvas * { box-sizing: border-box; }
.senify-canvas__topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.8rem;
  padding: 0.3rem 0.5rem;
  background: #ffffff;
  border-bottom: 1px solid #d5d8dc;
}
.senify-canvas__group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1rem;
  border: 1px solid #d5d8dc;
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
.senify-canvas__button:hover { background: #f1f2f3; }
.senify-canvas__button[data-active="true"] { background: #d004d4; color: #ffffff; }
.senify-canvas__select { min-height: 1.9rem; border: 0; background: transparent; font: inherit; }
.senify-canvas__zoom-label { min-width: 3rem; text-align: center; }
.senify-canvas__status { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.senify-canvas__stage {
  position: relative;
  flex: 1;
  overflow: auto;
  padding: 24px;
  background: #e0e0e0;
}
.senify-canvas__frame {
  position: absolute;
  background: #ffffff;
  border-radius: 2px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
  overflow: hidden;
  transform-origin: 0 0;
}
.senify-canvas__iframe { display: block; border: 0; background: #ffffff; }
`.trim();

export function ensureCanvasStyles(doc: DomDocument): void {
  if (doc.querySelector("style[data-senify-canvas-icons]") === null) {
    const icons = doc.createElement("style");
    icons.setAttribute("data-senify-canvas-icons", "");
    icons.textContent = CANVAS_ICON_CSS;
    (doc.head ?? doc.body).appendChild(icons);
  }
  if (doc.querySelector("style[data-senify-canvas-styles]") !== null) return;
  const style = doc.createElement("style");
  style.setAttribute("data-senify-canvas-styles", "");
  style.textContent = CANVAS_STYLES;
  (doc.head ?? doc.body).appendChild(style);
}
