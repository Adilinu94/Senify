import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Das Elemente-Panel (E4/E5) im echten Editor: linke Spalte, Kacheln in
// Kategorien, Suche, Einfuegen per Klick und per Ziehen, Panel-Wechsel mit der
// Auswahl und die drei Wege zurueck. Beide Wege laufen
// ueber denselben Controller wie die Schnellzugriff-Chips. Wie die anderen
// Browsertests entfaellt der Lauf, wenn Playwright fehlt.

const author = { kind: "human", id: "programm", label: "Programm" };

describe.skipIf(!browserAvailable)("elements panel in a real browser", () => {
  it("lists the tiles, inserts, and swaps with the settings on selection", async () => {
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

      const elements = tab.locator(".canvas-view__elements");
      const inspector = tab.locator(".canvas-view__inspector");

      // Ohne Auswahl steht links das Elemente-Panel: 22 Kacheln in fuenf
      // Kategorien, alle Symbole gezeichnet; der Inspektor ist weg (E5).
      await expect.poll(() => elements.isVisible()).toBe(true);
      expect(await inspector.isVisible()).toBe(false);
      expect(await tab.locator(".senify-elements__group").count()).toBe(5);
      expect(await tab.locator(".senify-elements__tile").count()).toBe(22);
      const iconBox = await tab.locator(".senify-elements__tile .ic").first().boundingBox();
      expect(iconBox?.width).toBe(20);

      // Der Schnellzugriff-Streifen unter der Werkzeugleiste ist weg: das
      // Elemente-Panel ist die eine Quelle fuer Bausteine (E7).
      expect(await tab.locator(".senify-canvas__catalog, .senify-canvas__chip").count()).toBe(0);

      // Suche: ein Treffer, Esc leert sie.
      const search = tab.locator(".senify-elements__search");
      await search.fill("divider");
      await expect.poll(() => tab.locator(".senify-elements__tile").count()).toBe(1);
      await search.press("Escape");
      await expect.poll(() => tab.locator(".senify-elements__tile").count()).toBe(22);

      // Ein Klick haengt das Element ans Ende der Seite; Suchtext und Panel
      // ueberstehen das Neuzeichnen.
      await search.fill("divider");
      await tab.locator('.senify-elements__tile[data-primitive="divider"]').click();
      await expect.poll(dividerCount).toBe(1);
      expect(await search.inputValue()).toBe("divider");
      await search.fill("");

      // Ein Plus-Punkt im Canvas merkt das Ziel: das Panel zeigt "Einfuegen vor
      // ...", die naechste Kachel fuegt genau dort ein (hier vor dem Hero), und
      // das Ziel ist danach wieder weg.
      const sectionOrder = (): Promise<(string | null)[]> =>
        desktopFrame().locator("section[data-section]").evaluateAll((nodes) =>
          nodes.map((node) => (node as unknown as { getAttribute(name: string): string | null }).getAttribute("data-section")),
        );
      await expect.poll(sectionOrder).toEqual(["hero", "divider"]);
      await hero.hover();
      await tab.locator('.senify-canvas__plus[data-position="before"]').click();
      const hint = tab.locator(".senify-elements__target");
      await expect.poll(() => hint.isVisible()).toBe(true);
      expect(await hint.textContent()).toMatch(/Einfügen vor /);
      await tab.locator('.senify-elements__tile[data-primitive="divider"]').click();
      await expect.poll(sectionOrder).toEqual(["divider", "hero", "divider"]);
      expect(await hint.isVisible()).toBe(false);

      // Das Kreuz im Hinweis verwirft das Ziel; die naechste Kachel haengt dann
      // wieder ans Ende der Seite.
      await hero.hover();
      await tab.locator('.senify-canvas__plus[data-position="after"]').click();
      await expect.poll(() => hint.isVisible()).toBe(true);
      await tab.locator(".senify-elements__target-cancel").click();
      await expect.poll(() => hint.isVisible()).toBe(false);
      await tab.locator('.senify-elements__tile[data-primitive="divider"]').click();
      await expect.poll(sectionOrder).toEqual(["divider", "hero", "divider", "divider"]);
      // Zurueck auf den Ausgangsstand, damit der Rest des Tests unveraendert gilt.
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(sectionOrder).toEqual(["hero", "divider"]);

      // Panel-Wechsel: die Auswahl ersetzt die Elemente durch "<Name> bearbeiten".
      await hero.click();
      await expect.poll(() => tab.locator(`.senify-canvas[data-selected="${heroId}"]`).count()).toBe(1);
      await expect.poll(() => inspector.isVisible()).toBe(true);
      expect(await elements.isVisible()).toBe(false);
      expect(await tab.locator(".senify-inspector__title").textContent()).toMatch(/ bearbeiten$/);

      // Rueckweg 1: der Zurueck-Knopf.
      await tab.locator(".senify-inspector__back").click();
      await expect.poll(() => elements.isVisible()).toBe(true);
      expect(await inspector.isVisible()).toBe(false);

      // Rueckweg 2: Esc im Inspektor. In einem Eingabefeld gibt Esc nur das Feld frei.
      await hero.click();
      await expect.poll(() => inspector.isVisible()).toBe(true);
      await tab.locator(".senify-inspector__back").focus();
      await tab.keyboard.press("Escape");
      await expect.poll(() => elements.isVisible()).toBe(true);

      // Rueckweg 3: ein Leerklick im Canvas loest die Auswahl.
      await hero.click();
      await expect.poll(() => inspector.isVisible()).toBe(true);
      // Ein Klick, der keinen Knoten trifft (der Seitenhintergrund im Frame).
      await desktopFrame().locator("body").dispatchEvent("click");
      await expect.poll(() => elements.isVisible()).toBe(true);

      // Ziehen setzt per Drag and Drop: die Kachel auf die untere Haelfte des Heros.
      await tab.locator('.senify-elements__tile[data-primitive="divider"]').dragTo(hero, {
        targetPosition: { x: 40, y: 8 },
      });
      await expect.poll(dividerCount).toBe(2);

      // Struktur (E6): die rechte Spalte heisst so, und ihr Kontextmenue bleibt am
      // rechten Fensterrand ganz sichtbar statt abgeschnitten zu werden.
      expect(await tab.locator(".senify-explorer__title").textContent()).toBe("Struktur");
      await tab.locator(".senify-explorer__item").filter({ hasText: "hero" }).first().click({ button: "right" });
      const menu = tab.locator('[data-role="context-menu"]');
      await menu.waitFor({ timeout: 10000 });
      const menuBox = await menu.boundingBox();
      const viewport = tab.viewportSize();
      expect((menuBox?.x ?? 0) + (menuBox?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
      expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
      await tab.keyboard.press("Escape");
      // Der Rechtsklick hat den Knoten gewaehlt: zurueck zu den Elementen.
      await tab.locator(".senify-inspector__back").click();
      await expect.poll(() => elements.isVisible()).toBe(true);

      // Speichern (Strangler E2): Katalog-Bausteine ohne Section-Zwilling werden
      // eingefuegt, gespeichert und liegen danach im Baum der Engine. Der
      // Speichern-Knopf zaehlt wieder auf null, nichts bleibt haengen.
      for (const type of ["heading", "frame"]) {
        await tab.locator(`.senify-elements__tile[data-primitive="${type}"]`).click();
      }
      const saveButton = tab.locator('[data-action="canvas-save"]');
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
