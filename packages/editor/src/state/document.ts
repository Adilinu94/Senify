// Editor document v2 (rebuild Phase 0, third slice).
//
// The document is the editor's whole state as plain data: no DOM, no UI. It is
// the widget-engine model — a node names its catalog `primitive`, carries its
// values with the device suffixes of `widget-engine/device.ts`
// (`padding`, `padding_tablet`, `padding_mobile`) and refers to style classes by
// name. The class registry (`classes`) holds the style rules; the compiler reads
// both through `toCssDocument`.
//
// Migration from the older section `NodeTree` (v1) lives in `migration.ts`.

import {
  getPrimitive,
  styleRuleToClassRule,
  type CssClassRule,
  type CssDocument,
  type CssNode,
  type DeviceValueMap,
  type StateName,
  type StyleRule,
} from "@senify/widget-engine";
import type { MotionSpec } from "@senify/section-sdk";

export const DOCUMENT_VERSION = 2;

export type NodeId = string;

// The style rules of the document, in the canonical shape of the site registry
// (`widget-engine/src/css/style-rule.ts`): stable `id`, `kind`, free `selector`,
// `order` as the array position, `styles`, `states` (O11), `contextStyles` and
// the freedom valves of ADR-0005. One model, not three — the editor document is
// the canvas-side copy of the registry, and the compiler reads it directly.
export type { StyleRule };

export type EditorNode = {
  id: NodeId;
  primitive: string;
  props: DeviceValueMap;
  // Pseudo-state values (hover / focus / active), the same shape as `props`
  // including the device suffixes. Phase 0 only passes them through to the
  // compiler so the canvas can force a state for the preview; the style panel
  // that writes them is Phase 2.
  states?: Partial<Record<StateName, DeviceValueMap>>;
  children?: NodeId[];
  slots?: Record<string, NodeId[]>;
  classes?: string[];
  // The motion spec (ticket 19): preset + intensity + tokens, the authoring
  // half of the v1 motion runtime. The bridge hands it to the section tree;
  // canvas preview and bake read the same spec.
  motion?: MotionSpec;
  hidden?: boolean;
  // Ticket 11: the breakpoints on which the node is *additionally* hidden.
  // `hidden` stays the global (desktop) flag; the v1 per-breakpoint
  // `overrides[device].hidden` lifts into this list, so the migration no
  // longer drops it. The renderer marks such nodes per frame (`isHiddenAt`).
  hiddenDevices?: readonly HiddenDevice[];
  locked?: boolean;
};

export type HiddenDevice = "tablet" | "mobile";

export type EditorDocument = {
  version: typeof DOCUMENT_VERSION;
  rootNodeId: NodeId;
  nodes: Record<NodeId, EditorNode>;
  // Array, not a record: the position in the array *is* the cascade order, the
  // same normalization the site registry uses (`normalizeRuleOrder`).
  styleRules: StyleRule[];
};

export type ParentRef = {
  nodeId: NodeId;
  slot?: string;
};

export function createEditorNode(
  id: NodeId,
  primitive: string,
  props: DeviceValueMap = {},
): EditorNode {
  return { id, primitive, props };
}

// A fresh document with one `root` node. The id is injected so tests and the
// store stay deterministic.
export function createDocument(idFactory: () => string): EditorDocument {
  const rootId = idFactory();
  return {
    version: DOCUMENT_VERSION,
    rootNodeId: rootId,
    nodes: { [rootId]: { id: rootId, primitive: "root", props: {} } },
    styleRules: [],
  };
}

export function cloneDocument(document: EditorDocument): EditorDocument {
  return structuredClone(document);
}

export function getNode(
  document: EditorDocument,
  id: NodeId,
): EditorNode | undefined {
  return document.nodes[id];
}

export function nodeExists(document: EditorDocument, id: NodeId): boolean {
  return document.nodes[id] !== undefined;
}

// Document order: a node, then its children, then its slot children (slots in
// key order). This is the canonical order for a selection range.
export function documentOrder(document: EditorDocument): NodeId[] {
  const order: NodeId[] = [];
  const seen = new Set<NodeId>();
  const visit = (id: NodeId): void => {
    if (seen.has(id)) return;
    const node = document.nodes[id];
    if (node === undefined) return;
    seen.add(id);
    order.push(id);
    for (const child of node.children ?? []) visit(child);
    for (const list of Object.values(node.slots ?? {})) {
      for (const child of list) visit(child);
    }
  };
  visit(document.rootNodeId);
  return order;
}

