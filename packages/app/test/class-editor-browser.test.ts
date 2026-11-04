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
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`);
      await waitForFrame();
      const frame = () => tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').contentFrame();
      const node = (id: string) => frame().locator(`[data-node-id="${id}"]`);
      await node("frame00001").click({ timeout: 30000 });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("textbox", { name: "Name der neuen Klasse" }).fill("cta");
      await tab.getByRole("button", { name: "Anlegen", exact: true }).click();
      await tab.getByRole("button", { name: "cta", exact: true }).waitFor();
      const background = tab.locator('.senify-inspector__field[data-key="background"] input[data-control="color-text"]');
      await background.fill("#123456");
      await background.dispatchEvent("change");
      await node("frame00002").click();
      await tab.getByRole("combobox", { name: "Vorhandene Klasse hinzufügen" }).selectOption({ label: "cta" });
      const color = (id: string) => node(id).evaluate((element) => {
        const target = element as unknown as { ownerDocument: { defaultView: { getComputedStyle(node: unknown): { backgroundColor: string } } } };
        return target.ownerDocument.defaultView.getComputedStyle(element).backgroundColor;
      });
      await expect.poll(() => color("frame00001")).toBe("rgb(18, 52, 86)");
      await expect.poll(() => color("frame00002")).toBe("rgb(18, 52, 86)");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.reload();
      await node("frame00002").click({ timeout: 30000 });
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
      await node("frame00001").click();
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
      await node("frame00003").click({ timeout: 30000 });
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
      await node("frame00003").click();
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
      await staleNode.click();
      await stale.locator('.senify-inspector__tab[data-tab="style"]').click();
      await stale.getByRole("button", { name: "cta", exact: true }).click();
      const staleBackground = stale.locator('.senify-inspector__field[data-key="background"] input[data-control="color-text"]');
      await tab.locator('.senify-canvas__button[data-action="device"][data-device="desktop"]').click();
      await node("frame00003").click();
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
      await staleNode.click();
      await stale.locator('.senify-inspector__tab[data-tab="style"]').click();
      await stale.getByRole("button", { name: "cta", exact: true }).click();
      expect(await staleBackground.inputValue()).toBe("#112233");
      await staleBackground.fill("#334455");
      await staleBackground.dispatchEvent("change");
      await expect.poll(async () => stale.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await stale.close();

      await tab.route("**/api/library-components", (route) => route.fulfill({ status: 503, json: { error: { message: "Offline" } } }));
      await tab.reload();
      await waitForFrame();
      await tab.locator('.senify-canvas__button[data-action="device"][data-device="desktop"]').click();
      await node("frame00003").click();
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("button", { name: "cta", exact: true }).waitFor();
      await tab.unroute("**/api/library-components");
      await tab.route(`**/api/sites/${site.id}/style-rules`, (route) => route.fulfill({ status: 503, json: { error: { message: "Offline" } } }));
      await tab.reload();
      await tab.getByRole("alert").getByText("Die Klassen konnten nicht geladen werden.", { exact: false }).waitFor();
      expect(await tab.locator(".senify-canvas__frame").count()).toBe(0);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120_000);
});
