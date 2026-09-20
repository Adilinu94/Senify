// Frame rules for the canvas (Phase 0, fourth slice).
//
// Three stylesheets meet in every frame and their order is the whole point of
// the cascade decision (O1, `packages/widget-engine/src/css/cascade.ts`):
//
//   1. the editor chrome, unlayered: the forced-state preview
//      (`data-force-state`) and the canvas markers. Unlayered CSS beats every
//      layer, so chrome and the forced state always win where they must, no
//      matter how specific a rule inside a layer is;
//   2. the widget base stylesheet (`PRIMITIVE_BASE_CSS`), which is the very
//      same string the release carries (`bake.ts` writes it as
//      `assets/primitive-base.css`). It is the weakest authored stage: the
//      element defaults of the 23 foundation stones, compiled from the catalog
//      by `markup.ts`;
//   3. the generated rules of the one compiler for this document, in the same
//      `@layer user-authored`. Base and node rules share the layer, so a node
//      rule (later in source order, same specificity as `.w-*`) wins over the
//      widget default — exactly like on the release, where the base file is
//      linked before the page's own rules.
//
// There is no second copy of the widget defaults on either side: the frame
// imports the constant, the bake writes it. One source, two render paths.
//
// The generated part is a pure function of the document, so forcing a state
// never touches the release stylesheet — `compileCss` does not know about the
// preview. Everything here is testable without a browser.

import {
  PRIMITIVE_BASE_CSS,
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
  // Live mode shows the real page (M4 Stufe 1): the editor chrome — markers,
  // the pointer cursor, the forced state — stays out of the frame.
  chrome?: boolean;
};

export type FrameRules = {
  // The widget base stylesheet: the same constant the release ships.
  base: string;
  // The generated rules of this document, in `@layer user-authored`.
  authored: string;
  // Unlayered editor chrome (forced state + markers).
  chrome: string;
  // What the frame actually receives: chrome, then base, then the authored
  // layer — the order the cascade decision prescribes (chrome beats layer,
  // base is the weakest authored stage).
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
  if (options.chrome ?? true) {
    if (forced !== null) {
      const forcedCss = forcedStateCss(cssDocument, forced, {
        ...(options.resolveToken === undefined
          ? {}
          : { resolveToken: options.resolveToken }),
      });
      if (forcedCss.trim() !== "") chromeParts.push(forcedCss);
    }
    chromeParts.push(CANVAS_CHROME_CSS);
  }
  const chrome = chromeParts.join("\n\n");
  // Base before the document rules: both live in `@layer user-authored`, so the
  // node rules win the tie on source order — the same weak-to-strong order the
  // release gets from linking `primitive-base.css` before the page's rules.
  const base = PRIMITIVE_BASE_CSS;
  const css = [chrome, base, authored]
    .filter((part) => part.trim() !== "")
    .join("\n\n");
  return { base, authored, chrome, css };
}
