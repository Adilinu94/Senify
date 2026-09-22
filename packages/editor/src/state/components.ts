// Visual components in the editor (ticket 04, slice 1): the store operations.
//
// A component is ordinary document data — a definition node, an instance node,
// a slot placeholder (widget-engine/legacy.ts reserves the primitives). These
// helpers only write through the store's gate (`applyBatch`), so every action
// is one history entry and travels the existing transport. The render paths
// inline the tree (section-sdk/components.ts); nothing here duplicates that.

import {
  COMPONENT_DEFINITION_PRIMITIVE,
  COMPONENT_INSTANCE_PRIMITIVE,
  COMPONENT_SLOT_PRIMITIVE,
  type DeviceValueMap,
  type PropValue,
} from "@senify/widget-engine";
import { definitionVariants, instanceVariants } from "@senify/section-sdk";
import { SenifyError } from "@senify/core";
import { collectSubtree, locateParent, type EditorDocument } from "./document.ts";
import { newNodeId } from "./ids.ts";
import type { EditorStore } from "./store.ts";

function definitionOf(store: EditorStore, id: string): { id: string; name: string } | null {
  const node = store.document.nodes[id];
  if (node === undefined || node.primitive !== COMPONENT_DEFINITION_PRIMITIVE) return null;
  const name = typeof node.props["name"] === "string" ? node.props["name"] : id;
  return { id, name };
}

function positiveVersion(value: PropValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : 1;
}

// The version a definition carries (`props.version`, default 1) - the same
// reading as section-sdk `ComponentDefinition.version`.
export function definitionVersionOf(document: EditorDocument, id: string): number | null {
  const node = document.nodes[id];
  if (node === undefined || node.primitive !== COMPONENT_DEFINITION_PRIMITIVE) return null;
  return positiveVersion(node.props["version"]);
}

// The version an instance pins (`props.componentVersion`, default 1). The pin
// is the drift signal, not a lookup key (section-sdk `instanceVersion`).
export function instanceVersionOf(node: { props: DeviceValueMap }): number {
  return positiveVersion(node.props["componentVersion"]);
}

export type ComponentDriftEntry = {
  instanceId: string;
  componentId: string;
  pinned: number;
  current: number;
};

// Instances whose pin differs from their definition's version - the editor
// counterpart of section-sdk `componentDrift` (which reads the baked tree).
export function componentDriftOf(
  document: EditorDocument,
  definitionId?: string,
): ComponentDriftEntry[] {
  const drift: ComponentDriftEntry[] = [];
  for (const node of Object.values(document.nodes)) {
    if (node.primitive !== COMPONENT_INSTANCE_PRIMITIVE) continue;
    const componentId = node.props["componentId"];
    if (typeof componentId !== "string") continue;
    if (definitionId !== undefined && componentId !== definitionId) continue;
    const current = definitionVersionOf(document, componentId);
    if (current === null) continue;
    const pinned = instanceVersionOf(node);
    if (pinned !== current) {
      drift.push({ instanceId: node.id, componentId, pinned, current });
    }
  }
  return drift;
}

export function componentDriftIn(
  store: EditorStore,
  definitionId?: string,
): ComponentDriftEntry[] {
  return componentDriftOf(store.document, definitionId);
}

// The declared parts of a definition in the editor document, in tree order —
// the override keys. Slot placeholders are structure, not parts.
export function componentParts(
  document: EditorDocument,
  definitionId: string,
): { id: string; primitive: string; props: DeviceValueMap }[] {
  const definition = document.nodes[definitionId];
  const rootChildId = definition?.children?.[0];
  if (definition?.primitive !== COMPONENT_DEFINITION_PRIMITIVE || rootChildId === undefined) {
    return [];
  }
  const parts: { id: string; primitive: string; props: DeviceValueMap }[] = [];
  const visit = (id: string): void => {
    const node = document.nodes[id];
    if (node === undefined) return;
    if (
      node.primitive === COMPONENT_DEFINITION_PRIMITIVE ||
      node.primitive === COMPONENT_SLOT_PRIMITIVE
    ) {
      return;
    }
    parts.push({ id: node.id, primitive: node.primitive, props: node.props });
    for (const child of node.children ?? []) visit(child);
    for (const list of Object.values(node.slots ?? {})) {
      for (const child of list) visit(child);
    }
  };
  visit(rootChildId);
  return parts;
}

