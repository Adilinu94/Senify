import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Der Abschluss der Import-Arbeit: die importierte Seite muss im laufenden
// Editor bearbeitbar sein, nicht nur als Dokument gültig.
//
// Gemessen wird der Weg, den ein Mensch geht: die Seite importieren, den
// Fußzeilentext im Canvas auswählen, seinen Inhalt im Inspektor ändern — und
// danach im gespeicherten Entwurf nachsehen, ob die Änderung angekommen ist und
// die Schriftregel (der Anteil der Box) sie überlebt hat.
//
// Der Fußzeilentext ist der Prüfstein: er war bis zum 21.10.2026 ein Bild
// (`<svg><foreignObject>`), das der Editor nicht erreichen konnte.
describe.skipIf(!browserAvailable)("Framer-Import im Editor: der Fußzeilentext bleibt bearbeitbar", () => {
  it("ändert den Text eines importierten body-Knotens und speichert ihn mit seiner Größenregel", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-framer-editor-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    // Eine Seite mit genau der Form, die Framer für „fit text" schreibt: die
    // Worte stehen mit 211 px in einem viewBox 1058,22 breit.
    const html = `<!doctype html><html><head><title>Fit Text</title></head><body><div id="main"><main><footer>
<svg class="framer-1apmb9b" data-framer-name="Your Name" data-framer-component-type="RichTextContainer" viewBox="0 0 1058.22 169">
<foreignObject width="100%" height="100%" class="framer-fit-text" transform="scale(1)" style="overflow:visible">
<p dir="auto" class="framer-text" style="--framer-font-family:&quot;Manrope&quot;, sans-serif;--framer-font-size:211px;--framer-font-weight:600;--framer-letter-spacing:-0.02em;--framer-line-height:80%;--framer-text-alignment:center">Alex Rivera</p>
</foreignObject></svg>
</footer></main></div></body></html>`;
    const browser = await chromium.launch({ headless: true });
    const pageErrors: string[] = [];
    try {
      const post = (path: string, body: unknown): Promise<Response> =>
        fetch(`${running.dashboardUrl}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      const site = (await (await post("/api/sites", { name: "Fit Text" })).json()) as { id: string };
      const page = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
      ).json()) as { id: string; draftVersion: number };

      // Der Import über die API: derselbe Weg, den der Dialog nimmt. Erst der
      // Trockenlauf (ohne `write`), der den Bericht liefert.
      const analysis = (await (
        await post(`/api/sites/${site.id}/imports/framer`, {
          source: { html },
          mode: "fidelity",
          pagePath: "/",
        })
      ).json()) as {
        job?: { status?: string };
        report?: { counts?: { nodes?: number; mapped?: number }; pageId?: string; irHash?: string };
      };
      expect(analysis.report?.counts?.nodes ?? 0).toBeGreaterThan(0);

      // Der Schreibschritt: der Bericht nennt den Hash, den der Schreibvorgang
      // erwartet — dieselbe Prüfung, die der Dialog macht.
      await post(`/api/sites/${site.id}/imports/framer`, {
        source: { html },
        mode: "fidelity",
        pagePath: "/",
        write: true,
        pageId: page.id,
        baseDraftVersion: page.draftVersion,
        ...(analysis.report?.irHash === undefined ? {} : { expectedIrHash: analysis.report.irHash }),
      });

      // Der Knoten, den der Import aus dem Fit-Text macht.
      const imported = (await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json()) as {
        draftVersion: number;
        draft: { nodes: Record<string, { props?: Record<string, unknown> }> };
      };
      const fit = Object.entries(imported.draft.nodes).find(([, node]) =>
        String(node.props?.["html"] ?? "").includes("Alex Rivera"),
      );
      expect(fit).toBeDefined();
      const [fitId, fitNode] = fit as [string, { props?: Record<string, unknown> }];
      // Der Kern: der Text steht als Text im Knoten (nicht als Bild ohne Inhalt).
      expect(fitNode.props?.["html"]).toBe("Alex Rivera");
      // Und seine Größe ist der Anteil der Box, nicht ein fester px-Wert.
      expect(String(fitNode.props?.["fontSize"])).toMatch(/cqw$/);
      expect(fitNode.props?.["fontSize"]).toBe("19.9391cqw");
      // Der Elternteil ist der Größen-Container, gegen den der Anteil misst.
      const eltern = Object.values(imported.draft.nodes).find(
        (node) => node.props?.["containerType"] === "inline-size",
      );
      expect(eltern).toBeDefined();

      // Der Editor: die Seite öffnen, den Knoten auswählen, den Text ändern.
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.on("pageerror", (error) => pageErrors.push(error.message));
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector('[data-action="canvas-overflow"]', { timeout: 30000 });

      // Der Canvas zeichnet die Seite in einem iframe; dort trägt jeder Knoten
      // seine Node-Id.
      const rahmen = tab
        .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
        .contentFrame();
      const node = rahmen.locator(`[data-node-id="${fitId}"]`).first();
      await node.waitFor({ timeout: 30000 });
      await node.click();
      // Der Inspektor zeigt den Inhalt des Knotens: ein Textfeld mit dem
      // importierten Text. Genau das war vor dem 21.10.2026 nicht möglich —
      // der Fußzeilentext war ein Bild ohne Textfeld.
      await tab.waitForSelector(".senify-inspector", { timeout: 30000 });
      const inhalt = tab.locator('.senify-inspector textarea').first();
      await inhalt.waitFor({ timeout: 30000 });
      expect(await inhalt.inputValue()).toBe("Alex Rivera");
      await inhalt.fill("Neuer Name");
      // Der Editor schreibt den Entwurf beim Verlassen des Feldes (der
      // „Speichern"-Knopf ist ausgegraut, weil er das selbst tut).
      await inhalt.blur();
      await expect
        .poll(
          async () => {
            const frisch = (await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json()) as {
              draft: { nodes: Record<string, { props?: Record<string, unknown> }> };
            };
            return String(frisch.draft.nodes[fitId]?.props?.["html"] ?? "");
          },
          { timeout: 30000 },
        )
        .toContain("Neuer Name");
      // Die Größenregel hat die Änderung überlebt.
      const nachher = (await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json()) as {
        draft: { nodes: Record<string, { props?: Record<string, unknown> }> };
      };
      expect(nachher.draft.nodes[fitId]?.props?.["fontSize"]).toBe("19.9391cqw");
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180_000);
});
