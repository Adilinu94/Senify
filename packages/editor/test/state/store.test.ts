import { describe, expect, it } from "vitest";
import {
  EditorStore,
  dragCoalesceKey,
  typingCoalesceKey,
  type EditorDocument,
} from "@senify/editor/state";
import { baseStore, counterIds, makeStore } from "./fixtures.ts";

describe("store write gate", () => {
  it("applies a mutation and walks undo / redo", () => {
    const store = baseStore();
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neu" });
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Neu");
    expect(store.canUndo).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
    expect(store.canRedo).toBe(true);
    expect(store.redo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Neu");
  });

  it("reports a no-op as unchanged and records nothing", () => {
    const store = baseStore();
    const before = store.history.applied().length;
    const outcome = store.apply({
      op: "clearNodeProp",
      id: "head000001",
      key: "fontSize",
      device: "tablet",
    });
    expect(outcome.changed).toBe(false);
    expect(store.history.applied()).toHaveLength(before);
  });

  it("counts one history entry per change, not per version", () => {
    const store = baseStore();
    const version = store.version;
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "A" });
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "B" });
    expect(store.version).toBe(version + 2);
  });

  it("refuses a change that would leave the document inconsistent", () => {
    const broken: EditorDocument = {
      version: 2,
      rootNodeId: "root",
      nodes: { root: { id: "root", primitive: "root", props: {}, children: ["gone"] } },
      styleRules: [],
    };
    const store = new EditorStore({ document: broken, idFactory: counterIds() });
    expect(() =>
      store.apply({ op: "setNodeProp", id: "root", key: "background", value: "#ffffff" }),
    ).toThrow(/Refusing an inconsistent change/);
  });

  it("führt restoreToAsync ohne Session bei rein lokalen Routen aus", async () => {
    const store = baseStore();
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "A" });
    const first = store.history.top()!;
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "B" });
    await expect(store.restoreToAsync(first.id)).resolves.toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("A");
    expect(store.history.future()).toHaveLength(1);
  });

  it("jumps to a history entry through the ordinary undo/redo gate", () => {
    const store = baseStore();
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "A" });
    const first = store.history.top();
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "B" });
    const second = store.history.top();
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "C" });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (first === null || second === null) return;
    // Back to the state right after the first entry (A) …
    expect(store.restoreTo(first.id)).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("A");
    expect(store.canRedo).toBe(true);
    // … and forward again to the second (B).
    expect(store.restoreTo(second.id)).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("B");
    // An unknown entry is refused without touching the document.
    expect(store.restoreTo("missing")).toBe(false);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("B");
  });
});

