import { SenifyError } from "@senify/core";
import {
  COMPONENT_DEFINITION_TYPE,
  COMPONENT_INSTANCE_TYPE,
  COMPONENT_SLOT_TYPE,
  isComponentType,
  PAGE_ROOT_TYPE,
  readSlotSpec,
  validatePropValues,
  type ComponentSlotSpec,
  type MotionSpec,
  type Node,
  type NodeId,
  type NodeOverride,
  type NodeTree,
  type PropValue,
  type Registry,
  type SectionDefinition,
  type ValidationIssue,
} from "@senify/section-sdk";
import { newNodeId } from "../ids.ts";
import { applyPatchOp } from "./patches.ts";
import { validateTreeIntegrity } from "./integrity.ts";
import {
  type Mutation,
  type MutationOp,
  type OverrideBreakpoint,
  type ParentRef,
  type PatchOp,
} from "./contract.ts";
import {
  childList,
  cloneTree,
  collectSubtree,
  pruneEmptyLists,
  requireAttached,
  requireNode,
  slotList,
  toNodeTree,
  type WorkingTree,
} from "./tree.ts";

export type MutationWarning = {
  opIndex?: number;
  field?: string;
  message: string;
  suggestion?: string;
};

export type MutationResult = {
  opIndex: number;
  op: MutationOp;
  undoPatch: PatchOp[];
};

export type ApplyMutationsOutcome = {
  tree: NodeTree;
  page: { title: string; path: string };
  warnings: MutationWarning[];
  results: MutationResult[];
};

export type ApplyMutationsOptions = {
  registry: Registry;
  tree: NodeTree;
  mutations: Mutation[];
  previousTitle: string;
  previousPath: string;
};

type ApplierState = {
  registry: Registry;
  tree: WorkingTree;
  title: string;
  path: string;
  warnings: MutationWarning[];
  currentOpIndex: number;
};

function withOpIndex(error: SenifyError, opIndex: number): SenifyError {
  if (error.opIndex !== undefined) return error;
  return new SenifyError(error.category, error.message, {
    field:
      error.field === undefined
        ? `mutations[${opIndex}]`
        : `mutations[${opIndex}].${error.field}`,
    suggestion: error.suggestion,
    opIndex,
  });
}

function throwOnIssues(issues: ValidationIssue[]): void {
  const first = issues[0];
  if (!first) return;
  throw new SenifyError("validation", first.message, {
    field: first.path,
    suggestion: first.suggestion,
  });
}

function assertRegistered(
  registry: Registry,
  type: string,
  field: string,
): void {
  if (type === PAGE_ROOT_TYPE) {
    throw new SenifyError(
      "validation",
      "The page root cannot be inserted or nested",
      {
        field,
        suggestion:
          "The page root exists exactly once per page — reference it by its id.",
      },
    );
  }
  if (!registry.has(type)) {
    throw new SenifyError("not_found", `Unknown section type "${type}"`, {
      field,
      suggestion:
        "Use a registered section type (list_sections) or register the section first.",
    });
  }
}

function definitionForNode(
  registry: Registry,
  node: Node,
): SectionDefinition | undefined {
  if (node.type === PAGE_ROOT_TYPE) return undefined;
  return registry.get(node.type);
}

function assertVariant(
  definition: SectionDefinition,
  variant: string | undefined | null,
  field: string,
): void {
  if (variant === undefined || variant === null) return;
  const variants = definition.variants ?? {};
  const names = Object.keys(variants);
  if (names.length === 0) {
    throw new SenifyError(
      "validation",
      `Section "${definition.type}" has no variants`,
      { field, suggestion: "Omit the variant field." },
    );
  }
  if (!Object.hasOwn(variants, variant)) {
    throw new SenifyError(
      "validation",
      `Unknown variant "${variant}" for section "${definition.type}"`,
      { field, suggestion: `Available variants: ${names.join(", ")}.` },
    );
  }
}

function warnLiteralValues(
  definition: SectionDefinition,
  props: Record<string, PropValue>,
  fieldPrefix: string,
  state: ApplierState,
  opIndex: number,
): void {
  const specs = new Map(
    [...definition.props, ...(definition.styleProps ?? [])].map((spec) => [
      spec.key,
      spec.control,
    ]),
  );
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== "string") continue;
    const control = specs.get(key);
    if (control !== "color" && control !== "scale") continue;
    state.warnings.push({
      opIndex,
      field: `mutations[${opIndex}].${fieldPrefix}.${key}`,
      message: `Literal value "${value}" bypasses theme tokens`,
      suggestion: `Use { "$token": "<role>" } so theme changes stay consistent.`,
    });
  }
}

