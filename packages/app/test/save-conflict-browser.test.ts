import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// L17: a stale draft version opens the conflict dialog — server state vs. own
// changes, with both ways out. This run drives the real editor in a browser:
// a foreign write bumps the server draft, the next autosave runs into the 409,
// the dialog names both sides, and "Server laden" replaces the local document.
// Skipped when Playwright is missing (same contract as the other browser tests).

const author = { kind: "human", id: "programm", label: "Programm" };

describe.skipIf(!browserAvailable)("save conflict dialog", () => {
  it("shows the dialog on a 409 and loads the server state on demand", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-conflict-"));
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
    const consoleErrors: string[] = [];
    try {
      // Warm the on-demand editor bundle before the browser asks for it.
      expect((await fetch(`${running.dashboardUrl}/editor.js`)).status).toBe(200);

      const site = (await (await post("/api/sites", { name: "Konflikt-Ansicht" })).json()) as {
        id: string;
      };
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
            node: { type: "hero", props: { headline: "Konflikt-Prüfung" } },
          },
        ],
      });
      expect(applied.status).toBe(200);

      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      tab.on("console", (message) => {
        if (message.type() !== "error") return;
        // Der 409 ist der Prüfgegenstand; der Browser loggt ihn als Netzfehler.
        if (message.text().includes("409 (Conflict)")) return;
        consoleErrors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

      const pageUrl = `${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`;
      await tab.goto(pageUrl, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".senify-canvas", { timeout: 30000 });

      // Eine fremde Sitzung schreibt weiter: der Server-Draft zieht auf v2.
      // Der Editor ignoriert den SSE-Event (derselbe Token-Label), der
      // lokale Stand bleibt auf v1 stehen — genau die Konfliktlage.
      const current = (await (
        await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)
      ).json()) as { draftVersion: number; draft: { rootNodeId: string } };
      const bumped = await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: current.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: current.draft.rootNodeId },
            node: { type: "divider" },
          },
        ],
      });
      expect(bumped.status).toBe(200);

      // Eine eigene Aenderung im Editor: der Plus-Punkt nach der Hero.
      const desktopFrame = tab
        .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
        .contentFrame();
      const heroSection = desktopFrame.locator('section[data-section="hero"]').first();
      await heroSection.hover();
      await expect
        .poll(async () => tab.locator('.senify-canvas__plus[data-position="after"]').count())
        .toBe(1);
      await tab.locator('.senify-canvas__plus[data-position="after"]').click();

      // Der Autosave laeuft in den 409; der Dialog nennt beide Seiten.
      const dialog = tab.locator('dialog[data-role="conflict-dialog"]');
      await expect.poll(async () => dialog.getAttribute("open")).toBe("");
      await expect
        .poll(async () => dialog.locator("h2").textContent())
        .toBe("Entwurf wurde inzwischen geändert");
      await expect
        .poll(async () => dialog.locator('[data-action="conflict-reload"]').textContent())
        .toContain("Server laden");
      await expect
        .poll(async () => dialog.locator('[data-action="conflict-retry"]').textContent())
        .toContain("Eigene Änderungen senden");
      await expect
        .poll(async () => dialog.locator('[data-action="conflict-later"]').textContent())
        .toBe("Später");

      // "Server laden" verwirft die eigenen Aenderungen und uebernimmt v2 —
      // samt des Dividers der fremden Sitzung.
      await dialog.locator('[data-action="conflict-reload"]').click();
      await expect.poll(async () => dialog.getAttribute("open")).toBeNull();
      // v3 = Hero-Insert (v2) plus der Fremd-Divider (v3).
      await expect
        .poll(async () => tab.locator("#page-version").textContent())
        .toContain("Draft v3");
      await expect
        .poll(async () => tab.locator('[data-role="canvas-status"]').textContent())
        .toBe("Neu geladen");
      await expect
        .poll(async () => desktopFrame.locator('section[data-section="divider"]').count())
        .toBe(1);

      // A class-registry change without a page change must also stop an old
      // editor from sending its page changes against stale class names.
      expect((await post(`/api/sites/${site.id}/style-rules`, { name: "fremde-klasse" })).status).toBe(201);
      await heroSection.hover();
      await expect.poll(async () => tab.locator('.senify-canvas__plus[data-position="after"]').count()).toBe(1);
      await tab.locator('.senify-canvas__plus[data-position="after"]').click();
      await expect.poll(async () => dialog.getAttribute("open")).toBe("");
      await expect.poll(async () => dialog.locator("h2").textContent()).toBe("Klassen wurden inzwischen geändert");
      expect(await dialog.locator('[data-action="conflict-retry"]').isVisible()).toBe(false);
      await dialog.locator('[data-action="conflict-reload"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent()).toBe("Neu geladen");
      await expect.poll(async () => desktopFrame.locator('section[data-section="divider"]').count()).toBe(1);

      // A newer theme must also stop stale page changes and reload the theme.
      const themeWrite = await fetch(`${running.dashboardUrl}/api/sites/${site.id}/theme`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: { tokens: { primitive: { color: { accent: "#123456" } } } } }),
      });
      expect(themeWrite.status).toBe(200);
      await heroSection.hover();
      await expect.poll(async () => tab.locator('.senify-canvas__plus[data-position="after"]').count()).toBe(1);
      await tab.locator('.senify-canvas__plus[data-position="after"]').click();
      await expect.poll(async () => dialog.getAttribute("open")).toBe("");
      await expect.poll(async () => dialog.locator("h2").textContent()).toBe("Variablen wurden inzwischen geändert");
      expect(await dialog.locator('[data-action="conflict-retry"]').isVisible()).toBe(false);
      await dialog.locator('[data-action="conflict-reload"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent()).toBe("Neu geladen");
      await tab.getByRole("tab", { name: "Variablen" }).click();
      expect(await tab.getByRole("textbox", { name: "Farbe accent", exact: true }).inputValue()).toBe("#123456");

      await heroSection.click();
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      const secondThemeWrite = await fetch(`${running.dashboardUrl}/api/sites/${site.id}/theme`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: { tokens: { primitive: { color: { accent: "#654321" } } } } }),
      });
      expect(secondThemeWrite.status).toBe(200);
      await tab.getByRole("textbox", { name: "Name der neuen Klasse" }).fill("veraltete-klasse");
      await tab.getByRole("button", { name: "Anlegen", exact: true }).click();
      await expect.poll(async () => dialog.locator("h2").textContent()).toBe("Variablen wurden inzwischen geändert");
      expect(await dialog.locator('[data-action="conflict-retry"]').isVisible()).toBe(false);
      const rules = await (await fetch(`${running.dashboardUrl}/api/sites/${site.id}/style-rules`)).json() as { rules: Array<{ name: string }> };
      expect(rules.rules.some((rule) => rule.name === "veraltete-klasse")).toBe(false);

      expect(consoleErrors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180000);
});