describe("coalescing", () => {
  it("starts a new typing step after undo creates a branch", () => {
    const store = baseStore();
    const key = typingCoalesceKey("head000001", "text");
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Erste Eingabe" }, { coalesceKey: key });
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Zwischenschritt" });
    expect(store.undo()).toBe(true);
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neue Eingabe" }, { coalesceKey: key });
    expect(store.canRedo).toBe(false);
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Erste Eingabe");
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
  });

  it("starts a new typing step after undo and redo", () => {
    const store = baseStore();
    const key = typingCoalesceKey("head000001", "text");
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Erste Eingabe" }, { coalesceKey: key });
    expect(store.undo()).toBe(true);
    expect(store.redo()).toBe(true);
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neue Eingabe" }, { coalesceKey: key });
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Erste Eingabe");
  });

  it("folds a typing burst into one undo entry", () => {
    const store = baseStore();
    const key = typingCoalesceKey("head000001", "text");
    for (const value of ["H", "Ha", "Hal"]) {
      store.apply(
        { op: "setNodeProp", id: "head000001", key: "text", value },
        { coalesceKey: key },
      );
    }
    expect(store.history.top()?.mutations).toHaveLength(3);
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
    expect(store.redo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hal");
  });

  it("folds a drag into one undo entry", () => {
    const store = makeStore();
    const root = store.document.rootNodeId;
    for (const id of ["sec0000001", "btn0000001", "frame000001"]) {
      store.apply({
        op: "insertNode",
        parent: { nodeId: root },
        node: { primitive: id === "sec0000001" ? "section" : id === "btn0000001" ? "button" : "frame", id },
      });
    }
    const start = [...(store.document.nodes[root]?.children ?? [])];
    const before = store.history.applied().length;
    const key = dragCoalesceKey("frame000001");
    store.apply(
      { op: "moveNode", id: "frame000001", target: { nodeId: root }, index: 0 },
      { coalesceKey: key },
    );
    store.apply(
      { op: "moveNode", id: "frame000001", target: { nodeId: root }, index: 1 },
      { coalesceKey: key },
    );
    expect(store.history.applied()).toHaveLength(before + 1);
    const final = [...(store.document.nodes[root]?.children ?? [])];
    expect(final).not.toEqual(start);
    store.undo();
    expect(store.document.nodes[root]?.children).toEqual(start);
    store.redo();
    expect(store.document.nodes[root]?.children).toEqual(final);
  });
});

describe("external async history", () => {
  it("erhält eine ungelöste externe Sperre beim Ersetzen des Dokuments", () => {
    const store = baseStore();
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Vorher" });
    const pending = store.beginExternalAction({ label: "Token löschen", versionBefore: store.version, versionAfter: store.version + 1 });
    store.replaceDocument(baseStore().document);
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Nach dem Laden" });
    expect(store.pendingExternalId).toBe(pending.id);
    expect(store.undo()).toBe(false);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Nach dem Laden");
    store.failExternalAction(pending.id);
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
  });

  it("trennt neue Eingaben nach Auflösung eines externen Vorgangs", () => {
    const store = baseStore();
    const pending = store.beginExternalAction({ label: "Token löschen", versionBefore: store.version, versionAfter: store.version + 1 });
    const coalesceKey = typingCoalesceKey("head000001", "text");
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Während der Anfrage" }, { coalesceKey });
    store.failExternalAction(pending.id);
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Nach der Anfrage" }, { coalesceKey });
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Während der Anfrage");
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
  });

  it("verweigert einen Sprung über externe Schritte ohne Teilnavigation", () => {
    const store = baseStore();
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Vorher" });
    const target = store.history.top()!;
    const pending = store.beginExternalAction({ label: "Token umbenennen", versionBefore: store.version, versionAfter: store.version + 1 });
    store.commitExternalAction(pending.id);
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Nachher" });
    const document = store.document;
    const applied = store.history.applied();
    const actions: string[] = [];
    store.setActionListener((event) => actions.push(event.type));

    expect(() => store.restoreTo(target.id)).toThrow(/serverseitig|extern/i);
    expect(store.document).toBe(document);
    expect(store.history.applied()).toEqual(applied);
    expect(store.history.future()).toEqual([]);
    expect(actions).toEqual([]);
  });

  it("emits lifecycle actions and blocks navigation while pending", () => {
    const store = baseStore();
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Alt" });
    const actions: string[] = [];
    store.setActionListener((event) => actions.push(event.type));
    const pending = store.beginExternalAction({ label: "Variable umbenennen", versionBefore: store.version, versionAfter: store.version });
    expect(store.pendingExternalId).toBe(pending.id);
    expect(store.canUndo).toBe(false);
    expect(store.undo()).toBe(false);
    // Local edits may continue while a variable operation is in flight.
    expect(() => store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neu" })).not.toThrow();
    store.commitExternalAction(pending.id, { versionAfter: store.version });
    expect(store.pendingExternalId).toBeNull();
    expect(actions).toContain("external-begin");
    expect(actions).toContain("apply");
    expect(actions).toContain("external-commit");
  });

  it("drops a failed pending action", () => {
    const store = baseStore();
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neu" });
    const pending = store.beginExternalAction({ label: "Variable löschen", versionBefore: store.version, versionAfter: store.version + 1 });
    expect(store.failExternalAction(pending.id)?.id).toBe(pending.id);
    expect(store.canUndo).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
  });

  it("does not silently undo across a committed external boundary", () => {
    const store = baseStore();
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neu" });
    const pending = store.beginExternalAction({ label: "Variable umbenennen", versionBefore: store.version, versionAfter: store.version + 1 });
    store.commitExternalAction(pending.id);
    expect(store.canUndo).toBe(false);
    expect(() => store.undo()).toThrow(/serverseitig|extern/i);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Neu");
  });

  it("setzt bei einer Wiederherstellung die ursprüngliche Order und verschiebt die folgenden Regeln", () => {
    const rule = (id: string, order: number) => ({ id, name: id, kind: "class" as const, selector: `.${id}`, order, styles: {}, contextStyles: {} });
    const store = new EditorStore({
      document: {
        version: 2, rootNodeId: "root", nodes: { root: { id: "root", primitive: "root", props: {} } },
        styleRules: [rule("r-a", 0), rule("r-c", 1), rule("r-b", 7)],
      },
    });
    store.reconcileStyleRuleOrderShift(1, 1, "r-b");
    expect(store.document.styleRules.map((entry) => [entry.id, entry.order])).toEqual([
      ["r-a", 0],
      ["r-b", 1],
      ["r-c", 2],
    ]);
  });
});

describe("store selection", () => {
  it("selects a node and reveals it", () => {
    const store = baseStore();
    store.select("head000001");
    expect(store.selection.selected).toEqual(["head000001"]);
    expect(store.selection.expanded).toContain("sec0000001");
    store.selectParent();
    expect(store.selection.selected).toEqual(["sec0000001"]);
    store.clearSelection();
    expect(store.selection.selected).toEqual([]);
  });
});

describe("store history token migration", () => {
  it("keeps retained entries usable across a server-confirmed rename", () => {
    const store = baseStore();
    store.apply({ op: "setNodeProp", id: "head000001", key: "color", value: { $token: "color.marker" } });
    const applied = store.history.applied().length;
    const node = store.document.nodes["head000001"];
    if (node === undefined) throw new Error("fixture node missing");

    expect(store.migrateHistoryReferences("color", "marker", "marke")).toBe(true);
    const entry = store.history.entries().at(-1);
    expect(JSON.stringify(entry)).toContain("color.marke");
    expect(JSON.stringify(entry)).not.toContain("color.marker");

    store.replaceDocumentPreservingHistory({
      ...store.document,
      nodes: { ...store.document.nodes, ["head000001"]: { ...node, props: { ...node.props, color: { $token: "color.marke" } } } },
    });

    expect(store.history.applied()).toHaveLength(applied);
    expect(store.canUndo).toBe(true);
    expect(store.document.nodes["head000001"]?.props["color"]).toEqual({ $token: "color.marke" });
  });
});
