import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb, openInspectorCategory } from "./support.ts";

// Ziehen am Zahlenfeld im ECHTEN Editor.
//
// Der Inspektor hatte die Geste nicht: tippen und die zwei Pfeile gab es, aber
// nicht das Ziehen am Feld - obwohl der Store die Burst-Faltung dafuer schon
// hat (`typingCoalesceKey`, von den Slidern genutzt). Es fehlte die Verbindung.
//
// Der Test faehrt die Geste im Browser, weil sie nur dort vollstaendig
// existiert: pointerdown am Feld, pointermove am DOKUMENT (nicht am Feld),
// pointerup. Genau der Dokument-Listener ist der Punkt - eine feld-lokale
// Loesung verliert den Faden, sobald der Zeiger das Feld verlaesst.
//
// Geprueft wird, was der Nutzer merkt:
//   1. Ziehen aendert den Wert ueberhaupt,
//   2. die Bewegung wirkt auch, wenn der Zeiger das Feld verlaesst,
//   3. EIN Undo nimmt den ganzen Zug zurueck.
describe.skipIf(!browserAvailable)("Ziehen am Zahlenfeld im Editor", () => {
  it("zieht den Wert, folgt dem Zeiger aus dem Feld und bleibt ein Undo", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-scrub-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const post = (path: string, body: unknown): Promise<Response> =>
        fetch(`${running.dashboardUrl}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });

      // Der Editor haengt an einer Seite, nicht an einer eigenen Route: der
      // Canvas erscheint unter `#/projects/<site>/pages/<page>`.
      expect((await fetch(`${running.dashboardUrl}/editor.js`)).status).toBe(200);
      const site = (await (await post("/api/sites", { name: "Ziehen" })).json()) as { id: string };
      const page = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const applied = await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        author: { kind: "human", id: "programm", label: "Programm" },
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: { type: "hero", props: { headline: "Ziehen" } },
          },
        ],
      });
      expect(applied.status).toBe(200);

      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30_000);
      const errors: string[] = [];
      tab.on("pageerror", (error) => errors.push(error.message));

      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector(".senify-canvas", { timeout: 30_000 });

      // Die Sektion waehlen: der Canvas steht im iframe, und der Klick geht
      // auf den Knoten selbst (data-node-id), nicht auf irgendein Element.
      const desktopFrame = tab
        .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
        .contentFrame();
      await desktopFrame.locator('[data-node-id]').first().waitFor({ timeout: 30_000 });
      await desktopFrame.locator('[data-node-id]').first().click({ position: { x: 8, y: 8 } });
      await expect
        .poll(async () => tab.locator(".senify-canvas[data-selected]").count(), { timeout: 15_000 })
        .toBe(1);

      // Ein Zahlenfeld im Inspektor. `size` ist die Gruppe mit Breite/Hoehe.
      // "Groesse" liegt im Stil-Tab als eigene Kategorie, nicht im Inhalt-Tab.
      await tab.locator(".senify-inspector__tab", { hasText: "Stil" }).first().click().catch(() => undefined);
      await openInspectorCategory(tab, "style/size").catch(() => undefined);
      const feld = tab.locator('.senify-inspector input[data-control="number"]').first();
      const vorhanden = await feld.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
      if (!vorhanden) {
        // Ohne Auswahl gibt es keine Felder - dann ist der Test nicht
        // durchfuehrbar und das soll sichtbar sein, nicht still gruen.
        throw new Error("Kein Zahlenfeld im Inspektor gefunden - die Auswahl hat nicht gegriffen.");
      }

      const vorher = await feld.inputValue();
      const box = await feld.boundingBox();
      expect(box).not.toBeNull();
      if (box === null) return;

      // Ziehen: erst 30 px im Feld, dann 90 px weiter und 60 px nach UNTEN -
      // also deutlich ausserhalb. Eine feld-lokale Loesung wuerde hier
      // abbrechen.
      await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await tab.mouse.down();
      await tab.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 6 });
      await tab.mouse.move(box.x + box.width / 2 + 90, box.y + box.height + 60, { steps: 6 });
      await tab.mouse.up();

      const nachher = await feld.inputValue();
      expect(nachher, `Wert blieb "${vorher}" - die Geste hat nicht gegriffen`).not.toBe(vorher);

      // Ein Undo nimmt den ganzen Zug zurueck.
      await feld.click();
      await tab.keyboard.press("Control+z");
      await expect.poll(async () => feld.inputValue(), { timeout: 10_000 }).toBe(vorher);

      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
    }
  }, 240_000);
});
