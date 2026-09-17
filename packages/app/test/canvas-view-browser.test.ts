import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// The new canvas wired into the editor page (rebuild Phase 0, fifth slice): the
// page view keeps the old editor as the default and offers the canvas behind a
// switch. This run drives that switch in a real browser: the canvas appears with
// three device frames, a click selects, a widget inserts, Undo takes it back, a
// save round-trips through the engine, and the old editor still loads.
// Skipped when Playwright is missing (same contract as the other browser tests).

const author = { kind: "human", id: "programm", label: "Programm" };

describe.skipIf(!browserAvailable)("canvas view in a real browser", () => {
  it("switches views, selects, inserts, undoes, saves and reloads", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-canvas-view-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      // The run fires bursts of edits plus its own API calls.
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const browser = await chromium.launch({ headless: true });
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    // The visual evidence of the run lands in the scratch folder, next to the
    // other phase-0 shots (same place the handoff asks for).
    const shotDir = resolve(process.cwd(), ".scratch/refs/nick/canvas");
    mkdirSync(shotDir, { recursive: true });
    try {
      // Warm the on-demand editor bundle before the browser asks for it.
      expect((await fetch(`${running.dashboardUrl}/editor.js`)).status).toBe(200);

      const site = (await (await post("/api/sites", { name: "Canvas-Ansicht" })).json()) as {
        id: string;
      };
      const page = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      // Seed one real section, so the canvas renders a component and not an
      // empty page.
      const applied = await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: { type: "hero", props: { headline: "Canvas-Prüfung" } },
          },
        ],
      });
      expect(applied.status).toBe(200);
      const fresh = (await (
        await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)
      ).json()) as {
        draft: { rootNodeId: string; nodes: Record<string, { children?: string[] }> };
      };
      const heroId = (fresh.draft.nodes[fresh.draft.rootNodeId]?.children ?? [])[0] ?? "";
      expect(heroId).not.toBe("");

      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      const isFavicon = (url: string): boolean => url.endsWith("/favicon.ico");
      tab.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
      tab.on("requestfailed", (request) => {
        if (isFavicon(request.url())) return;
        failedRequests.push(`failed: ${request.url()} (${request.failure()?.errorText ?? "?"})`);
      });
      tab.on("response", (response) => {
        if (response.status() < 400 || isFavicon(response.url())) return;
        failedRequests.push(`http ${response.status()}: ${response.url()}`);
      });

      const pageUrl = `${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`;
      let mounted = false;
      for (let attempt = 0; attempt < 3 && !mounted; attempt += 1) {
        await tab.goto(pageUrl, { waitUntil: "domcontentloaded" });
        mounted = await tab
          .waitForSelector(".senify-editor", { timeout: 30000 })
          .then(() => true)
          .catch(() => false);
      }
      expect(mounted).toBe(true);

      // The default view stays the old editor and keeps working.
      expect(await tab.locator(".senify-editor__iframe").count()).toBe(3);
      expect(await tab.locator(".editor-switch button.active").textContent()).toBe(
        "Editor (bisher)",
      );
      await tab.screenshot({ path: join(shotDir, "01-editor-default.png") });

      // Switch to the canvas: the new view mounts with three device frames.
      await tab.locator('.editor-switch button[data-view="canvas"]').click();
      await tab.waitForSelector(".senify-canvas", { timeout: 30000 });
      expect(await tab.url()).toContain("view=canvas");
      expect(await tab.locator(".senify-canvas__frame").count()).toBe(3);
      expect(await tab.locator(".senify-canvas__iframe").count()).toBe(3);
      await tab.screenshot({ path: join(shotDir, "02-canvas-frames.png") });

      const desktopFrame = () =>
        tab
          .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
          .contentFrame();
      await desktopFrame().locator(`[data-node-id="${heroId}"]`).first().waitFor({
        timeout: 30000,
      });

      // A click selects the hero: stage marker and the store agree.
      await desktopFrame().locator(`[data-node-id="${heroId}"]`).first().click();
      await expect
        .poll(async () => tab.locator(`.senify-canvas[data-selected="${heroId}"]`).count())
        .toBe(1);
      await tab.screenshot({ path: join(shotDir, "03-canvas-selected.png") });

      // Insert a widget behind the selection, then Undo takes it back and Redo
      // puts it in again.
      await tab.selectOption('.senify-canvas__select', "divider");
      await tab.locator('.senify-canvas__button[data-action="insert-after"]').click();
      const dividerCount = (): Promise<number> =>
        desktopFrame().locator('section[data-section="divider"]').count();
      await expect.poll(dividerCount).toBe(1);
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(dividerCount).toBe(0);
      await tab.locator('.senify-canvas__button[data-action="redo"]').click();
      await expect.poll(dividerCount).toBe(1);
      await tab.screenshot({ path: join(shotDir, "04-canvas-insert.png") });

      // Saving sends the pending editor ops to the engine and bumps the draft.
      const save = tab.locator('[data-action="canvas-save"]');
      await expect.poll(async () => save.isEnabled()).toBe(true);
      await save.click();
      await expect.poll(async () => tab.locator("#page-version").textContent()).toBe("Draft v3");
      await expect.poll(async () => save.isEnabled()).toBe(false);
      await tab.screenshot({ path: join(shotDir, "05-canvas-saved.png") });

      // Round-trip: reload the canvas and the saved divider is still there.
      await tab.reload({ waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".senify-canvas", { timeout: 30000 });
      await expect.poll(dividerCount).toBe(1);

      // The old editor is still reachable and still lays out its frames.
      await tab.locator('.editor-switch button[data-view="editor"]').click();
      await tab.waitForSelector(".senify-editor", { timeout: 60000 });
      expect(await tab.locator(".senify-editor__iframe").count()).toBe(3);
      await tab.screenshot({ path: join(shotDir, "06-editor-again.png") });

      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180000);
});
