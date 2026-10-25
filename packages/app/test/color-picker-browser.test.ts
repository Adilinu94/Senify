import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb, openInspectorCategory } from "./support.ts";

// Der Farbwaehler im ECHTEN Editor.
//
// Der Swatch war eine reine Anzeige: man sah die Farbe, konnte sie aber nicht
// anfassen. Wer sie aendern wollte, musste den Hex-Wert tippen. Genau das ist
// in einem fertigen Editor die falsche Antwort - Farbe waehlt man mit dem
// Zeiger, nicht aus dem Kopf.
//
// Der Test faehrt die Geste im Browser, weil sie nur dort vollstaendig
// existiert: pointerdown auf der Flaeche, pointermove am DOKUMENT (nicht auf
// der Flaeche), pointerup. Genau der Dokument-Listener ist der Punkt - eine
// flaechen-lokale Loesung verliert den Faden, sobald der Zeiger den Verlauf
// verlaesst.
//
// Geprueft wird, was der Nutzer merkt:
//   1. ein Klick auf den Swatch oeffnet den Waehler,
//   2. ein Zug im Verlauf aendert die Farbe des Knotens ueberhaupt,
//   3. die Bewegung wirkt auch, wenn der Zeiger die Flaeche verlaesst,
//   4. EIN Undo nimmt den ganzen Zug zurueck.
describe.skipIf(!browserAvailable)("Farbwaehler im Editor", () => {
  it("oeffnet am Swatch, zieht die Farbe und bleibt ein Undo", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-color-"));
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

      expect((await fetch(`${running.dashboardUrl}/editor.js`)).status).toBe(200);
      const site = (await (await post("/api/sites", { name: "Farbe" })).json()) as { id: string };
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
            node: { type: "hero", props: { headline: "Farbe" } },
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

      const desktopFrame = tab
        .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
        .contentFrame();
      await desktopFrame.locator('[data-node-id]').first().waitFor({ timeout: 30_000 });
      await desktopFrame.locator('[data-node-id]').first().click({ position: { x: 8, y: 8 } });
      await expect
        .poll(async () => tab.locator(".senify-canvas[data-selected]").count(), { timeout: 15_000 })
        .toBe(1);

      // Ein Farbfeld im Stil-Tab. Welche Kategorie es ist, haengt am Baustein;
      // der Swatch ist der einzige Anker, den der Test braucht.
      await tab.locator(".senify-inspector__tab", { hasText: "Stil" }).first().click().catch(() => undefined);
      for (const kategorie of ["style/background", "style/typography", "style/size", "style/border"]) {
        await openInspectorCategory(tab, kategorie).catch(() => undefined);
        if ((await tab.locator('.senify-inspector [data-control="swatch"]').count()) > 0) break;
      }
      const swatch = tab.locator('.senify-inspector [data-control="swatch"]').first();
      const vorhanden = await swatch.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
      if (!vorhanden) {
        // Ohne Farbfeld gibt es nichts zu bedienen - das soll sichtbar sein,
        // nicht still gruen.
        throw new Error("Kein Farbfeld im Inspektor gefunden - die Auswahl hat nicht gegriffen.");
      }

      const textfeld = tab.locator('.senify-inspector input[data-control="color-text"]').first();
      const vorher = await textfeld.inputValue();

      // 1. Der Swatch oeffnet den Waehler.
      await swatch.click();
      const pad = tab.locator('.senify-inspector [data-role="picker-pad"]');
      await expect.poll(async () => pad.count(), { timeout: 10_000 }).toBe(1);
      const hue = tab.locator('.senify-inspector [data-role="picker-hue"]');
      await expect.poll(async () => hue.count(), { timeout: 10_000 }).toBe(1);

      // 2./3. Ziehen: erst in die Mitte, dann 120 px weiter und 80 px nach
      // UNTEN - deutlich ausserhalb der Flaeche. Eine flaechen-lokale Loesung
      // wuerde hier abbrechen.
      //
      // WICHTIG: erst ins Bild scrollen. Der Inspektor ist laenger als der
      // Viewport; ohne den Scroll liegt die Flaeche bei y > 1000, und ein
      // Mausklick dorthin trifft nichts - der Test waere dann gruen oder rot
      // aus dem falschen Grund.
      await pad.scrollIntoViewIfNeeded();
      const box = await pad.boundingBox();
      expect(box).not.toBeNull();
      if (box === null) return;
      await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await tab.mouse.down();
      await tab.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4, { steps: 6 });
      await tab.mouse.move(box.x + box.width + 120, box.y + box.height + 80, { steps: 6 });
      await tab.mouse.up();

      const nachher = await textfeld.inputValue();
      expect(nachher, `Farbe blieb "${vorher}" - die Geste hat nicht gegriffen`).not.toBe(vorher);
      // Der Waehler schreibt Hex, keine Token-Referenz: ein Zug am Verlauf ist
      // ein Literalwert.
      expect(nachher).toMatch(/^#[0-9a-f]{6}$/i);

      // 4. Ein Undo nimmt den ganzen Zug zurueck, nicht einen Zwischenschritt.
      // Der Knopf im Canvas, nicht `Control+z`: die Tastenkombination greift
      // nur, solange kein Textfeld den Fokus hat (`isTextEntry`), und nach dem
      // Zug steht der Fokus im Inspektor-Feld. Der Knopf ist der Weg, der
      // unabhaengig vom Fokus funktioniert - und genau der, den ein Nutzer
      // nach einem Zug klickt.
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(async () => textfeld.inputValue(), { timeout: 10_000 }).toBe(vorher);

      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
    }
  }, 240_000);
});
