import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Ein langer deutscher Name ohne Leerzeichen (Seiten-, Klassen- oder
// Projektname) steht in der Ueberschrift der Rueckfrage. Gemessen am
// 11.11.2026 bei 390 px: die Ueberschrift war 467 px breit in einem Kasten von
// 316 px und ragte aus dem Dialog. Der Absatz darunter brach schon um.

const LANGER_NAME = "Donaudampfschifffahrtsgesellschaftskapitaensmuetze-Hauptueberschrift-Klasse";

describe.skipIf(!browserAvailable)("Rueckfrage mit langem Namen", () => {
  it("umbricht die Ueberschrift im schmalen Dialog statt ueber den Rand zu ragen", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-langer-titel-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(15000);
      await tab.goto(`${running.dashboardUrl}/`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".empty");
      await tab.evaluate(`import("/app-core.js").then((core) => { void core.askConfirm({ title: ${JSON.stringify(`${LANGER_NAME} loeschen?`)}, message: ${JSON.stringify(LANGER_NAME)}, confirmLabel: "Loeschen", danger: true }); })`);
      await tab.waitForSelector("dialog.ask-dialog[open]");
      const mass = (await tab.evaluate(`(() => {
        const dialog = document.querySelector("dialog.ask-dialog");
        const heading = dialog.querySelector("h2");
        return { scrollW: heading.scrollWidth, clientW: heading.clientWidth, dialogScrollW: dialog.scrollWidth, dialogClientW: dialog.clientWidth };
      })()`)) as { scrollW: number; clientW: number; dialogScrollW: number; dialogClientW: number };
      expect(mass.scrollW).toBeLessThanOrEqual(mass.clientW + 1);
      expect(mass.dialogScrollW).toBeLessThanOrEqual(mass.dialogClientW + 1);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
    }
  }, 60_000);
});
