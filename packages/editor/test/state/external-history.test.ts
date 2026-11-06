import { describe, expect, it } from "vitest";
import { createEditorSession, type ExternalHistoryResult, type SaveRequest } from "@senify/editor/state";
import { baseStore, classRule } from "./fixtures.ts";

function harness() {
  const requests: SaveRequest[] = [];
  let version = 1;
  const session = createEditorSession({
    document: baseStore().document,
    pageId: "page1", siteId: "site1",
    author: { kind: "human", id: "tester", label: "Tester" },
    initialVersion: 1, themeVersion: 1, styleRegistryVersion: 1,
    debounceMs: 100000,
    request: async (request) => {
      requests.push(request);
      version += 1;
      return { status: 200, body: { newDraftVersion: version } };
    },
  });
  const marker = session.beginExternalAction({ label: "Token löschen", versionBefore: 1, versionAfter: 2 });
  session.commitExternalAction(marker.id);
  return { session, marker, requests };
}

describe("serverbestätigte externe History", () => {
  it("verschiebt den Cursor erst nach Bestätigung und sendet keine zusätzlichen Page-Writes", async () => {
    const { session, marker, requests } = harness();
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const calls: string[] = [];
    session.registerExternalHistory(marker.id, async ({ direction, versions }) => {
      calls.push(direction);
      await delayed;
      return { status: "committed", pageVersion: versions.pageVersion + 1, themeVersion: versions.themeVersion! + 1 };
    });
    try {
      const document = session.document;
      const seen: number[] = [];
      session.subscribe(() => {
        if (session.pendingExternalId === null) seen.push(session.store.history.applied().length);
      });
      expect(session.canUndoAsync).toBe(true);
      const navigation = session.undoAsync();
      expect(session.store.history.top()?.id).toBe(marker.id);
      expect(session.version).toBe(1);
      expect(session.canUndoAsync).toBe(false);
      expect(await session.redoAsync()).toBe(false);
      release();
      expect(await navigation).toBe(true);
      expect(session.store.history.applied()).toHaveLength(0);
      expect(session.store.history.future()[0]?.id).toBe(marker.id);
      expect(session.document).toBe(document);
      expect(session.version).toBe(2);
      expect(seen).toEqual([0]);
      expect(await session.redoAsync()).toBe(true);
      expect(session.store.history.top()?.id).toBe(marker.id);
      expect(session.version).toBe(3);
      expect(calls).toEqual(["undo", "redo"]);
      expect(requests).toEqual([]);
    } finally { release(); session.dispose(); }
  });

  it("gibt eine eindeutige Erst-Ablehnung frei, aber nicht einen Konflikt nach Unknown", async () => {
    const { session, marker } = harness();
    const calls: boolean[] = [];
    session.registerExternalHistory(marker.id, async ({ uncertain, versions }) => {
      calls.push(uncertain);
      if (calls.length === 1) return { status: "rejected", message: "Versionskonflikt" };
      if (calls.length === 2) throw new Error("Antwort verloren");
      if (calls.length === 3) return { status: "rejected", message: "Retry-Konflikt" };
      return { status: "committed", pageVersion: versions.pageVersion + 1, themeVersion: versions.themeVersion! + 1 };
    });
    try {
      expect(await session.undoAsync()).toBe(false);
      expect(session.pendingExternalId).toBeNull();
      expect(session.store.history.top()?.id).toBe(marker.id);
      expect(await session.undoAsync()).toBe(false);
      const pending = session.pendingExternalId;
      expect(pending).not.toBeNull();
      expect(session.externalHistoryState()).toMatchObject({ status: "unresolved", message: "Antwort verloren" });
      expect(await session.retryExternalHistory()).toBe(false);
      expect(session.pendingExternalId).toBe(pending);
      expect(session.store.history.top()?.id).toBe(marker.id);
      expect(await session.retryExternalHistory()).toBe(true);
      expect(session.pendingExternalId).toBeNull();
      expect(session.store.history.applied()).toHaveLength(0);
      expect(calls).toEqual([false, false, true, true]);
    } finally { session.dispose(); }
  });

  it("erhält neue lokale Eingaben statt einen inzwischen unpassenden Serverstand zu übernehmen", async () => {
    const { session, marker } = harness();
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const serverDocument = baseStore().document;
    session.registerExternalHistory(marker.id, async ({ versions }) => {
      await delayed;
      return { status: "committed", document: serverDocument, pageVersion: versions.pageVersion + 1, themeVersion: versions.themeVersion! + 1 };
    });
    try {
      const navigation = session.undoAsync();
      session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neue Eingabe" });
      const localDocument = session.document;
      release();
      expect(await navigation).toBe(false);
      expect(session.document).toBe(localDocument);
      expect(session.document.nodes["head000001"]?.props["text"]).toBe("Neue Eingabe");
      expect(session.store.history.applied()).toHaveLength(2);
      expect(session.version).toBe(1);
      expect(session.pendingExternalId).not.toBeNull();
      expect(session.externalHistoryState().status).toBe("unresolved");
    } finally { release(); session.dispose(); }
  });

  it("verweigert eine unvollständige Bestätigung und behält die Lease nach Dokumentwechsel", async () => {
    const { session, marker } = harness();
    session.registerExternalHistory(marker.id, async () => ({ status: "committed", pageVersion: 1, themeVersion: 2 }));
    try {
      expect(await session.undoAsync()).toBe(false);
      const pending = session.pendingExternalId;
      expect(pending).not.toBeNull();
      expect(session.version).toBe(1);
      expect(session.store.history.top()?.id).toBe(marker.id);
      session.replaceDocument(baseStore().document, 5, 4);
      expect(session.pendingExternalId).toBe(pending);
      expect(await session.retryExternalHistory()).toBe(false);
      expect(session.version).toBe(5);
    } finally { session.dispose(); }
  });

  it("startet ohne Runner oder bei offenen Pipeline-Writes keinen externen Write", async () => {
    const { session, marker } = harness();
    let calls = 0;
    try {
      expect(session.canUndoAsync).toBe(false);
      expect(await session.undoAsync()).toBe(false);
      session.registerExternalHistory(marker.id, async ({ versions }) => {
        calls += 1;
        return { status: "committed", pageVersion: versions.pageVersion + 1, themeVersion: versions.themeVersion! + 1 };
      });
      session.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
      expect(await session.undoAsync()).toBe(true);
      expect(await session.undoAsync()).toBe(false);
      expect(calls).toBe(0);
      expect(session.store.history.top()?.id).toBe(marker.id);
      await session.flush();
      expect(await session.undoAsync()).toBe(true);
      expect(calls).toBe(1);
    } finally { session.dispose(); }
  });

  it("übernimmt nach Dispose keinen verspäteten Serverstand", async () => {
    const { session, marker } = harness();
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    session.registerExternalHistory(marker.id, async ({ versions }) => {
      await delayed;
      return { status: "committed", pageVersion: versions.pageVersion + 1, themeVersion: versions.themeVersion! + 1 };
    });
    const navigation = session.undoAsync();
    session.dispose();
    release();
    expect(await navigation).toBe(false);
    expect(session.version).toBe(1);
    expect(session.store.history.top()?.id).toBe(marker.id);
  });

  it("zeigt auch direkten Pipeline-Beobachtern Cursor und Versionen zusammen", async () => {
    const { session, marker } = harness();
    const server = baseStore();
    server.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Serverstand" });
    const seen: number[] = [];
    session.registerExternalHistory(marker.id, async () => ({ status: "committed", pageVersion: 2, themeVersion: 2, document: server.document }));
    session.pipeline.subscribe(() => {
      if (session.version !== 2) return;
      seen.push(session.store.history.applied().length);
      if (seen.length === 1) session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Beobachter-Eingabe" });
    });
    try {
      expect(await session.undoAsync()).toBe(true);
      expect(seen[0]).toBe(0);
      expect(session.document.nodes["head000001"]?.props["text"]).toBe("Beobachter-Eingabe");
      expect(session.pendingExternalId).toBeNull();
      expect(session.saveState().pending).toBe(1);
    } finally { session.dispose(); }
  });

  it.each([null, { status: "anderer Status" }, { status: "rejected" },
    { status: "committed", pageVersion: 2, themeVersion: 2, document: {} },
    { status: "committed", pageVersion: 2, themeVersion: 2, document: null }])(
    "behandelt eine ungültige Runner-Antwort als Unknown (%j)", async (response) => {
      const { session, marker } = harness();
      let calls = 0;
      session.registerExternalHistory(marker.id, async ({ versions }) => {
        calls += 1;
        return calls === 1 ? JSON.parse(JSON.stringify(response)) : { status: "committed", pageVersion: versions.pageVersion + 1, themeVersion: versions.themeVersion! + 1 };
      });
      try {
        expect(await session.undoAsync()).toBe(false);
        expect(session.externalHistoryState().status).toBe("unresolved");
        expect(session.pendingExternalId).not.toBeNull();
        expect(session.version).toBe(1);
        expect(await session.retryExternalHistory()).toBe(true);
      } finally { session.dispose(); }
    },
  );

  it("startet keinen Runner, wenn ein Start-Beobachter die Lease ausdrücklich auflöst", async () => {
    const { session, marker } = harness();
    let calls = 0;
    session.registerExternalHistory(marker.id, async () => {
      calls += 1;
      return { status: "unknown", message: "Antwort verloren" };
    });
    session.store.subscribe(() => {
      const pending = session.pendingExternalId;
      if (pending !== null) session.failExternalAction(pending);
    });
    try {
      expect(await session.undoAsync()).toBe(false);
      expect(calls).toBe(0);
      expect(session.pendingExternalId).toBeNull();
      expect(session.externalHistoryState().status).toBe("idle");
    } finally { session.dispose(); }
  });

  it("ignoriert eine alte Antwort nach ausdrücklicher Recovery und erhält die neue Lease", async () => {
    const { session, marker } = harness();
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    session.registerExternalHistory(marker.id, async () => {
      calls += 1;
      await delayed;
      return { status: "committed", pageVersion: 2, themeVersion: 2 };
    });
    try {
      const navigation = session.undoAsync();
      session.failExternalAction(session.pendingExternalId!);
      const replacement = session.beginExternalAction({ label: "Neuer Vorgang", versionBefore: 1, versionAfter: 2 });
      release();
      expect(await navigation).toBe(false);
      expect(await session.retryExternalHistory()).toBe(false);
      expect(calls).toBe(1);
      expect(session.pendingExternalId).toBe(replacement.id);
      expect(session.version).toBe(1);
      expect(session.store.history.top()?.id).toBe(marker.id);
    } finally { release(); session.dispose(); }
  });

  it("verweigert Registry-Änderungen ohne vollständigen Versions- und Dokumentbeleg", async () => {
    const { session, marker } = harness();
    const document = baseStore().document;
    document.styleRules.push(classRule("reg0000001", "accent"));
    session.registerExternalHistory(marker.id, async () => ({ status: "committed", document, pageVersion: 2, themeVersion: 2 }));
    try {
      expect(await session.undoAsync()).toBe(false);
      expect(session.pipeline.externalVersions()).toEqual({ pageVersion: 1, themeVersion: 1, registryVersion: 1 });
      expect(session.document.styleRules).toEqual([]);
      expect(session.pendingExternalId).not.toBeNull();
    } finally { session.dispose(); }
  });

  it("übernimmt Registry und bekannte Rule-IDs vor dem nächsten lokalen Write", async () => {
    const { session, marker, requests } = harness();
    const document = baseStore().document;
    const rule = classRule("reg0000001", "accent");
    document.styleRules.push(rule);
    session.registerExternalHistory(marker.id, async () => ({ status: "committed", document, pageVersion: 2, themeVersion: 2, registryVersion: 2 }));
    try {
      expect(await session.undoAsync()).toBe(true);
      expect(session.pipeline.externalVersions()).toEqual({ pageVersion: 2, themeVersion: 2, registryVersion: 2 });
      session.apply({ op: "upsertStyleRule", rule: { ...rule, styles: { color: "red" } } });
      await session.flush();
      expect(requests[0]).toMatchObject({ method: "PATCH", path: "/api/sites/site1/style-rules/reg0000001", body: { baseVersion: 2, baseThemeVersion: 2 } });
    } finally { session.dispose(); }
  });

  it("erhält gemischte lokale Schritte, sperrt externe Sprünge und verwirft nur den Redo-Zweig", async () => {
    const { session, marker } = harness();
    session.registerExternalHistory(marker.id, async ({ versions }) => ({ status: "committed", pageVersion: versions.pageVersion + 1, themeVersion: versions.themeVersion! + 1 }));
    try {
      session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Nach dem Token" });
      const local = session.store.history.top()!;
      await session.flush();
      expect(await session.undoAsync()).toBe(true);
      await session.flush();
      expect(await session.undoAsync()).toBe(true);
      const document = session.document;
      expect(() => session.store.restoreTo(local.id)).toThrow("serverseitig");
      expect(session.document).toBe(document);
      expect(await session.redoAsync()).toBe(true);
      expect(await session.redoAsync()).toBe(true);
      expect(session.document.nodes["head000001"]?.props["text"]).toBe("Nach dem Token");
      expect(await session.undoAsync()).toBe(true);
      session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neuer Zweig" });
      expect(session.store.history.future()).toEqual([]);
      expect(session.store.history.entries().map((entry) => entry.id)).toContain(marker.id);
    } finally { session.dispose(); }
  });

  it("sendet nach einer Eingabe aus der Start-Benachrichtigung noch keinen externen Write", async () => {
    const { session, marker } = harness();
    let calls = 0;
    session.registerExternalHistory(marker.id, async () => { calls += 1; return { status: "unknown", message: "Unklar" }; });
    const unsubscribe = session.subscribe(() => {
      if (session.externalHistoryState().status !== "running") return;
      unsubscribe();
      session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Start-Eingabe" });
    });
    try {
      expect(await session.undoAsync()).toBe(false);
      expect(calls).toBe(0);
      expect(session.pendingExternalId).toBeNull();
      expect(session.document.nodes["head000001"]?.props["text"]).toBe("Start-Eingabe");
      expect(session.externalHistoryState().status).toBe("rejected");
    } finally { unsubscribe(); session.dispose(); }
  });

  it("verwendet bei Retry unverändert Eintrag, Richtung und alle Request-Versionen", async () => {
    const { session, marker } = harness();
    const calls: unknown[] = [];
    session.registerExternalHistory(marker.id, async (request) => {
      calls.push(request);
      return calls.length === 1 ? { status: "unknown", message: "Antwortverlust" } : { status: "committed", pageVersion: 2, themeVersion: 2 };
    });
    try {
      expect(await session.undoAsync()).toBe(false);
      expect(await session.retryExternalHistory()).toBe(true);
      expect(calls).toEqual([
        { entryId: marker.id, direction: "undo", versions: { pageVersion: 1, themeVersion: 1, registryVersion: 1 }, uncertain: false },
        { entryId: marker.id, direction: "undo", versions: { pageVersion: 1, themeVersion: 1, registryVersion: 1 }, uncertain: true },
      ]);
    } finally { session.dispose(); }
  });

  it.each([
    { pageVersion: 3, themeVersion: 2 },
    { pageVersion: 2, themeVersion: 3 },
    { pageVersion: 2, themeVersion: 2, registryVersion: 0 },
    { pageVersion: 2, themeVersion: 2, registryVersion: 2 },
  ])("verweigert einen fremden oder unvollständigen Versionsstand (%j)", async (versions) => {
    const { session, marker } = harness();
    session.registerExternalHistory(marker.id, async () => ({ status: "committed", ...versions }));
    try {
      expect(await session.undoAsync()).toBe(false);
      expect(session.pipeline.externalVersions()).toEqual({ pageVersion: 1, themeVersion: 1, registryVersion: 1 });
      expect(session.pendingExternalId).not.toBeNull();
      expect(session.store.history.top()?.id).toBe(marker.id);
    } finally { session.dispose(); }
  });

  it("bindet den beim Start registrierten Runner, nicht einen während der Anfrage ersetzten", async () => {
    const { session, marker } = harness();
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    let replacementCalls = 0;
    session.registerExternalHistory(marker.id, async () => { await delayed; return { status: "committed", pageVersion: 2, themeVersion: 2 }; });
    try {
      const navigation = session.undoAsync();
      session.registerExternalHistory(marker.id, async ({ versions }) => { replacementCalls += 1; return { status: "committed", pageVersion: versions.pageVersion + 1, themeVersion: versions.themeVersion! + 1 }; });
      release();
      expect(await navigation).toBe(true);
      expect(replacementCalls).toBe(0);
      expect(await session.redoAsync()).toBe(true);
      expect(replacementCalls).toBe(1);
    } finally { release(); session.dispose(); }
  });
});

