import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connect } from "node:net";
import {
  applyTreePatches,
  applyUndoBatch,
  goldenTreeToMutations,
  type Mutation,
  type PatchOp,
} from "@senify/engine";
import type { NodeTree } from "@senify/section-sdk";
import {
  applyMutationsRequest,
  bootEngine,
  containerSection,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  treeOf,
  type BootEnv,
  type MutationsResponse,
  type PageResponse,
} from "./helpers.ts";

let env: BootEnv;
let siteId: string;
let page: PageResponse;

beforeAll(async () => {
  env = await bootEngine();
  siteId = (await createTestSite(env.api)).id;
});

afterAll(async () => {
  await env.close();
});

beforeEach(async () => {
  page = await createTestPage(env.api, siteId);
});

function nodeOf(current: PageResponse, id: string): Record<string, unknown> {
  const node = current.draft.nodes[id];
  if (!node) throw new Error(`Expected node "${id}" in tree`);
  return node;
}

function childIds(current: PageResponse, id: string): string[] {
  return (nodeOf(current, id).children as string[] | undefined) ?? [];
}

function slotIds(current: PageResponse, id: string, slot: string): string[] {
  const slots = nodeOf(current, id).slots as
    | Record<string, string[]>
    | undefined;
  return slots?.[slot] ?? [];
}

function propsOf(current: PageResponse, id: string): Record<string, unknown> {
  return (nodeOf(current, id).props ?? {}) as Record<string, unknown>;
}

async function loadPage(id: string): Promise<PageResponse> {
  const response = await env.api.request<PageResponse>({
    method: "GET",
    path: `/api/pages/${id}`,
  });
  expect(response.status).toBe(200);
  return response.body;
}

async function apply(
  mutations: Mutation[],
  overrides: Parameters<typeof applyMutationsRequest>[3] = {},
): Promise<{ status: number; body: MutationsResponse }> {
  const response = await applyMutationsRequest(env.api, page, mutations, overrides);
  if (response.status === 200) {
    page = await loadPage(page.id);
  }
  return response as { status: number; body: MutationsResponse };
}

describe("canonical mutations", () => {
  it("applies a golden batch with version bump and undo patches", async () => {
    const placement = goldenTreeToMutations(containerSection.golden.tree, {
      nodeId: page.draft.rootNodeId,
    });
    expect(placement.mutations).toHaveLength(2);
    const second = placement.mutations[1];
    expect(second?.op).toBe("insertNode");
    if (second?.op === "insertNode") {
      expect(second.parent).toEqual({ nodeId: placement.rootId });
    }

    const { status, body } = await apply(placement.mutations);
    expect(status).toBe(200);
    expect(body.newDraftVersion).toBe(2);
    expect(body.undoBatchId).toMatch(/^[A-Za-z0-9_-]{10,}$/);
    expect(body.warnings).toEqual([]);
    expect(body.results).toHaveLength(2);
    for (const result of body.results) {
      expect(result.undoPatch.length).toBeGreaterThan(0);
    }

    expect(childIds(page, page.draft.rootNodeId)).toEqual([placement.rootId]);
    expect(childIds(page, placement.rootId)).toHaveLength(1);
    const blockId = childIds(page, placement.rootId)[0];
    expect(blockId).toBeDefined();
    expect(propsOf(page, blockId as string).headline).toBe("Golden child");
  });

  it("rejects inserts with unknown parents", async () => {
    const { status, body } = await apply([
      {
        op: "insertNode",
        parent: { nodeId: "missing-node" },
        node: { type: "block", props: {} },
      },
    ]);
    expect(status).toBe(404);
    const error = (body as unknown as { error: Record<string, unknown> }).error;
    expect(error.category).toBe("not_found");
    expect(error.opIndex).toBe(0);
    expect(error.field).toBe("mutations[0].parent.nodeId");
    expect(error.suggestion).toBeDefined();
  });

  it("rejects unknown section types", async () => {
    const { status, body } = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { type: "nope" },
      },
    ]);
    expect(status).toBe(404);
    const error = (body as unknown as { error: Record<string, unknown> }).error;
    expect(error.category).toBe("not_found");
    expect(error.field).toBe("mutations[0].node.type");
    expect(error.suggestion).toContain("list_sections");
  });

  it("rejects nesting violations with the allowed list", async () => {
    const heroPlacement = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { type: "hero", props: { headline: "Hi" } },
      },
    ]);
    expect(heroPlacement.status).toBe(200);
    const heroId = childIds(page, page.draft.rootNodeId)[0] as string;

    const { status, body } = await apply([
      {
        op: "insertNode",
        parent: { nodeId: heroId },
        node: { type: "block", props: { headline: "Nested" } },
      },
    ]);
    expect(status).toBe(400);
    const error = (body as unknown as { error: Record<string, unknown> }).error;
    expect(error.category).toBe("validation");
    expect(error.field).toBe("mutations[0].node.type");
    expect(error.message).toContain("does not allow children");
    expect(error.suggestion).toBeDefined();
  });

  it("rejects duplicate node ids within a batch", async () => {
    const { status, body } = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "fixed-id-01", type: "block", props: {} },
      },
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "fixed-id-01", type: "block", props: {} },
      },
    ]);
    expect(status).toBe(400);
    const error = (body as unknown as { error: Record<string, unknown> }).error;
    expect(error.field).toBe("mutations[1].node.id");
    expect(error.message).toContain("already in use");
  });

  it("rejects out-of-range indexes", async () => {
    const { status, body } = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        index: 5,
        node: { type: "block", props: {} },
      },
    ]);
    expect(status).toBe(400);
    const error = (body as unknown as { error: Record<string, unknown> }).error;
    expect(error.field).toBe("mutations[0].index");
  });

  it("enforces slot rules (allowed types, max, existence)", async () => {
    const first = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "slot-host-01", type: "container", props: {} },
      },
    ]);
    expect(first.status).toBe(200);

    const parent = { nodeId: "slot-host-01", slot: "side" };
    const two = await apply([
      { op: "insertNode", parent, node: { type: "block", props: {} } },
      { op: "insertNode", parent, node: { type: "block", props: {} } },
    ]);
    expect(two.status).toBe(200);
    expect(slotIds(page, "slot-host-01", "side")).toHaveLength(2);

    const full = await apply([
      { op: "insertNode", parent, node: { type: "block", props: {} } },
    ]);
    expect(full.status).toBe(400);
    expect(
      (full.body as unknown as { error: { message: string } }).error.message,
    ).toContain("full");

    const wrongType = await apply([
      {
        op: "insertNode",
        parent: { nodeId: "slot-host-01", slot: "side" },
        node: { type: "hero", props: { headline: "X" } },
      },
    ]);
    expect(wrongType.status).toBe(400);
    expect(
      (wrongType.body as unknown as { error: { message: string } }).error.message,
    ).toContain("does not allow");

    const unknownSlot = await apply([
      {
        op: "insertNode",
        parent: { nodeId: "slot-host-01", slot: "nope" },
        node: { type: "block", props: {} },
      },
    ]);
    expect(unknownSlot.status).toBe(400);
    expect(
      (unknownSlot.body as unknown as { error: { message: string } }).error.message,
    ).toContain("has no slot");
  });
});

