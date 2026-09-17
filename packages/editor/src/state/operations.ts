// Editor operations (rebuild Phase 0, third slice).
//
// One pure function per op. An operation validates the intent against the
// widget catalog (unknown primitives, unknown properties, child rules, slots,
// class names, device inheritance), then describes the change as two patch
// lists: `forward` turns the current document into the next one, `inverse` turns
// it back. Nothing here mutates the document; the store applies the patches and
// records the history entry.
//
// All errors are `SenifyError` with a dotted `field` path, matching the engine.

import { SenifyError } from "@senify/core";
import type { EditorMutation, EditorNodeSpec } from "@senify/engine/browser";
import type { PropValue } from "@senify/section-sdk";
import {
  baseKeyOf,
  deviceKey,
  getPrimitive,
  inheritanceChain,
  matchesValueType,
  translatableProperties,
  type Device,
  type DeviceValueMap,
  type PrimitiveDefinition,
} from "@senify/widget-engine";
import {
  collectSubtree,
  locateParent,
  type EditorDocument,
  type EditorNode,
  type NodeId,
  type ParentRef,
} from "./document.ts";
import { isClassDefined } from "./document.ts";
import { newNodeId } from "./ids.ts";
import type { DocumentPatch } from "./patches.ts";

export type OperationContext = {
  idFactory?: () => string;
};

export type OperationResult = {
  forward: DocumentPatch[];
  inverse: DocumentPatch[];
  warnings: string[];
};

const EMPTY: OperationResult = { forward: [], inverse: [], warnings: [] };

const STYLE_PROPERTY_NAMES = new Set(translatableProperties(undefined));

function requireNode(
  document: EditorDocument,
  id: NodeId,
  field: string,
): EditorNode {
  const node = document.nodes[id];
  if (node === undefined) {
    throw new SenifyError("not_found", `Node "${id}" does not exist`, {
      field,
      suggestion: "The node was deleted or never existed — reload the document.",
    });
  }
  return node;
}

function requirePrimitive(primitive: string, field: string): PrimitiveDefinition {
  const definition = getPrimitive(primitive);
  if (definition === undefined) {
    throw new SenifyError("not_found", `Unknown primitive "${primitive}"`, {
      field,
      suggestion: "Use a primitive from the widget catalog.",
    });
  }
  return definition;
}

function knownProps(definition: PrimitiveDefinition): Set<string> {
  const keys = new Set(definition.controls.map((control) => control.key));
  for (const prop of translatableProperties(definition.type)) keys.add(prop);
  return keys;
}

function assertKnownProp(
  definition: PrimitiveDefinition,
  key: string,
  field: string,
): void {
  const base = baseKeyOf(key);
  const known = knownProps(definition);
  if (!known.has(base)) {
    throw new SenifyError(
      "validation",
      `Unknown property "${base}" for primitive "${definition.type}"`,
      {
        field,
        suggestion: `Known properties: ${[...known].join(", ")}.`,
      },
    );
  }
}

function assertPropValue(
  definition: PrimitiveDefinition,
  key: string,
  value: PropValue,
  field: string,
): void {
  if (value === null) return;
  const base = baseKeyOf(key);
  const control = definition.controls.find((entry) => entry.key === base);
  if (control !== undefined && !matchesValueType(control.valueType, value)) {
    throw new SenifyError(
      "validation",
      `Value for "${base}" must be a ${control.valueType}`,
      { field, suggestion: `Expected the value type "${control.valueType}".` },
    );
  }
}

function assertStyleProp(key: string, field: string): void {
  const base = baseKeyOf(key);
  if (!STYLE_PROPERTY_NAMES.has(base)) {
    throw new SenifyError("validation", `Unknown style property "${base}"`, {
      field,
      suggestion: `Known style properties: ${[...STYLE_PROPERTY_NAMES].join(", ")}.`,
    });
  }
}