describe("restoreTo stepwise jumps", () => {
  it("führt gemischten Sprung über registrierten externen Schritt aus", async () => {
    const { session } = harness();
    const store = session.store;
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "A" });
    const first = store.history.top()!;
    const ext = store.beginExternalAction({ label: "Token umbenennen", versionBefore: store.version, versionAfter: store.version + 1 });
    store.commitExternalAction(ext.id);
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "B" });
    await session.flush();
    let calls = 0;
    session.registerExternalHistory(ext.id, async (request) => {
      calls += 1;
      return { status: "committed", pageVersion: request.versions.pageVersion + 1, themeVersion: (request.versions.themeVersion ?? 0) + 1, registryVersion: request.versions.registryVersion };
    });
    expect(session.canRestoreToAsync(first.id)).toBe(true);
    const ok = await session.restoreToAsync(first.id);
    expect({ ok, calls, state: session.externalHistoryState().status, cursor: store.history.cursor(), first: first.id }).toMatchObject({ ok: true, calls: 1 });
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("A");
  });

  it("stoppt bei unknown und erlaubt Retry", async () => {
    const { session } = harness();
    const store = session.store;
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "A" });
    const first = store.history.top()!;
    const ext = store.beginExternalAction({ label: "Token umbenennen", versionBefore: store.version, versionAfter: store.version + 1 });
    store.commitExternalAction(ext.id);
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "B" });
    await session.flush();
    let mode = "unknown"; let calls = 0;
    session.registerExternalHistory(ext.id, async (request) => {
      calls += 1;
      if (mode === "unknown") return { status: "unknown", message: "x" };
      return { status: "committed", pageVersion: request.versions.pageVersion + 1, themeVersion: (request.versions.themeVersion ?? 0) + 1, registryVersion: request.versions.registryVersion };
    });
    const ok = await session.restoreToAsync(first.id);
    expect({ ok, calls, state: session.externalHistoryState().status }).toMatchObject({ ok: false, calls: 1, state: "unresolved" });
    mode = "ok";
    expect(await session.retryPendingExternalAsync()).toBe(true);
    expect(calls).toBe(2);
    expect(store.history.cursor()).toBe(first.id);
  });

  it("führt mehrere externe Schritte aus und stoppt beim ersten unknown", async () => {
    const { session } = harness();
    const store = session.store;
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "A" });
    const first = store.history.top()!;
    const ext1 = store.beginExternalAction({ label: "Eins", versionBefore: store.version, versionAfter: store.version + 1 }); store.commitExternalAction(ext1.id);
    const ext2 = store.beginExternalAction({ label: "Zwei", versionBefore: store.version, versionAfter: store.version + 1 }); store.commitExternalAction(ext2.id);
    await session.flush();
    const calls = [];
    session.registerExternalHistory(ext1.id, async (request) => { calls.push("ext1:" + request.direction); return { status: "committed", pageVersion: request.versions.pageVersion + 1, themeVersion: (request.versions.themeVersion ?? 0) + 1, registryVersion: request.versions.registryVersion }; });
    session.registerExternalHistory(ext2.id, async (request) => { calls.push("ext2:" + request.direction); return { status: "unknown", message: "x" }; });
    expect(session.canRestoreToAsync(first.id)).toBe(true);
    const ok = await session.restoreToAsync(first.id);
    expect({ ok, calls, pending: session.pendingExternalId, ext2: ext2.id }).toMatchObject({ ok: false, calls: ["ext2:undo"], pending: ext2.id });
  });
});