export function childIds(node: EditorNode): NodeId[] {
  return node.children ?? [];
}

export function slotIds(node: EditorNode, slot: string): NodeId[] {
  return node.slots?.[slot] ?? [];
}

export function locateParent(
  document: EditorDocument,
  id: NodeId,
): { parent: ParentRef; index: number } | undefined {
  for (const node of Object.values(document.nodes)) {
    const childIndex = (node.children ?? []).indexOf(id);
    if (childIndex >= 0) {
      return { parent: { nodeId: node.id }, index: childIndex };
    }
    for (const [slot, list] of Object.entries(node.slots ?? {})) {
      const index = list.indexOf(id);
      if (index >= 0) return { parent: { nodeId: node.id, slot }, index };
    }
  }
  return undefined;
}

// The node itself plus every descendant, parents before children.
export function collectSubtree(
  document: EditorDocument,
  id: NodeId,
): EditorNode[] {
  const node = document.nodes[id];
  if (node === undefined) return [];
  const out: EditorNode[] = [node];
  for (const child of node.children ?? []) out.push(...collectSubtree(document, child));
  for (const list of Object.values(node.slots ?? {})) {
    for (const child of list) out.push(...collectSubtree(document, child));
  }
  return out;
}

export function descendantIds(
  document: EditorDocument,
  id: NodeId,
): Set<NodeId> {
  return new Set(collectSubtree(document, id).map((node) => node.id));
}

// `?? []` everywhere a document may still be a literal from before the rule
// registry moved into the canonical shape (a cached bundle, a harness page).
// The load path normalizes, but a missing list must not break the canvas.
export function styleRulesOf(document: EditorDocument): StyleRule[] {
  return document.styleRules ?? [];
}

export function styleRuleById(
  document: EditorDocument,
  id: string,
): StyleRule | undefined {
  return styleRulesOf(document).find((rule) => rule.id === id);
}

// The rule a node can be assigned to: a reusable class, never an ambient rule
// (it attaches by matching) and never a scoped rule (its name is generated).
export function styleRuleByName(
  document: EditorDocument,
  name: string,
): StyleRule | undefined {
  return styleRulesOf(document).find(
    (rule) => rule.kind === "class" && rule.scope === undefined && rule.name === name,
  );
}

export function styleRuleNames(document: EditorDocument): string[] {
  return styleRulesOf(document)
    .filter((rule) => rule.kind === "class" && rule.scope === undefined)
    .map((rule) => rule.name);
}

export function isClassDefined(document: EditorDocument, name: string): boolean {
  return styleRuleByName(document, name) !== undefined;
}

// Every rule as the compiler reads it, order included (the array order is the
// cascade order). One mapping, shared with the bake: `styleRuleToClassRule`
// (widget engine) carries all three kinds and the freedom valves.
export function classRules(document: EditorDocument): CssClassRule[] {
  return styleRulesOf(document).map((rule) => styleRuleToClassRule(rule));
}

function toCssNode(document: EditorDocument, id: NodeId): CssNode | undefined {
  const node = document.nodes[id];
  if (node === undefined) return undefined;
  const children = (node.children ?? [])
    .map((child) => toCssNode(document, child))
    .filter((child): child is CssNode => child !== undefined);
  const slots: Record<string, CssNode[]> = {};
  for (const [slot, ids] of Object.entries(node.slots ?? {})) {
    slots[slot] = ids
      .map((child) => toCssNode(document, child))
      .filter((child): child is CssNode => child !== undefined);
  }
  const cssNode: CssNode = {
    id: node.id,
    primitive: node.primitive,
    props: { ...node.props },
  };
  if (node.classes !== undefined && node.classes.length > 0) {
    cssNode.classIds = [...node.classes];
  }
  if (node.states !== undefined) {
    cssNode.states = node.states;
  }
  if (children.length > 0) cssNode.children = children;
  if (Object.keys(slots).length > 0) cssNode.slots = slots;
  return cssNode;
}

// The document as the compiler sees it: the root subtree plus the class rules.
// `hidden` and `locked` are structural and stay out of the stylesheet (the
// renderer owns them), exactly like the bridge for the section tree.
export function toCssDocument(document: EditorDocument): CssDocument {
  const root = toCssNode(document, document.rootNodeId);
  return {
    nodes: root === undefined ? [] : [root],
    classRules: classRules(document),
  };
}

export function primitiveOf(node: EditorNode): string {
  return node.primitive;
}

export function primitiveExists(primitive: string): boolean {
  return getPrimitive(primitive) !== undefined;
}