describe("props, meta, overrides, motion", () => {
  it("updates props with schema validation and null removal", async () => {
    const created = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: {
          id: "props-block-01",
          type: "block",
          props: { headline: "Start", count: 1 },
        },
      },
    ]);
    expect(created.status).toBe(200);

    const updated = await apply([
      {
        op: "updateNodeProps",
        id: "props-block-01",
        patch: { headline: "Neu", count: 3, flag: true },
      },
    ]);
    expect(updated.status).toBe(200);
    expect(propsOf(page, "props-block-01")).toMatchObject({
      headline: "Neu",
      count: 3,
      flag: true,
    });
    expect(updated.body.results[0]?.undoPatch).toEqual([
      {
        patch: "setProps",
        id: "props-block-01",
        props: { headline: "Start", count: 1, flag: null },
      },
    ]);

    const removed = await apply([
      { op: "updateNodeProps", id: "props-block-01", patch: { headline: null } },
    ]);
    expect(removed.status).toBe(200);
    expect(propsOf(page, "props-block-01").headline).toBeUndefined();
    expect(removed.body.results[0]?.undoPatch).toEqual([
      {
        patch: "setProps",
        id: "props-block-01",
        props: { headline: "Neu" },
      },
    ]);

    const wrongType = await apply([
      { op: "updateNodeProps", id: "props-block-01", patch: { count: "x" } },
    ]);
    expect(wrongType.status).toBe(400);
    expect(
      (wrongType.body as unknown as { error: { field: string } }).error.field,
    ).toBe("mutations[0].props.count");

    const unknownProp = await apply([
      { op: "updateNodeProps", id: "props-block-01", patch: { nope: 1 } },
    ]);
    expect(unknownProp.status).toBe(400);
    const error = (unknownProp.body as unknown as { error: Record<string, unknown> })
      .error;
    expect(error.field).toBe("mutations[0].props.nope");
    expect(error.suggestion).toContain("headline");
  });

  it("validates enum, link and boolean fallbacks", async () => {
    await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "fallback-01", type: "block", props: {} },
      },
    ]);

    const badEnum = await apply([
      { op: "updateNodeProps", id: "fallback-01", patch: { tone: "brutal" } },
    ]);
    expect(badEnum.status).toBe(400);

    const badLink = await apply([
      { op: "updateNodeProps", id: "fallback-01", patch: { target: { url: 5 } } },
    ]);
    expect(badLink.status).toBe(400);

    const badFlag = await apply([
      { op: "updateNodeProps", id: "fallback-01", patch: { flag: "yes" } },
    ]);
    expect(badFlag.status).toBe(400);

    const good = await apply([
      {
        op: "updateNodeProps",
        id: "fallback-01",
        patch: {
          tone: "loud",
          flag: false,
          target: { pageId: "some-page" },
          headline: "Ok",
        },
      },
    ]);
    expect(good.status).toBe(200);
  });

  it("merges variant presets with explicit props winning", async () => {
    const merged = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "preset-box", type: "container", variant: "boxed" },
      },
    ]);
    expect(merged.status).toBe(200);
    expect(propsOf(page, "preset-box").eyebrow).toBe("Boxed default");

    const explicit = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: {
          id: "preset-box-2",
          type: "container",
          variant: "boxed",
          props: { eyebrow: "Eigen" },
        },
      },
    ]);
    expect(explicit.status).toBe(200);
    expect(propsOf(page, "preset-box-2").eyebrow).toBe("Eigen");
  });

  it("updates node meta with variant validation", async () => {
    await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "meta-box-01", type: "container", props: {} },
      },
    ]);

    const valid = await apply([
      {
        op: "updateNodeMeta",
        id: "meta-box-01",
        meta: { variant: "full", locked: true, hidden: true },
      },
    ]);
    expect(valid.status).toBe(200);
    expect(nodeOf(page, "meta-box-01")).toMatchObject({
      variant: "full",
      locked: true,
      hidden: true,
    });
    expect(valid.body.results[0]?.undoPatch).toEqual([
      {
        patch: "setNodeFields",
        id: "meta-box-01",
        fields: { variant: null, locked: null, hidden: null },
      },
    ]);

    const unknownVariant = await apply([
      { op: "updateNodeMeta", id: "meta-box-01", meta: { variant: "nope" } },
    ]);
    expect(unknownVariant.status).toBe(400);
    const error = (unknownVariant.body as unknown as { error: Record<string, unknown> })
      .error;
    expect(error.field).toBe("mutations[0].meta.variant");
    expect(error.suggestion).toContain("boxed");
  });

  it("rejects variants for sections without variants", async () => {
    await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "plain-block", type: "block", props: {} },
      },
    ]);
    const { status, body } = await apply([
      { op: "updateNodeMeta", id: "plain-block", meta: { variant: "boxed" } },
    ]);
    expect(status).toBe(400);
    expect(
      (body as unknown as { error: { message: string } }).error.message,
    ).toContain("has no variants");
  });

  it("manages breakpoint overrides with merge and clear", async () => {
    await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: {
          id: "override-01",
          type: "block",
          props: { headline: "Desktop", count: 1 },
        },
      },
    ]);

    const set = await apply([
      {
        op: "setBreakpointOverride",
        id: "override-01",
        breakpoint: "tablet",
        override: { props: { headline: "Kurz" }, hidden: true },
      },
    ]);
    expect(set.status).toBe(200);
    expect(nodeOf(page, "override-01").overrides).toEqual({
      tablet: { props: { headline: "Kurz" }, hidden: true },
    });

    const merged = await apply([
      {
        op: "setBreakpointOverride",
        id: "override-01",
        breakpoint: "tablet",
        override: { props: { count: 9 } },
      },
    ]);
    expect(merged.status).toBe(200);
    expect(nodeOf(page, "override-01").overrides).toEqual({
      tablet: { props: { headline: "Kurz", count: 9 }, hidden: true },
    });
    expect(merged.body.results[0]?.undoPatch).toEqual([
      {
        patch: "setOverride",
        id: "override-01",
        breakpoint: "tablet",
        override: { props: { headline: "Kurz" }, hidden: true },
      },
    ]);

    const invalid = await apply([
      {
        op: "setBreakpointOverride",
        id: "override-01",
        breakpoint: "mobile",
        override: { props: { nope: 1 } },
      },
    ]);
    expect(invalid.status).toBe(400);
    expect(
      (invalid.body as unknown as { error: { field: string } }).error.field,
    ).toBe("mutations[0].override.props.nope");

    const cleared = await apply([
      { op: "clearBreakpointOverride", id: "override-01", breakpoint: "tablet" },
    ]);
    expect(cleared.status).toBe(200);
    expect(nodeOf(page, "override-01").overrides).toBeUndefined();

    const idempotent = await apply([
      { op: "clearBreakpointOverride", id: "override-01", breakpoint: "tablet" },
    ]);
    expect(idempotent.status).toBe(200);
    expect(idempotent.body.results[0]?.undoPatch).toEqual([]);
  });

  it("manages motion with preset validation", async () => {
    await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "motion-box", type: "container", props: {} },
      },
    ]);

    const set = await apply([
      {
        op: "setMotion",
        id: "motion-box",
        spec: { preset: "fade-up", intensity: 6, trigger: "viewport" },
      },
    ]);
    expect(set.status).toBe(200);
    expect(nodeOf(page, "motion-box").motion).toMatchObject({
      preset: "fade-up",
      intensity: 6,
    });

    const unknownPreset = await apply([
      { op: "setMotion", id: "motion-box", spec: { preset: "explode" } },
    ]);
    expect(unknownPreset.status).toBe(400);
    const error = (unknownPreset.body as unknown as { error: Record<string, unknown> })
      .error;
    expect(error.field).toBe("mutations[0].spec.preset");
    expect(error.suggestion).toContain("fade-up");

    const tooIntense = await apply([
      { op: "setMotion", id: "motion-box", spec: { preset: "fade-up", intensity: 11 } },
    ]);
    expect(tooIntense.status).toBe(400);

    const cleared = await apply([{ op: "clearMotion", id: "motion-box" }]);
    expect(cleared.status).toBe(200);
    expect(nodeOf(page, "motion-box").motion).toBeUndefined();
    expect(cleared.body.results[0]?.undoPatch).toEqual([
      {
        patch: "setMotion",
        id: "motion-box",
        spec: { preset: "fade-up", intensity: 6, trigger: "viewport" },
      },
    ]);
  });

  it("warns on literal colors but keeps the value", async () => {
    await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "color-block", type: "block", props: { headline: "X" } },
      },
    ]);
    const { status, body } = await apply([
      { op: "updateNodeProps", id: "color-block", patch: { accent: "#ffffff" } },
    ]);
    expect(status).toBe(200);
    expect(body.warnings).toHaveLength(1);
    expect(body.warnings[0]?.field).toBe("mutations[0].props.accent");
    expect(body.warnings[0]?.message).toContain("theme tokens");
    expect(propsOf(page, "color-block").accent).toBe("#ffffff");
  });

  it("warns on literal scale and part values but accepts token refs", async () => {
    await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "style-block", type: "block", props: { headline: "X" } },
      },
    ]);
    const literal = await apply([
      {
        op: "updateNodeProps",
        id: "style-block",
        patch: { paddingY: "96px", cardBackground: "#f5f5f4" },
      },
    ]);
    expect(literal.status).toBe(200);
    expect(literal.body.warnings).toHaveLength(2);
    expect(literal.body.warnings[0]?.field).toBe(
      "mutations[0].props.paddingY",
    );
    expect(literal.body.warnings[1]?.field).toBe(
      "mutations[0].props.cardBackground",
    );

    const tokens = await apply([
      {
        op: "updateNodeProps",
        id: "style-block",
        patch: {
          paddingY: { $token: "space.16" },
          cardBackground: { $token: "bg.muted" },
        },
      },
    ]);
    expect(tokens.status).toBe(200);
    expect(tokens.body.warnings).toEqual([]);

    const viaOverride = await apply([
      {
        op: "setBreakpointOverride",
        id: "style-block",
        breakpoint: "mobile",
        override: { props: { paddingY: "48px" } },
      },
    ]);
    expect(viaOverride.status).toBe(200);
    expect(viaOverride.body.warnings).toHaveLength(1);
    expect(viaOverride.body.warnings[0]?.field).toBe(
      "mutations[0].override.props.paddingY",
    );
  });
});