function buildNode(
  document: EditorDocument,
  spec: EditorNodeSpec,
  fieldPrefix: string,
  idFactory: () => string,
): EditorNode {
  if (spec.primitive === "root") {
    throw new SenifyError("validation", "The root cannot be inserted or nested", {
      field: `${fieldPrefix}.primitive`,
      suggestion: "The root exists exactly once per document.",
    });
  }
  const definition = requirePrimitive(spec.primitive, `${fieldPrefix}.primitive`);
  const props: DeviceValueMap = {};
  for (const [key, value] of Object.entries(spec.props ?? {})) {
    assertKnownProp(definition, key, `${fieldPrefix}.props.${key}`);
    assertPropValue(definition, key, value, `${fieldPrefix}.props.${key}`);
    props[key] = value;
  }
  const id = spec.id ?? idFactory();
  if (document.nodes[id] !== undefined) {
    throw new SenifyError("conflict", `Node id "${id}" is already in use`, {
      field: `${fieldPrefix}.id`,
      suggestion: "Omit the id to let the store generate a unique one.",
    });
  }
  const node: EditorNode = { id, primitive: spec.primitive, props };
  if (spec.classes !== undefined) {
    for (const name of spec.classes) {
      if (!isClassDefined(document, name)) {
        throw new SenifyError(
          "not_found",
          `Unknown style class "${name}"`,
          {
            field: `${fieldPrefix}.classes`,
            suggestion: "Create the style rule before assigning it.",
          },
        );
      }
    }
    node.classes = [...new Set(spec.classes)];
  }
  if (spec.hidden !== undefined) node.hidden = spec.hidden;
  if (spec.locked !== undefined) node.locked = spec.locked;
  return node;
}

function targetList(
  document: EditorDocument,
  parent: EditorNode,
  childPrimitive: string,
  ref: ParentRef,
  field: string,
): NodeId[] {
  const definition = requirePrimitive(parent.primitive, field);
  if (ref.slot !== undefined) {
    const slotSpec = definition.slots[ref.slot];
    if (slotSpec === undefined) {
      const available = Object.keys(definition.slots);
      throw new SenifyError(
        "validation",
        `Primitive "${definition.type}" has no slot "${ref.slot}"`,
        {
          field,
          suggestion:
            available.length > 0
              ? `Available slots: ${available.join(", ")}.`
              : "This primitive has no slots — insert into children instead.",
        },
      );
    }
    if (
      slotSpec.allowedTypes !== undefined &&
      slotSpec.allowedTypes.length > 0 &&
      !slotSpec.allowedTypes.includes(childPrimitive)
    ) {
      throw new SenifyError(
        "validation",
        `Slot "${ref.slot}" of primitive "${definition.type}" does not allow "${childPrimitive}"`,
        { field, suggestion: `Allowed types: ${slotSpec.allowedTypes.join(", ")}.` },
      );
    }
    const list = parent.slots?.[ref.slot] ?? [];
    if (slotSpec.max !== undefined && list.length >= slotSpec.max) {
      throw new SenifyError(
        "validation",
        `Slot "${ref.slot}" of primitive "${definition.type}" is full (max ${slotSpec.max})`,
        { field, suggestion: "Remove a node from this slot first." },
      );
    }
    return list;
  }
  const allowed = definition.allowedChildren;
  if (allowed === "none") {
    throw new SenifyError(
      "validation",
      `Primitive "${definition.type}" does not allow children`,
      { field, suggestion: "Insert the node into a container primitive instead." },
    );
  }
  if (Array.isArray(allowed) && !allowed.includes(childPrimitive)) {
    throw new SenifyError(
      "validation",
      `Primitive "${definition.type}" does not allow child "${childPrimitive}"`,
      { field, suggestion: `Allowed children: ${allowed.join(", ")}.` },
    );
  }
  return parent.children ?? [];
}