export function componentPartsIn(
  store: EditorStore,
  definitionId: string,
): { id: string; primitive: string; props: DeviceValueMap }[] {
  return componentParts(store.document, definitionId);
}

// The override bag of an instance, read from the editor node. The shape is the
// one `section-sdk/components.ts` defines: part id -> changed props.
export function editorOverrides(node: {
  props: DeviceValueMap;
}): Record<string, Record<string, PropValue>> {
  const value = node.props["overrides"];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, Record<string, PropValue>> = {};
  for (const [partId, props] of Object.entries(value)) {
    if (props === null || typeof props !== "object" || Array.isArray(props)) continue;
    out[partId] = { ...props };
  }
  return out;
}

// Sets or clears one override of one instance part. `null` removes the value
// again; an empty part bag (and an empty bag overall) is pruned so the stored
// document stays free of dead entries. One `applyBatch`, so one undo entry.
export function setComponentOverride(
  store: EditorStore,
  instanceId: string,
  partId: string,
  key: string,
  value: PropValue | null,
): boolean {
  const instance = store.document.nodes[instanceId];
  if (instance === undefined || instance.primitive !== COMPONENT_INSTANCE_PRIMITIVE) {
    return false;
  }
  const componentId = instance.props["componentId"];
  if (typeof componentId !== "string") return false;
  const definition = definitionOf(store, componentId);
  if (definition === null) {
    throw new SenifyError(
      "not_found",
      `Component "${componentId}" is not defined`,
      { field: "componentId" },
    );
  }
  const parts = componentPartsIn(store, componentId);
  if (!parts.some((part) => part.id === partId)) {
    throw new SenifyError(
      "not_found",
      `Component "${definition.name}" has no part "${partId}"`,
      {
        field: "partId",
        suggestion: `Parts: ${parts.map((part) => part.id).join(", ") || "none"}.`,
      },
    );
  }
  const bag = editorOverrides(instance);
  const part = { ...(bag[partId] ?? {}) };
  if (value === null) delete part[key];
  else part[key] = value;
  if (Object.keys(part).length === 0) delete bag[partId];
  else bag[partId] = part;
  const next: Record<string, PropValue> = { ...bag };
  const mutation =
    Object.keys(next).length === 0
      ? { op: "clearNodeProp", id: instanceId, key: "overrides" }
      : { op: "setNodeProp", id: instanceId, key: "overrides", value: next };
  const outcome = store.applyBatch([mutation], {
    label: value === null ? `Override zurücksetzen · ${key}` : `Override · ${key}`,
  });
  return outcome.changed;
}

// The override bag of one instance in the editor document (read helper for the
// inspector and the MCP side).
export function overridesOf(
  store: EditorStore,
  instanceId: string,
): Record<string, Record<string, PropValue>> {
  const node = store.document.nodes[instanceId];
  if (node === undefined || node.primitive !== COMPONENT_INSTANCE_PRIMITIVE) return {};
  return editorOverrides(node);
}

// The variant names a definition offers (`props.variants` of the definition,
// keys in declaration order) - the list the inspector renders as toggles.
export function definitionVariantNames(
  document: EditorDocument,
  definitionId: string,
): string[] {
  const node = document.nodes[definitionId];
  if (node === undefined || node.primitive !== COMPONENT_DEFINITION_PRIMITIVE) return [];
  return Object.keys(definitionVariants(node));
}

// The variant names an instance activates (section-sdk `instanceVariants`).
export function variantsOf(store: EditorStore, instanceId: string): string[] {
  const node = store.document.nodes[instanceId];
  if (node === undefined || node.primitive !== COMPONENT_INSTANCE_PRIMITIVE) return [];
  return instanceVariants(node);
}