describe("tree operations", () => {
  it("moves nodes and blocks cycles", async () => {
    const setup = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "move-c1", type: "container", props: {} },
      },
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "move-b", type: "block", props: { headline: "B" } },
      },
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "move-c2", type: "container", props: {} },
      },
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "move-hero", type: "hero", props: { headline: "H" } },
      },
    ]);
    expect(setup.status).toBe(200);

    const into = await apply([
      { op: "moveNode", id: "move-b", target: { nodeId: "move-c1" }, index: 0 },
    ]);
    expect(into.status).toBe(200);
    expect(childIds(page, "move-c1")).toEqual(["move-b"]);

    const outer = await apply([
      { op: "moveNode", id: "move-c1", target: { nodeId: "move-c2" }, index: 0 },
    ]);
    expect(outer.status).toBe(200);

    const cycle = await apply([
      { op: "moveNode", id: "move-c2", target: { nodeId: "move-c1" } },
    ]);
    expect(cycle.status).toBe(400);
    expect(
      (cycle.body as unknown as { error: { message: string } }).error.message,
    ).toContain("own subtree");

    const intoHero = await apply([
      { op: "moveNode", id: "move-b", target: { nodeId: "move-hero" } },
    ]);
    expect(intoHero.status).toBe(400);

    const rootMove = await apply([
      {
        op: "moveNode",
        id: page.draft.rootNodeId,
        target: { nodeId: "move-c2" },
      },
    ]);
    expect(rootMove.status).toBe(400);
  });

  it("wraps nodes in registry-approved wrappers", async () => {
    const setup = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "wrap-hero", type: "hero", props: { headline: "H" } },
      },
    ]);
    expect(setup.status).toBe(200);

    const wrapped = await apply([
      {
        op: "wrapNode",
        id: "wrap-hero",
        wrapper: {
          id: "wrap-shell",
          type: "container",
          variant: "boxed",
          props: { eyebrow: "Wrapped" },
        },
      },
    ]);
    expect(wrapped.status).toBe(200);
    expect(childIds(page, page.draft.rootNodeId)).toEqual(["wrap-shell"]);
    expect(childIds(page, "wrap-shell")).toEqual(["wrap-hero"]);
    expect(wrapped.body.results[0]?.undoPatch).toEqual([
      {
        patch: "moveRaw",
        id: "wrap-hero",
        target: { nodeId: page.draft.rootNodeId },
        index: 0,
      },
      { patch: "deleteRaw", id: "wrap-shell" },
    ]);

    const wrapRoot = await apply([
      {
        op: "wrapNode",
        id: page.draft.rootNodeId,
        wrapper: { type: "container" },
      },
    ]);
    expect(wrapRoot.status).toBe(400);

    const badWrapper = await apply([
      { op: "wrapNode", id: "wrap-hero", wrapper: { type: "block" } },
    ]);
    expect(badWrapper.status).toBe(400);
    expect(
      (badWrapper.body as unknown as { error: { message: string } }).error.message,
    ).toContain("does not allow child");
  });

  it("duplicates subtrees with fresh ids", async () => {
    const placement = goldenTreeToMutations(containerSection.golden.tree, {
      nodeId: page.draft.rootNodeId,
    });
    const setup = await apply(placement.mutations);
    expect(setup.status).toBe(200);
    const originalId = placement.rootId;
    const originalChild = childIds(page, originalId)[0] as string;

    const duplicated = await apply([{ op: "duplicateNode", id: originalId }]);
    expect(duplicated.status).toBe(200);
    const rootChildren = childIds(page, page.draft.rootNodeId);
    expect(rootChildren).toHaveLength(2);
    const copyId = rootChildren[1] as string;
    expect(copyId).not.toBe(originalId);
    const copyChild = childIds(page, copyId)[0] as string;
    expect(copyChild).not.toBe(originalChild);
    expect(nodeOf(page, copyId).type).toBe("container");
    expect(propsOf(page, copyChild).headline).toBe("Golden child");
    expect(duplicated.body.results[0]?.undoPatch).toEqual([
      { patch: "deleteRaw", id: copyId },
    ]);
  });

  it("deletes subtrees and restores them via undo patches", async () => {
    const placement = goldenTreeToMutations(containerSection.golden.tree, {
      nodeId: page.draft.rootNodeId,
    });
    const setup = await apply(placement.mutations);
    expect(setup.status).toBe(200);
    const before = structuredClone(page.draft);

    const deleted = await apply([{ op: "deleteNode", id: placement.rootId }]);
    expect(deleted.status).toBe(200);
    expect(childIds(page, page.draft.rootNodeId)).toEqual([]);

    const undoPatches = (deleted.body.results[0]?.undoPatch ?? []) as Parameters<
      typeof applyTreePatches
    >[1];
    const restored = applyTreePatches(page.draft as never, undoPatches);
    expect(restored).toEqual(before);

    const deleteRoot = await apply([{ op: "deleteNode", id: page.draft.rootNodeId }]);
    expect(deleteRoot.status).toBe(400);
  });
});

