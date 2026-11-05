import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { startProgram } from "@senify/app";
import type { CanvasInstance } from "@senify/editor/canvas";
import type { EditorSession, ExternalHistoryRequest, ExternalHistoryResult } from "@senify/editor/state";
import { browserAvailable, memoryDb } from "./support.ts";

type HarnessScope = {
  __session: EditorSession;
  __canvas: CanvasInstance;
  __calls: ExternalHistoryRequest[];
  __release(result: ExternalHistoryResult): void;
  __register(): void;
  __writes: number;
  __messages: number;
  __mismatch(): string;
};

// Real canvas and session on the app bundle. Only the external server runner
// is controlled here; the app's real Delete/Restore flow has its own gate.
const HARNESS = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>History-Prüfung</title></head>
<body style="margin:0"><div id="host" style="width:1500px;height:900px"></div><script type="module">
  import { EditorStore, createEditorSession, createRegistry, mountCanvas } from "/editor.js";
  const session = createEditorSession({
    document: { version: 2, rootNodeId: "root000001", styleRules: [], nodes: {
      root000001: { id: "root000001", primitive: "root", props: {}, children: ["head000001"] },
      head000001: { id: "head000001", primitive: "heading", props: { level: "h2", text: "Ausgangstext" } },
    } },
    pageId: "page1", siteId: "site1", author: { kind: "human", id: "tester", label: "Tester" },
    initialVersion: 1, themeVersion: 1, styleRegistryVersion: 1, debounceMs: 100000,
    request: async () => { globalThis.__writes += 1; return { status: 200, body: { newDraftVersion: session.version + 1 } }; },
  });
  globalThis.__writes = 0;
  globalThis.__calls = [];
  const entry = session.beginExternalAction({ label: "Token löschen", versionBefore: 1, versionAfter: 2 });
  session.commitExternalAction(entry.id);
  globalThis.__register = () => session.registerExternalHistory(entry.id, (request) => {
    globalThis.__calls.push(request);
    return new Promise((resolve) => { globalThis.__release = resolve; });
  });
  globalThis.__session = session;
  globalThis.__messages = 0;
  globalThis.__mismatch = () => {
    try { mountCanvas(document.getElementById("host"), { store: new EditorStore({ document: session.document }), session, registry: createRegistry() }); }
    catch (error) { return error.message; }
    return "Kein Fehler";
  };
  globalThis.__canvas = mountCanvas(document.getElementById("host"), {
    store: session.store, session, registry: createRegistry(), frameLayout: "single",
    onMessage: () => { globalThis.__messages += 1; },
  });
  globalThis.__ready = true;
