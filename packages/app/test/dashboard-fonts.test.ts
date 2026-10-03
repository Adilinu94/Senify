import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserSkip, playwright, memoryDb } from "./support.ts";

// Das Dashboard bindet Inter ueber `public/fonts.css` (aus
// packages/app/src/../build-fonts.mjs). Ohne diese Bindung faellt `Inter` auf
// system-ui zurueck, und dasselbe Layout sieht unter Windows (Segoe UI) und
// unter Linux (DejaVu Sans) verschieden aus. Genau daran scheiterte das
// PNG-Gate: die unter Windows erzeugten Baselines passten auf Ubuntu nie
// (Lauf 22 vom 02.10.2026, Settings/Referenzen 1,2 bis 2,5 % geaenderte
// Pixel bei 1 % erlaubt).
//
// Der Test liest nicht die Datei, sondern den Browserzustand: nur wenn die
// Schrift wirklich geladen wurde, meldet `document.fonts.check` true.
describe.skipIf(browserSkip)("dashboard fonts", () => {
  it("laedt Inter fuer das Dashboard, nicht system-ui", async () => {
    const dataDir = join(tmpdir(), `senify-font-probe-${process.pid}-${Date.now()}`);
    mkdirSync(dataDir, { recursive: true });
    const database = memoryDb();
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    const browser = await (playwright as NonNullable<typeof playwright>).chromium.launch({ headless: true });
    try {
      const tab = await browser.newPage();
      await tab.goto(`${running.dashboardUrl}/#/settings`, { waitUntil: "networkidle" });
      await tab.evaluate("document.fonts.ready");
      const probe = (await tab.evaluate(`(() => {
        const link = document.querySelector('.tabs a:not(.active)');
        const families = [...new Set([...document.fonts].map((f) => f.family))];
        return {
          families,
          interReady: document.fonts.check('12px Inter'),
          rendered: link ? getComputedStyle(link).fontFamily : "",
        };
      })()`)) as { families: string[]; interReady: boolean; rendered: string };
      expect(probe.families).toContain("Inter");
      expect(probe.interReady).toBe(true);
      expect(probe.rendered).toContain("Inter");
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