function assertChildPlacement(
  state: ApplierState,
  parent: Node,
  childType: string,
  field: string,
): void {
  if (parent.type === PAGE_ROOT_TYPE) return;
  // Structural nodes (component definition, instance, slot) are indirection,
  // not content: the section child rules cannot judge them, so they fit
  // wherever a node may sit. A slot placeholder stays a leaf.
  if (isComponentType(childType) && parent.type !== COMPONENT_SLOT_TYPE) return;
  const definition = state.registry.get(parent.type);
  const allowed = definition.allowedChildren;
  if (allowed === undefined || allowed === "none") {
    throw new SenifyError(
      "validation",
      `Section "${parent.type}" does not allow children`,
      {
        field,
        suggestion:
          "Insert the node inside a container section or directly at the page root.",
      },
    );
  }
  // `"any"` is the open container: every registered type fits.
  if (allowed === "any") return;
  if (!allowed.includes(childType)) {
    throw new SenifyError(
      "validation",
      `Section "${parent.type}" does not allow child "${childType}"`,
      { field, suggestion: `Allowed children: ${allowed.join(", ")}.` },
    );
  }
}

// The slot rules that apply to one parent node: a section reads them from its
// registry definition, a component instance from its definition's slot
// placeholders (the registry only knows the structural type, not the slots the
// definition declares). `undefined` = the slot does not exist, `null` = an
// open container (any slot name, no rules), otherwise the declared rules.
type SlotRules = { allowedTypes?: string[]; max?: number };

