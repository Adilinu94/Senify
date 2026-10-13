import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Die Engine antwortet auf Englisch. Das Dashboard zeigt, was Menschen lesen
// (Fehleransicht der Route, Toasts), auf Deutsch: bekannte Meldungen als ganzer
// Satz, unbekannte mit deutschem Vorspann und dem Originaltext dahinter.
describe.skipIf(!browserAvailable)("dashboard engine messages", () => {
  it("shows German sentences for engine errors on the route error view", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-engine-messages-browser-"));
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
      const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      tab.setDefaultTimeout(30000);

      // Die Bibliothek lädt zuerst diese Route; die Antwort ist je Durchgang eine andere.
      let answer: { status: number; error: Record<string, unknown> } = { status: 409, error: {} };
      await tab.route(
        (url) => url.pathname === "/api/library-components",
        async (route) => {
          await route.fulfill({
            status: answer.status,
            contentType: "application/json",
            body: JSON.stringify({ error: answer.error }),
          });
        },
      );

      const detail = async (): Promise<string> => {
        await tab.waitForSelector(".route-error__detail");
        return (await tab.locator(".route-error__detail").textContent()) ?? "";
      };
      const open = async (): Promise<void> => {
        await tab.goto(`${running.dashboardUrl}/#/library`, { waitUntil: "domcontentloaded" });
        await tab.reload({ waitUntil: "domcontentloaded" });
      };

      // 409, Meldung in der Tabelle: ein ganzer deutscher Satz, kein englischer Vorschlag dahinter.
      answer = {
        status: 409,
        error: {
          category: "conflict",
          message: 'Page path "/kontakt" is already in use',
          suggestion: "Pick another path.",
        },
      };
      await open();
      expect(await detail()).toBe("Die Seitenadresse „/kontakt“ gehört schon einer anderen Seite.");
      expect(await tab.locator(".route-error").textContent()).not.toContain("Pick another path");

      // 400, Meldung in der Tabelle mit Platzhalter.
      answer = { status: 400, error: { category: "validation", message: "Site name is required" } };
      await open();
      expect(await detail()).toBe("Bitte einen Projektnamen eingeben.");

      // 409, unbekannte englische Meldung: deutscher Vorspann, Originaltext bleibt lesbar.
      answer = { status: 409, error: { category: "conflict", message: "The theme changed while the redesign was prepared" } };
      await open();
      expect(await detail()).toBe(
        "Das kollidiert mit dem aktuellen Stand: The theme changed while the redesign was prepared",
      );

      // Schon deutsche Meldungen der Engine bleiben unverändert (kein Vorspann davor).
      answer = { status: 409, error: { category: "conflict", message: "Die Style-Registry wurde zwischenzeitlich geändert" } };
      await open();
      expect(await detail()).toBe("Die Style-Registry wurde zwischenzeitlich geändert");

      // 404 bekommt seinen Vorspann.
      answer = { status: 404, error: { category: "not_found", message: 'Component "x" does not exist' } };
      await open();
      expect(await detail()).toBe('Nicht gefunden: Component "x" does not exist');
    } finally {
      await browser.close();
      await running.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120_000);
});
