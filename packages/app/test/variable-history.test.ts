import { describe, expect, it } from "vitest";
import * as editor from "@senify/editor/state";
import { baseStore } from "../../editor/test/state/fixtures.ts";

const { createVariableHistory } = await import(new URL("../public/variable-history.js", import.meta.url).href);
type Theme = { tokens: { primitive: { color: Record<string, string>; spacing: Record<string, string> } } };

function harness() {
  const values = new Map<string, string>();
  let storageBlocked = false;
  let readBlocked = false;
  let removeBlocked = false;
  let checkpointBlocked = false;
  const storage = { getItem: (key: string) => { if (readBlocked) throw new Error("Storage nicht lesbar"); return values.get(key) ?? null; }, setItem: (key: string, value: string) => {
    if (storageBlocked || (checkpointBlocked && key.startsWith("senify:editor-history:"))) throw new Error("Storage gesperrt");
    values.set(key, value);
  }, removeItem: (key: string) => { if (storageBlocked || removeBlocked) throw new Error("Storage gesperrt"); values.delete(key); } };
  let pageVersion = 1;
  let themeVersion = 1;
  let serverDocument = structuredClone(baseStore().document);
  const serverTheme: Theme = { tokens: { primitive: { color: { marker: "#123456" }, spacing: { abstand: "16px" } } } };
  let currentTheme = structuredClone(serverTheme);
  let active = true;
  let transform: (value: unknown, path: string) => unknown = (value) => value;
  let delay: Promise<void> | undefined;
  const responses = new Map<string, unknown>();
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  const session = () => editor.createEditorSession({ document: structuredClone(serverDocument), pageId: "page1", siteId: "site1",
    author: { kind: "human", id: "tester", label: "Tester" }, initialVersion: pageVersion, themeVersion, styleRegistryVersion: 1, debounceMs: 100000,
    request: async () => { pageVersion += 1; serverDocument = structuredClone(current.document); return { status: 200, body: { newDraftVersion: pageVersion } }; } });
  let current = session();
  const api = async (path: string, options?: { body: Record<string, unknown> }) => {
    if (options) {
      requests.push({ path, body: structuredClone(options.body) });
      const responseKey = `${path}:${JSON.stringify(options.body)}`;
      if (!responses.has(responseKey)) {
        const group = path.includes("/spacing/") ? "spacing" : "color";
        const name = group === "spacing" ? "abstand" : "marker";
        if (path.endsWith("/delete")) delete serverTheme.tokens.primitive[group][name];
        else serverTheme.tokens.primitive[group][name] = group === "spacing" ? "16px" : "#123456";
        pageVersion += 1; themeVersion += 1;
        responses.set(responseKey, { version: themeVersion, pageDraftVersion: pageVersion, receiptId: options.body.receiptId });
      }
      if (delay) await delay;
      return transform(structuredClone(responses.get(responseKey)), path);
    }
    if (path.endsWith("/theme")) return transform({ version: themeVersion, theme: structuredClone(serverTheme), css: "" }, path);
    if (path.endsWith("/style-rules")) return transform({ version: 1, rules: structuredClone(serverDocument.styleRules) }, path);
    return transform({ draftVersion: pageVersion, draft: structuredClone(serverDocument) }, path);
  };
  const mount = () => createVariableHistory({ session: current, api, storage, editor, getTheme: () => currentTheme,
    hasPendingLegacyRename: () => { try { return JSON.parse(values.get("senify:pending-variable:site1:page1") ?? "null")?.action === "rename"; } catch { return false; } },
    setTheme: (latest: { theme: Theme }) => { currentTheme = structuredClone(latest.theme); }, onChange: () => {}, isActive: () => active });
  let adapter = mount();
  const start = (group = "color", name = "marker") => adapter.start({ action: "delete", group, name,
    body: { receiptId: `receipt-${requests.length}`, baseThemeVersion: current.pipeline.externalVersions().themeVersion, pageContext: { pageId: "page1", baseDraftVersion: current.version } } });
  return { values, storage, requests, start, get session() { return current; }, get adapter() { return adapter; },
    get theme() { return structuredClone(currentTheme); },
    blockStorage: () => { storageBlocked = true; }, unblockStorage: () => { storageBlocked = false; },
    blockReads: () => { readBlocked = true; }, unblockReads: () => { readBlocked = false; },
    blockRemoves: () => { removeBlocked = true; }, unblockRemoves: () => { removeBlocked = false; },
    blockCheckpoints: () => { checkpointBlocked = true; }, unblockCheckpoints: () => { checkpointBlocked = false; },
    transform: (next: typeof transform) => { transform = next; }, delay: (next: Promise<void> | undefined) => { delay = next; },
    deactivate: () => { active = false; },
    foreignThemeWrite() { serverTheme.tokens.primitive.color.fremd = "#abcdef"; themeVersion += 1; },
    foreignPageWrite() { serverDocument.nodes.head000001!.props.text = "Fremde Eingabe"; pageVersion += 1; },
    legacyRenameWrite() { serverTheme.tokens.primitive.spacing.distanz = serverTheme.tokens.primitive.spacing.abstand!; delete serverTheme.tokens.primitive.spacing.abstand; themeVersion += 1; pageVersion += 1; },
    saveUnchangedTheme() { themeVersion += 1; current.acceptThemeVersion(themeVersion); },
    reload() { adapter.dispose(); current.dispose(); currentTheme = structuredClone(serverTheme); current = session(); adapter = mount(); },
    close() { adapter.dispose(); current.dispose(); } };
}

