// Visual components (ticket 04, slice 1): the pure half.
//
// A component lives **in the tree** as a definition node; an instance is a
// second reserved node that names the definition and fills its slots. That
// keeps the whole thing in the existing transport (no second registry, no new
// column) and gives one derivation for both render paths: the canvas inlines
// before it renders, the bake inlines before it maps sections — same function,
// same ids, same result.
//
//   __component          definition: props.name, children = the subtree
//   __component_slot     placeholder inside a definition: props.name
//   __component_instance instance: props.componentId, slots = the content
//
// `inlineComponents` removes the definitions, replaces every instance with a
// copy of the definition subtree (slot placeholders swapped for the instance's
// slot content) and reports what it could not resolve. Ids are rebuilt
// deterministically (`instance + original`), so a second run over the same tree
// produces the same result and scoped style rules can be remapped through the
// returned `nodeIdMap` — the same mechanism the layout splice uses (ticket 22).

import type { Node, NodeId, NodeTree, PropValue } from "./types.ts";

export const COMPONENT_DEFINITION_TYPE = "__component";
export const COMPONENT_INSTANCE_TYPE = "__component_instance";
export const COMPONENT_SLOT_TYPE = "__component_slot";
export const COMPONENT_STUB_TYPE = "__component_stub";

// The structural node types: they are indirection, not content. Placement
// rules of the section catalog cannot judge them (an instance stands in for
// whatever its definition renders), so the engine lets them through wherever
// a node may sit — only the slot placeholder stays a leaf.
const STRUCTURAL_TYPES: readonly string[] = [
  COMPONENT_DEFINITION_TYPE,
  COMPONENT_INSTANCE_TYPE,
  COMPONENT_SLOT_TYPE,
];

export function isComponentType(type: string): boolean {
  return STRUCTURAL_TYPES.includes(type);
}

export type ComponentProblemKind =
  | "unknown-component"
  | "cycle"
  | "duplicate-definition"
  | "multiple-roots";

export type ComponentProblem = {
  kind: ComponentProblemKind;
  nodeId: string;
  message: string;
};

export type ComponentDefinition = {
  id: NodeId;
  name: string;
  rootNodeId: NodeId;
  /** The one root child of the definition (its reusable subtree). */
  rootChildId: NodeId | null;
  /** The slot names the definition declares, in tree order. */
  slots: string[];
};

export type InlineResult = {
  tree: NodeTree;
  /** definition node id -> the id of its first copy (convenience). */
  nodeIdMap: Map<NodeId, NodeId>;
  /** definition node id -> every copy, in expansion order (rule remapping). */
  copies: Map<NodeId, NodeId[]>;
  /**
   * copy id -> where it came from: the instance that rendered it and the part
   * it copies. The canvas uses this to map a click inside an instance back to
   * the instance node (the copy id is not part of the document).
   */
  origins: Map<NodeId, { instanceId: NodeId; partId: NodeId }>;
  problems: ComponentProblem[];
};

export type InlineOptions = {
  // Injectable for tests; must stay deterministic for a given tree.
  idFactory?: (instanceId: NodeId, originalId: NodeId) => NodeId;
};

function defaultIdFactory(instanceId: NodeId, originalId: NodeId): NodeId {
  // Deterministic and within the id pattern (`^[A-Za-z0-9_-]{6,32}$`): the
  // instance prefix keeps sibling instances apart, the hash keeps it short.
  const hash = hashString(`${instanceId}/${originalId}`).toString(36);
  const id = `${instanceId.slice(0, 8)}_${hash}`;
  return id.length >= 6 ? id : `${id}_x`;
}