// The slot placeholders a definition declares, in tree order. The engine works
// on a working tree (Map), so this walks it directly instead of building a
// NodeTree for `componentDefinitions`.
function componentSlotSpecs(state: ApplierState, definition: Node): ComponentSlotSpec[] {
  const specs: ComponentSlotSpec[] = [];
  const visit = (id: NodeId): void => {
    const node = state.tree.nodes.get(id);
    if (node === undefined) return;
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
  for (const child of definition.children ?? []) visit(child);
  return specs;
}

function slotRulesFor(
  state: ApplierState,
  parent: Node,
  slot: string,
): SlotRules | null | undefined {
  if (parent.type === COMPONENT_INSTANCE_TYPE) {
    const componentId = parent.props["componentId"];
    if (typeof componentId !== "string") return null;
    const definition = state.tree.nodes.get(componentId);
    // A stale instance (definition removed) stays writable; the inliner
    // reports it and the editor/MCP surface the drift.
    if (definition === undefined || definition.type !== COMPONENT_DEFINITION_TYPE) {
      return null;
    }
    const spec = componentSlotSpecs(state, definition).find((entry) => entry.name === slot);
    if (spec === undefined) return undefined;
    return {
      allowedTypes: spec.allowedTypes,
      ...(spec.max === null ? {} : { max: spec.max }),
    };
  }
  const definition = definitionForNode(state.registry, parent);
  // Open containers (`"any"`) declare no slots: any slot name is accepted.
  if (definition?.allowedChildren === "any") return null;
  return definition?.slots?.[slot];
}

function assertSlotPlacement(
  state: ApplierState,
  parent: Node,
  childType: string,
  slot: string,
  field: string,
): NodeId[] {
  const definition = definitionForNode(state.registry, parent);
  const rules = slotRulesFor(state, parent, slot);
  if (rules === null) return slotList(parent, slot);
  if (rules === undefined) {
    const available = definition?.slots ? Object.keys(definition.slots) : [];
    throw new SenifyError(
      "validation",
      `Section "${parent.type}" has no slot "${slot}"`,
      {
        field,
        suggestion:
          available.length > 0
            ? `Available slots: ${available.join(", ")}.`
            : "This section has no slots — insert into children instead.",
      },
    );
  }
  if (
    rules.allowedTypes &&
    rules.allowedTypes.length > 0 &&
    !rules.allowedTypes.includes(childType)
  ) {
    throw new SenifyError(
      "validation",
      `Slot "${slot}" of section "${parent.type}" does not allow "${childType}"`,
      {
        field,
        suggestion: `Allowed types: ${rules.allowedTypes.join(", ")}.`,
      },
    );
  }
  const list = slotList(parent, slot);
  if (rules.max !== undefined && list.length >= rules.max) {
    throw new SenifyError(
      "validation",
      `Slot "${slot}" of section "${parent.type}" is full (max ${rules.max})`,
      { field, suggestion: "Remove a node from this slot first." },
    );
  }
  return list;
}

function targetList(
  state: ApplierState,
  owner: Node,
  childType: string,
  ref: ParentRef,
  field: string,
): NodeId[] {
  if (ref.slot) return assertSlotPlacement(state, owner, childType, ref.slot, field);
  assertChildPlacement(state, owner, childType, field);
  return childList(owner);
}

function resolveIndex(index: number | undefined, length: number): number {
  const at = index ?? length;
  if (at < 0 || at > length) {
    throw new SenifyError(
      "validation",
      `Index ${at} is out of range (0..${length})`,
      {
        field: "index",
        suggestion: "Use an index within the current child list.",
      },
    );
  }
  return at;
}

function buildNode(
  state: ApplierState,
  spec: {
    type: string;
    variant?: string;
    props?: Record<string, PropValue>;
    id?: string;
    classes?: string[];
    hidden?: boolean;
    overrides?: { tablet?: NodeOverride; mobile?: NodeOverride };
    locked?: boolean;
    motion?: MotionSpec;
  },
  fieldPrefix: string,
): Node {
  assertRegistered(state.registry, spec.type, `${fieldPrefix}.type`);
  const definition = state.registry.get(spec.type);
  assertVariant(definition, spec.variant, `${fieldPrefix}.variant`);
  // Variant presets supply curated defaults; explicit props always win.
  const preset =
    (spec.variant !== undefined
      ? definition.variants?.[spec.variant]?.preset
      : undefined) ?? {};
  const props: Record<string, PropValue> = {
    ...(preset as Record<string, PropValue>),
    ...(spec.props ?? {}),
  };
  throwOnIssues(validatePropValues(definition, props, `${fieldPrefix}.props`));
  const id = spec.id ?? newNodeId();
  if (state.tree.nodes.has(id)) {
    throw new SenifyError(
      "validation",
      `Node id "${id}" is already in use`,
      {
        field: `${fieldPrefix}.id`,
        suggestion: "Omit the id to let the engine generate a unique one.",
      },
    );
  }
  const node: Node = { id, type: spec.type, props: { ...props } };
  if (spec.variant !== undefined) node.variant = spec.variant;
  if (spec.classes !== undefined && spec.classes.length > 0) {
    node.classes = [...new Set(spec.classes)];
  }
  if (spec.hidden !== undefined) node.hidden = spec.hidden;
  // Ticket 11: per-breakpoint hidden overrides travel with the spec.
  if (spec.overrides !== undefined) node.overrides = structuredClone(spec.overrides);
  if (spec.locked !== undefined) node.locked = spec.locked;
  if (spec.motion !== undefined) node.motion = structuredClone(spec.motion);
  state.tree.nodes.set(id, node);
  return node;
}

function insertAt(
  list: NodeId[],
  at: number,
  id: NodeId,
): void {
  list.splice(at, 0, id);
}

function applyInsert(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "insertNode" }>,
): PatchOp[] {
  const parentNode = requireNode(state.tree, mutation.parent.nodeId, "parent.nodeId");
  const node = buildNode(state, mutation.node, "node");
  warnLiteralValues(
    state.registry.get(node.type),
    node.props,
    "node.props",
    state,
    state.currentOpIndex,
  );
  const list = targetList(state, parentNode, node.type, mutation.parent, "node.type");
  insertAt(list, resolveIndex(mutation.index, list.length), node.id);
  return [{ patch: "deleteRaw", id: node.id }];
}

function applyDelete(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "deleteNode" }>,
): PatchOp[] {
  requireNode(state.tree, mutation.id, "id");
  if (mutation.id === state.tree.rootNodeId) {
    throw new SenifyError("validation", "The page root cannot be deleted", {
      field: "id",
    });
  }
  const located = requireAttached(state.tree, mutation.id);
  const subtree = structuredClone(collectSubtree(state.tree, mutation.id));
  for (const entry of subtree) state.tree.nodes.delete(entry.id);
  const owner = requireNode(state.tree, located.parent.nodeId, "id");
  const list = located.parent.slot
    ? slotList(owner, located.parent.slot)
    : childList(owner);
  list.splice(located.index, 1);
  return [
    { patch: "insertRaw", parent: located.parent, index: located.index, nodes: subtree },
  ];
}

