import { describe, expect, it } from "vitest";
import { HistoryStack } from "@senify/editor";
import { patchesToMutations } from "../src/history.ts";
import { applyMutations, applyTreePatches, type Mutation } from "@senify/engine";
import type { NodeTree } from "@senify/section-sdk";
import { draftTree, registry } from "./fixtures.ts";

const PAGE = { previousTitle: "Start", previousPath: "/" };

type Step = { tree: NodeTree; entryId: string; versionAfter: number };

// Builds real history entries from real engine batches: the undo patches come
// from the same code path the server uses.
function recordRealSteps(history: HistoryStack, steps: Mutation[][]): Step[] {
  const recorded: Step[] = [];
  let tree = draftTree();
  let version = 1;
  steps.forEach((mutations, index) => {
    const outcome = applyMutations({
      registry,
      tree,
      mutations,
      previousTitle: PAGE.previousTitle,
      previousPath: PAGE.previousPath,
    });
    const entry = history.record({
      label: `Schritt ${index + 1}`,
      op: mutations[0]?.op ?? "updateNodeProps",
      mutations,
      undoPatch: outcome.results.flatMap((result) => result.undoPatch),
      batchId: `batch-${index + 1}`,
      versionBefore: version,
      versionAfter: version + 1,
    });
    version += 1;
    tree = outcome.tree;
    recorded.push({ tree, entryId: entry.id, versionAfter: version });
  });
  return recorded;
}

describe("history replay through canonical mutations", () => {
  it.each([
    [{ op: "updateNodeProps", id: "hero000001", patch: { headline: "Neu" } }],
    [{ op: "deleteNode", id: "hero000001" }],
    [{ op: "duplicateNode", id: "hero000001" }],
    [{ op: "moveNode", id: "hero000001", target: { nodeId: "page000001" }, index: 2 }],
    [
      { op: "updateNodeProps", id: "hero000001", patch: { headline: "Zwischenstand" } },
      { op: "updateNodeProps", id: "hero000001", patch: { headline: "Endstand" } },
    ],
    [{ op: "clearBreakpointOverride", id: "hero000001", breakpoint: "mobile" }],
  ] satisfies Mutation[][])("restores and replays %j with stable node ids", (...mutations) => {
    const original = draftTree();
    const apply = (tree: NodeTree, batch: Mutation[]) => applyMutations({
      registry, tree, mutations: batch, ...PAGE,
    });
    const forward = apply(original, mutations);
    const inverse = (outcome: ReturnType<typeof apply>) => patchesToMutations(
      [...outcome.results].reverse().flatMap((result) => result.undoPatch),
    );
    const undone = apply(forward.tree, inverse(forward));
    expect(undone.tree).toEqual(original);
    const redone = apply(undone.tree, inverse(undone));
    expect(redone.tree).toEqual(forward.tree);
    expect(apply(redone.tree, inverse(forward)).tree).toEqual(original);
  });
});

