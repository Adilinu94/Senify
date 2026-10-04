// The renderer of the widget catalog (Phase 1): an `ElementSpec` becomes React.
//
// This is the only place that turns a description into elements — and both
// render paths go through it. The editor canvas mounts `SectionTree` into the
// frame (`packages/editor/src/react-renderer.tsx`), the bake mounts the very
// same `SectionTree` through `Section.astro`. A primitive therefore looks the
// same in the canvas and in the release, which is what the parity gate of
// Phase 1 measures.
//
// No primitive is special-cased here: everything comes from
// `describePrimitive` (widget-engine/markup.ts). Adding a foundation stone is a
// catalog entry plus a description, never a new component.

import type { ElementType, ReactNode } from "react";
import type { Node, PropValue } from "@senify/section-sdk";
import { describePrimitive, type ElementSpec, type MarkupAttrs } from "@senify/widget-engine";
import { motionPendingAttrs, nodeRootClasses, resolveAsset, type SectionContext } from "./shared.tsx";

export type PrimitiveProps = {
  node: Node;
  children?: ReactNode;
  slots?: Record<string, ReactNode>;
  ctx: SectionContext;
};

type RenderScope = {
  node: Node;
  children: ReactNode;
  slots: Record<string, ReactNode>;
  ctx: SectionContext;
};

function reactAttrs(
  spec: ElementSpec,
  scope: RenderScope,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  const source: MarkupAttrs = spec.attrs ?? {};
  for (const [name, value] of Object.entries(source)) {
    // Absent and switched-off read the same in HTML.
    if (value === undefined || value === false) continue;
    attrs[name] = value;
  }
  // An image resolves its asset through the delivery context: the same lookup
  // the section components use (`resolveAsset`), so a replaced file keeps its
  // address and the encoded ladder stays available.
  if (spec.tag === "img" && typeof attrs["data-asset"] === "string") {
    const asset = resolveAsset({ assetId: attrs["data-asset"] }, scope.ctx);
    if (asset !== undefined) {
      attrs.src = asset.src;
      if (asset.width !== null) attrs.width = asset.width;
      if (asset.height !== null) attrs.height = asset.height;
    }
  }
  const classes =
    spec.root === true
      ? [...(spec.classes ?? []), ...nodeRootClasses(scope.node)]
      : [...(spec.classes ?? [])];
  if (classes.length > 0) attrs.className = classes.join(" ");
  if (spec.root === true) {
    attrs["data-node-id"] = scope.node.id;
    attrs["data-widget"] = scope.node.type;
    Object.assign(attrs, motionPendingAttrs(scope.node));
  }
  return attrs;
}

function renderSpec(spec: ElementSpec, scope: RenderScope, key: string): ReactNode {
  // `spec.html` is the one place markup is injected: `describePrimitive`
  // produced it through the allow-list sanitizer, so it is inline text markup
  // only (links, emphasis, line breaks) and nothing that can run or load.
  if (spec.html !== undefined) {
    const HtmlTag = spec.tag as ElementType;
    return <HtmlTag key={key} {...reactAttrs(spec, scope)} dangerouslySetInnerHTML={{ __html: spec.html }} />;
  }
  const parts: ReactNode[] = [];
  for (const [index, child] of (spec.children ?? []).entries()) {
    parts.push(renderSpec(child, scope, `${key}-${index}`));
  }
  if (spec.childrenSlot !== undefined) {
    // The node's own children, or the named slot — never both: a container that
    // offers a slot does not also take children (`catalog.ts` child rules).
    const slotContent =
      spec.childrenSlot === "children" ? scope.children : scope.slots[spec.childrenSlot];
    if (slotContent !== undefined) parts.push(slotContent);
  }
  if (spec.text !== undefined && spec.text !== "") parts.push(spec.text);
  const Tag = spec.tag as ElementType;
  // `key` is passed directly, never through the spread: React reads a `key`
  // inside a props object as a mistake and warns about it.
  const attrs = reactAttrs(spec, scope);
  // Void elements (img, hr, input, iframe) never receive children here: the
  // description gives them none.
  return (
    <Tag key={key} {...attrs}>
      {parts.length > 0 ? parts : null}
    </Tag>
  );
}

// `describePrimitive` answers `undefined` for a section type of the running
// registry; the caller (`map.tsx`) then takes the section render path.
export function PrimitiveNode({ node, children, slots, ctx }: PrimitiveProps): ReactNode {
  const described = describePrimitive(node.type, node.props as Record<string, PropValue>);
  if (described === undefined) return null;
  return renderSpec(
    described,
    {
      node,
      children: children ?? null,
      slots: slots ?? {},
      ctx,
    },
    node.id,
  );
}
