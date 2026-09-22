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

export type ComponentSlotSpec = {
  name: string;
  nodeId: NodeId;
  /** Section types the slot accepts; empty means "anything". */
  allowedTypes: string[];
  /** Upper bound for filled nodes; null means unlimited. */
  max: number | null;
};

// The slot rules a placeholder declares: `allowedTypes` (a list of section
// types, empty = any) and `max` (a positive number, absent = unlimited). A
// malformed value is ignored - the writer (editor/MCP) validates before it
// stores, the model stays readable.
export function readSlotSpec(node: {
  id: string;
  props: Record<string, PropValue>;
}): ComponentSlotSpec {
  const rawTypes = node.props["allowedTypes"];
  const allowedTypes = Array.isArray(rawTypes)
    ? rawTypes.filter((entry): entry is string => typeof entry === "string" && entry !== "")
    : [];
  const rawMax = node.props["max"];
  const max =
    typeof rawMax === "number" && Number.isFinite(rawMax) && rawMax >= 0
      ? Math.floor(rawMax)
      : null;
  const name = nameOfProps(node.props);
  return { name: name === "" ? node.id : name, nodeId: node.id, allowedTypes, max };
}

export type ComponentDefinition = {
  id: NodeId;
  name: string;
  /** The version of the definition (props.version, default 1). */
  version: number;
  rootNodeId: NodeId;
  /** The one root child of the definition (its reusable subtree). */
  rootChildId: NodeId | null;
  /** The slots the definition declares, in tree order. */
  slots: ComponentSlotSpec[];
  /** The named props overlays the definition offers (props.variants). */
  variants: ComponentVariants;
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

function nameOfProps(props: Record<string, PropValue>): string {
  const value: PropValue | undefined = props["name"];
  return typeof value === "string" ? value : "";
}

function nameOf(node: Node): string {
  return nameOfProps(node.props);
}

function componentIdOf(node: Node): string {
  const value: PropValue | undefined = node.props["componentId"];
  return typeof value === "string" ? value : "";
}

function positiveVersion(value: PropValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : 1;
}

// The version a definition carries (`props.version`, default 1).
function versionOf(node: Node): number {
  return positiveVersion(node.props["version"]);
}

// The version an instance pins (`props.componentVersion`, default 1). The
// draft renders the definition as it is; the pin is the drift signal, not a
// lookup key (old versions are not stored - the release snapshot freezes the
// whole page instead).
export function instanceVersion(instance: Node): number {
  return positiveVersion(instance.props["componentVersion"]);
}

export type ComponentDrift = {
  instanceId: NodeId;
  componentId: NodeId;
  pinned: number;
  current: number;
};

// Instances whose pin differs from their definition's version: the editor and
// the MCP surface them so a human or agent can update the instances in one
// step. An instance without a definition is not drift - it is a problem the
// inliner reports.
export function componentDrift(tree: NodeTree): ComponentDrift[] {
  const definitions = new Map(componentDefinitions(tree).map((entry) => [entry.id, entry]));
  const drift: ComponentDrift[] = [];
  for (const node of Object.values(tree.nodes)) {
    if (node.type !== COMPONENT_INSTANCE_TYPE) continue;
    const componentId = componentIdOf(node);
    const definition = definitions.get(componentId);
    if (definition === undefined) continue;
    const pinned = instanceVersion(node);
    if (pinned !== definition.version) {
      drift.push({ instanceId: node.id, componentId, pinned, current: definition.version });
    }
  }
  return drift;
}

// The override bag of an instance: part id -> the props this instance changes.
// Part ids are the node ids inside the definition — stable, declared, never
// derived from labels (the Plasmic lesson). A missing or malformed bag is an
// empty one; the inliner then renders the definition unchanged.
export type ComponentOverrides = Record<NodeId, Record<string, PropValue>>;

export function instanceOverrides(instance: Node): ComponentOverrides {
  return parseOverrides(instance.props["overrides"]);
}

// Variants (ticket 04): named props overlays of a definition. The definition
// declares them (`props.variants`: name -> part id -> props), an instance
// activates any number of them (`props.variants`: name list). Overlays merge in
// definition order and the instance's own overrides always win — so a variant
// swap keeps the instance's overrides, because those are addressed by the
// stable part ids, not by the variant.
export type ComponentVariants = Record<string, ComponentOverrides>;

function parseOverrides(value: PropValue | undefined): ComponentOverrides {
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

export function definitionVariants(definition: {
  props: Record<string, PropValue>;
}): ComponentVariants {
  const value: PropValue | undefined = definition.props["variants"];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: ComponentVariants = {};
  for (const [name, overlay] of Object.entries(value)) {
    if (name === "") continue;
    out[name] = parseOverrides(overlay);
  }
  return out;
}

// The variant names an instance activates. A single string counts as one
// activation (agents write both shapes); everything else is ignored.
export function instanceVariants(instance: {
  props: Record<string, PropValue>;
}): string[] {
  const value: PropValue | undefined = instance.props["variants"];
  if (typeof value === "string") return value === "" ? [] : [value];
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry !== "" && !out.includes(entry)) out.push(entry);
  }
  return out;
}