describe("versions, audit and request validation", () => {
  it("rejects stale baseDraftVersion with 409 and keeps the tree", async () => {
    const before = structuredClone(page.draft);
    const first = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { type: "block", props: { headline: "V2" } },
      },
    ]);
    expect(first.status).toBe(200);
    expect(first.body.newDraftVersion).toBe(2);

    const stale = await applyMutationsRequest(env.api, page, [
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { type: "block", props: { headline: "Stale" } },
      },
    ], { baseDraftVersion: 1 });
    expect(stale.status).toBe(409);
    const error = (stale.body as unknown as { error: Record<string, unknown> }).error;
    expect(error.category).toBe("conflict");
    expect(error.field).toBe("baseDraftVersion");
    expect(error.message).toContain("expected v1, current v2");
    expect(error.suggestion).toContain("Reload");

    page = await loadPage(page.id);
    expect(childIds(page, page.draft.rootNodeId)).toHaveLength(1);
    expect(page.draftVersion).toBe(2);
    expect(before).not.toEqual(page.draft);
  });

  it("validates dry_run without writing", async () => {
    const dry = await apply(
      [
        {
          op: "insertNode",
          parent: { nodeId: page.draft.rootNodeId },
          node: { type: "block", props: { headline: "Dry" } },
        },
      ],
      { dry_run: true },
    );
    expect(dry.status).toBe(200);
    expect(dry.body.newDraftVersion).toBe(1);
    expect(dry.body.undoBatchId).toBeNull();
    expect(childIds(page, page.draft.rootNodeId)).toEqual([]);

    const dryInvalid = await apply(
      [
        {
          op: "insertNode",
          parent: { nodeId: "missing" },
          node: { type: "block", props: {} },
        },
      ],
      { dry_run: true },
    );
    expect(dryInvalid.status).toBe(404);

    const live = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { type: "block", props: { headline: "Live" } },
      },
    ]);
    expect(live.status).toBe(200);
    expect(live.body.newDraftVersion).toBe(2);

    const audit = await env.api.request({
      method: "GET",
      path: `/api/pages/${page.id}/audit`,
    });
    expect((audit.body as { entries: unknown[] }).entries).toHaveLength(1);
  });

  it("records per-mutation audit entries with the author", async () => {
    const applied = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "audit-box", type: "container", props: {} },
      },
      {
        op: "updateNodeProps",
        id: "audit-box",
        patch: { eyebrow: "Audited" },
      },
      {
        op: "updateNodeMeta",
        id: "audit-box",
        meta: { variant: "full" },
      },
    ]);
    expect(applied.status).toBe(200);

    const audit = await env.api.request({
      method: "GET",
      path: `/api/pages/${page.id}/audit`,
    });
    expect(audit.status).toBe(200);
    const entries = (
      audit.body as { entries: Record<string, unknown>[] }
    ).entries;
    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.opIndex)).toEqual([2, 1, 0]);
    const batchIds = new Set(entries.map((entry) => entry.batchId));
    expect(batchIds.size).toBe(1);
    expect([...batchIds][0]).toBe(applied.body.undoBatchId);
    for (const entry of entries) {
      expect(entry.author).toEqual({ ...TEST_AUTHOR });
      expect(entry.draftVersionAfter).toBe(applied.body.newDraftVersion);
      expect(entry.mutation).toBe(
        ["updateNodeMeta", "updateNodeProps", "insertNode"][2 - (entry.opIndex as number)],
      );
      expect(Array.isArray(entry.undoPatch)).toBe(true);
    }

    const limited = await env.api.request({
      method: "GET",
      path: `/api/pages/${page.id}/audit?limit=1`,
    });
    expect(
      (limited.body as { entries: unknown[] }).entries,
    ).toHaveLength(1);
  });

  it("updates page meta and guards path uniqueness", async () => {
    const beforeTitle = page.title;
    const beforePath = page.path;
    const meta = await apply([
      { op: "updatePageMeta", title: "Home", path: "/home" },
    ]);
    expect(meta.status).toBe(200);
    expect(page.title).toBe("Home");
    expect(page.path).toBe("/home");
    expect(meta.body.results[0]?.undoPatch).toEqual([
      { patch: "setPageMeta", title: beforeTitle, path: beforePath },
    ]);

    const other = await createTestPage(env.api, siteId, { title: "Other" });
    const takeover = await applyMutationsRequest(env.api, other, [
      { op: "updatePageMeta", path: "/home" },
    ]);
    expect(takeover.status).toBe(409);
    expect(
      (takeover.body as unknown as { error: { field: string; opIndex: number } }).error,
    ).toMatchObject({ field: "mutations[0].path", opIndex: 0 });

    const empty = await apply([{ op: "updatePageMeta", title: "  " }]);
    expect(empty.status).toBe(400);
  });

  it("rejects invalid request shapes", async () => {
    const missingAuthor = await applyMutationsRequest(
      env.api,
      page,
      [{ op: "clearMotion", id: "x" }],
      { author: undefined },
    );
    expect(missingAuthor.status).toBe(400);
    expect(
      (missingAuthor.body as unknown as { error: { field: string } }).error.field,
    ).toBe("author");

    const badKind = await applyMutationsRequest(
      env.api,
      page,
      [{ op: "clearMotion", id: "x" }],
      { author: { kind: "bot", id: "b", label: "Bot" } },
    );
    expect(badKind.status).toBe(400);

    const empty = await apply([]);
    expect(empty.status).toBe(400);

    const unknownOp = await apply([
      { op: "explode", id: "x" } as unknown as Mutation,
    ]);
    expect(unknownOp.status).toBe(400);
    expect(
      (unknownOp.body as unknown as { error: { field: string } }).error.field,
    ).toBe("mutations[0].op");
  });

  it("validates asset and richtext fallbacks", async () => {
    await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "media-1", type: "block", props: {} },
      },
    ]);
    const badAsset = await apply([
      { op: "updateNodeProps", id: "media-1", patch: { cover: { assetId: 5 } } },
    ]);
    expect(badAsset.status).toBe(400);

    const badRichtext = await apply([
      { op: "updateNodeProps", id: "media-1", patch: { body: 42 } },
    ]);
    expect(badRichtext.status).toBe(400);

    const good = await apply([
      {
        op: "updateNodeProps",
        id: "media-1",
        patch: {
          cover: { assetId: "a1", focal: { x: 0.5, y: 0.5 } },
          body: "# Hallo",
        },
      },
    ]);
    expect(good.status).toBe(200);
  });
});