function resolveIndex(
  index: number | undefined,
  length: number,
  field: string,
): number {
  const at = index ?? length;
  if (at < 0 || at > length) {
    throw new SenifyError("validation", `Index ${at} is out of range (0..${length})`, {
      field,
      suggestion: "Use an index within the current child list.",
    });
  }
  return at;
}

function requireNotRoot(document: EditorDocument, id: NodeId, action: string): void {
  if (id === document.rootNodeId) {
    throw new SenifyError("validation", `The root cannot be ${action}`, { field: "id" });
  }
}

function deviceOf(device: Device | undefined): Device {
  return device ?? "desktop";
}

function setPropsPatch(
  id: NodeId,
  props: Record<string, PropValue | null>,
): DocumentPatch {
  return { patch: "setNodeProps", id, props };
}

// --------------------------------------------------------------- prop writes

function applySetNodeProp(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "setNodeProp" }>,
): OperationResult {
  const device = deviceOf(mutation.device);
  const node = requireNode(document, mutation.id, "id");
  const definition = requirePrimitive(node.primitive, "id");
  assertKnownProp(definition, mutation.key, "key");
  assertPropValue(definition, mutation.key, mutation.value, "value");
  const storeKey = deviceKey(mutation.key, device);
  const had = Object.prototype.hasOwnProperty.call(node.props, storeKey);
  const previous = had ? (node.props[storeKey] ?? null) : null;
  const warnings: string[] = [];
  if (device !== "desktop") {
    const broader = inheritanceChain(mutation.key, device).slice(1);
    if (!broader.some((key) => node.props[key] !== undefined)) {
      warnings.push(
        `No broader value for "${mutation.key}" — the ${device} value stands alone.`,
      );
    }
  }
  return {
    forward: [setPropsPatch(mutation.id, { [storeKey]: mutation.value })],
    inverse: [setPropsPatch(mutation.id, { [storeKey]: previous })],
    warnings,
  };
}

function applyClearNodeProp(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "clearNodeProp" }>,
): OperationResult {
  const device = deviceOf(mutation.device);
  const node = requireNode(document, mutation.id, "id");
  const definition = requirePrimitive(node.primitive, "id");
  assertKnownProp(definition, mutation.key, "key");
  const storeKey = deviceKey(mutation.key, device);
  if (!Object.prototype.hasOwnProperty.call(node.props, storeKey)) return EMPTY;
  const previous = node.props[storeKey] ?? null;
  return {
    forward: [setPropsPatch(mutation.id, { [storeKey]: null })],
    inverse: [setPropsPatch(mutation.id, { [storeKey]: previous })],
    warnings: [],
  };
}

// ------------------------------------------------------------- class writes

function applyAssignClass(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "assignClass" }>,
): OperationResult {
  const node = requireNode(document, mutation.id, "id");
  if (!isClassDefined(document, mutation.classId)) {
    throw new SenifyError(
      "not_found",
      `Unknown style class "${mutation.classId}"`,
      {
        field: "classId",
        suggestion: "Create the style rule before assigning it.",
      },
    );
  }
  const current = node.classes ?? [];
  if (current.includes(mutation.classId)) return EMPTY;
  return {
    forward: [
      {
        patch: "setNodeFields",
        id: mutation.id,
        fields: { classes: [...current, mutation.classId] },
      },
    ],
    inverse: [
      {
        patch: "setNodeFields",
        id: mutation.id,
        fields: { classes: current.length > 0 ? [...current] : null },
      },
    ],
    warnings: [],
  };
}

function applyRemoveClass(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "removeClass" }>,
): OperationResult {
  const node = requireNode(document, mutation.id, "id");
  const current = node.classes ?? [];
  if (!current.includes(mutation.classId)) {
    throw new SenifyError(
      "validation",
      `Class "${mutation.classId}" is not assigned to node "${mutation.id}"`,
      { field: "classId" },
    );
  }
  const next = current.filter((name) => name !== mutation.classId);
  return {
    forward: [
      {
        patch: "setNodeFields",
        id: mutation.id,
        fields: { classes: next.length > 0 ? next : null },
      },
    ],
    inverse: [
      {
        patch: "setNodeFields",
        id: mutation.id,
        fields: { classes: [...current] },
      },
    ],
    warnings: [],
  };
}