// The merged overlay of every active variant, in definition order. Unknown
// names are ignored (the writer reports them through `unknownVariants`).
export function activeVariantProps(
  definition: { props: Record<string, PropValue> },
  instance: { props: Record<string, PropValue> },
): ComponentOverrides {
  const variants = definitionVariants(definition);
  const active = instanceVariants(instance);
  const merged: ComponentOverrides = {};
  for (const name of Object.keys(variants)) {
    if (!active.includes(name)) continue;
    for (const [partId, props] of Object.entries(variants[name] ?? {})) {
      merged[partId] = { ...merged[partId], ...props };
    }
  }
  return merged;
}

// Activated variants the definition does not declare. They stay in the data
// (dropping them silently would be a quiet loss) but the editor and the MCP
// surface them so a human or agent can clean up.
export function unknownVariants(
  definition: { props: Record<string, PropValue> },
  instance: { props: Record<string, PropValue> },
): string[] {
  const declared = definitionVariants(definition);
  return instanceVariants(instance).filter((name) => declared[name] === undefined);
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
        version: versionOf(node),
        rootNodeId: node.id,
        rootChildId: node.children?.[0] ?? null,
        slots: collectSlots(tree, node.id),
        variants: definitionVariants(node),
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

function collectSlots(tree: NodeTree, definitionId: NodeId): ComponentSlotSpec[] {
  const specs: ComponentSlotSpec[] = [];
  const seen = new Set<NodeId>();
  const visit = (id: NodeId): void => {
    const node = tree.nodes[id];
    if (node === undefined || seen.has(id)) return;
    seen.add(id);
    if (node.type === COMPONENT_SLOT_TYPE) {
      const spec = readSlotSpec({ id: node.id, props: node.props });
      if (!specs.some((entry) => entry.name === spec.name)) specs.push(spec);
      return;
    }
    for (const child of node.children ?? []) visit(child);
    for (const list of Object.values(node.slots ?? {})) {
      for (const child of list) visit(child);
    }
  };
  for (const child of tree.nodes[definitionId]?.children ?? []) visit(child);
  return specs;
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
    // The active variants of the instance: their overlays apply to every part
    // copy before the instance's own overrides (which always win).
    const definitionNode = tree.nodes[definition.id];
    const variantProps =
      definitionNode === undefined ? {} : activeVariantProps(definitionNode, instance);
    const copyId = copyNode(definition.rootChildId, instance, nextStack, variantProps);
    if (copyId !== null) {
      noteCopy(definition.id, copyId);
      // The instance maps to its root copy: a scoped style rule the editor wrote
      // on the instance follows the copy (styles per instance). The bake's
      // scoped remap and the canvas's rule duplication both read this mapping.
      nodeIdMap.set(instance.id, copyId);
      const instanceCopies = copies.get(instance.id) ?? [];
      instanceCopies.push(copyId);
      copies.set(instance.id, instanceCopies);
      const root = nodes[copyId];
      if (root !== undefined) {
        // The instance's own classes belong on the root copy: the rendered
        // element must carry them for the class rules to match (canvas and bake
        // alike).
        const instanceClasses = instance.classes ?? [];
        if (instanceClasses.length > 0) {
          root.classes = [...new Set([...(root.classes ?? []), ...instanceClasses])];
        }
        // Motion on a component (ticket 19, M6): the instance's spec is the
        // instance's decision and wins on the rendered root copy; without one
        // the definition's default applies — the root part's own spec first,
        // then the definition container's. Motion on the other parts already
        // rides the copy itself (the spread in `copyNode`).
        const motion = instance.motion ?? root.motion ?? definitionNode?.motion;
        if (motion !== undefined) root.motion = structuredClone(motion);
      }
    }
    return copyId;
  };

  const copyNode = (
    originalId: NodeId,
    instance: Node,
    stack: readonly NodeId[],
    variantProps: ComponentOverrides,
  ): NodeId | null => {
    const original = tree.nodes[originalId];
    if (original === undefined) return null;
    if (original.type === COMPONENT_DEFINITION_TYPE) return null;
    if (original.type === COMPONENT_INSTANCE_TYPE) {
      // A nested instance is itself a part: the outer instance may swap it or
      // write its overrides (a variant may swap it too). Merge first, then
      // expand as usual.
      const patch = {
        ...(variantProps[original.id] ?? {}),
        ...(instanceOverrides(instance)[original.id] ?? {}),
      };
      const merged: Node =
        Object.keys(patch).length === 0
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
    // for this copy only. The active variants of the instance sit between
    // definition and overrides (their overlays are the definition's variation,
    // the overrides are the instance's own decision).
    const patch = instanceOverrides(instance)[original.id];
    const copy: Node = {
      ...original,
      id,
      props: {
        ...original.props,
        ...(variantProps[original.id] ?? {}),
        ...(patch ?? {}),
      },
    };
    if (original.children !== undefined) {
      copy.children = original.children
        .map((childId) => copyNode(childId, instance, stack, variantProps))
        .filter((childId): childId is NodeId => childId !== null);
    } else {
      delete copy.children;
    }
    if (original.slots !== undefined) {
      const slots: Record<string, NodeId[]> = {};
      for (const [slot, list] of Object.entries(original.slots)) {
        slots[slot] = list
          .map((childId) => copyNode(childId, instance, stack, variantProps))
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
  return definition.slots
    .filter((slot) => (instance.slots?.[slot.name] ?? []).length === 0)
    .map((slot) => slot.name);
}
