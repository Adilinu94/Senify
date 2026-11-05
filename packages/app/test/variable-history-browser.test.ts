import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

async function fixture(exposeSession = false) {
  const { chromium } = await import("playwright");
  const database = memoryDb();
  const dataDir = mkdtempSync(join(tmpdir(), "senify-shared-variable-history-"));
  const running = await startProgram({ db: database.db, dataDir, programTokenFile: join(dataDir, "token.json"), enginePort: 0, appPort: 0, openBrowser: false, reviewVisuals: false, rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 } });
  const browser = await chromium.launch({ headless: true });
  const request = (path: string, body: unknown, method = "POST") => fetch(`${running.dashboardUrl}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const site = await (await request("/api/sites", { name: "Gemeinsame History" })).json() as { id: string };
  const page = await (await request(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })).json() as { id: string; draftVersion: number; draft: { rootNodeId: string } };
  expect((await request(`/api/sites/${site.id}/theme`, { theme: { tokens: { primitive: { color: { marker: "#123456", andere: "#654321" } } } } }, "PUT")).status).toBe(200);
  expect((await request(`/api/pages/${page.id}/mutations`, { baseDraftVersion: page.draftVersion, mutations: [
    { op: "insertNode", parent: { nodeId: page.draft.rootNodeId }, node: { id: "frame00001", type: "frame", props: { width: "200px", height: "80px" } } },
  ] })).status).toBe(200);
  expect((await request(`/api/sites/${site.id}/style-rules`, { name: "gemeinsam", styles: { background: "#ffffff" } })).status).toBe(201);
  const tab = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  if (exposeSession) await tab.route("**/app.js", async (route) => {
    const upstream = await route.fetch();
    const source = await upstream.text();
    const anchor = "const savedUi = session.ui();";
    expect(source.split(anchor)).toHaveLength(2);
    await route.fulfill({ response: upstream, body: source.replace(anchor, `window.__historyTestSession = session; ${anchor}`) });
  });
  const ready = () => tab.waitForFunction('document.querySelector(".canvas-view__stage")?.dataset.startFit != null', undefined, { timeout: 30000 });
  await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`);
  await ready();
  const saved = () => expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
  const getPage = async () => (await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json()) as { draftVersion: number; draft: { nodes: Record<string, { type: string; props: Record<string, unknown> }> } };
  const getTheme = async () => (await (await fetch(`${running.dashboardUrl}/api/sites/${site.id}/theme`)).json()) as { version: number; theme: { tokens: { primitive: { color: Record<string, string> } } } };
  const getRules = async () => (await (await fetch(`${running.dashboardUrl}/api/sites/${site.id}/style-rules`)).json()) as { rules: { name: string; styles: Record<string, unknown> }[] };
  const rawRules = async () => {
    const result = await database.db.query<{ style_rules_json: unknown }>("SELECT style_rules_json FROM sites WHERE id = $1", [site.id]);
    const data = result.rows[0]!.style_rules_json;
    return (typeof data === "string" ? JSON.parse(data) : data) as Record<string, unknown>[];
  };
  const history = async () => {
    await tab.getByRole("button", { name: "Verlauf", exact: true }).click();
    const labels = await tab.locator(".senify-history__row").allTextContents();
    await tab.getByRole("button", { name: "Verlauf schließen" }).click();
    return labels;
  };
  const addHeading = async () => {
    await tab.getByRole("tab", { name: "Elemente" }).click();
    await tab.getByRole("button", { name: "Überschrift", exact: true }).click();
    await saved();
  };
  const deleteVariable = async () => {
    await tab.getByRole("tab", { name: "Variablen" }).click();
    await tab.getByRole("button", { name: "Farbe marker löschen", exact: true }).click();
    await tab.getByRole("button", { name: "Farbe marker löschen bestätigen" }).click();
  };
  const navigate = (direction: "undo" | "redo") => tab.locator(`.senify-canvas__button[data-action="${direction}"]`).click();
  const deleteClass = async () => {
    await tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').contentFrame().locator('[data-node-id="frame00001"]').click();
    await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
    await tab.getByRole("combobox", { name: "Vorhandene Klasse hinzufügen" }).selectOption({ label: "gemeinsam" });
    await saved();
    await tab.getByRole("button", { name: "Global löschen …" }).click();
    await tab.getByRole("button", { name: "Auf allen Seiten löschen" }).click();
    await saved();
  };
  const checkpointAt = (cursor: number) => expect.poll(() => tab.evaluate(({ siteId, pageId, cursor }) => {
    const saved = JSON.parse(sessionStorage.getItem(`senify:editor-history:${siteId}:${pageId}`) ?? "null");
    return sessionStorage.getItem(`senify:pending-variable:${siteId}:${pageId}`) === null && saved?.checkpoint.history.cursor === cursor;
  }, { siteId: site.id, pageId: page.id, cursor })).toBe(true);
  return { tab, site, page, request, ready, saved, getPage, getTheme, getRules, rawRules, history, addHeading, deleteVariable, deleteClass, checkpointAt, navigate, async close() {
    await browser.close();
    await running.close();
    await database.close();
    rmSync(dataDir, { recursive: true, force: true });
  } };
}