describe("concurrency and atomicity", () => {
  it("serializes concurrent batches: one wins, one conflicts", async () => {
    const base = page.draftVersion;
    const rootId = page.draft.rootNodeId;
    const send = (headline: string) =>
      env.api.request({
        method: "POST",
        path: `/api/pages/${page.id}/mutations`,
        body: {
          baseDraftVersion: base,
          author: TEST_AUTHOR,
          mutations: [
            {
              op: "insertNode",
              parent: { nodeId: rootId },
              node: { type: "block", props: { headline } },
            },
          ],
        },
      });
    const [first, second] = await Promise.all([send("A"), send("B")]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);

    const reloaded = await loadPage(page.id);
    expect(childIds(reloaded, reloaded.draft.rootNodeId)).toHaveLength(1);

    const audit = await env.api.request({
      method: "GET",
      path: `/api/pages/${page.id}/audit`,
    });
    const entries = (audit.body as { entries: unknown[] }).entries;
    expect(entries).toHaveLength(1);
  });

  it("writes nothing when a batch fails validation", async () => {
    const { status } = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "atomic-1", type: "block", props: {} },
      },
      {
        op: "insertNode",
        parent: { nodeId: "missing" },
        node: { type: "block", props: {} },
      },
    ]);
    expect(status).toBe(404);
    const reloaded = await loadPage(page.id);
    expect(reloaded.draftVersion).toBe(1);
    expect(childIds(reloaded, reloaded.draft.rootNodeId)).toEqual([]);
    const audit = await env.api.request({
      method: "GET",
      path: `/api/pages/${page.id}/audit`,
    });
    expect((audit.body as { entries: unknown[] }).entries).toEqual([]);
  });

  it("skips version bump and audit for no-op batches", async () => {
    const setup = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "noop-1", type: "block", props: {} },
      },
    ]);
    expect(setup.status).toBe(200);

    const noop = await apply([
      { op: "clearMotion", id: "noop-1" },
      { op: "clearBreakpointOverride", id: "noop-1", breakpoint: "tablet" },
      { op: "updatePageMeta" },
    ]);
    expect(noop.status).toBe(200);
    expect(noop.body.newDraftVersion).toBe(2);
    expect(noop.body.undoBatchId).toBeNull();

    const audit = await env.api.request({
      method: "GET",
      path: `/api/pages/${page.id}/audit`,
    });
    expect((audit.body as { entries: unknown[] }).entries).toHaveLength(1);
  });

  it("rejects unknown fields in closed contracts", async () => {
    const extraMeta = await applyMutationsRequest(env.api, page, [
      { op: "updatePageMeta", titel: "Typo" } as unknown as Mutation,
    ]);
    expect(extraMeta.status).toBe(400);

    const extraNode = await applyMutationsRequest(env.api, page, [
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { type: "block", bogus: 1 },
      } as unknown as Mutation,
    ]);
    expect(extraNode.status).toBe(400);
  });
});

