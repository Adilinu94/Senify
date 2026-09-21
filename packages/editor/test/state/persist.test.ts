import { describe, expect, it, vi } from "vitest";
import {
  createSavePipeline,
  patchesToPending,
  type SaveRequest,
  type SaveResponse,
  type SaveState,
} from "@senify/editor/state";
import type { Author } from "@senify/section-sdk";
import { createScopedRule } from "@senify/widget-engine";
import { baseStore } from "./fixtures.ts";

const AUTHOR: Author = { kind: "human", id: "tester", label: "Tester" };

type Scripted = (request: SaveRequest) => SaveResponse | undefined;

function harness(script: Scripted = () => ({ status: 200, body: { newDraftVersion: 2 } })) {
  const store = baseStore();
  const requests: SaveRequest[] = [];
  const pipeline = createSavePipeline({
    store,
    pageId: "page1",
    siteId: "site1",
    author: AUTHOR,
    request: async (request) => {
      requests.push(request);
      return script(request) ?? { status: 200, body: { newDraftVersion: 2 } };
    },
    debounceMs: 5,
  });
  return { store, pipeline, requests };
}

const rule = (id: string, name: string, styles: Record<string, unknown> = {}) => ({
  id,
  name,
  kind: "class" as const,
  selector: `.${name}`,
  order: 0,
  styles,
  contextStyles: {},
});

