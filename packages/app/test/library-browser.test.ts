import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

const author = { kind: "human", id: "programm", label: "Programm" };
const definition = {
  rootNodeId: "lib-root",
  nodes: {
    "lib-root": {
      id: "lib-root",
      type: "__component",
      props: { name: "Bibliothekskarte", version: 1 },
      children: ["lib-body"],
    },
    "lib-body": {
      id: "lib-body",
      type: "block",
      props: { headline: "Aus der globalen Bibliothek" },
    },
  },
};

describe.skipIf(!browserAvailable)("global library in the program", () => {
  it("lists, opens, installs and exposes the library in the editor", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-library-browser-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const headers = { "content-type": "application/json" };
    const request = (method: string, path: string, body?: unknown) =>
      fetch(`${running.dashboardUrl}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const browser = await chromium.launch({ headless: true });
    try {
      const site = (await (await request("POST", "/api/sites", { name: "Bibliotheksprojekt" })).json()) as { id: string };
      const page = (await (
        await request("POST", `/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const component = (await (
        await request("POST", "/api/library-components", {
          name: "Bibliothekskarte",
          kind: "component",
          definition,
          fingerprint: "struct-library-browser",
          tags: ["card", "imported"],
          provenance: { kind: "framer-import", sourceUrl: "https://example.test", pagePath: "/", irHash: "ir-browser" },
          license: { id: "MIT", status: "verified" },
          notes: "Browser-Nachweis",
          author,
        })
      ).json()) as { id: string };

      const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      tab.setDefaultTimeout(30000);
      await tab.goto(`${running.dashboardUrl}/#/library`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".library-card");
      expect(await tab.locator(".library-card").count()).toBe(1);
      expect(await tab.locator(".library-card").textContent()).toContain("struct-library-browser");

      await tab.locator('.library-search input').fill("nicht-vorhanden");
      await expect.poll(async () => tab.locator(".library-card").count()).toBe(0);
      await tab.locator('.library-search input').fill("Bibliothekskarte");
      await expect.poll(async () => tab.locator(".library-card").count()).toBe(1);

      await tab.locator(".library-card a").first().click();
      await tab.waitForSelector(".library-detail");
      expect(await tab.locator(".library-detail").textContent()).toContain("Lizenz MIT");
      expect(await tab.locator(".library-detail").textContent()).toContain("Herkunft framer-import");

      await tab.locator(".library-toolbar select").selectOption(site.id);
      await tab.locator(".library-detail button.primary").click();
      await expect.poll(async () => tab.locator(".library-install").count()).toBe(1);
      expect(await tab.locator(".library-install").textContent()).toContain("Pin v1");

      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".senify-canvas");
      await tab.locator('.senify-explorer__tab[data-tab="library"]').click();
      const item = tab.locator(".senify-explorer__tabitem", { hasText: "Bibliothekskarte" });
      await expect.poll(async () => item.count()).toBe(1);
      await item.click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent()).toContain("installiert");

      const fresh = (await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json()) as {
        draft: { nodes: Record<string, { type: string; props: Record<string, unknown> }> };
      };
      expect(Object.values(fresh.draft.nodes).some((node) =>
        node.type === "__component_instance" && node.props.libraryComponentId === component.id,
      )).toBe(true);

      // Der Weg zurueck: Detach loest die Bindung, der Inhalt bleibt, und
      // Re-Attach haengt den Baustein wieder an. Beides im Browser, weil die
      // Oberflaeche den Weg anbieten muss.
      await tab.goto(`${running.dashboardUrl}/#/library/${component.id}`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".library-detail");
      const installRow = tab.locator(".library-install").first();
      await installRow.locator("button.danger").click();
      await expect.poll(async () => tab.locator(".library-install").count()).toBe(0);
      // Die Herkunft bleibt gemerkt - ohne sie gaebe es kein Re-Attach.
      await tab.locator(".library-reattach select").selectOption(site.id);
      await tab.locator(".library-reattach button").click();
      await expect.poll(async () => tab.locator(".library-install").count()).toBe(1);
      expect(await tab.locator(".library-install").first().textContent()).toContain("Pin v1");

      // Und der Inhalt der Seite ist nach dem Detach und Re-Attach noch da.
      const nachDetach = (await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json()) as {
        draft: { nodes: Record<string, { type: string; props: Record<string, unknown> }> };
      };
      expect(Object.values(nachDetach.draft.nodes).some((node) =>
        node.type === "__component_instance" && node.props.libraryComponentId === component.id,
      )).toBe(true);
      await tab.close();
    } finally {
      await browser.close();
      await running.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120_000);
});
