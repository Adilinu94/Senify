import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Befund des Elementor-Abgleichs vom 11.11.2026: Pfeil links/rechts klappte eine
// Ebene im Strukturbaum ein und aus, danach lag der Fokus aber auf dem Dokument
// und die naechste Taste kam im Baum nicht mehr an. Der Fokus bleibt jetzt auf der
// Zeile, damit sich der Baum ohne Maus durchgehend bedienen laesst.

const author = { kind: "human", id: "programm", label: "Programm" };

describe.skipIf(!browserAvailable)("structure tree keyboard in a real browser", () => {
  it("keeps the focus on the row while collapsing and expanding", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-baum-"));
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
      const site = (await (await post("/api/sites", { name: "Baum" })).json()) as { id: string };
      const page = (await (await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })).json()) as {
        id: string;
        draftVersion: number;
        draft: { rootNodeId: string };
      };
      const frame = await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        author,
        mutations: [{ op: "insertNode", parent: { nodeId: page.draft.rootNodeId }, node: { type: "frame", props: {} } }],
      });
      expect(frame.status).toBe(200);
      const afterFrame = (await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json()) as {
        draftVersion: number;
        draft: { rootNodeId: string; nodes: Record<string, { children?: string[] }> };
      };
      const frameId = afterFrame.draft.nodes[afterFrame.draft.rootNodeId]?.children?.[0] as string;
      const heading = await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: afterFrame.draftVersion,
        author,
        mutations: [{ op: "insertNode", parent: { nodeId: frameId }, node: { type: "heading", props: { text: "Kind" } } }],
      });
      expect(heading.status).toBe(200);

      const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`);
      await tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').waitFor({ timeout: 30000 });

      const row = tab.locator(`.senify-explorer__item[data-node="${frameId}"]`);
      await row.click();
      // Neue Ebenen starten eingeklappt; Pfeil rechts oeffnet sie.
      if ((await row.getAttribute("aria-expanded")) === "false") await tab.keyboard.press("ArrowRight");
      await expect.poll(() => row.getAttribute("aria-expanded")).toBe("true");
      const rows = tab.locator(".senify-explorer__item");
      const rowCount = await rows.count();
      const focusedNode = (): Promise<unknown> =>
        tab.evaluate("document.activeElement?.getAttribute('data-node') ?? null");

      await tab.keyboard.press("ArrowLeft");
      await expect.poll(() => row.getAttribute("aria-expanded")).toBe("false");
      expect(await rows.count()).toBe(rowCount - 1);
      expect(await focusedNode()).toBe(frameId);

      await tab.keyboard.press("ArrowRight");
      await expect.poll(() => row.getAttribute("aria-expanded")).toBe("true");
      expect(await rows.count()).toBe(rowCount);
      expect(await focusedNode()).toBe(frameId);

      // Die Taste nach dem Ein- und Ausklappen kommt noch im Baum an.
      await tab.keyboard.press("ArrowDown");
      await expect
        .poll(() => focusedNode())
        .not.toBe(frameId);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