describe("undo / redo stack", () => {
  it("walks the cursor back and forth", () => {
    const history = new HistoryStack();
    history.record({
      label: "A",
      op: "deleteNode",
      mutations: [],
      undoPatch: [],
      batchId: null,
      versionBefore: 1,
      versionAfter: 2,
    });
    history.record({
      label: "B",
      op: "moveNode",
      mutations: [],
      undoPatch: [],
      batchId: null,
      versionBefore: 2,
      versionAfter: 3,
    });
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(history.undo()?.label).toBe("B");
    expect(history.undo()?.label).toBe("A");
    expect(history.undo()).toBeNull();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    expect(history.redo()?.label).toBe("A");
    expect(history.redo()?.label).toBe("B");
    expect(history.redo()).toBeNull();
    expect(history.applied()).toHaveLength(2);
  });

  it("drops the redo branch when a new action is recorded after an undo", () => {
    const history = new HistoryStack();
    for (const label of ["A", "B", "C"]) {
      history.record({
        label,
        op: "deleteNode",
        mutations: [],
        undoPatch: [],
        batchId: null,
        versionBefore: 1,
        versionAfter: 2,
      });
    }
    history.undo();
    history.record({
      label: "D",
      op: "deleteNode",
      mutations: [],
      undoPatch: [],
      batchId: null,
      versionBefore: 2,
      versionAfter: 3,
    });
    expect(history.entries().map((entry) => entry.label)).toEqual(["A", "B", "D"]);
    expect(history.canRedo).toBe(false);
  });

  it("respects the size limit", () => {
    const history = new HistoryStack({ limit: 2 });
    for (const label of ["A", "B", "C"]) {
      history.record({
        label,
        op: "deleteNode",
        mutations: [],
        undoPatch: [],
        batchId: null,
        versionBefore: 1,
        versionAfter: 2,
      });
    }
    expect(history.entries().map((entry) => entry.label)).toEqual(["B", "C"]);
  });

  it("removes a coalesced entry without touching the rest", () => {
    const history = new HistoryStack();
    const keep = history.record({
      label: "A",
      op: "deleteNode",
      mutations: [],
      undoPatch: [],
      batchId: null,
      versionBefore: 1,
      versionAfter: 2,
    });
    const drop = history.record({
      label: "B",
      op: "deleteNode",
      mutations: [],
      undoPatch: [],
      batchId: null,
      versionBefore: 2,
      versionAfter: 3,
    });
    expect(history.remove(drop.id)?.id).toBe(drop.id);
    expect(history.entries().map((entry) => entry.id)).toEqual([keep.id]);
    expect(history.canRedo).toBe(false);
  });

  it("does not merge a new step into an older group after an entry is removed", () => {
    const history = new HistoryStack();
    const base = { op: "inline-text" as const, mutations: [], undoPatch: [], batchId: null, versionBefore: 1, versionAfter: 2 };
    const first = history.record({ ...base, label: "Erste Eingabe", coalesceKey: "text" });
    const removed = history.record({ ...base, label: "Verworfen", coalesceKey: "anderes Feld" });
    history.remove(removed.id);
    const next = history.record({ ...base, label: "Neue Eingabe", coalesceKey: "text" });
    expect(next.id).not.toBe(first.id);
    expect(history.undo()?.id).toBe(next.id);
    expect(history.undo()?.id).toBe(first.id);
  });
});

