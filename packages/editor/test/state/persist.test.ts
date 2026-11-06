import { describe, expect, it, vi } from "vitest";
import {
  conflictDialogModel,
  createComponent,
  createSavePipeline,
  EditorStore,
  patchesToPending,
  setComponentOverride,
  type SaveRequest,
  type SaveResponse,
  type SaveState,
} from "@senify/editor/state";
import type { Author } from "@senify/section-sdk";
import { createScopedRule } from "@senify/widget-engine";
import { baseStore } from "./fixtures.ts";

const AUTHOR: Author = { kind: "human", id: "tester", label: "Tester" };

// The script answers a request. It may return a promise: a test that needs a
// request to hang (a change that arrives while the request is in flight) hands
// in a gate it opens itself. It may also throw - the transport contract
// allows a rejection.
type Scripted = (request: SaveRequest) => SaveResponse | undefined | Promise<SaveResponse | undefined>;

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
      const answer = await script(request);
      return answer ?? { status: 200, body: { newDraftVersion: 2 } };
    },
    debounceMs: 5,
  });
  return { store, pipeline, requests };
}

const rule = (id: string, name: string, styles: import("@senify/widget-engine").DeviceValueMap = {}) => ({
  id,
  name,
  kind: "class" as const,
  selector: `.${name}`,
  order: 0,
  styles,
  contextStyles: {},
});

