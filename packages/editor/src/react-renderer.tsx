import { flushSync } from "react-dom";
import * as ReactDom from "react-dom/client";
import type { ReactNode } from "react";
import type { NodeTree, Registry } from "@senify/section-sdk";
import { getPrimitive } from "@senify/widget-engine";
import { SectionTree, type SectionContext } from "@senify/registry/components";
import type { FrameRenderer } from "./mount.ts";
import { isHiddenAt } from "./frames.ts";
import type { FrameBreakpoint } from "./types.ts";
import type { DomElement } from "./dom.ts";

// The real frame renderer: the very components of the bake (SectionTree)
// mounted into the frame document, so the canvas shows the actual page. The
// editor core stays renderer-agnostic — this module is the injected
// FrameRenderer, the shell decides to use it.

export type ReactRendererOptions = {
  // Link paths and assets for link/media resolution. Missing (or empty)
  // contexts keep the components' own /assets/... fallbacks.
  context?: () => SectionContext;
};

const EMPTY_CONTEXT: SectionContext = { pagePaths: {}, assets: {} };

// react-dom is typed against the browser DOM; the editor core deliberately is
// not (see dom.ts). One narrow bridge keeps both worlds apart.
type ReactRoot = { render(node: ReactNode): void; unmount(): void };
const createRoot = (ReactDom as unknown as {
  createRoot(container: unknown, options?: unknown): ReactRoot;
}).createRoot;
const flushSyncRender = flushSync as unknown as (callback: () => void) => void;

const INLINE_CONTROLS = new Set(["text", "richtext"]);
const INLINE_PRIMITIVE_KINDS = new Set(["text", "textarea"]);

export function createReactRenderer(options: ReactRendererOptions = {}): FrameRenderer {
  // One live root per frame body. Re-mounting the same body re-renders that
  // root in place (the canvas refresh path: a store change updates the frame
  // without reloading the iframe), instead of stacking a second page next to
  // the first.
  const roots = new Map<DomElement, { root: ReactRoot; host: DomElement }>();
  return {
    mount(frame, body, context): void {
      const doc = body.ownerDocument;
      if (!doc) return;
      const existing = roots.get(body);
      const host = existing?.host ?? doc.createElement("div");
      if (existing === undefined) {
        host.className = "senify-frame-page";
        body.appendChild(host);
        roots.set(body, { root: createRoot(host), host });
      }
      const root = roots.get(body)?.root;
      if (root === undefined) return;
      flushSyncRender(() => {
        root.render(
          <SectionTree
            rootNodeId={context.tree.rootNodeId}
            nodes={context.tree.nodes}
            ctx={options.context?.() ?? EMPTY_CONTEXT}
          />,
        );
      });
      annotateInlineText(host, context.tree, context.registry);
      annotateHidden(host, context.tree, context.breakpoint);
    },
    destroy(): void {
      for (const entry of roots.values()) {
        entry.root.unmount();
        entry.host.remove();
      }
      roots.clear();
    },
  };
}

// The section components mark their root with data-node-id; the text props
// have no DOM hook of their own. After every render the smallest matching leaf
// of each text prop becomes the inline anchor (double-click target). A catalog
// primitive without a section twin carries its text controls in the catalog
// description, and its root may be the leaf itself (the heading).
function annotateInlineText(host: DomElement, tree: NodeTree, registry: Registry): void {
  for (const [nodeId, node] of Object.entries(tree.nodes)) {
    const keys = inlineControlKeys(node.type, registry);
    if (keys.length === 0) continue;
    const root = host.querySelector(`[data-node-id="${nodeId}"]`);
    if (!root) continue;
    for (const key of keys) {
      const value = node.props[key];
      if (typeof value !== "string" || value.trim() === "") continue;
      const leaf = findLeafWithText(root, value);
      if (!leaf || leaf.getAttribute("data-inline") !== null) continue;
      leaf.setAttribute("data-inline", "true");
      leaf.setAttribute("data-inline-node", nodeId);
      leaf.setAttribute("data-prop-key", key);
    }
  }
}

// The registry is asked first (same order as `SectionTree`): the running
// sections own their props until the E2 cutover; a catalog primitive answers
// from its description.
function inlineControlKeys(type: string, registry: Registry): string[] {
  if (registry.has(type)) {
    return registry
      .get(type)
      .props.filter((spec) => INLINE_CONTROLS.has(spec.control))
      .map((spec) => spec.key);
  }
  const primitive = getPrimitive(type);
  if (primitive === undefined) return [];
  return primitive.controls
    .filter((spec) => INLINE_PRIMITIVE_KINDS.has(spec.kind))
    .map((spec) => spec.key);
}

// Hidden nodes (per breakpoint) dim in the frame. The bake skips them or
// leaves the decision to the runtime; the editor marks the live DOM so the
// structure column's eye and the frame agree immediately.
function annotateHidden(host: DomElement, tree: NodeTree, breakpoint: FrameBreakpoint): void {
  for (const nodeId of Object.keys(tree.nodes)) {
    const root = host.querySelector(`[data-node-id="${nodeId}"]`);
    if (!root) continue;
    if (isHiddenAt(tree, nodeId, breakpoint)) {
      root.setAttribute("data-hidden", "true");
    } else {
      root.removeAttribute("data-hidden");
    }
  }
}

function findLeafWithText(root: DomElement, value: string): DomElement | null {
  const needle = value.trim();
  const candidates = [root, ...root.querySelectorAll("*")];
  for (const element of candidates) {
    if (element.textContent?.trim() !== needle) continue;
    // Text leaves only: containers would swallow nested markup.
    if (element.querySelector("*") !== null) continue;
    // Stay inside this node: nested nodes own their own anchors. The root
    // itself is allowed — a primitive's root can be the text leaf.
    if (element !== root && element.getAttribute("data-node-id") !== null) continue;
    if (element !== root && element.closest("[data-node-id]") !== root) continue;
    return element;
  }
  return null;
}