// Activates or deactivates variant names of one instance. Unknown names are
// rejected (the definition is the register, never a guess), the stored list
// keeps definition order and an empty list clears the prop. One `applyBatch`,
// so one undo entry - and the instance's overrides stay untouched, because
// they are addressed by part ids (the variant swap keeps them).
export function setComponentVariants(
  store: EditorStore,
  instanceId: string,
  names: readonly string[],
): boolean {
  const instance = store.document.nodes[instanceId];
  if (instance === undefined || instance.primitive !== COMPONENT_INSTANCE_PRIMITIVE) {
    return false;
  }
  const componentId = instance.props["componentId"];
  if (typeof componentId !== "string") return false;
  const definition = definitionOf(store, componentId);
  if (definition === null) {
    throw new SenifyError(
      "not_found",
      `Component "${componentId}" is not defined`,
      { field: "componentId" },
    );
  }
  const declared = definitionVariantNames(store.document, componentId);
  for (const name of names) {
    if (!declared.includes(name)) {
      throw new SenifyError(
        "not_found",
        `Component "${definition.name}" has no variant "${name}"`,
        {
          field: "variants",
          suggestion: `Variants: ${declared.join(", ") || "none"}.`,
        },
      );
    }
  }
  const next = declared.filter((name) => names.includes(name));
  const current = instanceVariants(instance);
  if (current.join("\u0000") === next.join("\u0000")) return false;
  const mutation =
    next.length === 0
      ? { op: "clearNodeProp", id: instanceId, key: "variants" }
      : { op: "setNodeProp", id: instanceId, key: "variants", value: next };
  const outcome = store.applyBatch([mutation], {
    label: next.length === 0 ? "Varianten zurücksetzen" : `Varianten · ${next.join(", ")}`,
  });
  return outcome.changed;
}

// Every definition in the document, in tree order — the list the explorer's
// component tab and the instantiate action read.
export function componentDefinitionsIn(store: EditorStore): { id: string; name: string }[] {
  return Object.values(store.document.nodes)
    .filter((node) => node.primitive === COMPONENT_DEFINITION_PRIMITIVE)
    .map((node) => ({
      id: node.id,
      name: typeof node.props["name"] === "string" ? node.props["name"] : node.id,
    }));
}

// Turns a node into a definition and leaves an instance in its place: the
// definition lands under the document root, the node becomes its single root
// child, the instance takes over the node's position. One undo entry.
export function createComponent(store: EditorStore, id: string, name?: string): string | null {
  if (id === store.document.rootNodeId) return null;
  const node = store.document.nodes[id];
  if (node === undefined) return null;
  if (
    node.primitive === COMPONENT_DEFINITION_PRIMITIVE ||
    node.primitive === COMPONENT_INSTANCE_PRIMITIVE ||
    node.primitive === COMPONENT_SLOT_PRIMITIVE
  ) {
    return null;
  }
  const located = locateParent(store.document, id);
  if (located === undefined) return null;
  const definitionId = newNodeId();
  const instanceId = newNodeId();
  const outcome = store.applyBatch(
    [
      {
        op: "insertNode",
        parent: { nodeId: store.document.rootNodeId },
        node: {
          primitive: COMPONENT_DEFINITION_PRIMITIVE,
          id: definitionId,
          props: { name: name ?? node.primitive, version: 1 },
        },
      },
      { op: "moveNode", id, target: { nodeId: definitionId }, index: 0 },
      {
        op: "insertNode",
        parent: located.parent,
        index: located.index,
        node: {
          primitive: COMPONENT_INSTANCE_PRIMITIVE,
          id: instanceId,
          props: { componentId: definitionId, componentVersion: 1 },
        },
      },
    ],
    { label: "Komponente anlegen" },
  );
  return outcome.changed ? definitionId : null;
}

// Declares a slot in a definition: a placeholder a later instance fills. The
// placeholder goes into the definition's root child (the reusable structure).
// `allowedTypes` (empty = anything) and `max` (absent = unlimited) are the
// rules the engine enforces on insert (section-sdk `readSlotSpec`).
export type SlotOptions = {
  allowedTypes?: string[];
  max?: number | null;
};

export function insertSlot(
  store: EditorStore,
  definitionId: string,
  name: string,
  parentId?: string,
  options: SlotOptions = {},
): string | null {
  const definition = definitionOf(store, definitionId);
  if (definition === null) return null;
  const rootChildId = store.document.nodes[definitionId]?.children?.[0];
  const parent = parentId ?? rootChildId;
  if (parent === undefined) return null;
  if (store.document.nodes[parent] === undefined) return null;
  const props: DeviceValueMap = { name };
  const allowedTypes = (options.allowedTypes ?? []).filter(
    (entry) => typeof entry === "string" && entry !== "",
  );
  if (allowedTypes.length > 0) props["allowedTypes"] = allowedTypes;
  if (
    typeof options.max === "number" &&
    Number.isFinite(options.max) &&
    options.max >= 0
  ) {
    props["max"] = Math.floor(options.max);
  }
  const slotId = newNodeId();
  const outcome = store.applyBatch(
    [
      {
        op: "insertNode",
        parent: { nodeId: parent },
        node: {
          primitive: COMPONENT_SLOT_PRIMITIVE,
          id: slotId,
          props,
        },
      },
    ],
    { label: `Slot ${name} anlegen` },
  );
  return outcome.changed ? slotId : null;
}

