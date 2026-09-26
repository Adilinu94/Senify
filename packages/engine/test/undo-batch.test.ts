import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Mutation } from "@senify/engine";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  treeOf,
  type AuditResponse,
  type BootEnv,
  type ErrorResponse,
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

type UndoResponse = {
  newDraftVersion: number;
  undoBatchId: string;
  undone: { batchId: string; mutations: string[]; authors: string[] }[];
  warnings: { message: string }[];
};

async function loadPage(id: string): Promise<PageResponse> {
  const response = await env.api.request<PageResponse>({
    method: "GET",
    path: `/api/pages/${id}`,
  });
  expect(response.status).toBe(200);
  return response.body;
}

async function apply(mutations: Mutation[]): Promise<MutationsResponse> {
  const response = await applyMutationsRequest(env.api, page, mutations);
  expect(response.status).toBe(200);
  page = await loadPage(page.id);
  return response.body;
}

async function undo(body: Record<string, unknown>): Promise<{
  status: number;
  body: UndoResponse & ErrorResponse;
}> {
  const response = await env.api.request<UndoResponse & ErrorResponse>({
    method: "POST",
    path: `/api/pages/${page.id}/undo-batch`,
    body,
  });
  if (response.status === 200) page = await loadPage(page.id);
  return response;
}

async function audit(): Promise<AuditResponse["entries"]> {
  const response = await env.api.request<AuditResponse>({
    method: "GET",
    path: `/api/pages/${page.id}/audit?limit=100`,
  });
  expect(response.status).toBe(200);
  return response.body.entries;
}

function insertBlock(id: string, headline: string): Mutation {
  return {
    op: "insertNode",
    parent: { nodeId: page.draft.rootNodeId },
    index: 0,
    node: { id, type: "block", props: { headline } },
  };
}

describe("agent undo (E17 slice 2)", () => {
  it("undoes the newest batch and audits the undo", async () => {
    const first = await apply([insertBlock("node_0001", "First")]);
    const second = await apply([
      { op: "updateNodeProps", id: "node_0001", patch: { headline: "Second" } },
    ]);
    expect(page.draft.nodes.node_0001?.props).toEqual({ headline: "Second" });

    const response = await undo({
      baseDraftVersion: page.draftVersion,
      steps: 1,
    });
    expect(response.status).toBe(200);
    expect(response.body.newDraftVersion).toBe(page.draftVersion);
    expect(response.body.undone).toHaveLength(1);
    expect(response.body.undone[0]?.batchId).toBe(second.undoBatchId);
    expect(response.body.undone[0]?.mutations).toEqual(["updateNodeProps"]);
    expect(page.draft.nodes.node_0001?.props).toEqual({ headline: "First" });

    // The undo itself is one audited batch that points at what it consumed.
    const entries = await audit();
    const undoEntries = entries.filter((entry) => entry.mutation === "undoBatch");
    expect(undoEntries).toHaveLength(1);
    expect(undoEntries[0]?.batchId).toBe(response.body.undoBatchId);
    expect(undoEntries[0]?.params.undoOf).toBe(second.undoBatchId);
    expect(undoEntries[0]?.draftVersionAfter).toBe(page.draftVersion);
    // The forward batch stays in the log: redo = re-apply its mutations.
    expect(entries.some((entry) => entry.batchId === first.undoBatchId)).toBe(true);
  });

  it("rejects a stale baseDraftVersion with a conflict and keeps the tree", async () => {
    await apply([insertBlock("node_0001", "First")]);
    const stale = page.draftVersion;
    await apply([
      { op: "updateNodeProps", id: "node_0001", patch: { headline: "Second" } },
    ]);

    const response = await undo({ baseDraftVersion: stale, steps: 1 });
    expect(response.status).toBe(409);
    expect(response.body.error.category).toBe("conflict");
    expect(response.body.error.field).toBe("baseDraftVersion");
    const current = await loadPage(page.id);
    expect(current.draft.nodes.node_0001?.props).toEqual({ headline: "Second" });
  });

  it("refuses an older batch after a newer one was undone", async () => {
    await apply([insertBlock("node_0001", "First")]);
    const second = await apply([
      { op: "updateNodeProps", id: "node_0001", patch: { headline: "Second" } },
    ]);
    const third = await apply([
      { op: "updateNodeProps", id: "node_0001", patch: { headline: "Third" } },
    ]);

    const undone = await undo({ baseDraftVersion: page.draftVersion, steps: 1 });
    expect(undone.status).toBe(200);
    expect(undone.body.undone[0]?.batchId).toBe(third.undoBatchId);
    expect(page.draft.nodes.node_0001?.props).toEqual({ headline: "Second" });

    // The consumed batch cannot be undone twice.
    const again = await undo({
      baseDraftVersion: page.draftVersion,
      batchIds: [third.undoBatchId],
    });
    expect(again.status).toBe(409);
    expect(again.body.error.category).toBe("conflict");

    // The remaining tail is exactly the second batch; an older selection is
    // refused, the tail itself goes through.
    const older = await undo({
      baseDraftVersion: page.draftVersion,
      batchIds: [second.undoBatchId, third.undoBatchId],
    });
    expect(older.status).toBe(409);
    const tail = await undo({
      baseDraftVersion: page.draftVersion,
      batchIds: [second.undoBatchId],
    });
    expect(tail.status).toBe(200);
    expect(tail.body.undone[0]?.batchId).toBe(second.undoBatchId);
    expect(page.draft.nodes.node_0001?.props).toEqual({ headline: "First" });
  });

  it("undoes a multi-op batch in one step", async () => {
    await apply([insertBlock("node_0001", "First"), insertBlock("node_0002", "Second")]);
    const tree = treeOf(page);
    expect(tree.nodes.node_0001).toBeDefined();
    expect(tree.nodes.node_0002).toBeDefined();

    const response = await undo({ baseDraftVersion: page.draftVersion, steps: 1 });
    expect(response.status).toBe(200);
    expect(response.body.undone[0]?.mutations).toEqual([
      "insertNode",
      "insertNode",
    ]);
    expect(page.draft.nodes.node_0001).toBeUndefined();
    expect(page.draft.nodes.node_0002).toBeUndefined();
  });

  it("validates the request body and the available steps", async () => {
    await apply([insertBlock("node_0001", "First")]);

    const badVersion = await undo({ baseDraftVersion: "x" });
    expect(badVersion.status).toBe(400);
    expect(badVersion.body.error.category).toBe("validation");

    const both = await undo({
      baseDraftVersion: page.draftVersion,
      steps: 1,
      batchIds: ["whatever"],
    });
    expect(both.status).toBe(400);

    const tooMany = await undo({
      baseDraftVersion: page.draftVersion,
      steps: 3,
    });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.field).toBe("steps");
  });

  it("has nothing to undo on a fresh page", async () => {
    const response = await undo({ baseDraftVersion: page.draftVersion, steps: 1 });
    expect(response.status).toBe(409);
    expect(response.body.error.category).toBe("conflict");
  });
});
