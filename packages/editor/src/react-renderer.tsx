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
  // The tree object is shared by every sheet of one refresh, and a React
  // element is an immutable description: build it once and mount it into all
  // frame roots (ticket 05, point 7 — the JSX work dominated the insert path).
  // Both callers replace the tree object on every change (immutable trees), so
  // reference identity is the cache key.
  let cachedTree: NodeTree | null = null;
  let cachedElement: ReactNode = null;
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
      if (cachedTree !== context.tree || cachedElement === null) {
        cachedTree = context.tree;
        cachedElement = (
          <SectionTree
            rootNodeId={context.tree.rootNodeId}
            nodes={context.tree.nodes}
            ctx={options.context?.() ?? EMPTY_CONTEXT}
          />
        );
      }
      const element = cachedElement;
      flushSyncRender(() => {
        root.render(element);
      });
      annotate(host, context.tree, context.registry, context.breakpoint);
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

// Post-render annotations in one DOM pass (ticket 05, point 7): inline-text
// anchors and the per-breakpoint hidden mark. One `querySelectorAll` instead of
// one `querySelector` per node keeps a refresh cheap; attribute writes only
// happen when the value actually changes.
function annotate(
  host: DomElement,
  tree: NodeTree,
  registry: Registry,
  breakpoint: FrameBreakpoint,
): void {
  const elements = new Map<string, DomElement>();
  for (const element of host.querySelectorAll("[data-node-id]")) {
    const id = element.getAttribute("data-node-id");
    if (id !== null && !elements.has(id)) elements.set(id, element);
  }
  for (const [nodeId, node] of Object.entries(tree.nodes)) {
    const root = elements.get(nodeId);
    if (root === undefined) continue;
    if (isHiddenAt(tree, nodeId, breakpoint)) {
      if (root.getAttribute("data-hidden") !== "true") root.setAttribute("data-hidden", "true");
    } else if (root.getAttribute("data-hidden") !== null) {
      root.removeAttribute("data-hidden");
    }
    const keys = inlineControlKeys(node.type, registry);
    if (keys.length === 0) continue;
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
// structure column's eye and the frame agree immediately. Folded into
// `annotate` (one DOM pass); the helper stays for the leaf lookup.
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
