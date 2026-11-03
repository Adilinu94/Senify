import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

describe.skipIf(!browserAvailable)("imported page in the editor", () => {
  it("loads assets beyond the first media page and shows only the correct responsive variant", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-imported-editor-"));
    const running = await startProgram({ db: database.db, dataDir, programTokenFile: join(dataDir, "token.json"), enginePort: 0, appPort: 0, openBrowser: false, reviewVisuals: false });
    const browser = await chromium.launch({ headless: true });
    try {
      const post = (path: string, body: unknown): Promise<Response> => fetch(`${running.dashboardUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const site = await (await post("/api/sites", { name: "Import" })).json() as { id: string };
      const page = await (await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })).json() as { id: string };
      const tab = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      const offsets: number[] = [];
      await tab.route(`**/api/sites/${site.id}/assets?*`, async (route) => {
        const offset = Number(new URL(route.request().url()).searchParams.get("offset"));
        offsets.push(offset);
        const assets = offset === 0
          ? Array.from({ length: 200 }, (_, i) => ({ id: `dummy${i}`, filename: "dummy.png", kind: "image", variants: [] }))
          : [{ id: "last-image", filename: "image.png", kind: "image", variants: [] }];
        await route.fulfill({ json: { assets, hasMore: offset === 0 } });
      });
      await tab.route("**/assets/last-image/image.png*", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZAAAAABJRU5ErkJggg==", "base64") }));
      await tab.route(`**/api/pages/${page.id}`, async (route) => {
        const response = await route.fetch();
        const data = await response.json() as Record<string, unknown>;
        data.draft = { rootNodeId: "root", nodes: {
          root: { id: "root", type: "page", props: {}, children: ["image0001", "desktop01", "tablet001", "mobile001"] },
          image0001: { id: "image0001", type: "image", props: { asset: { assetId: "last-image" }, alt: "Testbild" } },
          desktop01: { id: "desktop01", type: "frame", props: { width: "200px", height: "40px" }, overrides: { tablet: { hidden: true }, mobile: { hidden: true } } },
          tablet001: { id: "tablet001", type: "frame", props: { width: "200px", height: "40px" }, hidden: true, overrides: { tablet: { hidden: false }, mobile: { hidden: true } } },
          mobile001: { id: "mobile001", type: "frame", props: { width: "200px", height: "40px" }, hidden: true, overrides: { tablet: { hidden: true }, mobile: { hidden: false } } },
        } };
        await route.fulfill({ response, json: data });
      });
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`);
      await tab.waitForSelector(".senify-canvas__iframe", { timeout: 30000 });
      expect(await tab.locator(".senify-canvas__iframe").count()).toBe(1);
      expect(await tab.getByRole("tab", { name: "Elemente" }).getAttribute("aria-selected")).toBe("true");
      await tab.getByRole("tab", { name: "Struktur" }).click();
      expect(await tab.locator(".canvas-view__explorer").isVisible()).toBe(true);
      await tab.getByRole("tab", { name: "Bearbeiten" }).click();
      expect(await tab.locator(".canvas-view__inspector").isVisible()).toBe(true);
      await tab.getByRole("tab", { name: "Elemente" }).click();
      const frame = (device: string) => tab.locator(`.senify-canvas__frame[data-device="${device}"] iframe`).contentFrame();
      await expect.poll(() => frame("desktop").locator('[data-node-id="desktop01"]').isVisible(), { timeout: 15000 }).toBe(true);
      await frame("desktop").locator('[data-node-id="desktop01"]').click();
      expect(await tab.getByRole("tab", { name: "Bearbeiten" }).getAttribute("aria-selected")).toBe("true");
      for (const [device, visible] of [["desktop", "desktop01"], ["tablet", "tablet001"], ["mobile", "mobile001"]] as const) {
        await tab.locator(`.senify-canvas__button[data-action="device"][data-device="${device}"]`).click();
        await expect.poll(() => frame(device).locator(`[data-node-id="${visible}"]`).isVisible(), { timeout: 15000 }).toBe(true);
        expect(await tab.locator(".senify-canvas__iframe").count()).toBe(1);
        for (const other of ["desktop01", "tablet001", "mobile001"].filter((id) => id !== visible)) {
          expect(await frame(device).locator(`[data-node-id="${other}"]`).isVisible()).toBe(false);
        }
        await expect.poll(() => frame(device).locator("img").evaluate((image: { naturalWidth: number }) => image.naturalWidth)).toBe(1);
      }
      expect(offsets).toEqual([0, 200]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120_000);
});