function applyDuplicate(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "duplicateNode" }>,
): PatchOp[] {
  const source = requireNode(state.tree, mutation.id, "id");
  const located = requireAttached(state.tree, mutation.id);
  const sourceSubtreeIds = new Set(
    collectSubtree(state.tree, mutation.id).map((entry) => entry.id),
  );
  if (mutation.target && sourceSubtreeIds.has(mutation.target.nodeId)) {
    throw new SenifyError(
      "validation",
      "A node cannot be duplicated into its own subtree",
      {
        field: "target.nodeId",
        suggestion: "Choose a target outside the duplicated subtree.",
      },
    );
  }
  const target: ParentRef = mutation.target
    ? { ...mutation.target }
    : { ...located.parent };
  const targetOwner = requireNode(state.tree, target.nodeId, "target.nodeId");
  const list = targetList(state, targetOwner, source.type, target, "target.nodeId");
  const at =
    mutation.index !== undefined
      ? resolveIndex(mutation.index, list.length)
      : target.nodeId === located.parent.nodeId &&
          target.slot === located.parent.slot
        ? located.index + 1
        : list.length;

  const subtree = collectSubtree(state.tree, mutation.id);
  const idMap = new Map<NodeId, NodeId>();
  for (const entry of subtree) idMap.set(entry.id, newNodeId());
  const clones: Node[] = subtree.map((entry) => {
    const clone: Node = structuredClone(entry);
    const fresh = idMap.get(entry.id);
    if (!fresh) throw new Error("Internal error: id map incomplete");
    clone.id = fresh;
    if (clone.children) {
      clone.children = clone.children.map((childId) => {
        const mapped = idMap.get(childId);
        if (!mapped) throw new Error("Internal error: child id map incomplete");
        return mapped;
      });
    }
    if (clone.slots) {
      const remapped: Record<string, NodeId[]> = {};
      for (const [slot, ids] of Object.entries(clone.slots)) {
        remapped[slot] = ids.map((childId) => {
          const mapped = idMap.get(childId);
          if (!mapped) {
            throw new Error("Internal error: slot id map incomplete");
          }
          return mapped;
        });
      }
      clone.slots = remapped;
    }
    return clone;
  });
  for (const clone of clones) state.tree.nodes.set(clone.id, clone);

  const ownerId = idMap.get(target.nodeId) ?? target.nodeId;
  const owner = requireNode(state.tree, ownerId, "target.nodeId");
  const insertList = target.slot ? slotList(owner, target.slot) : childList(owner);
  const copyRoot = clones[0];
  if (!copyRoot) throw new Error("Internal error: empty clone set");
  insertAt(insertList, Math.min(at, insertList.length), copyRoot.id);
  return [{ patch: "deleteRaw", id: copyRoot.id }];
}

function applyMove(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "moveNode" }>,
): PatchOp[] {
  const node = requireNode(state.tree, mutation.id, "id");
  if (mutation.id === state.tree.rootNodeId) {
    throw new SenifyError("validation", "The page root cannot be moved", {
      field: "id",
    });
  }
  const located = requireAttached(state.tree, mutation.id);
  const subtreeIds = new Set(
    collectSubtree(state.tree, mutation.id).map((entry) => entry.id),
  );
  if (subtreeIds.has(mutation.target.nodeId)) {
    throw new SenifyError(
      "validation",
      "A node cannot be moved into its own subtree",
      {
        field: "target.nodeId",
        suggestion: "Choose a target outside the moved subtree.",
      },
    );
  }
  const targetOwner = requireNode(state.tree, mutation.target.nodeId, "target.nodeId");
  const list = targetList(state, targetOwner, node.type, mutation.target, "target.nodeId");

  const oldOwner = requireNode(state.tree, located.parent.nodeId, "id");
  const oldList = located.parent.slot
    ? slotList(oldOwner, located.parent.slot)
    : childList(oldOwner);
  oldList.splice(located.index, 1);

  insertAt(list, resolveIndex(mutation.index, list.length), mutation.id);
  return [
    { patch: "moveRaw", id: mutation.id, target: located.parent, index: located.index },
  ];
}

function applyWrap(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "wrapNode" }>,
): PatchOp[] {
  const node = requireNode(state.tree, mutation.id, "id");
  if (mutation.id === state.tree.rootNodeId) {
    throw new SenifyError("validation", "The page root cannot be wrapped", {
      field: "id",
    });
  }
  const located = requireAttached(state.tree, mutation.id);
  const wrapper = buildNode(state, mutation.wrapper, "wrapper");
  const wrapperDefinition = state.registry.get(wrapper.type);
  const allowed = wrapperDefinition.allowedChildren;
  // An open container (`"any"`) wraps every registered type.
  const listed = Array.isArray(allowed) ? allowed : undefined;
  const fits = allowed === "any" || (listed !== undefined && listed.includes(node.type));
  if (!fits) {
    throw new SenifyError(
      "validation",
      `Section "${wrapper.type}" does not allow child "${node.type}"`,
      {
        field: "wrapper.type",
        suggestion:
          listed !== undefined && listed.length > 0
            ? `Allowed children: ${listed.join(", ")}.`
            : "This section cannot wrap other nodes.",
      },
    );
  }
  const owner = requireNode(state.tree, located.parent.nodeId, "id");
  const list = targetList(state, owner, wrapper.type, located.parent, "wrapper.type");
  const position = list.indexOf(mutation.id);
  if (position < 0) throw new Error("Internal error: node missing from parent list");
  wrapper.children = [mutation.id];
  list.splice(position, 1, wrapper.id);
  return [
    { patch: "moveRaw", id: mutation.id, target: located.parent, index: located.index },
    { patch: "deleteRaw", id: wrapper.id },
  ];
}