describe("save pipeline", () => {
  it("bundles a burst into one page request and tracks the version", async () => {
    const { store, pipeline, requests } = harness((request) =>
      request.path.includes("/editor-mutations")
        ? { status: 200, body: { newDraftVersion: 7 } }
        : undefined,
    );
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    store.apply({ op: "setNodeProp", id: "head000001", key: "color", value: "#123456" });
    expect(pipeline.state().pending).toBe(2);
    expect(requests).toEqual([]);

    await pipeline.flush();
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.method).toBe("POST");
    expect(request?.path).toBe("/api/pages/page1/editor-mutations");
    const body = request?.body as { baseDraftVersion: number; mutations: unknown[] };
    expect(body.baseDraftVersion).toBe(1);
    expect(body.mutations).toHaveLength(2);
    expect(pipeline.state().status).toBe("saved");
    expect(pipeline.state().version).toBe(7);
    expect(pipeline.state().pending).toBe(0);
  });

  it("autosaves after the quiet period", async () => {
    vi.useFakeTimers();
    try {
      const { store, pipeline, requests } = harness();
      store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
      await vi.advanceTimersByTimeAsync(6);
      expect(requests).toHaveLength(1);
      expect(pipeline.state().status).toBe("saved");
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes style rule ops to the site routes", async () => {
    const { store, pipeline, requests } = harness();
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta", { color: "#fff" }) });
    store.apply({ op: "renameStyleRule", id: "r-cta", name: "hero" });
    store.apply({ op: "reorderStyleRule", id: "r-cta", index: 0 });
    store.apply({ op: "deleteStyleRule", id: "r-cta" });
    await pipeline.flush();

    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      "POST /api/sites/site1/style-rules",
      "PATCH /api/sites/site1/style-rules/r-cta",
      "POST /api/sites/site1/style-rules/r-cta/reorder",
      "DELETE /api/sites/site1/style-rules/r-cta",
    ]);
    // The create body drops the document's own ordering; the route owns it.
    const createBody = requests[0]?.body as Record<string, unknown>;
    expect(createBody["id"]).toBe("r-cta");
    expect(createBody["order"]).toBeUndefined();
    expect(createBody["styles"]).toEqual({ color: "#fff" });
  });

  it("creates a scoped rule with its node and patches it without a scope (ticket 02 point 5)", async () => {
    const { store, pipeline, requests } = harness();
    store.apply({
      op: "upsertStyleRule",
      rule: {
        ...createScopedRule({ id: "scope00001", nodeId: "head000001" }),
        states: { hover: { color: "#00ff00" } },
      },
    });
    await pipeline.flush();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    const createBody = requests[0]?.body as Record<string, unknown>;
    // The create route derives name and selector from `nodeId`; a scope object
    // would be rejected by the closed body schema.
    expect(createBody["nodeId"]).toBe("head000001");
    expect(createBody["scope"]).toBeUndefined();
    expect(createBody["states"]).toEqual({ hover: { color: "#00ff00" } });

    // The second upsert of the same id is a PATCH and keeps the scope
    // server-side (the patch schema has no scope field).
    const knownStore = baseStore();
    const knownRequests: SaveRequest[] = [];
    const knownPipeline = createSavePipeline({
      store: knownStore,
      pageId: "page1",
      siteId: "site1",
      author: AUTHOR,
      knownRuleIds: ["scope00001"],
      request: async (request) => {
        knownRequests.push(request);
        return { status: 200, body: {} };
      },
    });
    knownStore.apply({
      op: "upsertStyleRule",
      rule: {
        ...createScopedRule({ id: "scope00001", nodeId: "head000001" }),
        states: { hover: { color: "#ff0000" } },
      },
    });
    await knownPipeline.flush();
    expect(knownRequests[0]?.method).toBe("PATCH");
    const patchBody = knownRequests[0]?.body as Record<string, unknown>;
    expect(patchBody["nodeId"]).toBeUndefined();
    expect(patchBody["scope"]).toBeUndefined();
    expect(patchBody["states"]).toEqual({ hover: { color: "#ff0000" } });
  });

  it("updates a rule the server already knows instead of creating it twice", async () => {
    const store = baseStore();
    const requests: SaveRequest[] = [];
    const pipeline = createSavePipeline({
      store,
      pageId: "page1",
      siteId: "site1",
      author: AUTHOR,
      knownRuleIds: ["r-cta"],
      request: async (request) => {
        requests.push(request);
        return { status: 200, body: {} };
      },
    });
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta") });
    await pipeline.flush();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("PATCH");
    expect(requests[0]?.path).toBe("/api/sites/site1/style-rules/r-cta");
  });

  it("persists a class assignment as a setNodeMeta mutation", async () => {
    const { store, pipeline, requests } = harness();
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta") });
    await pipeline.flush();
    requests.length = 0;

    store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" });
    await pipeline.flush();
    expect(requests).toHaveLength(1);
    const body = requests[0]?.body as { mutations: unknown[] };
    expect(body.mutations).toEqual([
      { op: "setNodeMeta", id: "btn0000001", meta: { classes: ["cta"] } },
    ]);
    expect(pipeline.state().unsupported).toEqual([]);
  });

  it("persists a motion spec as setMotion and its clear as clearMotion", async () => {
    const { store, pipeline, requests } = harness();
    store.apply({
      op: "setMotion",
      id: "head000001",
      spec: { preset: "fade-up", intensity: 6 },
    });
    await pipeline.flush();
    expect(requests).toHaveLength(1);
    const body = requests[0]?.body as { mutations: unknown[] };
    expect(body.mutations).toEqual([
      { op: "setMotion", id: "head000001", spec: { preset: "fade-up", intensity: 6 } },
    ]);
    requests.length = 0;

    store.apply({ op: "clearMotion", id: "head000001" });
    await pipeline.flush();
    const cleared = requests[0]?.body as { mutations: unknown[] };
    expect(cleared.mutations).toEqual([{ op: "clearMotion", id: "head000001" }]);
    expect(pipeline.state().unsupported).toEqual([]);
  });

  it("persists slot content and collection entries instead of dropping them", async () => {
    const { store, pipeline, requests } = harness();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "collection", id: "coll000001" },
    });
    await pipeline.flush();
    requests.length = 0;

    // Slot content travels as insertNode on the slot parent — the transport
    // form of the setSlotContent patches (ticket 13 rest closed).
    store.apply({
      op: "setSlotContent",
      id: "coll000001",
      slot: "item",
      nodes: [{ primitive: "heading", id: "item000001", props: { text: "Neu" } }],
    });
    await pipeline.flush();
    expect(pipeline.state().unsupported).toEqual([]);
    expect(requests).toHaveLength(1);
    const body = requests[0]?.body as { mutations: unknown[] };
    expect(body.mutations).toEqual([
      {
        op: "insertNode",
        parent: { nodeId: "coll000001", slot: "item" },
        index: 0,
        node: { primitive: "heading", id: "item000001", props: { text: "Neu" } },
      },
    ]);
    requests.length = 0;

    store.apply({
      op: "updateCollectionEntry",
      id: "coll000001",
      index: 0,
      patch: { text: "Geändert" },
    });
    await pipeline.flush();
    const updated = requests[0]?.body as { mutations: unknown[] };
    expect(updated.mutations).toEqual([
      { op: "setNodeProp", id: "item000001", key: "text", value: "Geändert" },
    ]);
    expect(pipeline.state().unsupported).toEqual([]);
  });

  it("persists undo by translating the history patches back to mutations", async () => {
    const { store, pipeline, requests } = harness();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "heading", id: "head000009", props: { text: "Neu" } },
    });
    await pipeline.flush();
    requests.length = 0;

    store.undo();
    await pipeline.flush();
    expect(requests).toHaveLength(1);
    const body = requests[0]?.body as { mutations: { op: string; id: string }[] };
    expect(body.mutations).toEqual([{ op: "deleteNode", id: "head000009" }]);

    store.redo();
    await pipeline.flush();
    const redoBody = requests[1]?.body as { mutations: { op: string }[] };
    expect(redoBody.mutations[0]?.op).toBe("insertNode");
  });

  it("pauses on a conflict, keeps the batch and resends on retry", async () => {
    let conflict = true;
    const { store, pipeline, requests } = harness((request) => {
      if (!request.path.includes("/editor-mutations")) return undefined;
      if (conflict) {
        conflict = false;
        return {
          status: 409,
          body: { error: { message: "Draft has changed (expected v1, current v4)" } },
        };
      }
      return { status: 200, body: { newDraftVersion: 5 } };
    });
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    await pipeline.flush();

    const conflictState: SaveState = pipeline.state();
    expect(conflictState.status).toBe("conflict");
    expect(conflictState.pending).toBe(1);
    expect(conflictState.message).toContain("current v4");

    // No autosave while the conflict stands.
    store.apply({ op: "setNodeProp", id: "head000001", key: "color", value: "#000000" });
    await pipeline.flush();
    expect(requests).toHaveLength(1);

    await pipeline.retry();
    expect(requests).toHaveLength(2);
    const body = requests[1]?.body as { baseDraftVersion: number; mutations: unknown[] };
    expect(body.baseDraftVersion).toBe(4);
    expect(body.mutations).toHaveLength(2);
    expect(pipeline.state().status).toBe("saved");
    expect(pipeline.state().version).toBe(5);
  });

  it("accepts a fresh version after a reload", async () => {
    const { store, pipeline } = harness(() => ({
      status: 409,
      body: { error: { message: "Draft has changed (expected v1, current v3)" } },
    }));
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    await pipeline.flush();
    expect(pipeline.state().status).toBe("conflict");
    pipeline.acceptVersion(9);
    expect(pipeline.state().version).toBe(9);
    expect(pipeline.state().status).toBe("conflict");
  });

  it("keeps the batch and reports an error when the server fails", async () => {
    const { store, pipeline } = harness(() => ({
      status: 500,
      body: { error: { message: "Boom" } },
    }));
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    await pipeline.flush();
    expect(pipeline.state().status).toBe("error");
    expect(pipeline.state().message).toBe("Boom");
    expect(pipeline.state().pending).toBe(1);
  });
});

describe("patch translation (ticket 11)", () => {
  it("maps the hidden-device field onto the dedicated op", () => {
    const set = patchesToPending([
      {
        patch: "setNodeFields",
        id: "head000001",
        fields: { hiddenDevices: ["mobile"] },
      },
    ]);
    expect(set.pending).toEqual([
      {
        kind: "page",
        mutation: { op: "setNodeHiddenDevices", id: "head000001", devices: ["mobile"] },
      },
    ]);

    // `null` clears the list; the op carries the empty array.
    const cleared = patchesToPending([
      { patch: "setNodeFields", id: "head000001", fields: { hiddenDevices: null } },
    ]);
    expect(cleared.pending).toEqual([
      {
        kind: "page",
        mutation: { op: "setNodeHiddenDevices", id: "head000001", devices: [] },
      },
    ]);
  });
});