describe("tree ordering", () => {
  it("moves within a list with post-removal index semantics", async () => {
    const setup = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "order-a", type: "block", props: {} },
      },
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "order-b", type: "block", props: {} },
      },
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "order-c", type: "block", props: {} },
      },
    ]);
    expect(setup.status).toBe(200);

    const moveA = await apply([
      {
        op: "moveNode",
        id: "order-a",
        target: { nodeId: page.draft.rootNodeId },
        index: 2,
      },
    ]);
    expect(moveA.status).toBe(200);
    expect(childIds(page, page.draft.rootNodeId)).toEqual([
      "order-b",
      "order-c",
      "order-a",
    ]);

    const moveC = await apply([
      {
        op: "moveNode",
        id: "order-c",
        target: { nodeId: page.draft.rootNodeId },
        index: 0,
      },
    ]);
    expect(moveC.status).toBe(200);
    expect(childIds(page, page.draft.rootNodeId)).toEqual([
      "order-c",
      "order-b",
      "order-a",
    ]);
  });

  it("duplicates at explicit indexes and rejects self-targets", async () => {
    const placement = goldenTreeToMutations(containerSection.golden.tree, {
      nodeId: page.draft.rootNodeId,
    });
    const setup = await apply(placement.mutations);
    expect(setup.status).toBe(200);

    const duplicated = await apply([
      { op: "duplicateNode", id: placement.rootId, index: 0 },
    ]);
    expect(duplicated.status).toBe(200);
    const children = childIds(page, page.draft.rootNodeId);
    expect(children).toHaveLength(2);
    expect(children[1]).toBe(placement.rootId);

    const selfTarget = await apply([
      {
        op: "duplicateNode",
        id: placement.rootId,
        target: { nodeId: placement.rootId },
      },
    ]);
    expect(selfTarget.status).toBe(400);
    expect(
      (selfTarget.body as unknown as { error: { field: string } }).error.field,
    ).toBe("mutations[0].target.nodeId");
  });
});