function applyRenameClass(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "renameClass" }>,
): OperationResult {
  if (!isClassDefined(document, mutation.from)) {
    throw new SenifyError(
      "not_found",
      `Style class "${mutation.from}" does not exist`,
      { field: "from" },
    );
  }
  if (isClassDefined(document, mutation.to)) {
    throw new SenifyError("conflict", `Style class "${mutation.to}" already exists`, {
      field: "to",
      suggestion: "Pick a name that is not in use yet.",
    });
  }
  return {
    forward: [
      { patch: "renameClass", from: mutation.from, to: mutation.to },
    ],
    inverse: [
      { patch: "renameClass", from: mutation.to, to: mutation.from },
    ],
    warnings: [],
  };
}

// ------------------------------------------------------------- style rules

function applyCreateStyleRule(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "createStyleRule" }>,
): OperationResult {
  if (isClassDefined(document, mutation.name)) {
    throw new SenifyError("conflict", `Style class "${mutation.name}" already exists`, {
      field: "name",
    });
  }
  for (const key of Object.keys(mutation.props)) {
    assertStyleProp(key, `props.${key}`);
  }
  return {
    forward: [
      { patch: "setStyleRule", name: mutation.name, rule: { ...mutation.props } },
    ],
    inverse: [{ patch: "setStyleRule", name: mutation.name, rule: null }],
    warnings: [],
  };
}

function applyUpdateStyleRule(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "updateStyleRule" }>,
): OperationResult {
  const rule = document.classes[mutation.name];
  if (rule === undefined) {
    throw new SenifyError(
      "not_found",
      `Style class "${mutation.name}" does not exist`,
      { field: "name", suggestion: "Create the style rule first." },
    );
  }
  const next: DeviceValueMap = { ...rule };
  for (const [key, value] of Object.entries(mutation.props)) {
    assertStyleProp(key, `props.${key}`);
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return {
    forward: [{ patch: "setStyleRule", name: mutation.name, rule: next }],
    inverse: [{ patch: "setStyleRule", name: mutation.name, rule: { ...rule } }],
    warnings: [],
  };
}

function applyDeleteStyleRule(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "deleteStyleRule" }>,
): OperationResult {
  const rule = document.classes[mutation.name];
  if (rule === undefined) {
    throw new SenifyError(
      "not_found",
      `Style class "${mutation.name}" does not exist`,
      { field: "name" },
    );
  }
  const forward: DocumentPatch[] = [
    { patch: "setStyleRule", name: mutation.name, rule: null },
  ];
  const inverse: DocumentPatch[] = [
    { patch: "setStyleRule", name: mutation.name, rule: { ...rule } },
  ];
  for (const node of Object.values(document.nodes)) {
    if (node.classes === undefined || !node.classes.includes(mutation.name)) continue;
    const without = node.classes.filter((name) => name !== mutation.name);
    forward.push({
      patch: "setNodeFields",
      id: node.id,
      fields: { classes: without.length > 0 ? without : null },
    });
    inverse.push({
      patch: "setNodeFields",
      id: node.id,
      fields: { classes: [...node.classes] },
    });
  }
  return { forward, inverse, warnings: [] };
}

// ------------------------------------------------------------- structure

function applyInsertNode(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "insertNode" }>,
  idFactory: () => string,
): OperationResult {
  const parent = requireNode(document, mutation.parent.nodeId, "parent.nodeId");
  const node = buildNode(document, mutation.node, "node", idFactory);
  const list = targetList(
    document,
    parent,
    node.primitive,
    mutation.parent,
    "parent.nodeId",
  );
  const index = resolveIndex(mutation.index, list.length, "index");
  return {
    forward: [
      { patch: "insertNodes", parent: mutation.parent, index, nodes: [node] },
    ],
    inverse: [{ patch: "deleteNode", id: node.id }],
    warnings: [],
  };
}

