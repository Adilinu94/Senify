import { EditorStore, type EditorDocument } from "@senify/editor/state";
import { PAGE_ROOT_TYPE } from "@senify/section-sdk";
import type { NodeTree } from "@senify/section-sdk";

// Deterministic ids so assertions can name nodes.
export function counterIds(prefix = "n"): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}${String(n).padStart(9, "0")}`;
  };
}

export function makeStore(): EditorStore {
  return new EditorStore({ idFactory: counterIds() });
}

// root -> section (sec…) -> heading (head…), plus a button under root.
export function baseStore(): EditorStore {
  const store = makeStore();
  const root = store.document.rootNodeId;
  store.apply({
    op: "insertNode",
    parent: { nodeId: root },
    node: { primitive: "section", id: "sec0000001", props: { align: "center" } },
  });
  store.apply({
    op: "insertNode",
    parent: { nodeId: "sec0000001" },
    node: { primitive: "heading", id: "head000001", props: { text: "Hallo", fontSize: 24 } },
  });
  store.apply({
    op: "insertNode",
    parent: { nodeId: root },
    node: { primitive: "button", id: "btn0000001", props: { label: "Los" } },
  });
  return store;
}

// A v1 section tree that maps cleanly onto the v2 primitives.
export function v1Tree(): NodeTree {
  return {
    rootNodeId: "page000001",
    nodes: {
      page000001: {
        id: "page000001",
        type: PAGE_ROOT_TYPE,
        props: {},
        children: ["frame000001"],
      },
      frame000001: {
        id: "frame000001",
        type: "frame",
        props: { display: "flex" },
        children: ["head000001"],
        overrides: { tablet: { props: { display: "grid" } } },
      },
      head000001: {
        id: "head000001",
        type: "heading",
        props: { text: "Hi", fontSize: 24 },
        overrides: { mobile: { props: { fontSize: 16 } } },
      },
    },
  };
}

export function emptyV2Document(): EditorDocument {
  return {
    version: 2,
    rootNodeId: "root000001",
    nodes: { root000001: { id: "root000001", primitive: "root", props: {} } },
    classes: {},
  };
}