describe("undo roundtrips against server state", () => {
  async function snapshot(): Promise<{
    tree: NodeTree;
    title: string;
    path: string;
  }> {
    const current = await loadPage(page.id);
    return { tree: treeOf(current), title: current.title, path: current.path };
  }

  async function undoAndCompare(
    before: { tree: NodeTree; title: string; path: string },
    results: { undoPatch: unknown }[],
  ): Promise<void> {
    const after = await loadPage(page.id);
    const restored = applyUndoBatch({
      tree: treeOf(after),
      title: after.title,
      path: after.path,
      batch: results.map((result) => ({
        undoPatch: result.undoPatch as unknown as PatchOp[],
      })),
    });
    expect(restored.tree).toEqual(before.tree);
    expect(restored.title).toBe(before.title);
    expect(restored.path).toBe(before.path);
  }

  it("roundtrips insert, delete and duplicate", async () => {
    const placement = goldenTreeToMutations(containerSection.golden.tree, {
      nodeId: page.draft.rootNodeId,
    });

    const beforeInsert = await snapshot();
    const inserted = await apply(placement.mutations);
    expect(inserted.status).toBe(200);
    await undoAndCompare(beforeInsert, inserted.body.results);

    const secondPlacement = goldenTreeToMutations(containerSection.golden.tree, {
      nodeId: page.draft.rootNodeId,
    });
    const withNodes = await apply(secondPlacement.mutations);
    expect(withNodes.status).toBe(200);
    const beforeDelete = await snapshot();
    const deleted = await apply([{ op: "deleteNode", id: placement.rootId }]);
    expect(deleted.status).toBe(200);
    await undoAndCompare(beforeDelete, deleted.body.results);

    const beforeDuplicate = await snapshot();
    const duplicated = await apply([{ op: "duplicateNode", id: secondPlacement.rootId }]);
    expect(duplicated.status).toBe(200);
    await undoAndCompare(beforeDuplicate, duplicated.body.results);
  });

  it("roundtrips move and wrap", async () => {
    const setup = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "rt-hero", type: "hero", props: { headline: "H" } },
      },
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "rt-box", type: "container", props: {} },
      },
    ]);
    expect(setup.status).toBe(200);

    const beforeMove = await snapshot();
    const moved = await apply([
      { op: "moveNode", id: "rt-hero", target: { nodeId: "rt-box" } },
    ]);
    expect(moved.status).toBe(200);
    await undoAndCompare(beforeMove, moved.body.results);

    const beforeWrap = await snapshot();
    const wrapped = await apply([
      { op: "wrapNode", id: "rt-box", wrapper: { type: "container" } },
    ]);
    expect(wrapped.status).toBe(200);
    await undoAndCompare(beforeWrap, wrapped.body.results);
  });

  it("roundtrips props, meta, overrides, motion and page meta", async () => {
    const setup = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: {
          id: "rt-block",
          type: "block",
          props: { headline: "Vor", count: 1 },
        },
      },
    ]);
    expect(setup.status).toBe(200);

    const beforeProps = await snapshot();
    const props = await apply([
      {
        op: "updateNodeProps",
        id: "rt-block",
        patch: { headline: "Nach", count: 2 },
      },
      { op: "updateNodeMeta", id: "rt-block", meta: { locked: true } },
    ]);
    expect(props.status).toBe(200);
    await undoAndCompare(beforeProps, props.body.results);

    const beforeOverride = await snapshot();
    const override = await apply([
      {
        op: "setBreakpointOverride",
        id: "rt-block",
        breakpoint: "mobile",
        override: { props: { headline: "Mobil" } },
      },
      { op: "clearBreakpointOverride", id: "rt-block", breakpoint: "mobile" },
    ]);
    expect(override.status).toBe(200);
    await undoAndCompare(beforeOverride, override.body.results);

    const beforeMotion = await snapshot();
    const motionBatch = await apply([
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "rt-motion", type: "container", props: {} },
      },
      { op: "setMotion", id: "rt-motion", spec: { preset: "fade-up" } },
      { op: "clearMotion", id: "rt-motion" },
    ]);
    expect(motionBatch.status).toBe(200);
    await undoAndCompare(beforeMotion, motionBatch.body.results);

    const beforeMeta = await snapshot();
    const meta = await apply([
      { op: "updatePageMeta", title: "Undo Me", path: "/undo-me" },
    ]);
    expect(meta.status).toBe(200);
    await undoAndCompare(beforeMeta, meta.body.results);
  });
});

describe("malformed requests", () => {
  it("rejects malformed URL encoding with 400", async () => {
    const raw = await rawGet(env.server.origin, "/api/pages/%E0%A4%A");
    expect(raw.status).toBe(400);
    expect(JSON.parse(raw.body) as unknown).toMatchObject({
      error: { category: "validation" },
    });
  });
});

function rawGet(origin: string, rawPath: string): Promise<{ status: number; body: string }> {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const socket = connect(Number(url.port), url.hostname, () => {
      socket.write(`GET ${rawPath} HTTP/1.1\r\nHost: senify.test\r\nConnection: close\r\n\r\n`);
    });
    let data = "";
    socket.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
    });
    socket.on("close", () => {
      const separator = data.indexOf("\r\n\r\n");
      const head = separator >= 0 ? data.slice(0, separator) : data;
      const status = Number(head.split(" ")[1]);
      resolve({ status, body: separator >= 0 ? data.slice(separator + 4) : "" });
    });
    socket.on("error", reject);
  });
}
