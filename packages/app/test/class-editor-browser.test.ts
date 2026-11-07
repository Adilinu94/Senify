import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { bakePages, Store } from "@senify/engine";
import { browserAvailable, memoryDb } from "./support.ts";

describe.skipIf(!browserAvailable)("class editing in the editor", () => {
  it("creates, assigns and edits a shared class across reloads", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-classes-"));
    const running = await startProgram({ db: database.db, dataDir, programTokenFile: join(dataDir, "token.json"), enginePort: 0, appPort: 0, openBrowser: false, reviewVisuals: false, rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 } });
    const browser = await chromium.launch({ headless: true });
    try {
      const post = (path: string, body: unknown): Promise<Response> => fetch(`${running.dashboardUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const site = await (await post("/api/sites", { name: "Klassen" })).json() as { id: string };
      const page = await (await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })).json() as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const seed = await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        author: { kind: "human", id: "programm", label: "Programm" },
        mutations: ["frame00001", "frame00002"].map((id) => ({ op: "insertNode", parent: { nodeId: page.draft.rootNodeId }, node: { id, type: "frame", props: { width: "200px", height: "80px" } } })),
      });
      expect(seed.status).toBe(200);
      const tab = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      const waitForFrame = () => tab.waitForFunction('document.querySelector(".canvas-view__stage")?.dataset.startFit != null', undefined, { timeout: 30000 });
      const recoverHistory = async () => {
        const readCheckpoint = () => tab.evaluate(`(() => {
          const key = Object.keys(sessionStorage).find((key) => key.startsWith("senify:editor-history:") && key.endsWith(location.hash.split("/").at(-1) ?? ""));
          return key ? sessionStorage.getItem(key) : null;
        })()`);
        const checkpoint = await readCheckpoint();
        expect(await tab.locator('.senify-canvas__button[data-action="undo"]').isDisabled()).toBe(true);
        await tab.getByRole("tab", { name: "Variablen", exact: true }).click();
        await tab.locator('[data-variable-status]').getByText("Der gespeicherte Verlauf passt nicht", { exact: false }).waitFor();
        await tab.getByRole("button", { name: "Prüfung beenden …", exact: true }).click();
        await tab.getByRole("button", { name: "Weiter prüfen", exact: true }).click();
        expect(await readCheckpoint()).toBe(checkpoint);
        await tab.getByRole("button", { name: "Prüfung beenden …", exact: true }).click();
        await tab.getByRole("button", { name: "Prüfung beenden und Editorstand laden", exact: true }).click();
        await tab.locator('[data-variable-status]').getByText("Prüfung beendet. Der aktuelle Editorstand wurde geladen.", { exact: true }).waitFor();
        await tab.getByRole("tab", { name: "Bearbeiten", exact: true }).click();
      };
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`);
      await waitForFrame();
      const frame = () => tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').contentFrame();
      const node = (id: string) => frame().locator(`[data-node-id="${id}"]`);
      await node("frame00001").click({ timeout: 30000, position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("textbox", { name: "Name der neuen Klasse" }).fill("cta");
      await tab.getByRole("button", { name: "Anlegen", exact: true }).click();
      await tab.getByRole("button", { name: "cta", exact: true }).waitFor();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      const classNames = async () => {
        const response = await (await fetch(`${running.dashboardUrl}/api/sites/${site.id}/style-rules`)).json() as { rules: Array<{ name: string }> };
        return response.rules.map((rule) => rule.name);
      };
      expect(await classNames()).not.toContain("cta");
      await tab.locator('.senify-canvas__button[data-action="redo"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      expect(await classNames()).toContain("cta");
      await tab.getByRole("button", { name: "cta", exact: true }).click();
      const targetColor = (name: string) => tab.getByRole("button", { name, exact: true }).evaluate((element) => {
        const target = element as unknown as { ownerDocument: { defaultView: { getComputedStyle(node: unknown): { backgroundColor: string } } } };
        return target.ownerDocument.defaultView.getComputedStyle(element).backgroundColor;
      });
      expect(await targetColor("cta")).toBe("rgb(94, 234, 212)");
      await tab.getByRole("button", { name: "Lokal", exact: true }).click();
      expect(await targetColor("Lokal")).toBe("rgb(240, 171, 252)");
      await tab.getByRole("button", { name: "cta", exact: true }).click();
      await tab.evaluate('document.documentElement.dataset.mode = "dark"');
      expect(await targetColor("cta")).toBe("rgb(94, 234, 212)");
      await tab.getByRole("button", { name: "Lokal", exact: true }).click();
      expect(await targetColor("Lokal")).toBe("rgb(240, 171, 252)");
      await tab.evaluate('document.documentElement.dataset.mode = "light"');
      await tab.getByRole("button", { name: "cta", exact: true }).click();
      const background = tab.locator('.senify-inspector__field[data-key="background"] input[data-control="color-text"]');
      await background.fill("#123456");
      await background.dispatchEvent("change");
      await node("frame00002").click({ position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("searchbox", { name: "Klassen suchen" }).fill("unbekannt");
      expect(await tab.getByRole("combobox", { name: "Vorhandene Klasse hinzufügen" }).locator("option").allTextContents()).toEqual(["Keine Klasse gefunden"]);
      await tab.getByRole("searchbox", { name: "Klassen suchen" }).fill("CTA");
      await tab.getByRole("combobox", { name: "Vorhandene Klasse hinzufügen" }).selectOption({ label: "cta" });
      const color = (id: string) => node(id).evaluate((element) => {
        const target = element as unknown as { ownerDocument: { defaultView: { getComputedStyle(node: unknown): { backgroundColor: string } } } };
        return target.ownerDocument.defaultView.getComputedStyle(element).backgroundColor;
      });
      await expect.poll(() => color("frame00001")).toBe("rgb(18, 52, 86)");
      await expect.poll(() => color("frame00002")).toBe("rgb(18, 52, 86)");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.reload();
      await node("frame00002").click({ timeout: 30000, position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("button", { name: "cta", exact: true }).click();
      await background.fill("#abcdef");
      await background.dispatchEvent("change");
      await expect.poll(() => color("frame00001")).toBe("rgb(171, 205, 239)");
      await expect.poll(() => color("frame00002")).toBe("rgb(171, 205, 239)");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.reload();
      await expect.poll(() => color("frame00001"), { timeout: 15000 }).toBe("rgb(171, 205, 239)");
      await expect.poll(() => color("frame00002")).toBe("rgb(171, 205, 239)");

      // A scoped rule belonging to the first page must not prevent the second
      // page from loading the site's global classes.
      await node("frame00001").click({ position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("button", { name: "Lokal", exact: true }).click();
      await tab.locator('.senify-inspector__state[data-state="focus"]').click();
      await background.fill("#102030");
      await background.dispatchEvent("change");
      await tab.locator('.senify-inspector__state[data-state="basis"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");

      const other = await (await post(`/api/sites/${site.id}/pages`, { title: "Zweite Seite", path: "/zweite" })).json() as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const otherSeed = await post(`/api/pages/${other.id}/mutations`, {
        baseDraftVersion: other.draftVersion,
        author: { kind: "human", id: "programm", label: "Programm" },
        mutations: [{ op: "insertNode", parent: { nodeId: other.draft.rootNodeId }, node: { id: "frame00003", type: "frame", props: { width: "200px", height: "80px" } } }],
      });
      expect(otherSeed.status).toBe(200);
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${other.id}`);
      await waitForFrame();
      await node("frame00003").click({ timeout: 30000, position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("combobox", { name: "Vorhandene Klasse hinzufügen" }).selectOption({ label: "cta" });
      await background.fill("#445566");
      await background.dispatchEvent("change");
      await expect.poll(() => color("frame00003")).toBe("rgb(68, 85, 102)");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.locator('.senify-canvas__button[data-action="device"][data-device="mobile"]').click();
      const mobileFrame = tab.locator('.senify-canvas__frame[data-device="mobile"] iframe').contentFrame();
      const mobileColor = () => mobileFrame.locator('[data-node-id="frame00003"]').evaluate((element) => {
        const target = element as unknown as { ownerDocument: { defaultView: { getComputedStyle(node: unknown): { backgroundColor: string } } } };
        return target.ownerDocument.defaultView.getComputedStyle(element).backgroundColor;
      });
      await background.fill("#667788");
      await background.dispatchEvent("change");
      await expect.poll(mobileColor, { timeout: 15000 }).toBe("rgb(102, 119, 136)");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.locator('.senify-canvas__button[data-action="device"][data-device="desktop"]').click();
      await expect.poll(() => color("frame00003"), { timeout: 15000 }).toBe("rgb(68, 85, 102)");
      await tab.locator('.senify-inspector__state[data-state="hover"]').click();
      await background.fill("#334455");
      await background.dispatchEvent("change");
      await expect.poll(() => color("frame00003")).toBe("rgb(51, 68, 85)");
      await tab.locator('.senify-inspector__state[data-state="basis"]').click();
      await expect.poll(() => color("frame00003")).toBe("rgb(68, 85, 102)");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`);
      await expect.poll(() => color("frame00001"), { timeout: 15000 }).toBe("rgb(68, 85, 102)");
      await expect.poll(() => color("frame00002")).toBe("rgb(68, 85, 102)");
      // The other page changed the shared registry: its predecessor checkpoint
      // must be explicitly abandoned, not silently reused or overwritten.
      await recoverHistory();
      await node("frame00001").click({ position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("button", { name: "cta", exact: true }).click();
      await tab.getByRole("button", { name: "Verwendung anzeigen" }).click();
      await tab.getByText("Start (/) · 2 Elemente").waitFor();
      await tab.getByText("Zweite Seite (/zweite) · 1 Elemente").waitFor();

      // A rename follows the class across drafts and is itself undoable.
      await tab.getByRole("textbox", { name: "Klassenname ändern" }).fill("cta-neu");
      await tab.getByRole("button", { name: "Umbenennen", exact: true }).click();
      await tab.getByRole("button", { name: "cta-neu", exact: true }).waitFor();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      const otherClasses = async () => {
        const otherPage = await (await fetch(`${running.dashboardUrl}/api/pages/${other.id}`)).json() as { draft: { nodes: Record<string, { classes?: string[] }> } };
        return otherPage.draft.nodes.frame00003?.classes;
      };
      expect(await otherClasses()).toContain("cta-neu");
      await expect.poll(() => color("frame00002")).toBe("rgb(68, 85, 102)");
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      expect(await otherClasses()).toContain("cta");
      await tab.locator('.senify-canvas__button[data-action="redo"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      expect(await otherClasses()).toContain("cta-neu");
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      expect(await otherClasses()).toContain("cta");

      // A duplicate is independent, retains responsive and state styles, and
      // is assigned only to the selected element.
      await node("frame00002").click({ position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("button", { name: "cta", exact: true }).click();
      await tab.getByRole("button", { name: "Klasse duplizieren" }).click();
      await tab.getByRole("button", { name: "cta-kopie", exact: true }).waitFor();
      expect(await tab.getByRole("button", { name: "cta-kopie", exact: true }).getAttribute("aria-pressed")).toBe("true");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      const copies = await (await fetch(`${running.dashboardUrl}/api/sites/${site.id}/style-rules`)).json() as {
        rules: Array<{ id: string; name: string; styles: Record<string, unknown>; states?: Record<string, unknown>; contextStyles: Record<string, unknown> }>;
      };
      const original = copies.rules.find((rule) => rule.name === "cta");
      const copy = copies.rules.find((rule) => rule.name === "cta-kopie");
      expect(copy?.styles).toEqual(original?.styles);
      expect(copy?.states).toEqual(original?.states);
      expect(copy?.contextStyles).toEqual(original?.contextStyles);
      await background.fill("#987654");
      await background.dispatchEvent("change");
      await expect.poll(async () => {
        const latest = await (await fetch(`${running.dashboardUrl}/api/sites/${site.id}/style-rules`)).json() as { rules: Array<{ name: string; styles: Record<string, unknown> }> };
        return latest.rules.find((rule) => rule.name === "cta-kopie")?.styles.background;
      }, { timeout: 20000 }).toBe("#987654");
      await expect.poll(() => color("frame00002")).toBe("rgb(152, 118, 84)");
      await expect.poll(() => color("frame00001")).toBe("rgb(68, 85, 102)");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.reload();
      await waitForFrame();
      await expect.poll(() => color("frame00002")).toBe("rgb(152, 118, 84)");
      await node("frame00002").click({ position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("button", { name: "cta-kopie", exact: true }).waitFor();
      await tab.getByRole("button", { name: "Klasse cta-kopie entfernen" }).click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      expect(copy).toBeDefined();
      const cleanup = await fetch(`${running.dashboardUrl}/api/sites/${site.id}/style-rules/${copy!.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: "{}" });
      expect(cleanup.status).toBe(204);

      const store = new Store(database.db);
      const persistedSite = await store.getSite(site.id);
      const outDir = join(dataDir, "class-bake");
      await bakePages(store, { site: persistedSite, pages: await store.listPageDrafts(site.id), outDir, dataDir });
      const css = readFileSync(join(outDir, "assets", "style-rules.css"), "utf8");
      expect(css).toContain(".cta");
      expect(css).toContain("#445566");
      expect(css).toContain("#667788");
      expect(css).toContain("#334455");
      expect(readFileSync(join(outDir, "index.html"), "utf8")).toMatch(/class="[^"]*\bcta\b/);
      expect(readFileSync(join(outDir, "zweite", "index.html"), "utf8")).toMatch(/class="[^"]*\bcta\b/);

      // Clearing a breakpoint and a pseudo-state must survive another load.
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${other.id}`);
      await waitForFrame();
      await node("frame00003").click({ position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("button", { name: "cta", exact: true }).click();
      await tab.locator('.senify-inspector__state[data-state="hover"]').click();
      await tab.locator('.senify-inspector__field[data-key="background"] [data-action="reset"]').click();
      await tab.locator('.senify-inspector__state[data-state="basis"]').click();
      await tab.locator('.senify-canvas__button[data-action="device"][data-device="mobile"]').click();
      await tab.locator('.senify-inspector__field[data-key="background"] [data-action="reset"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.reload();
      await waitForFrame();
      await tab.locator('.senify-canvas__button[data-action="device"][data-device="mobile"]').click();
      await expect.poll(mobileColor, { timeout: 15000 }).toBe("rgb(68, 85, 102)");
      const rules = await (await fetch(`${running.dashboardUrl}/api/sites/${site.id}/style-rules`)).json() as { rules: Array<{ name: string; styles: Record<string, unknown>; states?: Record<string, unknown> }> };
      const cta = rules.rules.find((entry) => entry.name === "cta");
      expect(cta?.styles.background_mobile).toBeUndefined();
      expect(cta?.states?.hover).toBeUndefined();

      // A class conflict must reload the site registry, not just the page.
      const stale = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      await stale.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${other.id}`);
      await stale.waitForFunction('document.querySelector(".canvas-view__stage")?.dataset.startFit != null', undefined, { timeout: 30000 });
      const staleNode = stale.locator('.senify-canvas__frame[data-device="desktop"] iframe').contentFrame().locator('[data-node-id="frame00003"]');
      await staleNode.click({ position: { x: 6, y: 6 } });
      await stale.locator('.senify-inspector__tab[data-tab="style"]').click();
      await stale.getByRole("button", { name: "cta", exact: true }).click();
      const staleBackground = stale.locator('.senify-inspector__field[data-key="background"] input[data-control="color-text"]');
      await tab.locator('.senify-canvas__button[data-action="device"][data-device="desktop"]').click();
      await node("frame00003").click({ position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("button", { name: "cta", exact: true }).click();
      await background.fill("#112233");
      await background.dispatchEvent("change");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await staleBackground.fill("#223344");
      await staleBackground.dispatchEvent("change");
      const dialog = stale.getByRole("dialog");
      await dialog.getByRole("heading", { name: "Klassen wurden inzwischen geändert" }).waitFor();
      expect(await dialog.locator('[data-action="conflict-retry"]').isVisible()).toBe(false);
      await dialog.locator('[data-action="conflict-reload"]').click();
      await expect.poll(async () => stale.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Neu geladen");
      await staleNode.click({ position: { x: 6, y: 6 } });
      await stale.locator('.senify-inspector__tab[data-tab="style"]').click();
      await stale.getByRole("button", { name: "cta", exact: true }).click();
      expect(await staleBackground.inputValue()).toBe("#112233");
      await staleBackground.fill("#334455");
      await staleBackground.dispatchEvent("change");
      await expect.poll(async () => stale.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await stale.close();

      const secondRule = await post(`/api/sites/${site.id}/style-rules`, { name: "second", styles: { background: "#ff0000" } });
      expect(secondRule.status).toBe(201);
      await tab.reload();
      await waitForFrame();
      await recoverHistory();
      await tab.locator('.senify-canvas__button[data-action="device"][data-device="desktop"]').click();
      await node("frame00003").click({ position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("combobox", { name: "Vorhandene Klasse hinzufügen" }).selectOption({ label: "second" });
      await expect.poll(() => color("frame00003")).toBe("rgb(255, 0, 0)");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.getByRole("button", { name: "Klassenreihenfolge" }).click();
      await tab.getByRole("button", { name: "Klasse cta höher priorisieren" }).click();
      await expect.poll(() => color("frame00003")).toBe("rgb(51, 68, 85)");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(() => color("frame00003")).toBe("rgb(255, 0, 0)");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.locator('.senify-canvas__button[data-action="redo"]').click();
      await expect.poll(() => color("frame00003")).toBe("rgb(51, 68, 85)");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.reload();
      await expect.poll(() => color("frame00003"), { timeout: 15000 }).toBe("rgb(51, 68, 85)");

      // Global deletion removes every saved assignment; undo and redo restore
      // the full cross-page state, not only the current page.
      await node("frame00003").click({ position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("button", { name: "cta", exact: true }).click();
      await tab.getByRole("button", { name: "Global löschen …" }).click();
      await tab.getByText("Gespeicherter Stand: 3 Elemente auf 2 Seiten.", { exact: false }).waitFor();
      await tab.getByRole("button", { name: "Auf allen Seiten löschen" }).click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      const firstPageClasses = async () => {
        const firstPage = await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json() as { draft: { nodes: Record<string, { classes?: string[] }> } };
        return firstPage.draft.nodes.frame00002?.classes ?? [];
      };
      expect(await firstPageClasses()).not.toContain("cta");
      await expect.poll(() => color("frame00003")).toBe("rgb(255, 0, 0)");
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      expect(await firstPageClasses()).toContain("cta");
      await expect.poll(() => color("frame00003")).toBe("rgb(51, 68, 85)");
      await tab.locator('.senify-canvas__button[data-action="redo"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      expect(await firstPageClasses()).not.toContain("cta");
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      expect(await firstPageClasses()).toContain("cta");

      await tab.route("**/api/library-components", (route) => route.fulfill({ status: 503, json: { error: { message: "Offline" } } }));
      await tab.reload();
      await waitForFrame();
      await tab.locator('.senify-canvas__button[data-action="device"][data-device="desktop"]').click();
      await node("frame00003").click({ position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("button", { name: "cta", exact: true }).waitFor();
      await tab.unroute("**/api/library-components");
      await tab.route(`**/api/sites/${site.id}/style-rules`, (route) => route.fulfill({ status: 503, json: { error: { message: "Offline" } } }));
      await tab.reload();
      await tab.getByRole("alert").getByText("Die Klassen konnten nicht geladen werden.", { exact: false }).waitFor();
      expect(await tab.locator(".senify-canvas__frame").count()).toBe(0);
      await tab.unroute(`**/api/sites/${site.id}/style-rules`);
      await tab.route(`**/api/sites/${site.id}/theme`, (route) => route.fulfill({ status: 503, json: { error: { message: "Offline" } } }));
      await tab.reload();
      await tab.getByRole("alert").getByText("Die Variablen konnten nicht geladen werden.", { exact: false }).waitFor();
      expect(await tab.locator(".senify-canvas__frame").count()).toBe(0);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120_000);
});
