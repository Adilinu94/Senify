import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Befund des Elementor-Abgleichs vom 11.11.2026 (Screenreader): Die Eingabefelder
// und Schalter des Inspectors hatten keinen zugaenglichen Namen, die Beschriftung
// stand in einem losen <span>. Jedes Bedienelement der Felder traegt jetzt den
// Namen seiner Beschriftung.

const author = { kind: "human", id: "programm", label: "Programm" };

const NAMENLOSE = `(() => {
  const out = [];
  for (const e of document.querySelectorAll(".senify-inspector__field input, .senify-inspector__field textarea, .senify-inspector__field select, .senify-inspector__field [role=switch]")) {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const name = (e.getAttribute("aria-label") || (e.getAttribute("aria-labelledby") ? "x" : "") || (e.labels && e.labels[0] ? "x" : "") || "").trim();
    if (name === "") out.push(e.closest(".senify-inspector__field").dataset.key + ":" + e.tagName.toLowerCase());
  }
  return out;
})()`;

describe.skipIf(!browserAvailable)("inspector control names in a real browser", () => {
  it("gives every field control the name of its label", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-namen-"));
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
      const site = (await (await post("/api/sites", { name: "Namen" })).json()) as { id: string };
      const page = (await (await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })).json()) as {
        id: string;
        draftVersion: number;
        draft: { rootNodeId: string };
      };
      const inserted = await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: { type: "heading", props: { text: "Titel" } },
          },
        ],
      });
      expect(inserted.status).toBe(200);
      const fresh = (await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json()) as {
        draft: { rootNodeId: string; nodes: Record<string, { children?: string[] }> };
      };
      const headingId = fresh.draft.nodes[fresh.draft.rootNodeId]?.children?.[0] as string;

      const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`);
      await tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').waitFor({ timeout: 30000 });
      await tab.locator(`.senify-explorer__item[data-node="${headingId}"]`).click();
      await tab.locator('.senify-inspector__field[data-key="text"]').waitFor();

      // Allgemein und Stil: beide Reiter, weil die Stilfelder andere Steuerungen nutzen.
      for (const name of ["content", "style"]) {
        await tab.locator(`.senify-inspector__tab[data-tab="${name}"]`).click();
        await tab.locator(".senify-inspector__field").first().waitFor({ state: "attached" });
        expect(await tab.evaluate(NAMENLOSE), `Reiter ${name}`).toEqual([]);
      }
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
