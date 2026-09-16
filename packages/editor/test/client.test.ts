import { describe, expect, it, vi } from "vitest";
import {
  createHttpTransport,
  DRAFT_CONFLICT_MESSAGE,
  DraftConflictError,
  EditorRequestError,
  MutationsSession,
  type FetchLike,
  type FetchResponseLike,
} from "@senify/editor";
import type { AuthorInput } from "@senify/engine";
import { draftTree } from "./fixtures.ts";

const author: AuthorInput = { kind: "human", id: "anna", label: "Anna" };

type Call = { url: string; body: Record<string, unknown> };

function stubFetch(
  response: (call: Call) => { status: number; body: unknown },
  calls: Call[] = [],
): FetchLike {
  return (url, init) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, body });
    const result = response({ url, body });
    const payload: FetchResponseLike = {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.body,
    };
    return Promise.resolve(payload);
  };
}

function ok(body: unknown): { status: number; body: unknown } {
  return { status: 200, body };
}

function response(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    newDraftVersion: 4,
    undoBatchId: "batch-1",
    warnings: [],
    results: [{ opIndex: 0, op: "deleteNode", undoPatch: [{ patch: "deleteRaw", id: "x" }] }],
    ...overrides,
  };
}

describe("apply_mutations transport", () => {
  it("posts the batch with baseVersion and author and moves the cursor", async () => {
    const calls: Call[] = [];
    const transport = createHttpTransport({
      pageId: "page-1",
      fetchImpl: stubFetch(() => ok(response()), calls),
    });
    const onVersion = vi.fn();
    const session = new MutationsSession({
      transport,
      initialVersion: 3,
      author,
      onVersion,
    });
    const result = await session.applyMutations([{ op: "deleteNode", id: "hero000001" }]);
    expect(result.newDraftVersion).toBe(4);
    expect(session.version).toBe(4);
    expect(onVersion).toHaveBeenCalledWith(4);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/pages/page-1/mutations");
    expect(calls[0]?.body.baseDraftVersion).toBe(3);
    expect(calls[0]?.body.author).toEqual(author);
    expect(calls[0]?.body.mutations).toEqual([{ op: "deleteNode", id: "hero000001" }]);
  });

  it("sends the canonical mutations for an editor action", async () => {
    const calls: Call[] = [];
    const transport = createHttpTransport({
      pageId: "page-1",
      fetchImpl: stubFetch(() => ok(response()), calls),
    });
    const session = new MutationsSession({ transport, initialVersion: 7, author });
    await session.applyActions(
      [
        { kind: "move", nodeId: "pricing00001", target: { nodeId: "page000001" }, index: 0 },
      ],
      { tree: draftTree() },
    );
    expect(calls[0]?.body.baseDraftVersion).toBe(7);
    expect(calls[0]?.body.mutations).toEqual([
      { op: "moveNode", id: "pricing00001", target: { nodeId: "page000001" }, index: 0 },
    ]);
  });

  it("reports a 409 as 'Draft hat sich geändert — neu laden' and reloads", async () => {
    const onConflict = vi.fn();
    const transport = createHttpTransport({
      pageId: "page-1",
      onConflict,
      fetchImpl: stubFetch(() => ({
        status: 409,
        body: {
          error: {
            category: "conflict",
            message: "Draft has changed (expected v3, current v5)",
            field: "baseDraftVersion",
          },
        },
      })),
    });
    const session = new MutationsSession({ transport, initialVersion: 3, author });
    await expect(
      session.applyMutations([{ op: "deleteNode", id: "hero000001" }]),
    ).rejects.toBeInstanceOf(DraftConflictError);
    await expect(
      session.applyMutations([{ op: "deleteNode", id: "hero000001" }]),
    ).rejects.toThrow(DRAFT_CONFLICT_MESSAGE);
    expect(onConflict).toHaveBeenCalledTimes(2);
    // The cursor must not move on a conflict.
    expect(session.version).toBe(3);
  });

  it("surfaces engine errors with category, field and suggestion", async () => {
    const transport = createHttpTransport({
      pageId: "page-1",
      fetchImpl: stubFetch(() => ({
        status: 400,
        body: {
          error: {
            category: "validation",
            message: "Section \"pricing\" does not allow child \"hero\"",
            field: "mutations[0].node.type",
            suggestion: "Allowed children: none.",
          },
        },
      })),
    });
    const session = new MutationsSession({ transport, initialVersion: 1, author });
    const error = await session
      .applyMutations([{ op: "deleteNode", id: "x" }])
      .catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(EditorRequestError);
    expect((error as EditorRequestError).status).toBe(400);
    expect((error as EditorRequestError).category).toBe("validation");
    expect((error as EditorRequestError).field).toBe("mutations[0].node.type");
    expect((error as EditorRequestError).suggestion).toBe("Allowed children: none.");
  });

  it("skips the request for an empty batch", async () => {
    const calls: Call[] = [];
    const transport = createHttpTransport({
      pageId: "page-1",
      fetchImpl: stubFetch(() => ok(response()), calls),
    });
    const session = new MutationsSession({ transport, initialVersion: 2, author });
    const result = await session.applyMutations([]);
    expect(calls).toHaveLength(0);
    expect(result.newDraftVersion).toBe(2);
    expect(result.undoBatchId).toBeNull();
    expect(session.version).toBe(2);
  });

  it("rejects a response without a draft version", async () => {
    const transport = createHttpTransport({
      pageId: "page-1",
      fetchImpl: stubFetch(() => ok({ undoBatchId: null })),
    });
    await expect(transport.apply({ baseDraftVersion: 1, author, mutations: [] })).rejects.toThrow(
      /newDraftVersion/,
    );
  });
});