function applyDuplicateNode(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "duplicateNode" }>,
  idFactory: () => string,
): OperationResult {
  requireNotRoot(document, mutation.id, "duplicated");
  const source = requireNode(document, mutation.id, "id");
  const located = locateParent(document, mutation.id);
  if (located === undefined) {
    throw new SenifyError("validation", `Node "${mutation.id}" is not attached to the tree`, {
      field: "id",
    });
  }
  const subtree = collectSubtree(document, mutation.id);
  const subtreeIds = new Set(subtree.map((entry) => entry.id));
  const target: ParentRef = mutation.target !== undefined ? { ...mutation.target } : { ...located.parent };
  if (subtreeIds.has(target.nodeId)) {
    throw new SenifyError("validation", "A node cannot be duplicated into its own subtree", {
      field: "target.nodeId",
      suggestion: "Choose a target outside the duplicated subtree.",
    });
  }
  const targetOwner = requireNode(document, target.nodeId, "target.nodeId");
  const list = targetList(document, targetOwner, source.primitive, target, "target.nodeId");
  const index =
    mutation.index !== undefined
      ? resolveIndex(mutation.index, list.length, "index")
      : target.nodeId === located.parent.nodeId && target.slot === located.parent.slot
        ? located.index + 1
        : list.length;
  const idMap = new Map<NodeId, NodeId>();
  for (const entry of subtree) idMap.set(entry.id, idFactory());
  const clones: EditorNode[] = subtree.map((entry) => {
    const clone: EditorNode = structuredClone(entry);
    const fresh = idMap.get(entry.id);
    if (fresh === undefined) throw new Error("Internal error: id map incomplete");
    clone.id = fresh;
    if (clone.children !== undefined) {
      clone.children = clone.children.map((childId) => {
        const mapped = idMap.get(childId);
        if (mapped === undefined) throw new Error("Internal error: child id missing");
        return mapped;
      });
    }
    if (clone.slots !== undefined) {
      const slots: Record<string, NodeId[]> = {};
      for (const [slot, ids] of Object.entries(clone.slots)) {
        slots[slot] = ids.map((childId) => {
          const mapped = idMap.get(childId);
          if (mapped === undefined) throw new Error("Internal error: slot id missing");
          return mapped;
        });
      }
      clone.slots = slots;
    }
    return clone;
  });
  const root = clones[0];
  if (root === undefined) throw new Error("Internal error: empty clone set");
  return {
    forward: [{ patch: "insertNodes", parent: target, index, nodes: clones }],
    inverse: [{ patch: "deleteNode", id: root.id }],
    warnings: [],
  };
}

function applyMoveNode(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "moveNode" }>,
): OperationResult {
  requireNotRoot(document, mutation.id, "moved");
  const node = requireNode(document, mutation.id, "id");
  const located = locateParent(document, mutation.id);
  if (located === undefined) {
    throw new SenifyError("validation", `Node "${mutation.id}" is not attached to the tree`, {
      field: "id",
    });
  }
  if (collectSubtree(document, mutation.id).some((entry) => entry.id === mutation.target.nodeId)) {
    throw new SenifyError("validation", "A node cannot be moved into its own subtree", {
      field: "target.nodeId",
      suggestion: "Choose a target outside the moved subtree.",
    });
  }
  const targetOwner = requireNode(document, mutation.target.nodeId, "target.nodeId");
  const list = targetList(document, targetOwner, node.primitive, mutation.target, "target.nodeId");
  const index = resolveIndex(mutation.index, list.length, "index");
  return {
    forward: [
      { patch: "moveNode", id: mutation.id, target: mutation.target, index },
    ],
    inverse: [
      { patch: "moveNode", id: mutation.id, target: located.parent, index: located.index },
    ],
    warnings: [],
  };
}

