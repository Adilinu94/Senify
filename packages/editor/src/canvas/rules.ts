// Frame rules for the canvas (Phase 0, fourth slice).
//
// Two stylesheets meet in every frame and their order is the whole point of the
// cascade decision (O1, `packages/widget-engine/src/css/cascade.ts`):
//
//   1. the generated rules of the one compiler, wrapped in `@layer
//      user-authored` — the exact string the release would carry;
//   2. the editor chrome, unlayered: the forced-state preview
//      (`data-force-state`) and the canvas markers. Unlayered CSS beats the
//      single authored layer, so chrome and the forced state always win where
//      they must, no matter how specific a rule inside the layer is.
//
// The generated part is a pure function of the document, so forcing a state
// never touches the release stylesheet — `compileCss` does not know about the
// preview. Everything here is testable without a browser.

import {
  compileCss,
  forcedStateCss,
  type StateName,
  type TokenResolver,
} from "@senify/widget-engine";
import { toCssDocument, type EditorDocument } from "../state/document.ts";

export type FrameRulesOptions = {
  // The pseudo state the editor forces for the preview, or `null` for none.
  forcedState?: StateName | null;
  // Token resolution for theme colours and sizes (optional).
  resolveToken?: TokenResolver;
};

export type FrameRules = {
  // The generated rules, in `@layer user-authored`.
  authored: string;
  // Unlayered editor chrome (forced state + markers).
  chrome: string;
  // What the frame actually receives: chrome first, then the authored layer.
  css: string;
};

// The marker elements live inside the frame so they scale with it; they are
// unlayered chrome and never take pointer events (clicks fall through to the
// node underneath). Class names are shared with `canvas.ts`.
export const CANVAS_CHROME_CSS = `
/* Editor chrome — unlayered, so it beats the authored layer. */
.senify-canvas__marker {
  position: absolute;
  z-index: 2147483000;
  box-sizing: border-box;
  pointer-events: none;
}
.senify-canvas__marker[data-kind="hover"] {
  outline: 1px dashed #0ea5e9;
  outline-offset: -1px;
}
.senify-canvas__marker[data-kind="selection"] {
  outline: 2px solid #d004d4;
  outline-offset: -2px;
}
.senify-canvas__label {
  position: absolute;
  z-index: 2147483001;
  max-width: 16rem;
  overflow: hidden;
  padding: 0.1rem 0.4rem;
  border-radius: 0.2rem 0.2rem 0.2rem 0;
  background: #d004d4;
  color: #ffffff;
  font: 600 11px/1.5 system-ui, sans-serif;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}
.senify-canvas__handle {
  position: absolute;
  z-index: 2147483001;
  width: 8px;
  height: 8px;
  border: 1px solid #ffffff;
  background: #d004d4;
  pointer-events: none;
}
[data-node-id] { cursor: pointer; }
`.trim();

export function canvasFrameRules(
  document: EditorDocument,
  options: FrameRulesOptions = {},
): FrameRules {
  const cssDocument = toCssDocument(document);
  const authored = compileCss(
    cssDocument,
    options.resolveToken === undefined
      ? {}
      : { resolveToken: options.resolveToken },
  );
  const chromeParts: string[] = [];
  const forced = options.forcedState ?? null;
  if (forced !== null) {
    const forcedCss = forcedStateCss(cssDocument, forced, {
      ...(options.resolveToken === undefined
        ? {}
        : { resolveToken: options.resolveToken }),
    });
    if (forcedCss.trim() !== "") chromeParts.push(forcedCss);
  }
  chromeParts.push(CANVAS_CHROME_CSS);
  const chrome = chromeParts.join("\n\n");
  const css = [chrome, authored].filter((part) => part.trim() !== "").join("\n\n");
  return { authored, chrome, css };
}