function applyUpdateProps(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "updateNodeProps" }>,
): PatchOp[] {
  const node = requireNode(state.tree, mutation.id, "id");
  const definition = definitionForNode(state.registry, node);
  if (!definition) {
    throw new SenifyError("validation", "The page root has no props", {
      field: "id",
      suggestion: "Use updatePageMeta to change the page title or path.",
    });
  }
  const next: Record<string, PropValue> = { ...node.props };
  const undo: Record<string, PropValue | null> = {};
  for (const [key, value] of Object.entries(mutation.patch)) {
    undo[key] = node.props[key] ?? null;
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  throwOnIssues(validatePropValues(definition, next, "props"));
  const changedProps: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(mutation.patch)) {
    if (value !== null) changedProps[key] = value;
  }
  warnLiteralValues(definition, changedProps, "props", state, state.currentOpIndex);
  node.props = next;
  return [{ patch: "setProps", id: mutation.id, props: undo }];
}

function applyUpdateMeta(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "updateNodeMeta" }>,
): PatchOp[] {
  const node = requireNode(state.tree, mutation.id, "id");
  const definition = definitionForNode(state.registry, node);
  const meta = mutation.meta;
  if (meta.variant !== undefined) {
    if (!definition) {
      throw new SenifyError("validation", "The page root has no variants", {
        field: "meta.variant",
        suggestion: "Omit the variant field.",
      });
    }
    assertVariant(definition, meta.variant, "meta.variant");
  }
  const undo: {
    variant?: string | null;
    locked?: boolean | null;
    hidden?: boolean | null;
    classes?: string[] | null;
  } = {
    variant: node.variant ?? null,
    locked: node.locked ?? null,
    hidden: node.hidden ?? null,
    classes: node.classes === undefined ? null : [...node.classes],
  };
  if (meta.variant !== undefined) {
    if (meta.variant === null) delete node.variant;
    else node.variant = meta.variant;
  }
  if (meta.locked !== undefined) {
    if (meta.locked === null) delete node.locked;
    else node.locked = meta.locked;
  }
  if (meta.hidden !== undefined) {
    if (meta.hidden === null) delete node.hidden;
    else node.hidden = meta.hidden;
  }
  // Class assignment (ADR-0005): replace first, then union, then subtract —
  // one op may combine the forms, the result is order-independent enough.
  if (meta.classes !== undefined) {
    if (meta.classes === null || meta.classes.length === 0) delete node.classes;
    else node.classes = [...new Set(meta.classes)];
  }
  if (meta.addClasses !== undefined && meta.addClasses.length > 0) {
    const next = new Set(node.classes ?? []);
    for (const name of meta.addClasses) next.add(name);
    node.classes = [...next];
  }
  if (meta.removeClasses !== undefined && meta.removeClasses.length > 0) {
    const remove = new Set(meta.removeClasses);
    const next = (node.classes ?? []).filter((name) => !remove.has(name));
    if (next.length > 0) node.classes = next;
    else delete node.classes;
  }
  return [{ patch: "setNodeFields", id: mutation.id, fields: undo }];
}

function applySetOverride(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "setBreakpointOverride" }>,
): PatchOp[] {
  const node = requireNode(state.tree, mutation.id, "id");
  const definition = definitionForNode(state.registry, node);
  if (!definition) {
    throw new SenifyError("validation", "The page root has no breakpoint overrides", {
      field: "id",
    });
  }
  const breakpoint: OverrideBreakpoint = mutation.breakpoint;
  const override = mutation.override;
  const current = node.overrides?.[breakpoint];
  if (override.props === undefined && override.hidden === undefined) {
    return [];
  }
  const mergedProps: Record<string, PropValue> = {
    ...(current?.props ?? {}),
    ...(override.props ?? {}),
  };
  throwOnIssues(validatePropValues(definition, mergedProps, "override.props"));
  warnLiteralValues(definition, override.props ?? {}, "override.props", state, state.currentOpIndex);
  const next: NodeOverride = {};
  if (Object.keys(mergedProps).length > 0) next.props = mergedProps;
  if (override.hidden !== undefined) next.hidden = override.hidden;
  else if (current?.hidden !== undefined) next.hidden = current.hidden;
  node.overrides = { ...(node.overrides ?? {}), [breakpoint]: next };
  return [
    {
      patch: "setOverride",
      id: mutation.id,
      breakpoint,
      override: current ? structuredClone(current) : null,
    },
  ];
}

