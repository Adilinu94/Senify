// Frame rules for the canvas (Phase 0, fourth slice).
//
// Three stylesheets meet in every frame and their order is the whole point of
// the cascade decision (O1, `packages/widget-engine/src/css/cascade.ts`):
//
//   1. the editor chrome, unlayered: the forced-state preview
//      (`data-force-state`) and the pointer cursor on nodes. Unlayered CSS
//      beats every layer, so chrome and the forced state always win where they
//      must, no matter how specific a rule inside a layer is. The selection and
//      hover markers are not here anymore — they live in the editor portal over
//      the stage (`canvas/overlay.ts`, ticket 16);
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
  scopeNameFor,
  scopeSelectorFor,
  type CssClassRule,
  type CssDocument,
  type CssNode,
  type StateName,
  type TokenResolver,
} from "@senify/widget-engine";
import { toCssDocument, type EditorDocument } from "../state/document.ts";
import { editorOverrides } from "../state/components.ts";
import { activeVariantProps } from "@senify/section-sdk";
import { canvasNodeTreeWithCopies } from "./adapter.ts";

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

// The marker chrome moved to the editor portal (ticket 16): selection and
// hover rings, the Plaetzchen and the handles are DOM over the stage
// (`canvas/overlay.ts`), so the frame carries no editor colour at all. What
// stays is the interaction hint the content itself must give: the pointer
// cursor on every node and the text cursor on an inline-editable leaf
// (ticket 03 point 4).
export const CANVAS_CHROME_CSS = `
/* Editor chrome — unlayered, so it beats the authored layer. */
[data-node-id] { cursor: pointer; }
[data-inline] { cursor: text; }
`.trim();

// A component instance renders the definition's subtree under fresh node ids
// (the inliner). The definition's own node rules (props, classes, states) are
// keyed by the original ids, so they are emitted once more per copy — otherwise
// an instance would lose the styling the definition was built with, and canvas
// and bake would drift apart. The copies are pure data (`inlineComponents`).
//
// Two more things ride the copy (ticket 04, styles per instance): the active
// variants and the override bag of the instance are merged into the copy's
// props — an overridden *style* prop must reach the compiler, not only the
// rendered tree — and a scoped rule of the instance (or of a definition part)
// is emitted once per copy, anchored on the copy id the DOM carries.
function withComponentCopies(
  cssDocument: CssDocument,
  document: EditorDocument,
): CssDocument {
  const { copies, origins } = canvasNodeTreeWithCopies(document);
  if (copies.size === 0) return cssDocument;
  const extra: CssNode[] = [];
  const walk = (nodes: readonly CssNode[]): void => {
    for (const node of nodes) {
      for (const copyId of copies.get(node.id) ?? []) {
        if (copyId === node.id) continue;
        const origin = origins.get(copyId);
        const instance =
          origin === undefined ? undefined : document.nodes[origin.instanceId];
        const componentId =
          instance === undefined ? undefined : instance.props["componentId"];
        const definition =
          typeof componentId === "string" ? document.nodes[componentId] : undefined;
        // The variants sit between definition and overrides — the same order
        // the inliner applies (`activeVariantProps`).
        const variantPatch =
          definition === undefined || instance === undefined
            ? {}
            : (activeVariantProps(definition, instance)[node.id] ?? {});
        const overridePatch =
          instance === undefined ? undefined : editorOverrides(instance)[node.id];
        const patch = { ...variantPatch, ...(overridePatch ?? {}) };
        extra.push({
          ...node,
          id: copyId,
          ...(Object.keys(patch).length === 0
            ? {}
            : { props: { ...node.props, ...patch } }),
          children: undefined,
          slots: undefined,
        });
      }
      walk(node.children ?? []);
      for (const list of Object.values(node.slots ?? {})) walk(list);
    }
  };
  walk(cssDocument.nodes);
  const classRules = cssDocument.classRules ?? [];
  const keptRules: CssClassRule[] = [];
  const extraRules: CssClassRule[] = [];
  for (const rule of classRules) {
    const scopeId = rule.scope?.nodeId;
    const copiesOfScope =
      scopeId === undefined ? [] : (copies.get(scopeId) ?? []).filter((id) => id !== scopeId);
    // A node that renders as copies does not keep its own anchor: the rule
    // follows the copies (the same replacement the bake's remap does).
    if (copiesOfScope.length === 0) {
      keptRules.push(rule);
      continue;
    }
    for (const copyId of copiesOfScope) {
      // Name and selector are rebuilt from the copy id — the same canonical
      // copy the bake's `remapScopedRules` writes; the compiler keys rules by
      // name, so a duplicate with the old name would collide with the dead one.
      extraRules.push({
        ...rule,
        name: scopeNameFor(copyId),
        selector: scopeSelectorFor(copyId),
        scope: { nodeId: copyId },
      });
    }
  }
  if (extra.length === 0 && extraRules.length === 0) return cssDocument;
  return {
    ...cssDocument,
    nodes: [...cssDocument.nodes, ...extra],
    classRules: [...keptRules, ...extraRules],
  };
}

export function canvasFrameRules(
  document: EditorDocument,
  options: FrameRulesOptions = {},
): FrameRules {
  const cssDocument = withComponentCopies(toCssDocument(document), document);
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
