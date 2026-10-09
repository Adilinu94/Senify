import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Das Elemente-Panel (E4) im echten Editor: neuer Reiter im Explorer, Kacheln
// in Kategorien, Suche, Einfuegen per Klick und per Ziehen. Beide Wege laufen
// ueber denselben Controller wie die Schnellzugriff-Chips. Wie die anderen
// Browsertests entfaellt der Lauf, wenn Playwright fehlt.

const author = { kind: "human", id: "programm", label: "Programm" };

describe.skipIf(!browserAvailable)("elements panel in a real browser", () => {
  it("lists the tiles, searches, and inserts by click and by drag", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-elements-panel-"));
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
      const site = (await (await post("/api/sites", { name: "Elemente-Panel" })).json()) as { id: string };
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
            node: { type: "hero", props: { headline: "Elemente-Pruefung" } },
          },
        ],
      });
      expect(applied.status).toBe(200);
      const fresh = (await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json()) as {
        draft: { rootNodeId: string; nodes: Record<string, { children?: string[] }> };
      };
      const heroId = (fresh.draft.nodes[fresh.draft.rootNodeId]?.children ?? [])[0] ?? "";
      expect(heroId).not.toBe("");

      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      const errors: string[] = [];
      tab.on("pageerror", (error) => errors.push(error.message));

      const pageUrl = `${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`;
      let mounted = false;
      for (let attempt = 0; attempt < 3 && !mounted; attempt += 1) {
        await tab.goto(pageUrl, { waitUntil: "domcontentloaded" });
        mounted = await tab
          .waitForSelector(".senify-canvas", { timeout: 30000 })
          .then(() => true)
          .catch(() => false);
      }
      expect(mounted).toBe(true);
      const desktopFrame = () =>
        tab.locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe').contentFrame();
      const hero = desktopFrame().locator(`[data-node-id="${heroId}"]`).first();
      await hero.waitFor({ timeout: 30000 });
      const dividerCount = (): Promise<number> => desktopFrame().locator('section[data-section="divider"]').count();

      // Der neue Reiter: 22 Kacheln in fuenf Kategorien, alle Symbole gezeichnet.
      await tab.locator('.senify-explorer__tab[data-tab="elements"]').click();
      expect(await tab.locator(".senify-elements__group").count()).toBe(5);
      expect(await tab.locator(".senify-elements__tile").count()).toBe(22);
      const iconBox = await tab.locator(".senify-elements__tile .ic").first().boundingBox();
      expect(iconBox?.width).toBe(20);

      // Suche: ein Treffer, Esc leert sie.
      const search = tab.locator(".senify-elements__search");
      await search.fill("divider");
      await expect.poll(() => tab.locator(".senify-elements__tile").count()).toBe(1);
      await search.press("Escape");
      await expect.poll(() => tab.locator(".senify-elements__tile").count()).toBe(22);

      // Ohne Auswahl fuegt ein Klick nichts ein.
      await tab.locator('.senify-elements__tile[data-primitive="divider"]').click();
      expect(await dividerCount()).toBe(0);

      // Mit Auswahl fuegt ein Klick hinter dem Knoten ein; Suchtext und Panel
      // ueberstehen das Neuzeichnen des Explorers.
      await hero.click();
      await expect.poll(() => tab.locator(`.senify-canvas[data-selected="${heroId}"]`).count()).toBe(1);
      await search.fill("divider");
      await tab.locator('.senify-elements__tile[data-primitive="divider"]').click();
      await expect.poll(dividerCount).toBe(1);
      expect(await search.inputValue()).toBe("divider");
      expect(await tab.locator(".senify-elements__tile").count()).toBe(1);

      // Ziehen setzt per Drag and Drop: die Kachel auf die untere Haelfte des Heros.
      await tab.locator('.senify-explorer__tab[data-tab="elements"]').click();
      await tab.locator('.senify-elements__tile[data-primitive="divider"]').dragTo(hero, {
        targetPosition: { x: 40, y: 8 },
      });
      await expect.poll(dividerCount).toBe(2);
      // Speichern (Strangler E2): ein Katalog-Baustein ohne Section-Zwilling wird
      // eingefuegt, gespeichert und liegt danach im Baum der Engine. Der
      // Speichern-Knopf zaehlt wieder auf null, nichts bleibt haengen.
      await search.fill("");
      await hero.click();
      await expect.poll(() => tab.locator(`.senify-canvas[data-selected="${heroId}"]`).count()).toBe(1);
      for (const type of ["heading", "frame"]) {
        await tab.locator(`.senify-elements__tile[data-primitive="${type}"]`).click();
      }
      const saveButton = tab.locator('[data-action="canvas-save"]');
      await expect.poll(async () => (await saveButton.textContent()) ?? "").toMatch(/Speichern \(\d+\)/);
      await saveButton.click();
      await expect.poll(async () => (await saveButton.textContent())?.trim()).toBe("Speichern");
      expect(await tab.getByText("nicht speicherbar").count()).toBe(0);
      const stored = (await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json()) as {
        draft: { nodes: Record<string, { type: string }> };
      };
      const types = Object.values(stored.draft.nodes).map((node) => node.type);
      expect(types).toContain("heading");
      expect(types).toContain("frame");
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
    }
  }, 180000);
});