describe("save pipeline", () => {
  it("rejects a mixed batch containing global deletion before changing the document", () => {
    const store = baseStore();
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta") });
    expect(() => store.applyBatch([
      { op: "deleteStyleRule", id: "r-cta" },
      { op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 },
    ])).toThrow(/eigenen Schritt/);
    expect(store.document.styleRules.some((entry) => entry.id === "r-cta")).toBe(true);
  });

  it("orders a quick undo after the deletion has its receipt", async () => {
    const store = baseStore();
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta") });
    const requests: SaveRequest[] = [];
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR, styleRegistryVersion: 1, themeVersion: 4,
      request: async (request) => {
        requests.push(request);
        if (request.path.endsWith("/delete-globally")) return { status: 200, body: { version: 2, pageDraftVersion: 2, receiptId: (request.body as { receiptId: string }).receiptId } };
        return { status: 200, body: { version: 3, pageDraftVersion: 3 } };
      },
    });
    store.apply({ op: "deleteStyleRule", id: "r-cta" });
    store.undo();
    await pipeline.flush();
    expect(requests.map((request) => request.path)).toEqual(["/api/sites/site1/style-rules/r-cta/delete-globally", "/api/sites/site1/style-rules/r-cta/restore-globally"]);
    expect((requests[1]?.body as { receiptId: string }).receiptId).toBe((requests[0]?.body as { receiptId: string }).receiptId);
    expect(requests[1]?.body).toMatchObject({ baseThemeVersion: 4 });
    expect(pipeline.state().status).toBe("saved");
    pipeline.dispose();
  });

  it("retries a global deletion with the same receipt after a lost response", async () => {
    let attempts = 0;
    const { store, pipeline, requests } = harness((request) => {
      if (!request.path.endsWith("/delete-globally")) return { status: 200, body: { version: 1 } };
      attempts += 1;
      return attempts === 1 ? { status: 500, body: {} } : { status: 200, body: { version: 2, pageDraftVersion: 2, receiptId: (request.body as { receiptId: string }).receiptId } };
    });
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta") });
    await pipeline.flush();
    store.apply({ op: "deleteStyleRule", id: "r-cta" });
    await pipeline.flush();
    expect(pipeline.state().status).toBe("error");
    await pipeline.flush();
    expect((requests[1]?.body as { receiptId: string }).receiptId).toBe((requests[2]?.body as { receiptId: string }).receiptId);
    expect(pipeline.state().status).toBe("saved");
    pipeline.dispose();
  });

  it("persists a global deletion and its undo as single site operations", async () => {
    const { store, pipeline, requests } = harness((request) => {
      if (request.path.endsWith("/delete-globally")) return { status: 200, body: { version: 2, pageDraftVersion: 3, receiptId: (request.body as { receiptId: string }).receiptId } };
      if (request.path.endsWith("/restore-globally")) return { status: 200, body: { version: 3, pageDraftVersion: 4 } };
      return { status: 200, body: { version: 1, newDraftVersion: 2 } };
    });
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta") });
    store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" });
    await pipeline.flush();
    store.apply({ op: "deleteStyleRule", id: "r-cta" });
    await pipeline.flush();
    expect(requests[2]?.path).toBe("/api/sites/site1/style-rules/r-cta/delete-globally");
    expect(requests[2]?.body).toMatchObject({ baseVersion: 1, pageContext: { pageId: "page1", baseDraftVersion: 2 } });
    expect(requests).toHaveLength(3);
    store.undo();
    await pipeline.flush();
    expect(requests[3]?.path).toBe("/api/sites/site1/style-rules/r-cta/restore-globally");
    expect(requests[3]?.body).toMatchObject({ receiptId: (requests[2]?.body as { receiptId: string }).receiptId, baseVersion: 2, pageContext: { pageId: "page1", baseDraftVersion: 3 } });
    expect(pipeline.state().version).toBe(4);
    expect(requests).toHaveLength(4);
    pipeline.dispose();
  });

  it("uses the returned page version after removing an unused global class", async () => {
    const { store, pipeline, requests } = harness((request) => {
      if (request.method === "DELETE") return { status: 200, body: { version: 2, pageDraftVersion: 3 } };
      return { status: 200, body: { version: 1, newDraftVersion: 2 } };
    });
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta") });
    store.undo();
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    await pipeline.flush();
    expect(requests[1]?.body).toMatchObject({ pageContext: { pageId: "page1", baseDraftVersion: 1 } });
    expect(requests[2]?.body).toMatchObject({ baseDraftVersion: 3 });
    expect(pipeline.state().status).toBe("saved");
    pipeline.dispose();
  });

  it("explains a rejected class name in the conflict dialog", async () => {
    const { store, pipeline } = harness(() => ({ status: 409, body: { error: { field: "name", message: "Der Name wird bereits verwendet." } } }));
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta") });
    await pipeline.flush();
    expect(conflictDialogModel(pipeline.state())?.hint).toContain("Der Name wird bereits verwendet.");
    pipeline.dispose();
  });

  it("tracks the page version returned by a global class rename", async () => {
    const { store, pipeline, requests } = harness((request) => {
      if (request.method === "PATCH") return { status: 200, body: { version: 2, pageDraftVersion: 3 } };
      return { status: 200, body: { version: 1, newDraftVersion: 2 } };
    });
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta") });
    store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" });
    store.apply({ op: "renameStyleRule", id: "r-cta", name: "neu" });
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    await pipeline.flush();
    expect(requests[2]?.body).toMatchObject({ name: "neu", baseVersion: 1, pageContext: { pageId: "page1", baseDraftVersion: 2 } });
    expect(requests[3]?.body).toMatchObject({ baseDraftVersion: 3 });
    expect(pipeline.state().status).toBe("saved");
    pipeline.dispose();
  });

  it("pauses a page write when the class registry changed", async () => {
    const store = baseStore();
    const requests: SaveRequest[] = [];
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR, styleRegistryVersion: 3,
      request: async (request) => {
        requests.push(request);
        return { status: 409, body: { error: { field: "baseStyleRegistryVersion" } } };
      },
    });
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    await pipeline.flush();
    expect(requests[0]?.body).toMatchObject({ baseDraftVersion: 1, baseStyleRegistryVersion: 3 });
    expect(pipeline.state().conflict?.scope).toBe("style");
    expect(pipeline.state().pending).toBe(1);
    expect(conflictDialogModel(pipeline.state())?.retryAllowed).toBe(false);
    await pipeline.retry(2);
    expect(requests).toHaveLength(1);
    pipeline.dispose();
  });

  it("pauses a page write when the theme changed and accepts a refreshed version", async () => {
    const store = baseStore();
    const requests: SaveRequest[] = [];
    let stale = true;
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR, themeVersion: 4,
      request: async (request) => {
        requests.push(request);
        return stale ? { status: 409, body: { error: { field: "baseThemeVersion" } } } : { status: 200, body: { newDraftVersion: 2 } };
      },
    });
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    await pipeline.flush();
    expect(requests[0]?.body).toMatchObject({ baseThemeVersion: 4 });
    expect(pipeline.state().conflict?.scope).toBe("theme");
    expect(conflictDialogModel(pipeline.state())?.retryAllowed).toBe(false);
    await pipeline.retry(2);
    expect(requests).toHaveLength(1);
    pipeline.discardPending();
    pipeline.acceptThemeVersion(5);
    stale = false;
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 32 });
    await pipeline.flush();
    expect(requests[1]?.body).toMatchObject({ baseThemeVersion: 5 });
    expect(pipeline.state().status).toBe("saved");
    pipeline.dispose();
  });

  it("does not rebase pending page edits when a newer theme is loaded", async () => {
    const store = baseStore();
    const requests: SaveRequest[] = [];
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR, themeVersion: 4,
      request: async (request) => { requests.push(request); return { status: 409, body: { error: { field: "baseThemeVersion" } } }; },
    });
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    pipeline.acceptThemeVersion(5);
    await pipeline.flush();
    expect(requests[0]?.body).toMatchObject({ baseThemeVersion: 4 });
    expect(pipeline.state().conflict?.scope).toBe("theme");
    pipeline.dispose();
  });

  it("adopts external versions only while the original editor state is clean", async () => {
    const store = baseStore();
    const requests: SaveRequest[] = [];
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR, themeVersion: 4,
      request: async (request) => { requests.push(request); return { status: 200, body: { newDraftVersion: 3 } }; },
    });
    expect(pipeline.acceptExternalVersions(1, 4, 2, 5)).toBe(true);
    expect(pipeline.acceptExternalVersions(1, 4, 3, 6)).toBe(false);
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    expect(pipeline.acceptExternalVersions(2, 5, 3, 6)).toBe(false);
    await pipeline.flush();
    expect(requests[0]?.body).toMatchObject({ baseDraftVersion: 2, baseThemeVersion: 5 });
    pipeline.dispose();
  });

  it("clears a save error when failed changes are explicitly discarded", async () => {
    const store = baseStore();
    let fail = true;
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR, themeVersion: 4,
      request: async () => fail ? { status: 500, body: { error: { message: "Nicht gespeichert" } } } : { status: 200, body: { newDraftVersion: 3 } },
    });
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    await pipeline.flush();
    expect(pipeline.state().status).toBe("error");
    expect(pipeline.state().pending).toBeGreaterThan(0);
    pipeline.discardPending();
    store.replaceDocument(baseStore().document);
    expect(pipeline.state().status).toBe("idle");
    expect(pipeline.state().pending).toBe(0);
    expect(pipeline.acceptExternalVersions(1, 4, 2, 5)).toBe(true);
    fail = false;
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 32 });
    await pipeline.flush();
    expect(pipeline.state().status).toBe("saved");
    pipeline.dispose();
  });

  it("does not adopt external versions over unsupported local changes", () => {
    const store = baseStore();
    const listener = vi.spyOn(store, "setActionListener");
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR, themeVersion: 4,
      request: async () => ({ status: 200, body: {} }),
    });
    const action = listener.mock.calls[0]?.[0];
    expect(action).toBeDefined();
    action?.({ type: "apply", mutation: { op: "futureOperation" }, entry: {} } as unknown as Parameters<NonNullable<typeof action>>[0]);
    expect(pipeline.state().unsupported).toEqual(["futureOperation"]);
    pipeline.acceptThemeVersion(5);
    expect(pipeline.acceptExternalVersions(1, 4, 2, 5)).toBe(false);
    pipeline.discardPending();
    expect(pipeline.state().unsupported).toEqual([]);
    expect(pipeline.acceptExternalVersions(1, 4, 2, 5)).toBe(true);
    pipeline.dispose();
  });

  it("persists directly requested breakpoint visibility changes", async () => {
    const { store, pipeline, requests } = harness();
    store.apply({ op: "setNodeHiddenDevices", id: "head000001", devices: ["mobile"] });
    await pipeline.flush();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body).toMatchObject({ mutations: [{ op: "setNodeHiddenDevices", id: "head000001", devices: ["mobile"] }] });
    expect(pipeline.state().unsupported).toEqual([]);
    pipeline.dispose();
  });

  it("treats a class write with a stale theme as a theme conflict", async () => {
    const store = baseStore();
    const requests: SaveRequest[] = [];
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR, themeVersion: 4,
      request: async (request) => { requests.push(request); return { status: 409, body: { error: { field: "baseThemeVersion" } } }; },
    });
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta", { color: { $token: "color.accent" } }) });
    await pipeline.flush();
    expect(requests[0]?.body).toMatchObject({ baseThemeVersion: 4 });
    expect(pipeline.state().conflict?.scope).toBe("theme");
    expect(conflictDialogModel(pipeline.state())?.retryAllowed).toBe(false);
    pipeline.dispose();
  });

  it("does not rebase later edits while an older page request is in flight", async () => {
    const store = baseStore();
    const requests: SaveRequest[] = [];
    let release: (() => void) | undefined;
    const first = new Promise<void>((resolve) => { release = resolve; });
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR, themeVersion: 4, debounceMs: 5,
      request: async (request) => {
        requests.push(request);
        if (requests.length === 1) { await first; return { status: 200, body: { newDraftVersion: 2 } }; }
        return { status: 409, body: { error: { field: "baseThemeVersion" } } };
      },
    });
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    const saving = pipeline.flush();
    pipeline.acceptThemeVersion(5);
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 32 });
    release?.();
    await saving;
    await vi.waitFor(() => expect(pipeline.state().status).toBe("conflict"));
    expect(requests[1]?.body).toMatchObject({ baseThemeVersion: 4 });
    pipeline.dispose();
  });

  it("keeps class conflicts paused until the current registry is loaded", async () => {
    let conflict = true;
    const { store, pipeline, requests } = harness(() => conflict ? { status: 409, body: {} } : { status: 200, body: {} });
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta", { color: "#123456" }) });
    await pipeline.flush();
    expect(pipeline.state().conflict?.scope).toBe("style");
    expect(conflictDialogModel(pipeline.state())?.retryAllowed).toBe(false);
    await pipeline.retry(10);
    expect(requests).toHaveLength(1);
    pipeline.discardPending();
    pipeline.acceptStyleRegistry(7, ["r-cta"]);
    conflict = false;
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta", { color: "#abcdef" }) });
    await pipeline.flush();
    expect(requests[1]?.method).toBe("PATCH");
    expect(requests[1]?.body).toMatchObject({ baseVersion: 7 });
    pipeline.dispose();
  });

  it("creates a class before saving its assignment and keeps unsent changes on failure", async () => {
    let failCreate = true;
    const { store, pipeline, requests } = harness((request) => {
      if (request.path.endsWith("/style-rules") && failCreate) return { status: 500, body: {} };
      return { status: 200, body: { newDraftVersion: 2, version: 1 } };
    });
    store.applyBatch([
      { op: "upsertStyleRule", rule: rule("new-class", "cta") },
      { op: "assignClass", id: "btn0000001", classId: "cta" },
    ]);
    await pipeline.flush();
    expect(requests.map((request) => request.path)).toEqual(["/api/sites/site1/style-rules"]);
    expect(pipeline.state().pending).toBe(2);
    failCreate = false;
    await pipeline.flush();
    expect(requests.map((request) => request.path)).toEqual([
      "/api/sites/site1/style-rules", "/api/sites/site1/style-rules", "/api/pages/page1/editor-mutations",
    ]);
    expect(pipeline.state().status).toBe("saved");
    pipeline.dispose();
  });

  it("saves changes made while an earlier request is still in flight", async () => {
    const store = baseStore();
    const requests: SaveRequest[] = [];
    let release: (() => void) | undefined;
    const first = new Promise<void>((resolve) => { release = resolve; });
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR, debounceMs: 5,
      request: async (request) => {
        requests.push(request);
        if (requests.length === 1) await first;
        return { status: 200, body: { newDraftVersion: requests.length + 1 } };
      },
    });
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    const initialSave = pipeline.flush();
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 32 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    release?.();
    await initialSave;
    await vi.waitFor(() => expect(pipeline.state().status).toBe("saved"));
    expect(requests).toHaveLength(2);
    expect(pipeline.state().pending).toBe(0);
    pipeline.dispose();
  });

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
      "POST /api/sites/site1/style-rules/r-cta/delete-globally",
    ]);
    // The create body drops the document's own ordering; the route owns it.
    const createBody = requests[0]?.body as Record<string, unknown>;
    expect(createBody["id"]).toBe("r-cta");
    expect(createBody["order"]).toBeUndefined();
    expect(createBody["styles"]).toEqual({ color: "#fff" });
  });

  it("übernimmt nach einem Reorder die vom Server normalisierte Reihenfolge in die lokale Teilmenge", async () => {
    const store = new EditorStore({
      document: {
        version: 2,
        rootNodeId: "root",
        nodes: { root: { id: "root", primitive: "root", props: {} } },
        styleRules: [
          { ...rule("r-cta", "cta", { color: "#fff" }), order: 4 },
          { ...rule("r-second", "second", { color: "#f00" }), order: 5 },
        ],
      },
    });
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR,
      knownRuleIds: ["r-cta", "r-second"], styleRegistryVersion: 1,
      request: async (request) => request.path.endsWith("/reorder")
        ? { status: 200, body: { rules: [
          { ...rule("r-hidden", "hidden"), order: 0 },
          { ...rule("r-second", "second", { color: "#f00" }), order: 1 },
          { ...rule("r-cta", "cta", { color: "#fff" }), order: 2 },
        ], version: 2 } }
        : { status: 200, body: {} },
    });
    store.apply({ op: "reorderStyleRule", id: "r-cta", index: 1 });
    await pipeline.flush();
    // The registry is site-wide: the hidden scoped rule occupies order 0, so
    // this page's subset must keep 1 and 2, not a compacted 0 and 1.
    expect(store.document.styleRules.map((entry) => [entry.id, entry.order])).toEqual(
      [["r-second", 1], ["r-cta", 2]],
    );
    expect(store.document.styleRules.map((entry) => entry.styles)).toEqual([
      { color: "#f00" },
      { color: "#fff" },
    ]);
  });

  it("verschiebt nach dem Löschen einer Regel die Order der nachfolgenden Regeln", async () => {
    const store = new EditorStore({
      document: {
        version: 2,
        rootNodeId: "root",
        nodes: { root: { id: "root", primitive: "root", props: {} } },
        styleRules: [
          { ...rule("r-a", "a"), order: 0 },
          { ...rule("r-b", "b"), order: 1 },
          { ...rule("r-c", "c"), order: 2 },
        ],
      },
    });
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR,
      knownRuleIds: ["r-a", "r-b", "r-c"], styleRegistryVersion: 1,
      request: async (request) => ({ status: 200, body: { version: 2, pageDraftVersion: 2, receiptId: (request.body as { receiptId: string }).receiptId } }),
    });
    store.apply({ op: "deleteStyleRule", id: "r-b" });
    await pipeline.flush();
    expect(store.document.styleRules.map((entry) => [entry.id, entry.order])).toEqual([
      ["r-a", 0],
      ["r-c", 1],
    ]);
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
    expect(patchBody).toMatchObject({
      replaceStyleValues: true,
      stylePriorities: null,
      statePriorities: null,
      contextStylePriorities: null,
    });
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

  it("updates rules loaded in the document without requiring a separate ID list", async () => {
    const store = baseStore();
    store.apply({ op: "upsertStyleRule", rule: rule("existing", "cta") });
    const requests: SaveRequest[] = [];
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR,
      request: async (request) => { requests.push(request); return { status: 200, body: {} }; },
    });
    store.apply({ op: "upsertStyleRule", rule: rule("existing", "cta", { color: "#123456" }) });
    await pipeline.flush();
    expect(requests.map((request) => [request.method, request.path])).toEqual([["PATCH", "/api/sites/site1/style-rules/existing"]]);
    pipeline.dispose();
  });

  it("creates a scoped rule again when deletion is undone", async () => {
    const store = baseStore();
    store.apply({ op: "upsertStyleRule", rule: createScopedRule({ id: "existing", nodeId: "head000001" }) });
    const requests: SaveRequest[] = [];
    const pipeline = createSavePipeline({
      store, pageId: "page1", siteId: "site1", author: AUTHOR,
      request: async (request) => { requests.push(request); return { status: 200, body: {} }; },
    });
    store.apply({ op: "deleteStyleRule", id: "existing" });
    await pipeline.flush();
    store.undo();
    await pipeline.flush();
    expect(requests.map((request) => request.method)).toEqual(["DELETE", "POST"]);
    pipeline.dispose();
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

  it("persists a section variant switch as a setNodeMeta mutation", async () => {
    const { store, pipeline, requests } = harness();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "hero", id: "hero000001", props: { headline: "Hallo" } },
    });
    await pipeline.flush();
    requests.length = 0;

    store.apply({ op: "setNodeMeta", id: "hero000001", meta: { variant: "split" } });
    await pipeline.flush();
    expect(requests).toHaveLength(1);
    const body = requests[0]?.body as { mutations: unknown[] };
    expect(body.mutations).toEqual([
      { op: "setNodeMeta", id: "hero000001", meta: { variant: "split" } },
    ]);

    // Undo goes back to the section default as `null`.
    requests.length = 0;
    store.undo();
    await pipeline.flush();
    expect((requests[0]?.body as { mutations: unknown[] }).mutations).toEqual([
      { op: "setNodeMeta", id: "hero000001", meta: { variant: null } },
    ]);
    expect(pipeline.state().unsupported).toEqual([]);
  });

  it("persists a motion spec as setMotion and its clear as clearMotion", async () => {    const { store, pipeline, requests } = harness();
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

  // Ticket 04: an instance override is an ordinary prop write on the instance
  // node — the engine validates it against the structural definition and the
  // bridge maps it onto `updateNodeProps`.
  it("persists an instance override as a setNodeProp bag", async () => {
    const { store, pipeline, requests } = harness();
    createComponent(store, "head000001", "karte");
    await pipeline.flush();
    requests.length = 0;
    const instanceId = store.document.nodes["sec0000001"]?.children?.[0] ?? "";
    setComponentOverride(store, instanceId, "head000001", "text", "Eigene Karte");
    await pipeline.flush();
    expect(requests).toHaveLength(1);
    const body = requests[0]?.body as { mutations: unknown[] };
    expect(body.mutations).toEqual([
      {
        op: "setNodeProp",
        id: instanceId,
        key: "overrides",
        value: { head000001: { text: "Eigene Karte" } },
      },
    ]);
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
    // The dialog model carries both sides (L17).
    expect(conflictState.conflict).toEqual({
      expectedVersion: 1,
      serverVersion: 4,
      scope: "page",
    });
    const dialog = conflictDialogModel(conflictState);
    expect(dialog?.serverVersion).toBe(4);
    expect(dialog?.expectedVersion).toBe(1);
    expect(dialog?.pending).toBe(1);
    expect(dialog?.retryLabel).toContain("1");
    expect(dialog?.reloadLabel).toContain("verwerfen");
    expect(conflictDialogModel({ ...conflictState, status: "saved" })).toBeNull();

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

  it("discards the pending batch when the server is loaded (L17)", async () => {
    const { store, pipeline, requests } = harness(() => ({
      status: 409,
      body: { error: { message: "Draft has changed (expected v1, current v4)" } },
    }));
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    await pipeline.flush();
    expect(pipeline.state().status).toBe("conflict");
    pipeline.acceptVersion(4);
    pipeline.discardPending();
    const state = pipeline.state();
    expect(state.pending).toBe(0);
    expect(state.status).toBe("idle");
    expect(state.conflict).toBeUndefined();
    // Nothing is resent by a later flush.
    await pipeline.flush();
    expect(requests).toHaveLength(1);
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

describe("the pipeline does not lose a change", () => {
  // A gate the test opens itself: the request stays in flight until then, so
  // a change can be made while it runs.
  function gate(): { promise: Promise<SaveResponse>; open: (response: SaveResponse) => void } {
    let open!: (response: SaveResponse) => void;
    const promise = new Promise<SaveResponse>((resolve) => {
      open = resolve;
    });
    return { promise, open };
  }

  it("keeps a change that arrives while a failing request is in flight", async () => {
    const held = gate();
    const { store, pipeline } = harness(() => held.promise);
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    const flushed = pipeline.flush();
    store.apply({ op: "setNodeProp", id: "head000001", key: "color", value: "#123456" });
    held.open({ status: 500, body: { error: { message: "Boom" } } });
    await flushed;

    // Both the batch that failed and the change that arrived meanwhile are
    // still queued. Before the fix the second one was overwritten.
    expect(pipeline.state().pending).toBe(2);
    expect(pipeline.state().status).toBe("error");
  });

  it("keeps a change that arrives while a conflicting request is in flight", async () => {
    const held = gate();
    const { store, pipeline } = harness(() => held.promise);
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    const flushed = pipeline.flush();
    store.apply({ op: "setNodeProp", id: "head000001", key: "color", value: "#123456" });
    held.open({
      status: 409,
      body: { error: { message: "Draft has changed (expected v1, current v4)" } },
    });
    await flushed;

    expect(pipeline.state().pending).toBe(2);
    expect(pipeline.state().status).toBe("conflict");
  });

  it("saves a change that arrived during the request without another user action", async () => {
    const held = gate();
    const { store, pipeline, requests } = harness(() => held.promise);
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    const flushed = pipeline.flush();
    store.apply({ op: "setNodeProp", id: "head000001", key: "color", value: "#123456" });

    // The debounce elapses while the request is still in flight. Its timer
    // fires, `flush()` returns because a request is running, and the timer is
    // consumed: the change waits for a timer that nobody sets again.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(requests).toHaveLength(1);
    expect(pipeline.state().pending).toBe(1);

    held.open({ status: 200, body: { newDraftVersion: 3 } });
    await flushed;

    // The autosave promise holds: the change gets a timer of its own.
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(requests).toHaveLength(2);
    expect(pipeline.state().status).toBe("saved");
    expect(pipeline.state().pending).toBe(0);
    const body = requests[1]?.body as { mutations: { op: string; key: string }[] };
    expect(body.mutations[0]?.key).toBe("color");
  });

  it("keeps the batch and recovers when the transport rejects", async () => {
    let attempt = 0;
    const { store, pipeline, requests } = harness(() => {
      attempt += 1;
      if (attempt === 1) throw new Error("network down");
      return { status: 200, body: { newDraftVersion: 5 } };
    });
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    await pipeline.flush();
    expect(pipeline.state().status).toBe("error");
    expect(pipeline.state().message).toBe("network down");
    expect(pipeline.state().pending).toBe(1);

    // The pipeline is not stuck: a rejecting transport used to leave it on
    // "saving" forever, and every later flush returned without sending.
    await pipeline.flush();
    expect(requests).toHaveLength(2);
    expect(pipeline.state().status).toBe("saved");
    expect(pipeline.state().pending).toBe(0);
  });

  it("does not queue the saved page batch again when a registry write fails", async () => {
    // The page batch went out; the registry write did not. Only the registry
    // write belongs back into the queue - the page batch would be written a
    // second time, and an insert would insert twice.
    const { store, pipeline, requests } = harness((request) => {
      if (request.path.includes("/style-rules")) throw new Error("registry down");
      return { status: 200, body: { newDraftVersion: 3 } };
    });
    store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta", { color: "#fff" }) });
    await pipeline.flush();

    expect(pipeline.state().status).toBe("error");
    expect(pipeline.state().message).toBe("registry down");
    // The page mutation is saved, the registry op is queued: one, not two.
    expect(pipeline.state().pending).toBe(1);
    expect(requests).toHaveLength(2);
  });
});

describe("the style registry conflict has a working retry", () => {
  it("resends against the registry version the server reported", async () => {
    let conflict = true;
    const { store, pipeline, requests } = harness((request) => {
      if (!request.path.includes("/style-rules")) return undefined;
      if (conflict) {
        conflict = false;
        return {
          status: 409,
          body: {
            error: {
              message: "Die Style-Registry wurde zwischenzeitlich geändert",
              currentVersion: 7,
            },
          },
        };
      }
      return { status: 200, body: { version: 8 } };
    });
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta", { color: "#fff" }) });
    await pipeline.flush();

    const state = pipeline.state();
    expect(state.status).toBe("conflict");
    expect(state.pending).toBe(1);
    // The registry has its own lock; the dialog has to name it.
    expect(state.conflict).toEqual({
      expectedVersion: 0,
      serverVersion: 7,
      scope: "registry",
    });
    const dialog = conflictDialogModel(state);
    expect(dialog?.title).toContain("Style-Registry");
    expect(dialog?.serverVersion).toBe(7);

    // The retry sends the registry version, not the page version: the page
    // version says nothing about the registry lock.
    await pipeline.retry();
    expect(pipeline.state().status).toBe("saved");
    const body = requests[1]?.body as { baseVersion: number };
    expect(body.baseVersion).toBe(7);
    expect(pipeline.state().styleRegistryVersion).toBe(8);
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