describe.skipIf(!browserAvailable)("gemeinsame Variablen-History in der App", () => {
  it.each(["session", "store", "pipeline"])("erhält eine direkte %s-Observer-Eingabe bei ausdrücklicher Recovery", async (observer) => {
    const f = await fixture(true);
    try {
      await f.deleteVariable(); await f.checkpointAt(1);
      const theme = await f.getTheme();
      expect((await f.request(`/api/sites/${f.site.id}/theme`, { baseVersion: theme.version, theme: { tokens: { primitive: { color: { andere: "#abcdef" } } } } }, "PUT")).status).toBe(200);
      await f.tab.reload(); await f.ready();
      await f.tab.getByRole("tab", { name: "Variablen" }).click();
      await f.tab.evaluate(`(() => {
        const session = window.__historyTestSession;
        let written = false;
        const target = ${JSON.stringify(observer)} === "session" ? session : session[${JSON.stringify(observer)}];
        target.subscribe(() => {
          if (written || session.pendingExternalId !== null) return;
          written = true;
          session.apply({ op: "setNodeProp", id: "frame00001", key: "width", value: "321px" });
          window.__historyObserverPending = session.saveState().pending;
        });
      })()`);
      await f.tab.getByRole("button", { name: "Prüfung beenden …", exact: true }).click();
      await f.tab.getByRole("button", { name: "Prüfung beenden und Editorstand laden", exact: true }).click();
      await f.tab.locator('[data-variable-status]').getByText("Prüfung beendet. Der aktuelle Editorstand wurde geladen.", { exact: true }).waitFor();
      expect(await f.tab.evaluate(`({ width: window.__historyTestSession.document.nodes.frame00001.props.width, history: window.__historyTestSession.store.history.size, observerPending: window.__historyObserverPending })`)).toEqual({ width: "321px", history: 1, observerPending: 1 });
      await f.saved();
      expect((await f.getPage()).draft.nodes.frame00001?.props.width).toBe("321px");
      await f.checkpointAt(1);
      await f.tab.reload(); await f.ready();
      expect(await f.history()).toHaveLength(1);
      await f.navigate("undo"); await f.saved();
      expect((await f.getPage()).draft.nodes.frame00001?.props.width).toBe("200px");
    } finally { await f.close(); }
  }, 120_000);

  it("speichert nach Recovery ohne Auswahl den vollständigen aktuellen Versionssatz", async () => {
    const f = await fixture();
    try {
      await f.deleteVariable(); await f.checkpointAt(1);
      const page = await f.getPage();
      expect((await f.request(`/api/pages/${f.page.id}/editor-mutations`, { baseDraftVersion: page.draftVersion, mutations: [{ op: "setNodeProp", id: "frame00001", key: "width", value: "222px" }] })).status).toBe(200);
      await f.tab.reload(); await f.ready();
      expect((await f.request(`/api/sites/${f.site.id}/style-rules`, { name: "spaeter", styles: { background: "#abcdef" } })).status).toBe(201);
      const registry = await (await fetch(`${f.tab.url().split("/#/")[0]}/api/sites/${f.site.id}/style-rules`)).json() as { version: number };
      const next = { pageVersion: (await f.getPage()).draftVersion, themeVersion: (await f.getTheme()).version, registryVersion: registry.version };
      await f.tab.getByRole("tab", { name: "Variablen" }).click();
      await f.tab.getByRole("button", { name: "Prüfung beenden …", exact: true }).click();
      await f.tab.getByRole("button", { name: "Prüfung beenden und Editorstand laden", exact: true }).click();
      await f.tab.locator('[data-variable-status]').getByText("Prüfung beendet. Der aktuelle Editorstand wurde geladen.", { exact: true }).waitFor();
      expect(await f.tab.evaluate(({ siteId, pageId }) => JSON.parse(sessionStorage.getItem(`senify:editor-history:${siteId}:${pageId}`)!).checkpoint.versions, { siteId: f.site.id, pageId: f.page.id })).toEqual(next);
      await f.tab.reload(); await f.ready();
      await f.tab.getByRole("tab", { name: "Variablen" }).click();
      expect(await f.tab.getByRole("button", { name: "Prüfung beenden …", exact: true }).count()).toBe(0);
    } finally { await f.close(); }
  }, 120_000);

  it("erhält Checkpoint und gemeinsame Belege bei verlorener Legacy-Rename-Antwort über Reload", async () => {
    const f = await fixture();
    try {
      await f.deleteClass();
      await f.deleteVariable(); await f.checkpointAt(3);
      const readCheckpoint = () => f.tab.evaluate(({ siteId, pageId }) => sessionStorage.getItem(`senify:editor-history:${siteId}:${pageId}`), { siteId: f.site.id, pageId: f.page.id });
      const confirmed = await readCheckpoint();
      const bodies: unknown[] = [];
      await f.tab.route(`**/api/sites/${f.site.id}/theme/variables/color/andere/rename`, async (route) => {
        bodies.push(route.request().postDataJSON());
        const upstream = await route.fetch();
        expect(upstream.status()).toBe(200);
        if (bodies.length === 1) await route.fulfill({ status: 503, json: { error: { message: "Rename-Antwort verloren" } } });
        else await route.fulfill({ response: upstream });
      });
      await f.tab.getByRole("button", { name: "Farbe andere umbenennen", exact: true }).click();
      await f.tab.getByRole("textbox", { name: "Neuer Name für Farbe andere", exact: true }).fill("anders");
      await f.tab.getByRole("button", { name: "Farbe andere umbenennen bestätigen", exact: true }).click();
      await f.tab.locator('[data-variable-status]').getByText("Rename-Antwort verloren", { exact: true }).waitFor();
      expect(await readCheckpoint()).toBe(confirmed);
      const pending = await f.tab.evaluate(({ siteId, pageId }) => sessionStorage.getItem(`senify:pending-variable:${siteId}:${pageId}`), { siteId: f.site.id, pageId: f.page.id });
      await f.tab.reload(); await f.ready();
      expect(await readCheckpoint()).toBe(confirmed);
      expect(await f.tab.evaluate(({ siteId, pageId }) => sessionStorage.getItem(`senify:pending-variable:${siteId}:${pageId}`), { siteId: f.site.id, pageId: f.page.id })).toBe(pending);
      expect(await f.tab.locator('.senify-canvas__button[data-action="undo"]').isDisabled()).toBe(true);
      await f.tab.getByRole("tab", { name: "Variablen" }).click();
      await f.tab.getByRole("button", { name: "Prüfung beenden …", exact: true }).click();
      await f.tab.getByRole("button", { name: "Weiter prüfen", exact: true }).click();
      expect(await readCheckpoint()).toBe(confirmed);
      expect(bodies).toHaveLength(1);
      await f.tab.getByRole("button", { name: "Ausstehenden Variablenvorgang prüfen", exact: true }).click();
      await f.tab.locator('[data-variable-status]').getByText("Variable umbenannt.", { exact: true }).waitFor();
      expect(bodies[1]).toEqual(bodies[0]);
      // This slice retains the existing separate Rename contract: only the
      // confirmed retry may clear prior history. Token migration follows later.
      expect(await f.history()).toHaveLength(0);
      expect((await f.getTheme()).theme.tokens.primitive.color.anders).toBe("#654321");
      await f.tab.reload(); await f.ready();
      expect(await f.tab.locator('.senify-canvas__button[data-action="undo"]').isDisabled()).toBe(true);
      await f.tab.getByRole("tab", { name: "Variablen" }).click();
      expect(await f.tab.getByRole("button", { name: "Ausstehenden Variablenvorgang prüfen", exact: true }).count()).toBe(0);
    } finally { await f.close(); }
  }, 120_000);

  it("erhält einen bestätigten Checkpoint nach Fremd-Theme-Write bis zur bewussten Reload-Recovery", async () => {
    const f = await fixture();
    try {
      await f.addHeading();
      await f.deleteVariable(); await f.checkpointAt(2);
      const readCheckpoint = () => f.tab.evaluate(({ siteId, pageId }) => sessionStorage.getItem(`senify:editor-history:${siteId}:${pageId}`), { siteId: f.site.id, pageId: f.page.id });
      const confirmed = await readCheckpoint();
      const theme = await f.getTheme();
      expect((await f.request(`/api/sites/${f.site.id}/theme`, { baseVersion: theme.version, theme: { tokens: { primitive: { color: { andere: "#abcdef" } } } } }, "PUT")).status).toBe(200);
      const writes: string[] = [];
      f.tab.on("request", (request) => { if (["POST", "PUT"].includes(request.method()) && request.url().includes(`/api/sites/${f.site.id}/theme`)) writes.push(request.url()); });
      await f.tab.reload(); await f.ready();
      expect(await readCheckpoint()).toBe(confirmed);
      expect(await f.tab.locator('.senify-canvas__button[data-action="undo"]').isDisabled()).toBe(true);
      await f.tab.getByRole("tab", { name: "Variablen" }).click();
      await f.tab.locator('[data-variable-status]').getByText("Der gespeicherte Verlauf passt nicht", { exact: false }).waitFor();
      expect(await f.tab.getByRole("button", { name: "Ausstehenden Variablenvorgang prüfen", exact: true }).count()).toBe(0);
      await f.tab.getByRole("textbox", { name: "Farbe andere", exact: true }).fill("#112233");
      await f.tab.getByRole("button", { name: "Farbe andere speichern", exact: true }).click();
      await f.tab.locator('[data-variable-status]').getByText("Bitte zuerst den ausstehenden Variablenvorgang prüfen.", { exact: true }).waitFor();
      expect(writes).toEqual([]);
      expect((await f.getTheme()).theme.tokens.primitive.color.andere).toBe("#abcdef");
      await f.tab.reload(); await f.ready();
      expect(await readCheckpoint()).toBe(confirmed);
      await f.tab.getByRole("tab", { name: "Variablen" }).click();
      await f.tab.getByRole("button", { name: "Prüfung beenden …", exact: true }).click();
      await f.tab.getByRole("button", { name: "Weiter prüfen", exact: true }).click();
      expect(await readCheckpoint()).toBe(confirmed);
      await f.tab.getByRole("button", { name: "Prüfung beenden …", exact: true }).click();
      await f.tab.getByRole("button", { name: "Prüfung beenden und Editorstand laden", exact: true }).click();
      await f.tab.locator('[data-variable-status]').getByText("Prüfung beendet. Der aktuelle Editorstand wurde geladen.", { exact: true }).waitFor();
      expect(await f.history()).toHaveLength(0);
      expect(writes).toEqual([]);
      expect(await f.tab.evaluate(({ siteId, pageId }) => sessionStorage.getItem(`senify:pending-variable:${siteId}:${pageId}`), { siteId: f.site.id, pageId: f.page.id })).toBeNull();
      await f.tab.getByRole("textbox", { name: "Farbe andere", exact: true }).fill("#112233");
      await f.tab.getByRole("button", { name: "Farbe andere speichern", exact: true }).click();
      await f.tab.locator('[data-variable-status]').getByText("Gespeichert", { exact: true }).waitFor();
      expect(writes).toHaveLength(1);
      expect((await f.getTheme()).theme.tokens.primitive.color.andere).toBe("#112233");
    } finally { await f.close(); }
  }, 120_000);

  it.each([false, true])("erhält den gemeinsamen Verlauf nach gewöhnlichem Variablenspeichern (Reload=%s)", async (reload) => {
    const f = await fixture();
    try {
      await f.addHeading();
      await f.deleteVariable(); await f.checkpointAt(2);
      for (const value of ["#abcdef", "#654321"]) {
        await f.tab.getByRole("textbox", { name: "Farbe andere", exact: true }).fill(value);
        await f.tab.getByRole("button", { name: "Farbe andere speichern", exact: true }).click();
        await expect.poll(async () => (await f.getTheme()).theme.tokens.primitive.color.andere).toBe(value);
        await f.tab.locator('[data-variable-status]').getByText("Gespeichert", { exact: true }).waitFor();
      }
      if (reload) { await f.tab.reload(); await f.ready(); }
      expect(await f.history()).toHaveLength(2);
      await f.navigate("undo"); await f.checkpointAt(1);
      expect((await f.getTheme()).theme.tokens.primitive.color.marker).toBe("#123456");
      await f.navigate("undo"); await f.saved();
      expect(Object.values((await f.getPage()).draft.nodes).filter((node) => node.type === "heading")).toHaveLength(0);
    } finally { await f.close(); }
  }, 120_000);

  it.each(["delete", "restore"] as const)("übernimmt einen bestätigten älteren Pending-%s-Retry als neuen gemeinsamen Schritt", async (action) => {
    const f = await fixture();
    try {
      await f.addHeading();
      const receiptId = "legacy-pending-beleg";
      const body = async () => ({ receiptId, baseThemeVersion: (await f.getTheme()).version,
        pageContext: { pageId: f.page.id, baseDraftVersion: (await f.getPage()).draftVersion } });
      if (action === "restore") expect((await f.request(`/api/sites/${f.site.id}/theme/variables/color/marker/delete`, await body())).status).toBe(200);
      const operation = { action, group: "color", name: "marker", body: await body() };
      expect((await f.request(`/api/sites/${f.site.id}/theme/variables/color/marker/${action}`, operation.body)).status).toBe(200);
      await f.tab.evaluate(({ siteId, pageId, operation }) => {
        sessionStorage.setItem(`senify:pending-variable:${siteId}:${pageId}`, JSON.stringify(operation));
      }, { siteId: f.site.id, pageId: f.page.id, operation });
      await f.tab.reload(); await f.ready();
      expect(await f.tab.locator('.senify-canvas__button[data-action="undo"]').isDisabled()).toBe(true);
      const bodies: unknown[] = [];
      await f.tab.route(`**/api/sites/${f.site.id}/theme/variables/color/marker/${action}`, async (route) => {
        bodies.push(route.request().postDataJSON());
        await route.continue();
      });
      await f.tab.getByRole("tab", { name: "Variablen" }).click();
      await f.tab.getByRole("button", { name: "Ausstehenden Variablenvorgang prüfen" }).click();
      await f.tab.locator('[data-variable-status]').getByText(action === "delete" ? "Variable gelöscht." : "Variable wiederhergestellt.", { exact: true }).waitFor();
      expect(bodies).toEqual([operation.body]);
      expect(await f.history()).toHaveLength(1);
      await f.checkpointAt(1);
      await f.tab.reload(); await f.ready();
      await f.navigate("undo"); await f.checkpointAt(0);
      expect((await f.getTheme()).theme.tokens.primitive.color.marker).toBe(action === "delete" ? "#123456" : undefined);
      expect(Object.values((await f.getPage()).draft.nodes).filter((node) => node.type === "heading")).toHaveLength(1);
    } finally { await f.close(); }
  }, 120_000);

  it("kürzt beim Pending-Reload den verworfenen Klassen-Redo-Zweig samt Belegen", async () => {
    const f = await fixture();
    try {
      await f.deleteClass();
      await f.navigate("undo"); await f.saved(); await f.checkpointAt(1);
      const bodies: unknown[] = [];
      await f.tab.route(`**/api/sites/${f.site.id}/theme/variables/color/marker/delete`, async (route) => {
        bodies.push(route.request().postDataJSON());
        const upstream = await route.fetch();
        expect(upstream.status()).toBe(200);
        if (bodies.length === 1) await route.fulfill({ status: 503, json: { error: { message: "Antwort verloren" } } });
        else await route.fulfill({ response: upstream });
      });
      await f.deleteVariable();
      await f.tab.locator('[data-variable-status]').getByText("Antwort verloren").waitFor();
      await f.tab.reload(); await f.ready();
      await f.tab.getByRole("tab", { name: "Variablen" }).click();
      await f.tab.getByRole("button", { name: "Ausstehenden Variablenvorgang prüfen" }).click();
      await f.checkpointAt(2);
      expect(bodies[1]).toEqual(bodies[0]);
      expect(await f.history()).toHaveLength(2);
      const checkpoint = await f.tab.evaluate(({ siteId, pageId }) => JSON.parse(sessionStorage.getItem(`senify:editor-history:${siteId}:${pageId}`)!).checkpoint, { siteId: f.site.id, pageId: f.page.id });
      expect(checkpoint.classDeletionReceipts).toEqual([]);
      await f.tab.reload(); await f.ready();
      await f.navigate("undo"); await f.checkpointAt(1);
      expect((await f.getRules()).rules.some((rule) => rule.name === "gemeinsam")).toBe(true);
      expect((await f.getTheme()).theme.tokens.primitive.color.marker).toBe("#123456");
    } finally { await f.close(); }
  }, 120_000);

  it("führt Klassen-Undo nach vollständig zurückgenommenen Variablenschritten aus", async () => {
    const f = await fixture();
    try {
      await f.deleteClass();
      await f.deleteVariable(); await f.checkpointAt(3);
      await f.navigate("undo"); await f.checkpointAt(2);
      await f.tab.reload(); await f.ready();
      await f.navigate("undo"); await f.saved(); await f.checkpointAt(1);
      expect((await f.getRules()).rules.some((rule) => rule.name === "gemeinsam")).toBe(true);
      expect((await f.getPage()).draft.nodes.frame00001).toMatchObject({ classes: ["gemeinsam"] });
      await f.navigate("redo"); await f.saved();
      await f.navigate("redo"); await f.checkpointAt(3);
      expect((await f.getRules()).rules.some((rule) => rule.name === "gemeinsam")).toBe(false);
      expect((await f.getTheme()).theme.tokens.primitive.color.marker).toBeUndefined();
    } finally { await f.close(); }
  }, 120_000);

  it.each([false, true])("übernimmt einen älteren separaten Beleg (restored=%s) nur als neuen bestätigten Schritt", async (restored) => {
    const f = await fixture();
    try {
      await f.addHeading();
      const receiptId = "separater-legacy-beleg";
      const change = async (action: "delete" | "restore") => {
        const page = await f.getPage();
        const theme = await f.getTheme();
        expect((await f.request(`/api/sites/${f.site.id}/theme/variables/color/marker/${action}`, {
          receiptId, baseThemeVersion: theme.version, pageContext: { pageId: f.page.id, baseDraftVersion: page.draftVersion },
        })).status).toBe(200);
      };
      await change("delete");
      if (restored) await change("restore");
      await f.tab.evaluate(({ siteId, pageId, receiptId, restored }) => {
        sessionStorage.setItem(`senify:variable-history:${siteId}:${pageId}`, JSON.stringify({ kind: "delete", group: "color", name: "marker", receiptId, restored }));
      }, { siteId: f.site.id, pageId: f.page.id, receiptId, restored });
      await f.tab.reload();
      await f.ready();
      // Different versions require an explicit recovery, not silent migration
      // or removal of the independently stored legacy receipt.
      expect(await f.history()).toHaveLength(0);
      await f.tab.getByRole("tab", { name: "Variablen" }).click();
      expect(await f.tab.locator('.senify-canvas__button[data-action="undo"]').isDisabled()).toBe(true);
      await f.tab.getByRole("button", { name: "Prüfung beenden …", exact: true }).click();
      await f.tab.getByRole("button", { name: "Prüfung beenden und Editorstand laden", exact: true }).click();
      await f.tab.locator('[data-variable-status]').getByText("Prüfung beendet. Der aktuelle Editorstand wurde geladen.", { exact: true }).waitFor();
      expect(await f.tab.evaluate(({ siteId, pageId }) => JSON.parse(sessionStorage.getItem(`senify:variable-history:${siteId}:${pageId}`)!), { siteId: f.site.id, pageId: f.page.id })).toEqual({ kind: "delete", group: "color", name: "marker", receiptId, restored });
      await f.tab.getByRole("button", { name: restored ? "Löschen von marker wiederholen" : "Löschen von marker rückgängig", exact: true }).click();
      await f.tab.getByRole("status").getByText(restored ? "Variable gelöscht." : "Variable wiederhergestellt.").waitFor();
      expect(await f.history()).toHaveLength(1);
      await f.navigate("undo");
      await expect.poll(async () => (await f.getTheme()).theme.tokens.primitive.color.marker).toBe(restored ? "#123456" : undefined);
      // A server read may precede the navigation's GET checks and checkpoint
      // commit. Reload here tests confirmed history, not an in-flight request.
      await expect.poll(() => f.tab.evaluate(({ siteId, pageId }) => {
        const saved = JSON.parse(sessionStorage.getItem(`senify:editor-history:${siteId}:${pageId}`) ?? "null");
        return sessionStorage.getItem(`senify:pending-variable:${siteId}:${pageId}`) === null && saved?.checkpoint.history.cursor === 0;
      }, { siteId: f.site.id, pageId: f.page.id })).toBe(true);
      await f.tab.reload();
      await f.ready();
      await f.navigate("redo");
      await expect.poll(async () => (await f.getTheme()).theme.tokens.primitive.color.marker).toBe(restored ? undefined : "#123456");
      expect(Object.values((await f.getPage()).draft.nodes).filter((node) => node.type === "heading")).toHaveLength(1);
    } finally { await f.close(); }
  }, 120_000);

  it("erhält globale Klassenlöschbelege neben Variablenschritten über Reload und Redo-Zyklen", async () => {
    const f = await fixture();
    try {
      await f.addHeading();
      await f.deleteVariable();
      await f.tab.locator('[data-variable-status]').getByText("Variable gelöscht.").waitFor();
      await f.tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').contentFrame().locator('[data-node-id="frame00001"]').click();
      await f.tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await f.tab.getByRole("combobox", { name: "Vorhandene Klasse hinzufügen" }).selectOption({ label: "gemeinsam" });
      await f.saved();
      for (let cycle = 0; cycle < 2; cycle += 1) {
        if (cycle === 0) {
          await f.tab.getByRole("button", { name: "Global löschen …" }).click();
          await f.tab.getByRole("button", { name: "Auf allen Seiten löschen" }).click();
        } else await f.navigate("redo");
        await f.saved();
        expect((await f.getRules()).rules.some((rule) => rule.name === "gemeinsam")).toBe(false);
        await f.tab.reload();
        await f.ready();
        await f.navigate("undo");
        await f.saved();
        expect((await f.getRules()).rules.some((rule) => rule.name === "gemeinsam")).toBe(true);
        expect((await f.getPage()).draft.nodes.frame00001).toMatchObject({ classes: ["gemeinsam"] });
        expect((await f.getTheme()).theme.tokens.primitive.color.marker).toBeUndefined();
        await f.tab.reload();
        await f.ready();
      }
    } finally { await f.close(); }
  }, 120_000);

  it("erhält neue Eingaben bei verzögerter Undo-Bestätigung und Retry bis zur ausdrücklichen Recovery", async () => {
    const f = await fixture();
    let release!: () => void;
    try {
      await f.addHeading();
      await f.deleteVariable();
      await f.tab.getByRole("status").getByText("Variable gelöscht.").waitFor();
      const bodies: unknown[] = [];
      let captured!: () => void;
      const committed = new Promise<void>((resolve) => { captured = resolve; });
      const delayed = new Promise<void>((resolve) => { release = resolve; });
      await f.tab.route(`**/api/sites/${f.site.id}/theme/variables/color/marker/restore`, async (route) => {
        bodies.push(route.request().postDataJSON());
        const upstream = await route.fetch();
        expect(upstream.status()).toBe(200);
        if (bodies.length === 1) { captured(); await delayed; }
        await route.fulfill({ response: upstream });
      });
      await f.navigate("undo");
      await committed;
      expect(await f.tab.locator('.senify-canvas__button[data-action="undo"]').isDisabled()).toBe(true);
      await f.tab.getByRole("tab", { name: "Elemente" }).click();
      await f.tab.getByRole("button", { name: "Überschrift", exact: true }).click();
      const dialog = f.tab.locator('dialog[data-role="conflict-dialog"]');
      await expect.poll(() => dialog.getAttribute("open")).toBe("");
      release();
      // The conflicting input remains local until the human explicitly loads
      // the server. Neither the late answer nor Retry discards it silently.
      const frame = f.tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').contentFrame();
      await expect.poll(() => frame.locator('[data-widget="heading"]').count()).toBe(2);
      await expect.poll(() => f.tab.locator('.senify-canvas').getAttribute("data-history-status")).toBe("unresolved");
      await dialog.locator('[data-action="conflict-reload"]').click();
      // Closing the dialog only starts the reload. Wait for its document to
      // arrive; the unresolved History message intentionally remains visible.
      await expect.poll(() => frame.locator('[data-widget="heading"]').count()).toBe(1);
      const saved = f.tab.waitForResponse((response) => response.url().endsWith(`/api/pages/${f.page.id}/editor-mutations`) && response.request().method() === "POST");
      await f.tab.getByRole("tab", { name: "Elemente" }).click();
      await f.tab.getByRole("button", { name: "Überschrift", exact: true }).click();
      expect((await saved).status()).toBe(200);
      await expect.poll(async () => Object.values((await f.getPage()).draft.nodes).filter((node) => node.type === "heading").length).toBe(2);
      const savedDraft = (await f.getPage()).draft;
      await f.tab.getByRole("tab", { name: "Variablen" }).click();
      await f.tab.getByRole("button", { name: "Ausstehenden Variablenvorgang prüfen" }).click();
      await expect.poll(() => bodies.length).toBe(2);
      expect(bodies[1]).toEqual(bodies[0]);
      await f.tab.locator('[data-variable-status]').getByText("Der aktuelle Editorstand bestätigt den Vorgang nicht.", { exact: false }).waitFor();
      expect(await f.tab.locator('.senify-canvas__button[data-action="undo"]').isDisabled()).toBe(true);
      expect((await f.getPage()).draft).toEqual(savedDraft);
      await f.tab.getByRole("button", { name: "Prüfung beenden …", exact: true }).click();
      await f.tab.getByRole("button", { name: "Prüfung beenden und Editorstand laden", exact: true }).click();
      await f.tab.getByRole("status").getByText("Prüfung beendet. Der aktuelle Editorstand wurde geladen.").waitFor();
      expect((await f.getPage()).draft).toEqual(savedDraft);
      expect(await f.history()).toHaveLength(0);
      expect(await f.tab.evaluate(({ siteId, pageId }) => sessionStorage.getItem(`senify:pending-variable:${siteId}:${pageId}`), { siteId: f.site.id, pageId: f.page.id })).toBeNull();
    } finally { release?.(); await f.close(); }
  }, 120_000);

  it("navigiert Page-, Klassen- und Delete-Schritte in Reihenfolge und erhält den Cursor nach Reload", async () => {
    const f = await fixture();
    try {
      await f.addHeading();
      const originalRules = (await f.rawRules()).map(({ updatedAt: _updatedAt, ...rule }) => rule);
      const originalDraft = (await f.getPage()).draft;
      await f.deleteVariable();
      await f.tab.getByRole("status").getByText("Variable gelöscht.").waitFor();
      expect((await f.history()).some((label) => label.includes("Variable color.marker gelöscht"))).toBe(true);
      await f.tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').contentFrame().locator('[data-node-id="frame00001"]').click();
      await f.tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await f.tab.getByRole("combobox", { name: "Vorhandene Klasse hinzufügen" }).selectOption({ label: "gemeinsam" });
      await f.saved();
      const background = f.tab.locator('.senify-inspector__field[data-key="background"] input[data-control="color-text"]');
      await background.fill("#abcdef");
      await background.dispatchEvent("change");
      await f.saved();
      await f.tab.reload();
      await f.ready();
      expect((await f.history()).some((label) => label.includes("Variable color.marker gelöscht"))).toBe(true);
      await f.navigate("undo");
      await f.saved();
      expect((await f.getRules()).rules.find((rule) => rule.name === "gemeinsam")?.styles.background).toBe("#ffffff");
      await f.navigate("undo");
      await f.saved();
      expect((await f.getPage()).draft).toEqual(originalDraft);
      expect((await f.rawRules()).map(({ updatedAt: _updatedAt, ...rule }) => rule)).toEqual(originalRules);
      await f.navigate("undo");
      await expect.poll(async () => (await f.getTheme()).theme.tokens.primitive.color.marker).toBe("#123456");
      expect(Object.values((await f.getPage()).draft.nodes).filter((node) => node.type === "heading")).toHaveLength(1);
      await f.tab.reload();
      await f.ready();
      await f.navigate("undo");
      await f.saved();
      expect(Object.values((await f.getPage()).draft.nodes).filter((node) => node.type === "heading")).toHaveLength(0);
      await f.navigate("redo");
      await f.saved();
      await f.navigate("redo");
      await expect.poll(async () => (await f.getTheme()).theme.tokens.primitive.color.marker).toBeUndefined();
      await f.navigate("redo");
      await f.saved();
      await f.navigate("redo");
      await f.saved();
      expect((await f.getRules()).rules.find((rule) => rule.name === "gemeinsam")?.styles.background).toBe("#abcdef");
      // A new local action after undo removes only the abandoned redo branch.
      await f.navigate("undo");
      await f.saved();
      await f.addHeading();
      expect(await f.tab.locator('.senify-canvas__button[data-action="redo"]').isDisabled()).toBe(true);
      await f.tab.reload();
      await f.ready();
      expect(await f.tab.locator('.senify-canvas__button[data-action="redo"]').isDisabled()).toBe(true);
    } finally { await f.close(); }
  }, 120_000);

  it("prüft verlorene Delete-, Undo- und Redo-Antworten nach Reload mit derselben Request-Basis", async () => {
    const f = await fixture();
    try {
      await f.addHeading();
      const bodies: unknown[] = [];
      let lose = true;
      await f.tab.route(`**/api/sites/${f.site.id}/theme/variables/color/marker/*`, async (route) => {
        bodies.push(route.request().postDataJSON());
        const upstream = await route.fetch();
        expect(upstream.status()).toBe(200);
        if (lose) { lose = false; await route.fulfill({ status: 503, json: { error: { message: "History-Antwort verloren" } } }); }
        else await route.fulfill({ response: upstream });
      });
      await f.deleteVariable();
      for (const [cycle, direction] of (["undo", "redo", "undo"] as const).entries()) {
        await f.tab.getByRole("tabpanel", { name: "Variablen" }).getByRole("status").getByText("History-Antwort verloren").waitFor();
        expect(await f.tab.locator('.senify-canvas__button[data-action="undo"]').isDisabled()).toBe(true);
        await f.tab.reload();
        await f.ready();
        await f.tab.getByRole("tab", { name: "Variablen" }).click();
        await f.tab.getByRole("button", { name: "Ausstehenden Variablenvorgang prüfen" }).click();
        await expect.poll(() => bodies.length).toBe((cycle + 1) * 2);
        expect(bodies.at(-1)).toEqual(bodies.at(-2));
        await expect.poll(() => f.tab.getByRole("button", { name: "Ausstehenden Variablenvorgang prüfen" }).count()).toBe(0);
        expect((await f.history()).some((label) => label.includes("Variable color.marker gelöscht"))).toBe(true);
        lose = true;
        await f.navigate(direction);
      }
      await f.tab.getByRole("tabpanel", { name: "Variablen" }).getByRole("status").getByText("History-Antwort verloren").waitFor();
      await f.tab.getByRole("button", { name: "Ausstehenden Variablenvorgang prüfen" }).click();
      await expect.poll(async () => (await f.getTheme()).theme.tokens.primitive.color.marker).toBe("#123456");
      await f.navigate("undo");
      await f.saved();
      expect(Object.values((await f.getPage()).draft.nodes).filter((node) => node.type === "heading")).toHaveLength(0);
    } finally { await f.close(); }
  }, 120_000);

  it("behält lokale History über eine bestätigte Umbenennung und migriert Tokenverweise", async () => {
    const f = await fixture(true);
    try {
      await f.tab.evaluate(`window.__historyTestSession.apply({ op: "setNodeProp", id: "frame00001", key: "background", value: { $token: "color.marker" } })`);
      await f.saved();
      await f.tab.evaluate(`window.__historyTestSession.apply({ op: "setNodeProp", id: "frame00001", key: "background", value: { $token: "color.andere" } })`);
      await f.saved();

      await f.tab.getByRole("tab", { name: "Variablen" }).click();
      await f.tab.getByRole("button", { name: "Farbe marker umbenennen", exact: true }).click();
      await f.tab.getByRole("textbox", { name: "Neuer Name für Farbe marker" }).fill("marke");
      await f.tab.getByRole("button", { name: "Farbe marker umbenennen bestätigen" }).click();
      await f.tab.getByRole("status").getByText("Variable umbenannt.").waitFor();
      await f.saved();

      const retained = await f.tab.evaluate(`(() => { const session = window.__historyTestSession; return { json: JSON.stringify(session.store.history.entries()), canUndo: session.canUndo }; })()`) as { json: string; canUndo: boolean };
      expect(retained.canUndo).toBe(true);
      expect(retained.json).toContain("color.marke");
      expect(retained.json).not.toContain("color.marker");

      await f.navigate("undo");
      await f.saved();
      expect(await f.tab.evaluate(`window.__historyTestSession.document.nodes.frame00001?.props.background`)).toEqual({ $token: "color.marke" });

      await f.navigate("redo");
      await f.saved();
      expect((await f.getPage()).draft.nodes.frame00001!.props.background).toEqual({ $token: "color.andere" });
    } finally { await f.close(); }
  }, 120_000);
});