function applyDeleteNode(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "deleteNode" }>,
): OperationResult {
  requireNotRoot(document, mutation.id, "deleted");
  requireNode(document, mutation.id, "id");
  const located = locateParent(document, mutation.id);
  if (located === undefined) {
    throw new SenifyError("validation", `Node "${mutation.id}" is not attached to the tree`, {
      field: "id",
    });
  }
  const subtree = collectSubtree(document, mutation.id);
  return {
    forward: [{ patch: "deleteNode", id: mutation.id }],
    inverse: [
      {
        patch: "insertNodes",
        parent: located.parent,
        index: located.index,
        nodes: subtree,
      },
    ],
    warnings: [],
  };
}

// --------------------------------------------------------------- slots

function applySetSlotContent(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "setSlotContent" }>,
  idFactory: () => string,
): OperationResult {
  const parent = requireNode(document, mutation.id, "id");
  const definition = requirePrimitive(parent.primitive, "id");
  const slotSpec = definition.slots[mutation.slot];
  if (slotSpec === undefined) {
    const available = Object.keys(definition.slots);
    throw new SenifyError(
      "validation",
      `Primitive "${definition.type}" has no slot "${mutation.slot}"`,
      {
        field: "slot",
        suggestion: available.length > 0 ? `Available slots: ${available.join(", ")}.` : undefined,
      },
    );
  }
  const newNodes = mutation.nodes.map((spec, index) =>
    buildNode(document, spec, `nodes[${index}]`, idFactory),
  );
  for (const node of newNodes) {
    if (
      slotSpec.allowedTypes !== undefined &&
      slotSpec.allowedTypes.length > 0 &&
      !slotSpec.allowedTypes.includes(node.primitive)
    ) {
      throw new SenifyError(
        "validation",
        `Slot "${mutation.slot}" of primitive "${definition.type}" does not allow "${node.primitive}"`,
        { field: "nodes", suggestion: `Allowed types: ${slotSpec.allowedTypes.join(", ")}.` },
      );
    }
  }
  if (slotSpec.max !== undefined && newNodes.length > slotSpec.max) {
    throw new SenifyError(
      "validation",
      `Slot "${mutation.slot}" of primitive "${definition.type}" holds at most ${slotSpec.max} nodes`,
      { field: "nodes" },
    );
  }
  const oldIds = parent.slots?.[mutation.slot] ?? [];
  const oldSubtrees = oldIds.map((id) => collectSubtree(document, id));
  const parent_ = { nodeId: mutation.id, slot: mutation.slot };
  const forward: DocumentPatch[] = [
    ...oldIds.map((id): DocumentPatch => ({ patch: "deleteNode", id })),
    ...newNodes.map((node, index): DocumentPatch => ({
      patch: "insertNodes",
      parent: parent_,
      index,
      nodes: [node],
    })),
  ];
  const inverse: DocumentPatch[] = [
    ...newNodes.map((node): DocumentPatch => ({ patch: "deleteNode", id: node.id })),
    ...oldIds.map((id, index): DocumentPatch => ({
      patch: "insertNodes",
      parent: parent_,
      index,
      nodes: oldSubtrees[index] ?? [],
    })),
  ];
  return { forward, inverse, warnings: [] };
}

function requireCollection(
  document: EditorDocument,
  id: NodeId,
): EditorNode {
  const node = requireNode(document, id, "id");
  const definition = requirePrimitive(node.primitive, "id");
  if (definition.type !== "collection") {
    throw new SenifyError(
      "validation",
      `Primitive "${definition.type}" is not a collection`,
      { field: "id", suggestion: 'Only the "collection" primitive holds entries.' },
    );
  }
  return node;
}