function applyClearOverride(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "clearBreakpointOverride" }>,
): PatchOp[] {
  const node = requireNode(state.tree, mutation.id, "id");
  const current = node.overrides?.[mutation.breakpoint];
  if (!current) return [];
  const breakpoint: OverrideBreakpoint = mutation.breakpoint;
  // The undo patch keeps the state before this mutation; clone first because
  // the selective path edits `current` in place (ticket 11, L2).
  const before = structuredClone(current);
  const selective = mutation.props !== undefined || mutation.hidden === true;
  if (selective) {
    if (mutation.props !== undefined && current.props !== undefined) {
      for (const key of mutation.props) delete current.props[key];
      if (Object.keys(current.props).length === 0) delete current.props;
    }
    if (mutation.hidden === true) delete current.hidden;
  }
  const empty = current.props === undefined && current.hidden === undefined;
  if (!selective || empty) {
    if (node.overrides) {
      delete node.overrides[breakpoint];
      if (Object.keys(node.overrides).length === 0) delete node.overrides;
    }
  }
  return [
    {
      patch: "setOverride",
      id: mutation.id,
      breakpoint,
      override: before,
    },
  ];
}

function applySetMotion(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "setMotion" }>,
): PatchOp[] {
  const node = requireNode(state.tree, mutation.id, "id");
  const definition = definitionForNode(state.registry, node);
  if (!definition) {
    throw new SenifyError("validation", "The page root has no motion", {
      field: "id",
    });
  }
  const presets = definition.motionPresets;
  if (presets && !presets.includes(mutation.spec.preset)) {
    throw new SenifyError(
      "validation",
      `Unknown motion preset "${mutation.spec.preset}" for section "${definition.type}"`,
      {
        field: "spec.preset",
        suggestion:
          presets.length > 0
            ? `Available presets: ${presets.join(", ")}.`
            : "This section has no motion presets.",
      },
    );
  }
  const previous: MotionSpec | null = node.motion
    ? structuredClone(node.motion)
    : null;
  node.motion = structuredClone(mutation.spec);
  return [{ patch: "setMotion", id: mutation.id, spec: previous }];
}

function applyClearMotion(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "clearMotion" }>,
): PatchOp[] {
  const node = requireNode(state.tree, mutation.id, "id");
  if (!node.motion) return [];
  const previous = structuredClone(node.motion);
  delete node.motion;
  return [{ patch: "setMotion", id: mutation.id, spec: previous }];
}

const PAGE_PATH_PATTERN = /^\/[^\s?#]*$/;

function applyUpdatePageMeta(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "updatePageMeta" }>,
): PatchOp[] {
  const previous = { title: state.title, path: state.path };
  let changed = false;
  if (mutation.title !== undefined) {
    const title = mutation.title.trim();
    if (title === "") {
      throw new SenifyError("validation", "Page title cannot be empty", {
        field: "title",
        suggestion: "Provide a non-empty title.",
      });
    }
    state.title = title;
    changed = true;
  }
  if (mutation.path !== undefined) {
    const path = mutation.path.trim();
    if (!PAGE_PATH_PATTERN.test(path)) {
      throw new SenifyError("validation", `Invalid page path "${path}"`, {
        field: "path",
        suggestion: 'Paths start with "/" and must not contain spaces, "?" or "#".',
      });
    }
    state.path = path;
    changed = true;
  }
  if (!changed) return [];
  return [{ patch: "setPageMeta", title: previous.title, path: previous.path }];
}

// Slot existence without the per-insert max check: `setSlotContent` replaces
// the whole list, so the total count is validated once, not per node. `null`
// means an open container (any slot name, no rules).
function requireSlotRules(
  state: ApplierState,
  parent: Node,
  slot: string,
): SlotRules | null {
  const rules = slotRulesFor(state, parent, slot);
  if (rules === undefined) {
    const definition = definitionForNode(state.registry, parent);
    const available = definition?.slots ? Object.keys(definition.slots) : [];
    throw new SenifyError(
      "validation",
      `Section "${parent.type}" has no slot "${slot}"`,
      {
        field: "slot",
        suggestion:
          available.length > 0
            ? `Available slots: ${available.join(", ")}.`
            : "This section has no slots — insert into children instead.",
      },
    );
  }
  return rules;
}