function hashString(input: string): number {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function nameOf(node: Node): string {
  const value: PropValue | undefined = node.props["name"];
  return typeof value === "string" ? value : "";
}

function componentIdOf(node: Node): string {
  const value: PropValue | undefined = node.props["componentId"];
  return typeof value === "string" ? value : "";
}

// The override bag of an instance: part id -> the props this instance changes.
// Part ids are the node ids inside the definition — stable, declared, never
// derived from labels (the Plasmic lesson). A missing or malformed bag is an
// empty one; the inliner then renders the definition unchanged.
export type ComponentOverrides = Record<NodeId, Record<string, PropValue>>;

export function instanceOverrides(instance: Node): ComponentOverrides {
  const value: PropValue | undefined = instance.props["overrides"];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: ComponentOverrides = {};
  for (const [partId, props] of Object.entries(value)) {
    if (props === null || typeof props !== "object" || Array.isArray(props)) continue;
    out[partId] = { ...props };
  }
  return out;
}

export type ComponentPart = {
  id: NodeId;
  type: string;
  props: Record<string, PropValue>;
};

// The declared register of a definition: every node of its reusable subtree,
// in tree order. The ids are the override keys — the editor and the agents
// read this list instead of guessing from labels. Slot placeholders are
// structure, not overridable parts, so they stay out.
export function componentParts(tree: NodeTree, definitionId: NodeId): ComponentPart[] {
  const definition = componentDefinition(tree, definitionId);
  if (definition === undefined || definition.rootChildId === null) return [];
  const parts: ComponentPart[] = [];
  const seen = new Set<NodeId>();
  const visit = (id: NodeId): void => {
    const node = tree.nodes[id];
    if (node === undefined || seen.has(id)) return;
    seen.add(id);
    if (node.type === COMPONENT_DEFINITION_TYPE || node.type === COMPONENT_SLOT_TYPE) return;
    parts.push({ id: node.id, type: node.type, props: { ...node.props } });
    for (const child of node.children ?? []) visit(child);
    for (const list of Object.values(node.slots ?? {})) {
      for (const child of list) visit(child);
    }
  };
  visit(definition.rootChildId);
  return parts;
}

// Overrides whose part no longer exists (the definition changed after the
// instance was written). They stay in the data — dropping them silently would
// be the kind of quiet loss this codebase refuses — but the editor and the MCP
// surface them so a human or agent can clean up.
export function staleOverrides(tree: NodeTree, instance: Node): NodeId[] {
  const bag = instanceOverrides(instance);
  const definition = componentDefinition(tree, componentIdOf(instance));
  if (definition === undefined) return Object.keys(bag);
  const parts = new Set(componentParts(tree, definition.id).map((part) => part.id));
  return Object.keys(bag).filter((partId) => !parts.has(partId));
}

// Every definition in the tree, in tree order. A definition is a node of the
// reserved type; its children are the reusable subtree.
export function componentDefinitions(tree: NodeTree): ComponentDefinition[] {
  const definitions: ComponentDefinition[] = [];
  const seen = new Set<NodeId>();
  const visit = (id: NodeId): void => {
    const node = tree.nodes[id];
    if (node === undefined || seen.has(id)) return;
    seen.add(id);
    if (node.type === COMPONENT_DEFINITION_TYPE) {
      definitions.push({
        id: node.id,
        name: nameOf(node) === "" ? node.id : nameOf(node),
        rootNodeId: node.id,
        rootChildId: node.children?.[0] ?? null,
        slots: collectSlots(tree, node.id),
      });
      return;
    }
    for (const child of node.children ?? []) visit(child);
    for (const list of Object.values(node.slots ?? {})) {
      for (const child of list) visit(child);
    }
  };
  visit(tree.rootNodeId);
  return definitions;
}

function collectSlots(tree: NodeTree, definitionId: NodeId): string[] {
  const names: string[] = [];
  const seen = new Set<NodeId>();
  const visit = (id: NodeId): void => {
    const node = tree.nodes[id];
    if (node === undefined || seen.has(id)) return;
    seen.add(id);
    if (node.type === COMPONENT_SLOT_TYPE) {
      const name = nameOf(node);
      if (name !== "" && !names.includes(name)) names.push(name);
      return;
    }
    for (const child of node.children ?? []) visit(child);
    for (const list of Object.values(node.slots ?? {})) {
      for (const child of list) visit(child);
    }
  };
  for (const child of tree.nodes[definitionId]?.children ?? []) visit(child);
  return names;
}

export function componentDefinition(
  tree: NodeTree,
  id: string,
): ComponentDefinition | undefined {
  return componentDefinitions(tree).find((definition) => definition.id === id);
}

// A definition must not contain an instance of itself, directly or through
// another definition: the inliner would never terminate.
export function wouldCreateCycle(
  tree: NodeTree,
  definitionId: NodeId,
  candidate: NodeTree,
): boolean {
  const definitions = new Map(componentDefinitions(tree).map((entry) => [entry.id, entry]));
  const seen = new Set<NodeId>();
  const reaches = (id: NodeId): boolean => {
    if (id === definitionId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const definition = definitions.get(id);
    if (definition === undefined) return false;
    for (const instanceId of instancesIn(candidate, definition.rootNodeId)) {
      if (reaches(componentIdOf(candidate.nodes[instanceId]!))) return true;
    }
    return false;
  };
  for (const instanceId of instancesIn(candidate, definitionId)) {
    if (reaches(componentIdOf(candidate.nodes[instanceId]!))) return true;
  }
  return false;
}

function instancesIn(tree: NodeTree, rootId: NodeId): NodeId[] {
  const found: NodeId[] = [];
  const seen = new Set<NodeId>();
  const visit = (id: NodeId): void => {
    const node = tree.nodes[id];
    if (node === undefined || seen.has(id)) return;
    seen.add(id);
    if (node.type === COMPONENT_INSTANCE_TYPE) {
      found.push(id);
      return;
    }
    for (const child of node.children ?? []) visit(child);
    for (const list of Object.values(node.slots ?? {})) {
      for (const child of list) visit(child);
    }
  };
  visit(rootId);
  return found;
}

// The one derivation: definitions out, instances expanded, slots filled.
export function inlineComponents(tree: NodeTree, options: InlineOptions = {}): InlineResult {
  const idFactory = options.idFactory ?? defaultIdFactory;
  const problems: ComponentProblem[] = [];
  const nodeIdMap = new Map<NodeId, NodeId>();
  const copies = new Map<NodeId, NodeId[]>();
  const origins = new Map<NodeId, { instanceId: NodeId; partId: NodeId }>();
  const nodes: Record<NodeId, Node> = {};
  const definitions = new Map<NodeId, ComponentDefinition>();
  for (const definition of componentDefinitions(tree)) {
    if (definitions.has(definition.id)) {
      problems.push({
        kind: "duplicate-definition",
        nodeId: definition.id,
        message: `Component "${definition.name}" is defined more than once`,
      });
      continue;
    }
    definitions.set(definition.id, definition);
  }
  const byName = new Map<string, ComponentDefinition>();
  for (const definition of definitions.values()) {
    if (!byName.has(definition.name)) byName.set(definition.name, definition);
  }

  const resolve = (id: string): ComponentDefinition | undefined =>
    definitions.get(id) ?? byName.get(id);

  const used = new Set<NodeId>();
  const freshId = (instanceId: NodeId, originalId: NodeId): NodeId => {
    const base = idFactory(instanceId, originalId);
    let next = base;
    let counter = 1;
    while (used.has(next)) {
      next = `${base}_${counter}`;
      counter += 1;
    }
    used.add(next);
    return next;
  };

  const noteCopy = (definitionId: NodeId, copyId: NodeId): void => {
    const list = copies.get(definitionId) ?? [];
    list.push(copyId);
    copies.set(definitionId, list);
    if (!nodeIdMap.has(definitionId)) nodeIdMap.set(definitionId, copyId);
  };

  const stubFor = (instance: Node, message: string): NodeId => {
    const id = freshId(instance.id, `${instance.id}:stub`);
    nodes[id] = {
      id,
      type: COMPONENT_STUB_TYPE,
      props: { message },
      children: [],
    };
    return id;
  };

  const expandInstance = (instance: Node, stack: readonly NodeId[]): NodeId | null => {
    const definition = resolve(componentIdOf(instance));
    if (definition === undefined) {
      problems.push({
        kind: "unknown-component",
        nodeId: instance.id,
        message: `Component "${componentIdOf(instance)}" is not defined`,
      });
      return stubFor(instance, `Unknown component "${componentIdOf(instance)}"`);
    }
    if (stack.includes(definition.id)) {
      problems.push({
        kind: "cycle",
        nodeId: instance.id,
        message: `Component "${definition.name}" contains itself`,
      });
      return stubFor(instance, `Cycle through "${definition.name}"`);
    }
    if (definition.rootChildId === null) {
      problems.push({
        kind: "multiple-roots",
        nodeId: definition.id,
        message: `Component "${definition.name}" has no root`,
      });
      return stubFor(instance, `Component "${definition.name}" has no root`);
    }
    if ((tree.nodes[definition.id]?.children?.length ?? 0) > 1) {
      problems.push({
        kind: "multiple-roots",
        nodeId: definition.id,
        message: `Component "${definition.name}" has more than one root`,
      });
      return stubFor(instance, `Component "${definition.name}" has more than one root`);
    }
    const nextStack = [...stack, definition.id];
    const copyId = copyNode(definition.rootChildId, instance, nextStack);
    if (copyId !== null) noteCopy(definition.id, copyId);
    return copyId;
  };

  const copyNode = (
    originalId: NodeId,
    instance: Node,
    stack: readonly NodeId[],
  ): NodeId | null => {
    const original = tree.nodes[originalId];
    if (original === undefined) return null;
    if (original.type === COMPONENT_DEFINITION_TYPE) return null;
    if (original.type === COMPONENT_INSTANCE_TYPE) {
      // A nested instance is itself a part: the outer instance may swap it or
      // write its overrides. Merge first, then expand as usual.
      const patch = instanceOverrides(instance)[original.id];
      const merged: Node =
        patch === undefined
          ? original
          : { ...original, props: { ...original.props, ...patch } };
      return expandInstance(merged, stack);
    }
    if (original.type === COMPONENT_SLOT_TYPE) {
      // The placeholder gives way to the instance's slot content. The content
      // lives on the page, so its nodes keep their own ids.
      const name = nameOf(original);
      const filled = instance.slots?.[name] ?? [];
      const children = filled
        .map((childId) => expandNode(childId, stack))
        .filter((childId): childId is NodeId => childId !== null);
      if (children.length === 0) return null;
      if (children.length === 1) return children[0] ?? null;
      // More than one node fills the slot: keep them together in a frame so
      // the definition's shape stays a single node.
      const groupId = freshId(instance.id, `${original.id}:slot`);
      nodes[groupId] = {
        id: groupId,
        type: "frame",
        props: {},
        children,
      };
      return groupId;
    }
    const id = freshId(instance.id, original.id);
    if (!nodeIdMap.has(original.id)) nodeIdMap.set(original.id, id);
    const list = copies.get(original.id) ?? [];
    list.push(id);
    copies.set(original.id, list);
    origins.set(id, { instanceId: instance.id, partId: original.id });
    // The override bag of the instance wins over the definition's own props —
    // for this copy only. The definition stays untouched.
    const patch = instanceOverrides(instance)[original.id];
    const copy: Node = {
      ...original,
      id,
      props: { ...original.props, ...(patch ?? {}) },
    };
    if (original.children !== undefined) {
      copy.children = original.children
        .map((childId) => copyNode(childId, instance, stack))
        .filter((childId): childId is NodeId => childId !== null);
    } else {
      delete copy.children;
    }
    if (original.slots !== undefined) {
      const slots: Record<string, NodeId[]> = {};
      for (const [slot, list] of Object.entries(original.slots)) {
        slots[slot] = list
          .map((childId) => copyNode(childId, instance, stack))
          .filter((childId): childId is NodeId => childId !== null);
      }
      copy.slots = slots;
    } else {
      delete copy.slots;
    }
    nodes[id] = copy;
    return id;
  };

  const expandNode = (id: NodeId, stack: readonly NodeId[]): NodeId | null => {
    const node = tree.nodes[id];
    if (node === undefined) return null;
    if (node.type === COMPONENT_DEFINITION_TYPE) return null;
    if (node.type === COMPONENT_INSTANCE_TYPE) return expandInstance(node, stack);
    const copy: Node = {
      ...node,
      props: { ...node.props },
    };
    if (node.children !== undefined) {
      copy.children = node.children
        .map((childId) => expandNode(childId, stack))
        .filter((childId): childId is NodeId => childId !== null);
    } else {
      delete copy.children;
    }
    if (node.slots !== undefined) {
      const slots: Record<string, NodeId[]> = {};
      for (const [slot, list] of Object.entries(node.slots)) {
        slots[slot] = list
          .map((childId) => expandNode(childId, stack))
          .filter((childId): childId is NodeId => childId !== null);
      }
      copy.slots = slots;
    } else {
      delete copy.slots;
    }
    nodes[id] = copy;
    used.add(id);
    return id;
  };

  const rootId = expandNode(tree.rootNodeId, []);
  const result: NodeTree = {
    rootNodeId: rootId ?? tree.rootNodeId,
    nodes,
  };
  return { tree: result, nodeIdMap, copies, origins, problems };
}

// The names a definition declares vs. the slots an instance fills — the check
// the editor runs before it writes an instance.
export function unfilledSlots(
  definition: ComponentDefinition,
  instance: Node,
): string[] {
  return definition.slots.filter((name) => (instance.slots?.[name] ?? []).length === 0);
}