function applyCreateCollectionEntry(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "createCollectionEntry" }>,
  idFactory: () => string,
): OperationResult {
  const parent = requireCollection(document, mutation.id);
  const definition = requirePrimitive(parent.primitive, "id");
  const slotSpec = definition.slots["item"];
  const node = buildNode(document, mutation.node, "node", idFactory);
  const existing = parent.slots?.item ?? [];
  if (slotSpec?.max !== undefined && existing.length >= slotSpec.max) {
    throw new SenifyError(
      "validation",
      `The item slot of "${parent.primitive}" is full (max ${slotSpec.max})`,
      { field: "node", suggestion: "Remove the existing entry first." },
    );
  }
  if (
    slotSpec?.allowedTypes !== undefined &&
    slotSpec.allowedTypes.length > 0 &&
    !slotSpec.allowedTypes.includes(node.primitive)
  ) {
    throw new SenifyError(
      "validation",
      `The item slot does not allow "${node.primitive}"`,
      { field: "node.primitive", suggestion: `Allowed types: ${slotSpec.allowedTypes.join(", ")}.` },
    );
  }
  const index = resolveIndex(mutation.index, existing.length, "index");
  return {
    forward: [
      {
        patch: "insertNodes",
        parent: { nodeId: mutation.id, slot: "item" },
        index,
        nodes: [node],
      },
    ],
    inverse: [{ patch: "deleteNode", id: node.id }],
    warnings: [],
  };
}

function applyUpdateCollectionEntry(
  document: EditorDocument,
  mutation: Extract<EditorMutation, { op: "updateCollectionEntry" }>,
): OperationResult {
  const parent = requireCollection(document, mutation.id);
  const entryIds = parent.slots?.item ?? [];
  const entryId = entryIds[mutation.index];
  if (entryId === undefined) {
    throw new SenifyError(
      "validation",
      `No collection entry at index ${mutation.index}`,
      { field: "index", suggestion: `The item slot holds ${entryIds.length} entries.` },
    );
  }
  const entry = requireNode(document, entryId, "index");
  const definition = requirePrimitive(entry.primitive, "index");
  const changes: Record<string, PropValue | null> = {};
  const restore: Record<string, PropValue | null> = {};
  for (const [key, value] of Object.entries(mutation.patch)) {
    assertKnownProp(definition, key, `patch.${key}`);
    if (value !== null) assertPropValue(definition, key, value, `patch.${key}`);
    changes[key] = value;
    restore[key] = Object.prototype.hasOwnProperty.call(entry.props, key)
      ? (entry.props[key] ?? null)
      : null;
  }
  return {
    forward: [setPropsPatch(entryId, changes)],
    inverse: [setPropsPatch(entryId, restore)],
    warnings: [],
  };
}

export function applyEditorMutation(
  document: EditorDocument,
  mutation: EditorMutation,
  context: OperationContext = {},
): OperationResult {
  const idFactory = context.idFactory ?? newNodeId;
  switch (mutation.op) {
    case "setNodeProp":
      return applySetNodeProp(document, mutation);
    case "clearNodeProp":
      return applyClearNodeProp(document, mutation);
    case "assignClass":
      return applyAssignClass(document, mutation);
    case "removeClass":
      return applyRemoveClass(document, mutation);
    case "renameClass":
      return applyRenameClass(document, mutation);
    case "createStyleRule":
      return applyCreateStyleRule(document, mutation);
    case "updateStyleRule":
      return applyUpdateStyleRule(document, mutation);
    case "deleteStyleRule":
      return applyDeleteStyleRule(document, mutation);
    case "insertNode":
      return applyInsertNode(document, mutation, idFactory);
    case "duplicateNode":
      return applyDuplicateNode(document, mutation, idFactory);
    case "moveNode":
      return applyMoveNode(document, mutation);
    case "deleteNode":
      return applyDeleteNode(document, mutation);
    case "setSlotContent":
      return applySetSlotContent(document, mutation, idFactory);
    case "createCollectionEntry":
      return applyCreateCollectionEntry(document, mutation, idFactory);
    case "updateCollectionEntry":
      return applyUpdateCollectionEntry(document, mutation);
  }
}
