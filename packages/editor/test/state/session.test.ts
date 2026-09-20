import { describe, expect, it } from "vitest";
import {
  createEditorSession,
  DEFAULT_UI_STATE,
  loadUiState,
  parseUiState,
  saveUiState,
  uiStateKey,
  type SaveRequest,
  type SaveResponse,
  type SessionStorage,
} from "@senify/editor/state";
import type { Author } from "@senify/section-sdk";
import { baseStore, emptyV2Document } from "./fixtures.ts";

// E5, slice 1: one session core behind canvas and inspector. The document and
// selection live in the store, the server version and pending queue in the save
// pipeline, the view state (device, tab, zoom, selection) in `ui-state.ts`.
// These tests pin the composition, the one subscription and the persistence.

const AUTHOR: Author = { kind: "human", id: "tester", label: "Tester" };

function memoryStorage(seed: Record<string, string> = {}): SessionStorage & {
  entries: Record<string, string>;
} {
  const entries: Record<string, string> = { ...seed };
  return {
    entries,
    get: (key) => entries[key] ?? null,
    set: (key, value) => {
      entries[key] = value;
    },
  };
}

function harness(options: { storage?: SessionStorage; script?: (request: SaveRequest) => SaveResponse } = {}) {
  const store = baseStore();
  const requests: SaveRequest[] = [];
  const session = createEditorSession({
    document: store.document,
    pageId: "page1",
    siteId: "site1",
    author: AUTHOR,
    request: async (request) => {
      requests.push(request);
      return options.script?.(request) ?? { status: 200, body: { newDraftVersion: 2 } };
    },
    initialVersion: 1,
    debounceMs: 5,
    ...(options.storage === undefined ? {} : { storage: options.storage }),
  });
  return { session, requests };
}

describe("editor session", () => {
  it("bundles document, selection, history and save state in one object", async () => {
    const { session, requests } = harness();
    expect(session.version).toBe(1);
    expect(session.saveState().pending).toBe(0);

    const outcome = session.apply({
      op: "setNodeProp",
      id: "head000001",
      key: "fontSize",
      value: 30,
    });
    expect(outcome.changed).toBe(true);
    expect(session.document.nodes["head000001"]?.props["fontSize"]).toBe(30);
    expect(session.canUndo).toBe(true);
    expect(session.saveState().pending).toBe(1);

    await session.flush();
    expect(requests).toHaveLength(1);
    expect(session.version).toBe(2);
    expect(session.saveState().status).toBe("saved");
    expect(session.saveState().pending).toBe(0);

    expect(session.undo()).toBe(true);
    expect(session.document.nodes["head000001"]?.props["fontSize"]).toBe(24);
  });

  it("notifies once per change through the session subscription", () => {
    const { session } = harness();
    let events = 0;
    const unsubscribe = session.subscribe(() => {
      events += 1;
    });
    session.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
    expect(events).toBeGreaterThan(0);
    const seen = events;
    session.patchUi({ tab: "style" });
    expect(events).toBeGreaterThan(seen);
    unsubscribe();
    const before = events;
    session.patchUi({ device: "tablet" });
    expect(events).toBe(before);
  });

  it("persists the view state and restores it for the next session", () => {
    const storage = memoryStorage();
    const { session } = harness({ storage });
    session.setDevice("mobile");
    session.setTab("style");
    session.setZoom(0.8);
    session.select("head000001");

    const stored = storage.entries[uiStateKey("page1")] ?? "";
    expect(stored).toContain('"device":"mobile"');
    expect(stored).toContain('"tab":"style"');

    const { session: restored } = harness({ storage });
    expect(restored.ui()).toEqual({
      device: "mobile",
      tab: "style",
      zoom: 0.8,
      selectedId: "head000001",
    });
  });

  it("drops a stale selection when the document is replaced", () => {
    const storage = memoryStorage();
    const { session } = harness({ storage });
    session.select("head000001");
    expect(session.ui().selectedId).toBe("head000001");
    session.replaceDocument(emptyV2Document(), 9);
    expect(session.ui().selectedId).toBeNull();
    expect(session.version).toBe(9);
    expect(session.saveState().status).toBe("idle");
  });

  it("keeps the selection when the replaced document still has the node", () => {
    const { session } = harness();
    session.select("head000001");
    const fresh = baseStore();
    session.replaceDocument(fresh.document, 3);
    expect(session.ui().selectedId).toBe("head000001");
  });
});

describe("ui state persistence", () => {
  it("falls back to the defaults for missing or corrupt entries", () => {
    expect(parseUiState(null)).toEqual(DEFAULT_UI_STATE);
    expect(parseUiState({ device: "watch", tab: "nope", zoom: -1 })).toEqual({
      ...DEFAULT_UI_STATE,
    });
    const storage = memoryStorage({ [uiStateKey("page1")]: "{not json" });
    expect(loadUiState(storage, "page1")).toEqual(DEFAULT_UI_STATE);
    expect(loadUiState(undefined, "page1")).toEqual(DEFAULT_UI_STATE);
  });

  it("round-trips a stored state", () => {
    const storage = memoryStorage();
    const state = { device: "tablet" as const, tab: "advanced" as const, zoom: 1.25, selectedId: "n1" };
    saveUiState(storage, "page1", state);
    expect(loadUiState(storage, "page1")).toEqual(state);
  });
});
