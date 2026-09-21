// Editor clipboard (ticket 03 point 2): copy/paste of a subtree, wrap in a
// container.
//
// The clipboard keeps the source node id: the same document is the only source
// of a paste, and `duplicateNode` already copies the whole subtree plus its
// scoped style rules (with fresh ids, pointing at the copies). A paste whose
// source vanished reports instead of guessing. Wrap is atomic — one history
// entry carries the inserted container and the move into it.

import { newNodeId } from "./ids.ts";
import { locateParent } from "./document.ts";
import type { EditorStore } from "./store.ts";

let copiedNodeId: string | null = null;

export function copiedNode(): string | null {
  return copiedNodeId;
}

export function clearClipboard(): void {
  copiedNodeId = null;
}

export function copyNode(store: EditorStore, id: string): boolean {
  if (id === store.document.rootNodeId) return false;
  if (store.document.nodes[id] === undefined) return false;
  copiedNodeId = id;
  return true;
}

// Inserts the copied subtree right after `targetId` (or after the source when
// no target is given) and returns the new root node id, or `null`.
export function pasteNode(store: EditorStore, targetId?: string | null): string | null {
  const source = copiedNodeId;
  if (source === null) return null;
  if (store.document.nodes[source] === undefined) {
    copiedNodeId = null;
    return null;
  }
  const anchor = targetId ?? source;
  const located = locateParent(store.document, anchor);
  if (located === undefined) return null;
  const outcome = store.apply(
    {
      op: "duplicateNode",
      id: source,
      target: located.parent,
      index: located.index + 1,
    },
    { label: "Einfügen" },
  );
  const insert = outcome.patches.find((patch) => patch.patch === "insertNodes");
  if (insert === undefined || insert.patch !== "insertNodes") return null;
  return insert.nodes[0]?.id ?? null;
}

// Wraps the node in a fresh container (the neutral `frame`): the container
// takes the node's place, the node moves into it. One undo entry.
export function wrapNode(store: EditorStore, id: string): string | null {
  if (id === store.document.rootNodeId) return null;
  const located = locateParent(store.document, id);
  if (located === undefined) return null;
  const containerId = newNodeId();
  const outcome = store.applyBatch(
    [
      {
        op: "insertNode",
        parent: located.parent,
        index: located.index,
        node: { primitive: "frame", id: containerId, props: {} },
      },
      { op: "moveNode", id, target: { nodeId: containerId }, index: 0 },
    ],
    { label: "In Container einwickeln" },
  );
  return outcome.changed ? containerId : null;
}
