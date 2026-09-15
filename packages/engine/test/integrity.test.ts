import { describe, expect, it } from "vitest";
import {
  applyMutations,
  validateTreeIntegrity,
  type Mutation,
} from "@senify/engine";
import type { NodeTree } from "@senify/section-sdk";
import { createTestRegistry } from "./helpers.ts";

function baseTree(): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page", props: {} },
    },
  };
}

describe("validateTreeIntegrity", () => {
  it("accepts a healthy tree", () => {
    const tree = baseTree();
    tree.nodes.root = {
      id: "root",
      type: "page",
      props: {},
      children: ["a"],
    };
    tree.nodes.a = { id: "a", type: "block", props: {} };
    expect(validateTreeIntegrity(tree)).toEqual([]);
  });

  it("marks dangling child and slot references", () => {
    const tree = baseTree();
    tree.nodes.root = {
      id: "root",
      type: "page",
      props: {},
      children: ["ghost"],
      slots: { side: ["specter"] },
    };
    const issues = validateTreeIntegrity(tree);
    expect(issues.map((issue) => issue.kind).sort()).toEqual([
      "dangling-child",
      "dangling-slot",
    ]);
    const childIssue = issues.find((issue) => issue.kind === "dangling-child");
    expect(childIssue?.message).toContain("ghost");
    const slotIssue = issues.find((issue) => issue.kind === "dangling-slot");
    expect(slotIssue?.message).toContain("specter");
  });

  it("marks orphan nodes and missing roots", () => {
    const tree = baseTree();
    tree.nodes.orphan = { id: "orphan", type: "block", props: {} };
    const orphanIssues = validateTreeIntegrity(tree);
    expect(orphanIssues.map((issue) => issue.kind)).toEqual(["orphan-node"]);

    const missing: NodeTree = { rootNodeId: "gone", nodes: {} };
    const missingIssues = validateTreeIntegrity(missing);
    expect(missingIssues.map((issue) => issue.kind)).toEqual(["missing-root"]);
  });

  it("marks double-parented nodes", () => {
    const tree = baseTree();
    tree.nodes.root = {
      id: "root",
      type: "page",
      props: {},
      children: ["shared"],
      slots: { extra: ["shared"] },
    };
    tree.nodes.shared = { id: "shared", type: "block", props: {} };
    const issues = validateTreeIntegrity(tree);
    expect(issues.map((issue) => issue.kind)).toEqual(["duplicate-parent"]);
  });
});

describe("broken references are marked, never deleted", () => {
  it("surfaces dangling references as warnings and keeps them", () => {
    const registry = createTestRegistry();
    const tree = baseTree();
    tree.nodes.root = {
      id: "root",
      type: "page",
      props: {},
      children: ["ghost"],
    };
    const mutations: Mutation[] = [
      {
        op: "insertNode",
        parent: { nodeId: "root" },
        node: { id: "fresh-block", type: "block", props: { headline: "Ok" } },
      },
    ];
    const outcome = applyMutations({
      registry,
      tree,
      mutations,
      previousTitle: "T",
      previousPath: "/",
    });
    expect(outcome.results).toHaveLength(1);
    expect(
      outcome.warnings.some(
        (warning) => warning.field === "tree" && warning.message.includes("ghost"),
      ),
    ).toBe(true);
    // Nothing was deleted: the dangling reference is still there.
    expect(outcome.tree.nodes.root?.children).toContain("ghost");
    expect(outcome.tree.nodes["fresh-block"]).toBeDefined();
  });
});