function assertSlotAllowedTypes(
  parent: Node,
  slot: string,
  slotSpec: { allowedTypes?: string[] },
  childType: string,
  field: string,
): void {
  const allowed = slotSpec.allowedTypes;
  if (allowed && allowed.length > 0 && !allowed.includes(childType)) {
    throw new SenifyError(
      "validation",
      `Slot "${slot}" of section "${parent.type}" does not allow "${childType}"`,
      { field, suggestion: `Allowed types: ${allowed.join(", ")}.` },
    );
  }
}

// Replaces the whole content of one slot (ticket 13 rest). The undo removes
// the new roots and re-inserts the old subtrees at their recorded indices.
function applySetSlotContent(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "setSlotContent" }>,
): PatchOp[] {
  const parent = requireNode(state.tree, mutation.id, "id");
  const rules = requireSlotRules(state, parent, mutation.slot);
  const newNodes = mutation.nodes.map((spec, index) => {
    const node = buildNode(state, spec, `nodes[${index}]`);
    warnLiteralValues(
      state.registry.get(node.type),
      node.props,
      `nodes[${index}].props`,
      state,
      state.currentOpIndex,
    );
    return node;
  });
  if (rules !== null) {
    for (const node of newNodes) {
      assertSlotAllowedTypes(parent, mutation.slot, rules, node.type, "nodes");
    }
    if (rules.max !== undefined && newNodes.length > rules.max) {
      throw new SenifyError(
        "validation",
        `Slot "${mutation.slot}" of section "${parent.type}" holds at most ${rules.max} nodes`,
        { field: "nodes", suggestion: "Remove entries from the slot first." },
      );
    }
  }
  const previous = [...slotList(parent, mutation.slot)];
  const oldSubtrees = previous.map((id) =>
    structuredClone(collectSubtree(state.tree, id)),
  );
  for (const id of previous) {
    for (const entry of collectSubtree(state.tree, id)) {
      state.tree.nodes.delete(entry.id);
    }
  }
  const list = slotList(parent, mutation.slot);
  list.splice(0, list.length, ...newNodes.map((node) => node.id));
  return [
    ...newNodes.map((node): PatchOp => ({ patch: "deleteRaw", id: node.id })),
    ...oldSubtrees.map((subtree, index): PatchOp => ({
      patch: "insertRaw",
      parent: { nodeId: mutation.id, slot: mutation.slot },
      index,
      nodes: subtree,
    })),
  ];
}

// A collection is a section with an `item` slot; the entry list is that slot.
function collectionEntryIds(parent: Node): NodeId[] {
  return parent.slots?.item ?? [];
}

function applyCreateCollectionEntry(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "createCollectionEntry" }>,
): PatchOp[] {
  const parent = requireNode(state.tree, mutation.id, "id");
  const slotSpec = requireSlotRules(state, parent, "item");
  const node = buildNode(state, mutation.node, "node");
  warnLiteralValues(
    state.registry.get(node.type),
    node.props,
    "node.props",
    state,
    state.currentOpIndex,
  );
  if (slotSpec !== null) {
    assertSlotAllowedTypes(parent, "item", slotSpec, node.type, "node");
  }
  const existing = collectionEntryIds(parent);
  if (slotSpec !== null && slotSpec.max !== undefined && existing.length >= slotSpec.max) {
    throw new SenifyError(
      "validation",
      `The item slot of "${parent.type}" is full (max ${slotSpec.max})`,
      { field: "node", suggestion: "Remove the existing entry first." },
    );
  }
  const index = resolveIndex(mutation.index, existing.length);
  insertAt(slotList(parent, "item"), index, node.id);
  return [{ patch: "deleteRaw", id: node.id }];
}

