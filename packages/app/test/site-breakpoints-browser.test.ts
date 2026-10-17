import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { DEFAULT_BREAKPOINTS } from "@senify/widget-engine/breakpoints";
import { browserAvailable, memoryDb } from "./support.ts";

// Umbruchpunkte je Website (ADR-0020), von der Oberfläche bis ins Blatt: das
// Feld in den Projekt-Einstellungen speichert, zeigt die Fehler auf Deutsch und
// setzt auf den Standard zurück; der Editor legt jedes Blatt in den Bereich
// seines Geräts, sodass die Media-Queries darin antworten wie auf der
// veröffentlichten Seite. Übersprungen, wenn playwright fehlt.

const author = { kind: "human", id: "programm", label: "Programm" };

describe.skipIf(!browserAvailable)("site breakpoints in the dashboard and the canvas", () => {
  it("saves, rejects and resets the pair, and lays the canvas sheets inside their ranges", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-site-breakpoints-browser-"));
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
    const storedPair = async (siteId: string): Promise<unknown> =>
      ((await (await fetch(`${running.dashboardUrl}/api/sites/${siteId}`)).json()) as { breakpoints?: unknown })
        .breakpoints;
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    try {
      expect((await fetch(`${running.dashboardUrl}/editor.js`)).status).toBe(200);
      const site = (await (await post("/api/sites", { name: "Umbruchpunkte" })).json()) as { id: string };
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
            node: { type: "hero", props: { headline: "Umbruch-Prüfung" } },
          },
        ],
      });
      expect(applied.status).toBe(200);

      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

      // --- Einstellungen: das Feld ---
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/settings`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector('[data-panel="breakpoints"]');
      const tablet = tab.locator("#site-breakpoint-tablet");
      const mobile = tab.locator("#site-breakpoint-mobile");
      const save = tab.locator('[data-panel="breakpoints"] button.primary');
      const reset = tab.locator('[data-panel="breakpoints"] button', { hasText: "Auf Standard zurücksetzen" });
      // Ohne eigene Werte: leere Felder mit den Standardwerten als Hinweis, Zurücksetzen gesperrt.
      expect(await tablet.inputValue()).toBe("");
      expect(await tablet.getAttribute("placeholder")).toBe(String(DEFAULT_BREAKPOINTS.tablet));
      expect(await mobile.getAttribute("placeholder")).toBe(String(DEFAULT_BREAKPOINTS.mobile));
      expect(await reset.isDisabled()).toBe(true);

      // Ein Wert außerhalb der Grenzen: deutsche Meldung, nichts gespeichert.
      await tablet.fill("500");
      await mobile.fill("400");
      await save.click();
      await expect
        .poll(async () => tab.locator(".toast.error").first().textContent())
        .toContain("Der Tablet-Wert muss zwischen 641 und 1600 Pixel liegen.");
      expect(await storedPair(site.id)).toBeUndefined();

      // Zu enger Abstand.
      await tablet.fill("900");
      await mobile.fill("850");
      await save.click();
      await expect
        .poll(async () => tab.locator(".toast.error").allTextContents())
        .toEqual(expect.arrayContaining([expect.stringContaining("mindestens 120 Pixel größer")]));
      expect(await storedPair(site.id)).toBeUndefined();

      // Gültig: gespeichert, die Seite zeigt die Werte wieder.
      await tablet.fill("1200");
      await mobile.fill("810");
      await save.click();
      await expect.poll(async () => storedPair(site.id)).toEqual({ tablet: 1200, mobile: 810 });
      // Die Seite baut sich nach dem Speichern neu auf: erst dann ist Zurücksetzen frei.
      await expect.poll(async () => reset.isEnabled()).toBe(true);
      expect(await tab.locator("#site-breakpoint-tablet").inputValue()).toBe("1200");
      expect(await tab.locator("#site-breakpoint-mobile").inputValue()).toBe("810");

      // Nur ein Feld geändert: das andere nimmt den Standard.
      await tab.locator("#site-breakpoint-mobile").fill("");
      await tab.locator('[data-panel="breakpoints"] button.primary').click();
      await expect
        .poll(async () => storedPair(site.id))
        .toEqual({ tablet: 1200, mobile: DEFAULT_BREAKPOINTS.mobile });
      // Die Seite baut sich neu auf und zeigt den gespeicherten Standardwert im Feld.
      await expect.poll(async () => tab.locator("#site-breakpoint-mobile").inputValue()).toBe(
        String(DEFAULT_BREAKPOINTS.mobile),
      );
      await tab.locator("#site-breakpoint-mobile").fill("810");
      await tab.locator('[data-panel="breakpoints"] button.primary').click();
      await expect.poll(async () => storedPair(site.id)).toEqual({ tablet: 1200, mobile: 810 });
      await expect.poll(async () => tab.locator("#site-breakpoint-mobile").inputValue()).toBe("810");

      // --- Editor: jedes Blatt liegt im Bereich seines Geräts ---
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector(".senify-canvas");
      await tab.waitForFunction(
        `document.querySelectorAll(".senify-canvas__iframe").length === 3 && [...document.querySelectorAll(".senify-canvas__iframe")].every((frame) => frame.contentDocument?.querySelector("[data-node-id]"))`,
      );
      const probe = async (device: string): Promise<{ width: number; tablet: boolean; mobile: boolean; label: string }> => {
        const handle = await tab.locator(`.senify-canvas__frame[data-device="${device}"] iframe`).elementHandle();
        const frame = await handle?.contentFrame();
        if (frame === null || frame === undefined) throw new Error(`no frame for ${device}`);
        const result = (await frame.evaluate(`({
          width: window.innerWidth,
          tablet: window.matchMedia("(max-width: 1199.98px)").matches,
          mobile: window.matchMedia("(max-width: 809.98px)").matches,
        })`)) as { width: number; tablet: boolean; mobile: boolean };
        const label = (await tab.locator(`.senify-canvas__frame[data-device="${device}"] .senify-canvas__frame-label`).textContent()) ?? "";
        return { ...result, label };
      };
      const desktop = await probe("desktop");
      const tabletSheet = await probe("tablet");
      const mobileSheet = await probe("mobile");
      // Desktop: keine der beiden Abfragen. Tablet: nur die Tablet-Abfrage. Handy: beide.
      expect([desktop.tablet, desktop.mobile]).toEqual([false, false]);
      expect([tabletSheet.tablet, tabletSheet.mobile]).toEqual([true, false]);
      expect([mobileSheet.tablet, mobileSheet.mobile]).toEqual([true, true]);
      expect([desktop.width, tabletSheet.width, mobileSheet.width]).toEqual([1440, 1024, 390]);
      expect(tabletSheet.label).toContain("1024 px");

      // --- Zurücksetzen: Standard, und das Tablet-Blatt rückt in seinen Bereich ---
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/settings`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector('[data-panel="breakpoints"]');
      await tab.locator('[data-panel="breakpoints"] button', { hasText: "Auf Standard zurücksetzen" }).click();
      await expect.poll(async () => storedPair(site.id)).toBeUndefined();
      await expect.poll(async () => tab.locator("#site-breakpoint-tablet").inputValue()).toBe("");
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector(".senify-canvas");
      await tab.waitForFunction(
        `document.querySelectorAll(".senify-canvas__iframe").length === 3 && [...document.querySelectorAll(".senify-canvas__iframe")].every((frame) => frame.contentDocument?.querySelector("[data-node-id]"))`,
      );
      const standardTablet = await tab
        .locator('.senify-canvas__frame[data-device="tablet"] iframe')
        .evaluate((frame) => (frame as unknown as { contentWindow: { innerWidth: number } }).contentWindow.innerWidth);
      // Der Standard (1024): das Tablet-Blatt ist schmaler als die Zahl, sonst zeigte es das Desktop-Layout.
      expect(standardTablet).toBe(DEFAULT_BREAKPOINTS.tablet - 1);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 240000);
});
