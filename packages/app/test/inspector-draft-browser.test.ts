import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb, openInspectorCategory } from "./support.ts";

// Der Inspektor baut bei jedem Store-Ereignis neu — auch beim Autosave-Status.
// Tippt jemand gerade einen Stilwert und der Flush landet zwischen Eingabe und
// `change`, muss der Entwurf trotzdem im Canvas ankommen. Gemessen (12.11.2026):
// der Neu-Render entfernt das fokussierte Feld, der Browser feuert daraufhin
// `change` auf dem alten Element — so committet der Entwurf. Der Lauf haelt die
// Speicher-Anfrage kuenstlich an, sodass der Flush garantiert zwischen Fuellen
// und Commit landet, und prueft die Farbe im Canvas.

const author = { kind: "human", id: "programm", label: "Programm" };

describe.skipIf(!browserAvailable)("inspector draft in a real browser", () => {
  it("keeps a typed style value when the autosave flush re-renders the inspector", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-inspector-draft-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const browser = await chromium.launch({ headless: true });
    try {
      expect((await fetch(`${running.dashboardUrl}/editor.js`)).status).toBe(200);
      const site = (await (await post("/api/sites", { name: "Inspektor-Entwurf" })).json()) as {
        id: string;
      };
      const page = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const applied = await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: { type: "hero", props: { headline: "Entwurf-Prüfung" } },
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

      // Die Speicher-Anfrage anhalten: der Flush landet erst nach dem Fuellen.
      let releaseSave: () => void = () => {};
      const saveHeld = new Promise<void>((resolve) => {
        releaseSave = resolve;
      });
      let saveRequested = false;
      await tab.route("**/editor-mutations", async (route) => {
        saveRequested = true;
        await saveHeld;
        await route.continue();
      });

      const pageUrl = `${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`;
      await tab.goto(pageUrl, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".senify-canvas", { timeout: 30000 });
      const desktopFrame = () =>
        tab
          .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
          .contentFrame();
      await desktopFrame().locator(`[data-node-id="${heroId}"]`).first().waitFor({
        timeout: 30000,
      });

      // Eine echte Bearbeitung erzeugt den pending Autosave: Divider hinter dem
      // Hero einfuegen (Plus-Punkt armed das Ziel, Kachel fuegt ein).
      const heroNode = desktopFrame().locator(`[data-node-id="${heroId}"]`).first();
      await heroNode.hover();
      await expect
        .poll(async () => tab.locator('.senify-canvas__plus[data-position="after"]').count())
        .toBe(1);
      await tab.locator('.senify-canvas__plus[data-position="after"]').click();
      await tab.locator('.senify-elements__tile[data-primitive="divider"]').click();
      const dividerNode = desktopFrame().locator('section[data-section="divider"]').first();
      await expect
        .poll(async () => desktopFrame().locator('section[data-section="divider"]').count())
        .toBe(1);

      await dividerNode.click();
      await tab.waitForSelector(".senify-inspector", { timeout: 30000 });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await openInspectorCategory(tab, "style/background");
      const backgroundField = tab.locator(
        '.senify-inspector__field[data-key="background"] input',
      );
      await backgroundField.waitFor({ timeout: 30000 });
      await backgroundField.fill("#123456");

      // Der Flush laeuft jetzt garantiert zwischen Fuellen und Commit: die
      // Anfrage startete (pending Edit), sie wird freigegeben, der Store meldet
      // "Gespeichert" — und der Inspektor baut neu, waehrend der Fokus im Feld ist.
      await expect.poll(() => saveRequested, { timeout: 15000 }).toBe(true);
      releaseSave();
      await expect
        .poll(async () => (await tab.locator('[data-role="canvas-status"]').textContent())?.trim(), { timeout: 20000 })
        .toBe("Gespeichert");
      await backgroundField.dispatchEvent("change");
      await expect
        .poll(async () =>
          dividerNode.evaluate((element) => {
            const target = element as unknown as {
              ownerDocument: {
                defaultView: {
                  getComputedStyle(node: unknown): { backgroundColor: string };
                };
              };
            };
            return target.ownerDocument.defaultView.getComputedStyle(element).backgroundColor;
          }),
          { timeout: 15000 },
        )
        .toBe("rgb(18, 52, 86)");
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});