// Raises the definition's version (`props.version`). The instances keep their
// pin - that difference is exactly the drift the editor shows until the author
// updates them.
export function bumpComponentVersion(store: EditorStore, definitionId: string): number | null {
  const current = definitionVersionOf(store.document, definitionId);
  if (current === null) return null;
  const version = current + 1;
  const outcome = store.applyBatch(
    [{ op: "setNodeProp", id: definitionId, key: "version", value: version }],
    { label: `Komponente versionieren · v${version}` },
  );
  return outcome.changed ? version : null;
}

// Pulls every instance of a definition up to its current version. One batch,
// so the whole update is a single undo step.
export function updateComponentInstances(store: EditorStore, definitionId: string): number {
  const current = definitionVersionOf(store.document, definitionId);
  if (current === null) return 0;
  const stale = componentDriftIn(store, definitionId);
  if (stale.length === 0) return 0;
  store.applyBatch(
    stale.map((entry) => ({
      op: "setNodeProp" as const,
      id: entry.instanceId,
      key: "componentVersion",
      value: current,
    })),
    { label: `Instanzen aktualisieren · v${current}` },
  );
  return stale.length;
}

// Places an instance of a definition behind the target node (or at the end of
// the root when no target is given).
export function instantiateComponent(
  store: EditorStore,
  componentId: string,
  targetId?: string | null,
): string | null {
  if (definitionOf(store, componentId) === null) return null;
  const version = definitionVersionOf(store.document, componentId) ?? 1;
  const anchor = targetId ?? store.document.rootNodeId;
  const located = locateParent(store.document, anchor);
  const parent = located?.parent ?? { nodeId: store.document.rootNodeId };
  const index = located === undefined ? undefined : located.index + 1;
  const instanceId = newNodeId();
  const outcome = store.applyBatch(
    [
      {
        op: "insertNode",
        parent,
        ...(index === undefined ? {} : { index }),
        node: {
          primitive: COMPONENT_INSTANCE_PRIMITIVE,
          id: instanceId,
          props: { componentId, componentVersion: version },
        },
      },
    ],
    { label: "Komponenten-Instanz einfügen" },
  );
  return outcome.changed ? instanceId : null;
}

// The anti-baukasten lever: replaces the instance with a real copy of the
// definition's subtree (`duplicateNode` clones it with fresh ids and its scoped
// rules), then removes the instance. The instance's overrides are materialized
// into the copy (a detached tree has no definition to override), and both steps
// share one coalesce key, so a single undo restores the instance.
export function detachComponent(store: EditorStore, instanceId: string): string | null {
  const instance = store.document.nodes[instanceId];
  if (instance === undefined || instance.primitive !== COMPONENT_INSTANCE_PRIMITIVE) {
    return null;
  }
  const componentId = instance.props["componentId"];
  if (typeof componentId !== "string") return null;
  const rootChildId = store.document.nodes[componentId]?.children?.[0];
  if (rootChildId === undefined) return null;
  const located = locateParent(store.document, instanceId);
  if (located === undefined) return null;
  const overrides = editorOverrides(instance);
  const subtree = collectSubtree(store.document, rootChildId);
  const coalesceKey = `detach:${instanceId}`;
  const outcome = store.applyBatch(
    [
      {
        op: "duplicateNode",
        id: rootChildId,
        target: located.parent,
        index: located.index,
      },
      { op: "deleteNode", id: instanceId },
    ],
    { label: "Komponente auflösen", coalesceKey },
  );
  const insert = outcome.patches.find((patch) => patch.patch === "insertNodes");
  if (insert === undefined || insert.patch !== "insertNodes") return null;
  const root = insert.nodes[0];
  // The duplicate keeps the subtree order, so the copy of a part sits at the
  // same index as the part itself.
  const writes: unknown[] = [];
  subtree.forEach((node, index) => {
    const copy = insert.nodes[index];
    const part = copy === undefined ? undefined : overrides[node.id];
    if (copy === undefined || part === undefined) return;
    for (const [key, value] of Object.entries(part)) {
      writes.push({ op: "setNodeProp", id: copy.id, key, value });
    }
  });
  if (writes.length > 0) {
    store.applyBatch(writes, { label: "Overrides übernehmen", coalesceKey });
  }
  return root?.id ?? null;
}
