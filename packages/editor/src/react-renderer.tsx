import { flushSync } from "react-dom";
import * as ReactDom from "react-dom/client";
import type { ReactNode } from "react";
import type { NodeTree, Registry } from "@senify/section-sdk";
import { SectionTree, type SectionContext } from "@senify/registry/components";
import type { FrameRenderer } from "./mount.ts";
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

export function createReactRenderer(options: ReactRendererOptions = {}): FrameRenderer {
  const roots = new Map<DomElement, ReactRoot>();
  return {
    mount(frame, body, context): void {
      const doc = body.ownerDocument;
      if (!doc) return;
      const host = doc.createElement("div");
      host.className = "senify-frame-page";
      body.appendChild(host);
      const root = createRoot(host);
      roots.set(body, root);
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
    },
    destroy(): void {
      for (const root of roots.values()) root.unmount();
      roots.clear();
    },
  };
}

// The section components mark their root with data-node-id; the text props
// have no DOM hook of their own. After every render the smallest matching leaf
// of each text prop becomes the inline anchor (double-click target).
function annotateInlineText(host: DomElement, tree: NodeTree, registry: Registry): void {
  for (const [nodeId, node] of Object.entries(tree.nodes)) {
    if (!registry.has(node.type)) continue;
    const root = host.querySelector(`[data-node-id="${nodeId}"]`);
    if (!root) continue;
    for (const spec of registry.get(node.type).props) {
      if (!INLINE_CONTROLS.has(spec.control)) continue;
      const value = node.props[spec.key];
      if (typeof value !== "string" || value.trim() === "") continue;
      const leaf = findLeafWithText(root, value);
      if (!leaf || leaf.getAttribute("data-inline") !== null) continue;
      leaf.setAttribute("data-inline", "true");
      leaf.setAttribute("data-inline-node", nodeId);
      leaf.setAttribute("data-prop-key", spec.key);
    }
  }
}

function findLeafWithText(root: DomElement, value: string): DomElement | null {
  const needle = value.trim();
  for (const element of root.querySelectorAll("*")) {
    if (element.textContent?.trim() !== needle) continue;
    // Text leaves only: containers would swallow nested markup.
    if (element.querySelector("*") !== null) continue;
    // Stay inside this node: nested nodes own their own anchors.
    if (element.getAttribute("data-node-id") !== null) continue;
    if (element.closest("[data-node-id]") !== root) continue;
    return element;
  }
  return null;
}