function applyUpdateCollectionEntry(
  state: ApplierState,
  mutation: Extract<Mutation, { op: "updateCollectionEntry" }>,
): PatchOp[] {
  const parent = requireNode(state.tree, mutation.id, "id");
  const entryIds = collectionEntryIds(parent);
  const entryId = entryIds[mutation.index];
  if (entryId === undefined) {
    throw new SenifyError(
      "validation",
      `No collection entry at index ${mutation.index}`,
      {
        field: "index",
        suggestion: `The item slot holds ${entryIds.length} entries.`,
      },
    );
  }
  const entry = requireNode(state.tree, entryId, "index");
  const definition = definitionForNode(state.registry, entry);
  if (!definition) {
    throw new SenifyError("validation", "The page root is not a collection entry", {
      field: "index",
    });
  }
  const next: Record<string, PropValue> = { ...entry.props };
  const undo: Record<string, PropValue | null> = {};
  for (const [key, value] of Object.entries(mutation.patch)) {
    undo[key] = entry.props[key] ?? null;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  throwOnIssues(validatePropValues(definition, next, "patch"));
  const changedProps: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(mutation.patch)) {
    if (value !== null) changedProps[key] = value;
  }
  warnLiteralValues(definition, changedProps, "patch", state, state.currentOpIndex);
  entry.props = next;
  return [{ patch: "setProps", id: entryId, props: undo }];
}

function applyOne(
  state: ApplierState,
  mutation: Mutation,
  opIndex: number,
): PatchOp[] {
  state.currentOpIndex = opIndex;
  switch (mutation.op) {
    case "insertNode":
      return applyInsert(state, mutation);
    case "deleteNode":
      return applyDelete(state, mutation);
    case "duplicateNode":
      return applyDuplicate(state, mutation);
    case "moveNode":
      return applyMove(state, mutation);
    case "wrapNode":
      return applyWrap(state, mutation);
    case "updateNodeProps":
      return applyUpdateProps(state, mutation);
    case "updateNodeMeta":
      return applyUpdateMeta(state, mutation);
    case "setBreakpointOverride":
      return applySetOverride(state, mutation);
    case "clearBreakpointOverride":
      return applyClearOverride(state, mutation);
    case "setMotion":
      return applySetMotion(state, mutation);
    case "clearMotion":
      return applyClearMotion(state, mutation);
    case "updatePageMeta":
      return applyUpdatePageMeta(state, mutation);
    case "setSlotContent":
      return applySetSlotContent(state, mutation);
    case "createCollectionEntry":
      return applyCreateCollectionEntry(state, mutation);
    case "updateCollectionEntry":
      return applyUpdateCollectionEntry(state, mutation);
  }
}

export function applyMutations(
  options: ApplyMutationsOptions,
): ApplyMutationsOutcome {
  const working: ApplierState = {
    registry: options.registry,
    tree: cloneTree(options.tree),
    title: options.previousTitle,
    path: options.previousPath,
    warnings: [],
    currentOpIndex: 0,
  };
  const results: MutationResult[] = [];
  options.mutations.forEach((mutation, opIndex) => {
    try {
      const undoPatch = applyOne(working, mutation, opIndex);
      results.push({ opIndex, op: mutation.op, undoPatch });
    } catch (error) {
      if (error instanceof SenifyError) throw withOpIndex(error, opIndex);
      throw error;
    }
  });
  pruneEmptyLists(working.tree);
  const tree = toNodeTree(working.tree);
  // Broken references are marked, never deleted: surface them as warnings.
  for (const issue of validateTreeIntegrity(tree)) {
    working.warnings.push({
      field: "tree",
      message: issue.message,
      suggestion:
        "The tree references nodes that no longer exist — rebuild the affected branch; the engine never deletes references automatically.",
    });
  }
  return {
    tree,
    page: { title: working.title, path: working.path },
    warnings: working.warnings,
    results,
  };
}

export type UndoBatchInput = {
  tree: NodeTree;
  title: string;
  path: string;
  batch: { undoPatch: PatchOp[] }[];
};

export function applyUndoBatch(input: UndoBatchInput): {
  tree: NodeTree;
  title: string;
  path: string;
  warnings: MutationWarning[];
} {
  const working = cloneTree(input.tree);
  let title = input.title;
  let path = input.path;
  for (let index = input.batch.length - 1; index >= 0; index -= 1) {
    const step = input.batch[index];
    if (!step) continue;
    for (const patch of step.undoPatch) {
      if (patch.patch === "setPageMeta") {
        title = patch.title;
        path = patch.path;
      } else {
        applyPatchOp(working, patch);
      }
    }
  }
  pruneEmptyLists(working);
  const tree = toNodeTree(working);
  // E17 (slice 1): an undo runs through the same integrity check as a forward
  // batch. A stale batch (recorded against a different tree state) surfaces as
  // a warning instead of silently corrupting the tree.
  const warnings: MutationWarning[] = [];
  for (const issue of validateTreeIntegrity(tree)) {
    warnings.push({
      field: "tree",
      message: issue.message,
      suggestion:
        "The undo was recorded against a different tree state — reload the page and redo the step.",
    });
  }
  return { tree, title, path, warnings };
}