describe("external async history", () => {
  it("bestätigt nur die eigene Navigationslease, den Eintrag und die reservierte Richtung", () => {
    const history = new HistoryStack();
    const marker = history.beginExternal({ label: "Token", versionBefore: 1, versionAfter: 2 });
    history.commitExternal(marker.id);
    const pending = history.beginExternalNavigation("undo");
    expect(history.top()?.id).toBe(marker.id);
    for (const [pendingId, entryId, direction] of [
      ["fremde-lease", marker.id, "undo"],
      [pending.id, "fremder-eintrag", "undo"],
      [pending.id, marker.id, "redo"],
    ] as const) {
      expect(history.canConfirmExternalNavigation(pendingId, entryId, direction)).toBe(false);
      expect(() => history.confirmExternalNavigation(pendingId, entryId, direction)).toThrow("reservierte");
    }
    expect(() => history.commitExternal(pending.id)).toThrow("Navigation");
    expect(history.pendingExternalId).toBe(pending.id);
    expect(history.confirmExternalNavigation(pending.id, marker.id, "undo").id).toBe(marker.id);
    expect(history.applied()).toEqual([]);
    expect(history.future().map((entry) => entry.id)).toEqual([marker.id]);
    const redo = history.beginExternalNavigation("redo");
    expect(history.confirmExternalNavigation(redo.id, marker.id, "redo").id).toBe(marker.id);
    expect(history.top()?.id).toBe(marker.id);
  });

  it("lässt nach neuen Eingaben oder entferntem Ziel keinen reservierten Cursorwechsel zu", () => {
    const history = new HistoryStack();
    const marker = history.beginExternal({ label: "Token", versionBefore: 1, versionAfter: 2 });
    history.commitExternal(marker.id);
    const pending = history.beginExternalNavigation("undo");
    const local = history.record({ label: "Neue Eingabe", op: "updateNodeProps", mutations: [], undoPatch: [], batchId: null, versionBefore: 2, versionAfter: 3 });
    expect(history.canConfirmExternalNavigation(pending.id, marker.id, "undo")).toBe(false);
    expect(() => history.confirmExternalNavigation(pending.id, marker.id, "undo")).toThrow("reservierte");
    expect(history.top()?.id).toBe(local.id);
    history.clear({ preservePendingExternal: true });
    expect(history.pendingExternalId).toBe(pending.id);
    expect(history.canConfirmExternalNavigation(pending.id, marker.id, "undo")).toBe(false);
    history.failExternal(pending.id);
    expect(history.pendingExternalId).toBeNull();
  });

  it("sperrt Restore-Patches während eines ausstehenden externen Vorgangs", () => {
    const history = new HistoryStack();
    const steps = recordRealSteps(history, [
      [{ op: "updateNodeProps", id: "hero000001", patch: { headline: "Erster Stand" } }],
      [{ op: "updateNodeProps", id: "hero000001", patch: { headline: "Zweiter Stand" } }],
    ]);
    const pending = history.beginExternal({ label: "Token löschen", versionBefore: 3, versionAfter: 4 });
    expect(() => history.restoreAsDraft(steps[0]!.entryId)).toThrow(/externer Vorgang/i);
    expect(history.pendingExternalId).toBe(pending.id);
    expect(history.applied()).toHaveLength(2);
    history.failExternal(pending.id);
    expect(applyTreePatches(steps[1]!.tree, history.restoreAsDraft(steps[0]!.entryId))).toEqual(steps[0]!.tree);
  });

  it("tracks a pending external entry and blocks navigation until resolved", () => {
    const history = new HistoryStack();
    history.record({ label: "A", op: "updateNodeProps", mutations: [], undoPatch: [], batchId: null, versionBefore: 1, versionAfter: 2 });
    const pending = history.beginExternal({ label: "Variable umbenennen", versionBefore: 2, versionAfter: 3 });
    expect(pending.status).toBe("pending");
    expect(pending.external).toBe(true);
    expect(history.pendingExternalId).toBe(pending.id);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBeNull();
    // Local document edits may continue while the server operation is in flight;
    // navigation stays blocked until the result is resolved.
    expect(() => history.record({ label: "B", op: "updateNodeProps", mutations: [], undoPatch: [], batchId: null, versionBefore: 2, versionAfter: 3 })).not.toThrow();
    history.commitExternal(pending.id, { versionAfter: 3 });
    expect(history.pendingExternalId).toBeNull();
    expect(history.entries().some((entry) => entry.id === pending.id && entry.status === "committed")).toBe(true);
  });

  it("removes a failed external entry without corrupting the cursor", () => {
    const history = new HistoryStack();
    const before = history.record({ label: "A", op: "updateNodeProps", mutations: [], undoPatch: [], batchId: null, versionBefore: 1, versionAfter: 2 });
    const pending = history.beginExternal({ label: "Variable löschen", versionBefore: 2, versionAfter: 3 });
    expect(history.failExternal(pending.id)?.id).toBe(pending.id);
    expect(history.pendingExternalId).toBeNull();
    expect(history.entries().map((entry) => entry.id)).toEqual([before.id]);
    expect(history.top()?.id).toBe(before.id);
    expect(history.canUndo).toBe(true);
  });

  it("treats committed external entries as a non-local undo/redo boundary", () => {
    const history = new HistoryStack();
    history.record({ label: "A", op: "updateNodeProps", mutations: [], undoPatch: [], batchId: null, versionBefore: 1, versionAfter: 2 });
    const pending = history.beginExternal({ label: "Variable umbenennen", versionBefore: 2, versionAfter: 3 });
    history.commitExternal(pending.id);
    expect(history.canUndo).toBe(false);
    expect(() => history.undo()).toThrow(/serverseitig|extern/i);
    expect(() => history.restoreAsDraft(history.entries()[0]!.id)).toThrow(/serverseitig|extern/i);
  });

  it("refuses restore when the jumped range crosses an external entry", () => {
    const history = new HistoryStack();
    const a = history.record({ label: "A", op: "updateNodeProps", mutations: [], undoPatch: [], batchId: null, versionBefore: 1, versionAfter: 2 });
    const ext = history.beginExternal({ label: "Variable löschen", versionBefore: 2, versionAfter: 3 });
    history.commitExternal(ext.id);
    history.record({ label: "B", op: "updateNodeProps", mutations: [], undoPatch: [], batchId: null, versionBefore: 3, versionAfter: 4 });
    // Cursor is after B; jumping back to A would rewind across committed external B's predecessor? range includes external.
    // Applied: [A, ext, B], cursor=3. restoreAsDraft(A) rewinds ext,B => crosses ext.
    expect(() => history.restoreAsDraft(a.id)).toThrow(/serverseitig|extern/i);
  });
});

