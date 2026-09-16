import { describe, expect, it } from "vitest";
import { HistoryStack } from "@senify/editor";
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
