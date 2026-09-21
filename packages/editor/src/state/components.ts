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
} from "@senify/widget-engine";
import { locateParent } from "./document.ts";
import { newNodeId } from "./ids.ts";
import type { EditorStore } from "./store.ts";

function definitionOf(store: EditorStore, id: string): { id: string; name: string } | null {
  const node = store.document.nodes[id];
  if (node === undefined || node.primitive !== COMPONENT_DEFINITION_PRIMITIVE) return null;
  const name = typeof node.props["name"] === "string" ? node.props["name"] : id;
  return { id, name };
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
          props: { name: name ?? node.primitive },
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
          props: { componentId: definitionId },
        },
      },
    ],
    { label: "Komponente anlegen" },
  );
  return outcome.changed ? definitionId : null;
}

// Declares a slot in a definition: a placeholder a later instance fills. The
// placeholder goes into the definition's root child (the reusable structure).
export function insertSlot(
  store: EditorStore,
  definitionId: string,
  name: string,
  parentId?: string,
): string | null {
  const definition = definitionOf(store, definitionId);
  if (definition === null) return null;
  const rootChildId = store.document.nodes[definitionId]?.children?.[0];
  const parent = parentId ?? rootChildId;
  if (parent === undefined) return null;
  if (store.document.nodes[parent] === undefined) return null;
  const slotId = newNodeId();
  const outcome = store.applyBatch(
    [
      {
        op: "insertNode",
        parent: { nodeId: parent },
        node: {
          primitive: COMPONENT_SLOT_PRIMITIVE,
          id: slotId,
          props: { name },
        },
      },
    ],
    { label: `Slot ${name} anlegen` },
  );
  return outcome.changed ? slotId : null;
}

// Places an instance of a definition behind the target node (or at the end of
// the root when no target is given).
export function instantiateComponent(
  store: EditorStore,
  componentId: string,
  targetId?: string | null,
): string | null {
  if (definitionOf(store, componentId) === null) return null;
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
          props: { componentId },
        },
      },
    ],
    { label: "Komponenten-Instanz einfügen" },
  );
  return outcome.changed ? instanceId : null;
}

// The anti-baukasten lever: replaces the instance with a real copy of the
// definition's subtree (`duplicateNode` clones it with fresh ids and its scoped
// rules), then removes the instance. One undo entry.
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
    { label: "Komponente auflösen" },
  );
  const insert = outcome.patches.find((patch) => patch.patch === "insertNodes");
  if (insert === undefined || insert.patch !== "insertNodes") return null;
  return insert.nodes[0]?.id ?? null;
}