describe("restore as draft", () => {
  it("rewinds the applied stack to the picked entry", () => {
    const history = new HistoryStack();
    const steps = recordRealSteps(history, [
      [
        {
          op: "updateNodeProps",
          id: "hero000001",
          patch: { headline: "Schritt 1" },
        },
      ],
      [{ op: "deleteNode", id: "pricing00001" }],
      [
        {
          op: "updateNodeProps",
          id: "hero000001",
          patch: { headline: "Schritt 3" },
        },
      ],
    ]);
    const finalTree = steps[2]?.tree;
    const target = steps[0];
    if (!finalTree || !target) throw new Error("fixture steps missing");

    const patches = history.restoreAsDraft(target.entryId);
    expect(applyTreePatches(finalTree, patches)).toEqual(target.tree);
    // Restoring the newest entry is a no-op.
    expect(history.restoreAsDraft(steps[2]?.entryId ?? "")).toEqual([]);
  });

  it("replays an entry's own undo patch to reach the previous state", () => {
    const history = new HistoryStack();
    const steps = recordRealSteps(history, [
      [{ op: "deleteNode", id: "pricing00001" }],
      [
        {
          op: "updateNodeProps",
          id: "hero000001",
          patch: { headline: "Neu" },
        },
      ],
    ]);
    const entry = history.top();
    const second = steps[1];
    const first = steps[0];
    if (!entry || !second || !first) throw new Error("fixture steps missing");
    expect(applyTreePatches(second.tree, entry.undoPatch)).toEqual(first.tree);
  });

  it("refuses to restore an entry that is not applied", () => {
    const history = new HistoryStack();
    const steps = recordRealSteps(history, [
      [{ op: "deleteNode", id: "pricing00001" }],
      [{ op: "deleteNode", id: "widget00001" }],
    ]);
    history.undo();
    const future = steps[1];
    if (!future) throw new Error("fixture step missing");
    expect(() => history.restoreAsDraft(future.entryId)).toThrow(/Only applied/);
    expect(() => history.restoreAsDraft("nope")).toThrow(/does not exist/);
  });
});

describe("rename token references in retained history", () => {
  it("rewrites structured references in forward and undo patches", () => {
    const history = new HistoryStack();
    const entry = history.record({
      label: "Farbe gesetzt",
      op: "updateNodeProps",
      mutations: [{ op: "updateNodeProps", id: "hero000001", patch: { background: { $token: "color.marker" } } }],
      undoPatch: [{ patch: "setProps", id: "hero000001", props: { background: { $token: "color.marker" } } }],
      batchId: "batch-token",
      versionBefore: 1,
      versionAfter: 2,
    });
    const cursorBefore = history.snapshot().cursor;

    expect(history.renameReferences("color", "marker", "marke")).toBe(true);

    const migrated = history.entries().find((item) => item.id === entry.id);
    expect(migrated?.mutations).toEqual([{ op: "updateNodeProps", id: "hero000001", patch: { background: { $token: "color.marke" } } }]);
    expect(migrated?.undoPatch).toEqual([{ patch: "setProps", id: "hero000001", props: { background: { $token: "color.marke" } } }]);
    expect(history.snapshot().cursor).toBe(cursorBefore);
  });

  it("rewrites $ref and keeps unrelated token names", () => {
    const history = new HistoryStack();
    history.record({
      label: "Abstand gesetzt",
      op: "updateNodeProps",
      mutations: [{ op: "updateNodeProps", id: "hero000001", patch: { gap: { $ref: "spacing.luft" }, background: { $token: "color.andere" } } }],
      undoPatch: [],
      batchId: null,
      versionBefore: 1,
      versionAfter: 2,
    });

    expect(history.renameReferences("spacing", "luft", "raum")).toBe(true);

    expect(history.entries()[0]?.mutations[0]).toEqual({
      op: "updateNodeProps",
      id: "hero000001",
      patch: { gap: { $ref: "spacing.raum" }, background: { $token: "color.andere" } },
    });
  });

  it("refuses CSS-text references and leaves the history unchanged", () => {
    const history = new HistoryStack();
    const mutation = { op: "updateNodeProps" as const, id: "hero000001", patch: { background: "var(--color-marker)" } };
    history.record({
      label: "CSS gesetzt",
      op: "updateNodeProps",
      mutations: [mutation],
      undoPatch: [],
      batchId: null,
      versionBefore: 1,
      versionAfter: 2,
    });
    const before = history.snapshot();

    expect(history.renameReferences("color", "marker", "marke")).toBe(false);

    expect(history.snapshot()).toEqual(before);
  });

  it("keeps external markers and their ids intact", () => {
    const history = new HistoryStack();
    const external = history.beginExternal({ label: "Variable gelöscht", versionBefore: 1, versionAfter: 1 });
    history.commitExternal(external.id);
    const snapshot = history.snapshot();

    expect(history.renameReferences("color", "marker", "marke")).toBe(true);
    expect(history.snapshot()).toEqual(snapshot);
  });
});
