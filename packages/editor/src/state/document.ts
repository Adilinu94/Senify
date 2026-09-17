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
  type CssClassRule,
  type CssDocument,
  type CssNode,
  type DeviceValueMap,
  type StateName,
} from "@senify/widget-engine";

export const DOCUMENT_VERSION = 2;

export type NodeId = string;

// `classes` maps a class name to the values of its style rule, useable with the
// device suffixes exactly like node props.
export type StyleRuleMap = Record<string, DeviceValueMap>;

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
  hidden?: boolean;
  locked?: boolean;
};

export type EditorDocument = {
  version: typeof DOCUMENT_VERSION;
  rootNodeId: NodeId;
  nodes: Record<NodeId, EditorNode>;
  classes: StyleRuleMap;
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
    classes: {},
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

export function styleRuleNames(document: EditorDocument): string[] {
  return Object.keys(document.classes);
}

export function isClassDefined(document: EditorDocument, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(document.classes, name);
}

export function classRules(document: EditorDocument): CssClassRule[] {
  return Object.entries(document.classes).map(([name, props]) => ({
    name,
    props: { ...props },
  }));
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