describe("App-Adapter für bestätigte Variablen-History", () => {
  it.each([false, true])("erhält bestätigte Checkpoints beim delegierten Legacy-Pending-Rename (bereits ausgeführt=%s)", async (committed) => {
    const f = harness();
    try {
      expect(await f.start()).toBe(true);
      const key = "senify:editor-history:site1:page1";
      const pendingKey = "senify:pending-variable:site1:page1";
      const confirmed = f.values.get(key);
      const pending = JSON.stringify({ action: "rename", group: "spacing", name: "abstand", body: {
        receiptId: "legacy-rename", newName: "distanz", baseThemeVersion: f.session.pipeline.externalVersions().themeVersion,
        pageContext: { pageId: "page1", baseDraftVersion: f.session.version },
      } });
      f.values.set(pendingKey, pending);
      if (committed) f.legacyRenameWrite();
      f.reload();
      expect(f.values.get(key)).toBe(confirmed);
      expect(f.values.get(pendingKey)).toBe(pending);
      expect(f.adapter.pending()).toBeNull();
      expect(await f.adapter.retry()).toBe(false);
      expect(f.requests).toHaveLength(1);
    } finally { f.close(); }
  });

  it.each([false, true])("bindet einen älteren Pending-Retry ohne frühere History an (bereits ausgeführt=%s)", async (committed) => {
    const f = harness();
    try {
      const body = { receiptId: "legacy-pending-beleg", baseThemeVersion: 1, pageContext: { pageId: "page1", baseDraftVersion: 1 } };
      if (committed) {
        f.transform((value, path) => { if (path.endsWith("/delete")) throw new Error("Antwort verloren"); return value; });
        expect(await f.adapter.start({ action: "delete", group: "color", name: "marker", body })).toBe(false);
      }
      f.values.set("senify:pending-variable:site1:page1", JSON.stringify({ action: "delete", group: "color", name: "marker", body }));
      f.reload(); f.transform((value) => value);
      expect(f.session.pendingExternalId).not.toBeNull();
      expect(await f.adapter.retry()).toBe(true);
      expect(f.requests.at(-1)?.body).toEqual(body);
      expect(f.session.store.history.size).toBe(1);
      f.reload();
      expect(await f.session.undoAsync()).toBe(true);
      expect(f.theme.tokens.primitive.color.marker).toBe("#123456");
    } finally { f.close(); }
  });

  it.each(["apply", "batch", "undo", "redo"])("veröffentlicht bei %s vor Save keinen unbestätigten Checkpoint", async (action) => {
    const f = harness();
    try {
      expect(await f.start()).toBe(true);
      if (action === "undo" || action === "redo") {
        f.session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Gespeichert" });
        await f.session.flush();
        if (action === "redo") { expect(f.session.undo()).toBe(true); await f.session.flush(); }
      }
      const key = "senify:editor-history:site1:page1";
      const confirmed = f.values.get(key);
      const checkpoints: unknown[] = [];
      f.session.subscribe(() => checkpoints.push(f.session.historyCheckpoint()));
      if (action === "apply") f.session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Nicht gespeichert" });
      if (action === "batch") f.session.store.applyBatch([{ op: "setNodeProp", id: "head000001", key: "text", value: "Nicht gespeichert" }]);
      if (action === "undo") expect(f.session.undo()).toBe(true);
      if (action === "redo") expect(f.session.redo()).toBe(true);
      expect(checkpoints.every((checkpoint) => checkpoint === null)).toBe(true);
      expect(f.values.get(key)).toBe(confirmed);
      f.reload();
      expect(f.adapter.hasEntries()).toBe(true);
      expect(f.session.store.history.size).toBe(JSON.parse(confirmed!).checkpoint.history.entries.length);
    } finally { f.close(); }
  });

  it.each([false, true])("aktualisiert den Checkpoint nach angenommenem Theme-Write (Reload=%s)", async (reload) => {
    const f = harness();
    try {
      expect(await f.start()).toBe(true);
      f.saveUnchangedTheme();
      if (reload) f.reload();
      expect(f.session.store.history.size).toBe(1);
      expect(await f.session.undoAsync()).toBe(true);
    } finally { f.close(); }
  });

  it.each([false, true])("begrenzt neue Variablenschritte kanonisch bei voller History (Antwortverlust=%s)", async (lost) => {
    const f = harness();
    try {
      for (let index = 0; index < 200; index += 1) f.session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: `Schritt ${index}` });
      await f.session.flush();
      const firstId = f.session.store.history.entries()[0]!.id;
      expect(f.session.store.history.size).toBe(200);
      if (lost) f.transform((value, path) => { if (path.endsWith("/delete")) throw new Error("Antwort verloren"); return value; });
      expect(await f.start()).toBe(!lost);
      expect(f.requests).toHaveLength(1);
      if (lost) {
        f.reload(); f.transform((value) => value);
        expect(await f.adapter.retry()).toBe(true);
        expect(f.requests[1]?.body).toEqual(f.requests[0]?.body);
      }
      expect(f.session.store.history.size).toBe(200);
      expect(f.session.store.history.entries().some((entry) => entry.id === firstId)).toBe(false);
      expect(f.session.store.history.top()?.external).toBe(true);
      f.reload();
      expect(f.session.store.history.size).toBe(200);
      expect(await f.session.undoAsync()).toBe(true);
    } finally { f.close(); }
  });

  it.each(["first", "undo"])("erhält den gesicherten Request bei Checkpoint-Write-Ausfall (%s)", async (mode) => {
    const f = harness();
    try {
      if (mode === "undo") expect(await f.start()).toBe(true);
      f.blockCheckpoints();
      expect(await (mode === "undo" ? f.session.undoAsync() : f.start())).toBe(true);
      expect(f.values.has("senify:pending-variable:site1:page1")).toBe(true);
      const body = f.requests.at(-1)?.body;
      f.reload(); f.unblockCheckpoints();
      expect(f.session.pendingExternalId).not.toBeNull();
      expect(await f.adapter.retry()).toBe(true);
      expect(f.requests.at(-1)?.body).toEqual(body);
      expect(f.values.has("senify:pending-variable:site1:page1")).toBe(false);
      expect(f.session.store.history.size).toBe(1);
      expect(f.session.store.history.snapshot().cursor).toBe(mode === "undo" ? 0 : 1);
    } finally { f.close(); }
  });

  it.each(["color", "spacing"])("bindet %s an Cursor, neue Redo-Belege und einen bestätigten Reload", async (group) => {
    const f = harness();
    try {
      expect(await f.start(group, group === "spacing" ? "abstand" : "marker")).toBe(true);
      expect(f.session.store.history.size).toBe(1);
      expect(await f.session.undoAsync()).toBe(true);
      expect(await f.session.redoAsync()).toBe(true);
      expect(f.requests[2]?.body.receiptId).not.toBe(f.requests[0]?.body.receiptId);
      f.reload();
      expect(f.session.store.history.size).toBe(1);
      expect(await f.session.undoAsync()).toBe(true);
      expect(f.requests[3]?.body.receiptId).toBe(f.requests[2]?.body.receiptId);
    } finally { f.close(); }
  });

  it.each([null, {}, { version: 2, pageDraftVersion: 2, receiptId: "falscher-beleg" }])("übernimmt keine unvollständige Schreibantwort (%j)", async (response) => {
    const f = harness();
    try {
      f.transform((value, path) => path.endsWith("/delete") ? response : value);
      expect(await f.start()).toBe(false);
      expect(f.session.version).toBe(1);
      expect(f.session.store.history.size).toBe(0);
      expect(f.session.pendingExternalId).not.toBeNull();
      f.transform((value) => value);
      expect(await f.adapter.retry()).toBe(true);
      expect(f.requests[1]?.body).toEqual(f.requests[0]?.body);
    } finally { f.close(); }
  });

  it.each(["theme", "page", "registry"])("verweigert abweichende %s-Inhalte ohne Cursoränderung", async (resource) => {
    const f = harness();
    try {
      f.transform((value, path) => {
        if (resource === "theme" && path.endsWith("/theme")) return { version: 2, theme: { tokens: { primitive: { color: { fremd: "#abcdef" }, spacing: { abstand: "16px" } } } } };
        if (resource === "page" && path.endsWith("/page1")) return { draftVersion: 3, draft: baseStore().document };
        if (resource === "registry" && path.endsWith("/style-rules")) return { version: 2, rules: [] };
        return value;
      });
      expect(await f.start()).toBe(false);
      expect(f.session.version).toBe(1);
      expect(f.session.pendingExternalId).not.toBeNull();
    } finally { f.close(); }
  });

  it("sichert Erst-Write und Navigation vor dem Netzwerk gegen Storage-Ausfall", async () => {
    const f = harness();
    try {
      f.blockStorage();
      expect(await f.start()).toBe(false);
      expect(f.requests).toHaveLength(0);
      expect(f.session.pendingExternalId).toBeNull();
      f.unblockStorage();
      expect(await f.start()).toBe(true);
      f.blockStorage();
      expect(await f.session.undoAsync()).toBe(false);
      expect(f.requests).toHaveLength(1);
      expect(f.session.pendingExternalId).toBeNull();
    } finally { f.close(); }
  });

  it.each(["first", "undo"])("gibt eine eindeutige Erst-Ablehnung frei, aber keinen vorherigen Unknown (%s)", async (mode) => {
    const f = harness();
    try {
      if (mode === "undo") expect(await f.start()).toBe(true);
      const navigate = () => mode === "undo" ? f.session.undoAsync() : f.start();
      const endpoint = mode === "undo" ? "/restore" : "/delete";
      f.transform((value, path) => { if (path.endsWith(endpoint)) throw Object.assign(new Error("Versionskonflikt"), { status: 409 }); return value; });
      expect(await navigate()).toBe(false);
      expect(f.session.pendingExternalId).toBeNull();
      expect(f.adapter.pending()).toBeNull();
      f.transform((value, path) => { if (path.endsWith(endpoint)) throw new Error("Antwort unklar"); return value; });
      expect(await navigate()).toBe(false);
      const pendingId = f.session.pendingExternalId;
      expect(pendingId).not.toBeNull();
      f.transform((value, path) => { if (path.endsWith(endpoint)) throw Object.assign(new Error("Versionskonflikt"), { status: 409 }); return value; });
      expect(await f.adapter.retry()).toBe(false);
      expect(f.session.pendingExternalId).toBe(pendingId);
      expect(f.adapter.pending()).not.toBeNull();
    } finally { f.close(); }
  });

  it("wiederholt nach neuen gespeicherten Eingaben nur den alten Request und ersetzt keine Inhalte", async () => {
    const f = harness();
    try {
      f.transform((value, path) => { if (path.endsWith("/delete")) throw new Error("Antwort verloren"); return value; });
      expect(await f.start()).toBe(false);
      f.session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neue Eingabe" });
      await f.session.flush();
      f.transform((value) => value);
      const document = f.session.document;
      expect(await f.adapter.retry()).toBe(false);
      expect(f.requests).toHaveLength(2);
      expect(f.requests[1]?.body).toEqual(f.requests[0]?.body);
      expect(f.session.document).toBe(document);
      expect(f.session.document.nodes.head000001?.props.text).toBe("Neue Eingabe");
      expect(f.session.pendingExternalId).not.toBeNull();
    } finally { f.close(); }
  });

  it("übernimmt nach View-Wechsel keine verspätete Bestätigung und erhält den gesicherten Request", async () => {
    const f = harness();
    let release!: () => void;
    f.delay(new Promise<void>((resolve) => { release = resolve; }));
    try {
      const operation = f.start();
      f.deactivate(); f.adapter.dispose(); release();
      expect(await operation).toBe(false);
      expect(f.session.version).toBe(1);
      expect(f.values.has("senify:pending-variable:site1:page1")).toBe(true);
    } finally { release(); f.close(); }
  });

  it.each(["undo", "redo"])("wiederholt uncertain %s trotz neuer Eingaben ohne Übernahme", async (direction) => {
    const f = harness();
    try {
      expect(await f.start()).toBe(true);
      if (direction === "redo") expect(await f.session.undoAsync()).toBe(true);
      f.transform((value, path) => { if (path.endsWith(direction === "undo" ? "/restore" : "/delete")) throw new Error("Antwort verloren"); return value; });
      expect(await (direction === "undo" ? f.session.undoAsync() : f.session.redoAsync())).toBe(false);
      const body = f.requests.at(-1)?.body;
      f.session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neue Eingabe" });
      await f.session.flush();
      const document = f.session.document;
      const length = f.requests.length;
      f.transform((value) => value);
      expect(await f.adapter.retry()).toBe(false);
      expect(f.requests).toHaveLength(length + 1);
      expect(f.requests.at(-1)?.body).toEqual(body);
      expect(f.session.document).toBe(document);
      expect(f.session.pendingExternalId).not.toBeNull();
    } finally { f.close(); }
  });

  it("behält Unknown bei Storage-Fehler im Navigations-Retry", async () => {
    const f = harness();
    try {
      expect(await f.start()).toBe(true);
      f.transform((value, path) => { if (path.endsWith("/restore")) throw new Error("Antwort verloren"); return value; });
      expect(await f.session.undoAsync()).toBe(false);
      const pending = f.session.pendingExternalId;
      f.blockStorage();
      expect(await f.adapter.retry()).toBe(false);
      expect(f.requests).toHaveLength(2);
      expect(f.session.pendingExternalId).toBe(pending);
      f.unblockStorage(); f.transform((value) => value);
      expect(await f.adapter.retry()).toBe(true);
      expect(f.requests.at(-1)?.body).toEqual(f.requests[1]?.body);
    } finally { f.close(); }
  });

  it("bindet den gesicherten Request unabhängig vom Eingabeobjekt", async () => {
    const f = harness();
    try {
      const input = { action: "delete", group: "color", name: "marker", body: { receiptId: "original", baseThemeVersion: 1, pageContext: { pageId: "page1", baseDraftVersion: 1 } } };
      f.transform((value, path) => { if (path.endsWith("/delete")) throw new Error("Antwort verloren"); return value; });
      expect(await f.adapter.start(input)).toBe(false);
      input.body.receiptId = "veraendert";
      input.body.baseThemeVersion = 2;
      f.transform((value) => value);
      expect(await f.adapter.retry()).toBe(true);
      expect(f.requests[1]?.body).toEqual(f.requests[0]?.body);
    } finally { f.close(); }
  });

  it("übernimmt beim Beenden einer nicht passenden Navigation keine vorgemerkte Bestätigung", async () => {
    const f = harness();
    let release!: () => void;
    try {
      expect(await f.start()).toBe(true);
      f.delay(new Promise<void>((resolve) => { release = resolve; }));
      const undo = f.session.undoAsync();
      f.session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neue Eingabe" });
      // The server contents still match the original checkpoint, but local
      // document identity prevents the session from adopting the result.
      f.session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Hallo" });
      release();
      expect(await undo).toBe(false);
      const versions = f.session.pipeline.externalVersions();
      const theme = f.theme;
      const pending = f.session.pendingExternalId;
      f.session.discardPending();
      f.blockRemoves();
      expect(() => f.adapter.abandon()).toThrow("Storage gesperrt");
      expect(f.session.pendingExternalId).toBe(pending);
      f.unblockRemoves();
      expect(f.adapter.abandon()).toBe(true);
      expect(f.session.pipeline.externalVersions()).toEqual(versions);
      expect(f.theme).toEqual(theme);
      expect(f.session.pendingExternalId).toBeNull();
      expect(f.adapter.hasEntries()).toBe(false);
      expect(f.values.has("senify:editor-history:site1:page1")).toBe(false);
      expect(f.values.has("senify:pending-variable:site1:page1")).toBe(false);
    } finally { release?.(); f.close(); }
  });

  it("wiederholt nach fehlgeschlagenem Entfernen nur den bestätigten Request", async () => {
    const f = harness();
    try {
      f.blockRemoves();
      expect(await f.start()).toBe(true);
      expect(f.values.has("senify:pending-variable:site1:page1")).toBe(true);
      f.reload();
      expect(f.session.pendingExternalId).not.toBeNull();
      f.unblockRemoves();
      expect(await f.adapter.retry()).toBe(true);
      expect(f.requests[1]?.body).toEqual(f.requests[0]?.body);
      expect(f.session.version).toBe(2);
      expect(f.session.store.history.size).toBe(1);
      expect(await f.session.undoAsync()).toBe(true);
    } finally { f.close(); }
  });

  it("sperrt bei unlesbarem Storage vor jedem Write und erlaubt nur bewusste Recovery", async () => {
    const f = harness();
    try {
      f.blockReads(); f.reload();
      expect(f.session.pendingExternalId).not.toBeNull();
      expect(await f.adapter.retry()).toBe(false);
      expect(f.requests).toHaveLength(0);
      f.unblockReads();
      expect(f.adapter.abandon()).toBe(true);
      expect(f.session.pendingExternalId).toBeNull();
    } finally { f.close(); }
  });

  it.each(["theme", "page"])("erhält nicht passende bestätigte Reload-Checkpoints bis zur ausdrücklichen Recovery (%s)", async (resource) => {
    const f = harness();
    try {
      expect(await f.start()).toBe(true);
      const key = "senify:editor-history:site1:page1";
      const confirmed = f.values.get(key);
      if (resource === "theme") f.foreignThemeWrite();
      else f.foreignPageWrite();
      f.reload();
      expect(f.values.get(key)).toBe(confirmed);
      expect(f.session.pendingExternalId).not.toBeNull();
      expect(f.adapter.state().status).toBe("unresolved");
      expect(f.adapter.pending().body).toBeUndefined();
      expect(f.values.has("senify:pending-variable:site1:page1")).toBe(false);
      expect(await f.session.undoAsync()).toBe(false);
      expect(await f.start("spacing", "abstand")).toBe(false);
      expect(await f.adapter.retry()).toBe(false);
      f.session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neue Eingabe" });
      await f.session.flush();
      expect(f.values.get(key)).toBe(confirmed);
      f.reload();
      expect(f.values.get(key)).toBe(confirmed);
      expect(f.session.pendingExternalId).not.toBeNull();
      expect(f.requests).toHaveLength(1);
      f.blockRemoves();
      expect(() => f.adapter.abandon()).toThrow("Storage gesperrt");
      expect(f.session.pendingExternalId).not.toBeNull();
      f.unblockRemoves();
      expect(f.adapter.abandon()).toBe(true);
      expect(f.session.pendingExternalId).toBeNull();
      expect(f.values.has(key)).toBe(false);
    } finally { f.close(); }
  });

  it.each(["foreign-page", "wrong-inverse", "duplicate-receipt", "missing-receipt", "broken-json", "stored-null"])("erhält beschädigte bestätigte Envelopes und sperrt ihre Recovery (%s)", async (damage) => {
    const f = harness();
    try {
      f.session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Vor Token" });
      await f.session.flush();
      expect(await f.start()).toBe(true);
      const key = "senify:editor-history:site1:page1";
      const envelope = JSON.parse(f.values.get(key)!);
      if (damage === "foreign-page") envelope.checkpoint.pageId = "page2";
      if (damage === "wrong-inverse") envelope.checkpoint.history.entries[0].undoPatch[0].props.fontSize = 99;
      if (damage === "duplicate-receipt") envelope.receipts.push(envelope.receipts[0]);
      if (damage === "missing-receipt") envelope.receipts = [];
      const saved = damage === "broken-json" ? "{" : damage === "stored-null" ? "null" : JSON.stringify(envelope);
      f.values.set(key, saved);
      f.reload();
      expect(f.session.store.history.size).toBe(0);
      expect(f.adapter.hasEntries()).toBe(false);
      expect(f.values.get(key)).toBe(saved);
      expect(f.session.pendingExternalId).not.toBeNull();
      expect(await f.adapter.retry()).toBe(false);
      expect(await f.start()).toBe(false);
      expect(f.requests).toHaveLength(1);
      expect(f.adapter.abandon()).toBe(true);
      expect(f.session.pendingExternalId).toBeNull();
    } finally { f.close(); }
  });

  it.each(["null-entry", "foreign-page", "bad-patch", "missing-receipt", "broken-json"])("führt beschädigte gespeicherte Vorgänge nicht aus (%s)", async (damage) => {
    const f = harness();
    try {
      f.transform((value, path) => { if (path.endsWith("/delete")) throw new Error("Antwort verloren"); return value; });
      await f.start();
      const key = "senify:pending-variable:site1:page1";
      const operation = JSON.parse(f.values.get(key)!);
      if (damage === "null-entry") operation.before.checkpoint.history.entries.push(null);
      if (damage === "foreign-page") operation.before.checkpoint.pageId = "page2";
      if (damage === "bad-patch") operation.entry.mutations = [{ patch: "deleteNode", id: "head000001" }];
      if (damage === "missing-receipt") operation.record = null;
      f.values.set(key, damage === "broken-json" ? "{" : JSON.stringify(operation));
      f.reload();
      f.transform((value) => value);
      expect(await f.adapter.retry()).toBe(false);
      expect(f.requests).toHaveLength(1);
      expect(f.session.pendingExternalId).not.toBeNull();
      expect(f.adapter.abandon()).toBe(true);
      expect(f.session.pendingExternalId).toBeNull();
    } finally { f.close(); }
  });
});