</script></body></html>`;

describe.skipIf(!browserAvailable)("serverbestätigte Canvas-Navigation im Browser", () => {
  let browser: Browser;
  let running: Awaited<ReturnType<typeof startProgram>>;
  let database: ReturnType<typeof memoryDb>;
  let dataDir: string;

  beforeAll(async () => {
    database = memoryDb();
    dataDir = mkdtempSync(join(tmpdir(), "senify-canvas-history-"));
    running = await startProgram({ db: database.db, dataDir, programTokenFile: join(dataDir, "token.json"), enginePort: 0, appPort: 0, openBrowser: false });
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
  }, 120000);

  afterAll(async () => {
    await browser?.close();
    await running?.close();
    await database?.close();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  async function open(): Promise<{ tab: Page; errors: string[] }> {
    const tab = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors: string[] = [];
    tab.on("pageerror", (error) => errors.push(error.message));
    tab.on("console", (message) => { if (message.type() === "error" && !message.text().includes("404")) errors.push(message.text()); });
    await tab.route((url) => url.pathname === "/", (route) => route.fulfill({ status: 200, contentType: "text/html", body: HARNESS }));
    await tab.goto(`${running.dashboardUrl}/`, { waitUntil: "load" });
    await tab.waitForFunction("window.__ready === true");
    return { tab, errors };
  }

  const undo = (tab: Page) => tab.locator('[data-action="undo"]');
  const redo = (tab: Page) => tab.locator('[data-action="redo"]');
  const probe = (tab: Page) => tab.evaluate(() => {
    const scope = globalThis as unknown as HarnessScope;
    return {
      cursor: scope.__session.store.history.applied().length,
      versions: scope.__session.pipeline.externalVersions(),
      pending: scope.__session.pendingExternalId,
      calls: scope.__calls,
      writes: scope.__writes,
      text: scope.__session.document.nodes["head000001"]?.props["text"],
    };
  });
  const confirm = (tab: Page) => tab.evaluate(() => {
    const scope = globalThis as unknown as HarnessScope;
    const base = scope.__calls.at(-1)!.versions;
    scope.__release({ status: "committed", pageVersion: base.pageVersion + 1, themeVersion: base.themeVersion! + 1 });
  });

  it("aktualisiert die Toolbar bei Runnerregistrierung und bestätigt Toolbar-, Frame- und öffentliche Async-Navigation", async () => {
    const { tab, errors } = await open();
    try {
      expect(await undo(tab).isDisabled()).toBe(true);
      await tab.evaluate(() => (globalThis as unknown as HarnessScope).__register());
      await expect.poll(() => undo(tab).isEnabled()).toBe(true);
      expect(await tab.evaluate(() => (globalThis as unknown as HarnessScope).__canvas.undo())).toBe(false);
      await undo(tab).click();
      await expect.poll(async () => (await probe(tab)).calls.length).toBe(1);
      expect(await probe(tab)).toMatchObject({ cursor: 1, versions: { pageVersion: 1, themeVersion: 1 }, writes: 0 });
      expect(await undo(tab).isDisabled()).toBe(true);
      expect(await redo(tab).isDisabled()).toBe(true);
      await tab.keyboard.press("Control+y");
      expect(await tab.evaluate(() => (globalThis as unknown as HarnessScope).__canvas.redo())).toBe(false);
      expect(await tab.evaluate(() => (globalThis as unknown as HarnessScope).__canvas.undoAsync())).toBe(false);
      expect((await probe(tab)).calls).toHaveLength(1);
      await confirm(tab);
      await expect.poll(async () => (await probe(tab)).cursor).toBe(0);
      await expect.poll(() => redo(tab).isEnabled()).toBe(true);
      const frame = tab.locator(".senify-canvas__iframe").contentFrame();
      await frame.locator('[data-node-id="head000001"]').click();
      await tab.keyboard.press("Control+Shift+z");
      await expect.poll(async () => (await probe(tab)).calls.length).toBe(2);
      expect((await probe(tab)).calls.at(-1)?.direction).toBe("redo");
      expect((await probe(tab)).cursor).toBe(0);
      await confirm(tab);
      await expect.poll(async () => (await probe(tab)).cursor).toBe(1);
      await tab.evaluate(() => { void (globalThis as unknown as HarnessScope).__canvas.undoAsync(); });
      await expect.poll(async () => (await probe(tab)).calls.length).toBe(3);
      await confirm(tab);
      await expect.poll(async () => (await probe(tab)).cursor).toBe(0);
      await tab.evaluate(() => { void (globalThis as unknown as HarnessScope).__canvas.redoAsync(); });
      await expect.poll(async () => (await probe(tab)).calls.length).toBe(4);
      await confirm(tab);
      await expect.poll(async () => (await probe(tab)).cursor).toBe(1);
      expect((await probe(tab)).versions).toMatchObject({ pageVersion: 5, themeVersion: 5 });
      expect((await probe(tab)).writes).toBe(0);
      expect(errors).toEqual([]);
    } finally { await tab.close(); }
  }, 120000);

  it("erhält lokale Schritte und aktualisiert die externe Sperre nach Flush ohne Storeänderung", async () => {
    const { tab, errors } = await open();
    try {
      await tab.evaluate(() => {
        const scope = globalThis as unknown as HarnessScope;
        scope.__register();
        scope.__session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Lokaler Schritt" });
      });
      await tab.keyboard.press("Control+z");
      expect((await probe(tab)).text).toBe("Ausgangstext");
      expect((await probe(tab)).cursor).toBe(1);
      expect(await undo(tab).isDisabled()).toBe(true);
      expect((await probe(tab)).calls).toEqual([]);
      await tab.evaluate(() => (globalThis as unknown as HarnessScope).__session.flush());
      await expect.poll(() => undo(tab).isEnabled()).toBe(true);
      await undo(tab).click();
      await expect.poll(async () => (await probe(tab)).calls.length).toBe(1);
      await confirm(tab);
      await expect.poll(async () => (await probe(tab)).cursor).toBe(0);
      await redo(tab).click();
      await expect.poll(async () => (await probe(tab)).calls.length).toBe(2);
      await confirm(tab);
      await expect.poll(async () => (await probe(tab)).cursor).toBe(1);
      await tab.keyboard.press("Control+y");
      expect((await probe(tab)).text).toBe("Lokaler Schritt");
      expect((await probe(tab)).cursor).toBe(2);
      expect(await tab.evaluate(() => (globalThis as unknown as HarnessScope).__canvas.undo())).toBe(true);
      expect(await tab.evaluate(() => (globalThis as unknown as HarnessScope).__canvas.redo())).toBe(true);
      expect(errors).toEqual([]);
    } finally { await tab.close(); }
  }, 120000);

  it("zeigt Unknown und Retry-Konflikte ohne lokale Navigation und lässt erst die Bestätigung frei", async () => {
    const { tab, errors } = await open();
    try {
      await tab.evaluate(() => (globalThis as unknown as HarnessScope).__register());
      await tab.keyboard.press("Control+z");
      await expect.poll(async () => (await probe(tab)).calls.length).toBe(1);
      await tab.evaluate(() => (globalThis as unknown as HarnessScope).__release({ status: "unknown", message: "Antwort verloren" }));
      await expect.poll(() => tab.locator('[data-role="status"]').textContent()).toBe("Antwort verloren");
      const pending = (await probe(tab)).pending;
      expect(pending).not.toBeNull();
      await tab.keyboard.press("Control+z");
      expect((await probe(tab)).calls).toHaveLength(1);
      await tab.evaluate(() => { void (globalThis as unknown as HarnessScope).__session.retryExternalHistory(); });
      await expect.poll(async () => (await probe(tab)).calls.length).toBe(2);
      await tab.evaluate(() => (globalThis as unknown as HarnessScope).__release({ status: "rejected", message: "Retry-Konflikt" }));
      await expect.poll(() => tab.locator('[data-role="status"]').textContent()).toBe("Retry-Konflikt");
      expect((await probe(tab)).pending).toBe(pending);
      expect((await probe(tab)).cursor).toBe(1);
      await tab.locator('[data-action="history"]').click();
      expect(await tab.locator(".senify-history__row").first().isDisabled()).toBe(true);
      await tab.keyboard.press("Escape");
      await tab.evaluate(() => { void (globalThis as unknown as HarnessScope).__session.retryExternalHistory(); });
      await expect.poll(async () => (await probe(tab)).calls.length).toBe(3);
      await confirm(tab);
      await expect.poll(async () => (await probe(tab)).cursor).toBe(0);
      expect((await probe(tab)).calls.map((call) => call.uncertain)).toEqual([false, true, true]);
      expect(await redo(tab).isEnabled()).toBe(true);
      await expect.poll(() => tab.locator('[data-role="status"]').textContent()).toBe("");
      expect(await tab.locator('[data-role="status"]').getAttribute("aria-busy")).toBe("false");
      expect(errors).toEqual([]);
    } finally { await tab.close(); }
  }, 120000);

  it("erhält Eingaben während der Anfrage und startet nach Destroy keine neue Navigation", async () => {
    const { tab, errors } = await open();
    try {
      await tab.evaluate(() => (globalThis as unknown as HarnessScope).__register());
      await undo(tab).click();
      await expect.poll(async () => (await probe(tab)).calls.length).toBe(1);
      await tab.evaluate(() => (globalThis as unknown as HarnessScope).__session.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neue Eingabe" }));
      await confirm(tab);
      await expect.poll(() => tab.locator('[data-role="status"]').textContent()).toContain("Editorstand");
      expect(await probe(tab)).toMatchObject({ cursor: 2, text: "Neue Eingabe", versions: { pageVersion: 1, themeVersion: 1 } });
      expect(await undo(tab).isDisabled()).toBe(true);
      await tab.evaluate(() => {
        const scope = globalThis as unknown as HarnessScope;
        scope.__canvas.destroy();
        scope.__session.failExternalAction(scope.__session.pendingExternalId!);
      });
      expect(await tab.evaluate(() => (globalThis as unknown as HarnessScope).__canvas.undoAsync())).toBe(false);
      expect(await tab.evaluate(() => (globalThis as unknown as HarnessScope).__canvas.undo())).toBe(false);
      expect((await probe(tab)).text).toBe("Neue Eingabe");
      expect(errors).toEqual([]);
    } finally { await tab.close(); }
  }, 120000);

  it("verweigert einen anderen Session-Store und meldet nach Destroy keine verspätete Antwort", async () => {
    const { tab, errors } = await open();
    try {
      expect(await tab.evaluate(() => (globalThis as unknown as HarnessScope).__mismatch())).toContain("denselben Store");
      expect(await tab.locator(".senify-canvas").count()).toBe(1);
      await tab.evaluate(() => (globalThis as unknown as HarnessScope).__register());
      await undo(tab).click();
      await expect.poll(async () => (await probe(tab)).calls.length).toBe(1);
      const messages = await tab.evaluate(() => {
        const scope = globalThis as unknown as HarnessScope;
        scope.__canvas.destroy();
        return scope.__messages;
      });
      // Destroy owns only the projection, not the externally owned session.
      await confirm(tab);
      await expect.poll(async () => (await probe(tab)).cursor).toBe(0);
      expect(await tab.evaluate(() => (globalThis as unknown as HarnessScope).__messages)).toBe(messages);
      expect(await tab.locator(".senify-canvas").count()).toBe(0);
      expect(errors).toEqual([]);
    } finally { await tab.close(); }
  }, 120000);
});
