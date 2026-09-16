import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Die Referenz-Bibliothek im echten Browser (T14 Oberflaeche): linke Leiste,
// Karten, Vergleich, Anlegen, Stil-Guide, Detailseite und der Zustand in der
// Adresse. Uebersprungen, wenn playwright fehlt.

const author = { kind: "human", id: "programm", label: "Programm" };
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex",
);

describe.skipIf(!browserAvailable)("reference library in the program (T14)", () => {
  it("renders the rail, cards, comparison, detail and the address state", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-references-browser-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    const jsonHeaders = { "content-type": "application/json" };
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    try {
      const collection = (await (
        await post("/api/reference-collections", {
          name: "Monumental Editorial",
          description: "Ruhige Flaechen.",
          accent: "#b98a52",
        })
      ).json()) as { collection: { id: string } };

      for (const name of ["ATELO - Interior Gallery", "Sakura Studio - Art Gallery"]) {
        const created = await post("/api/references/manual", {
          name,
          collectionId: collection.collection.id,
          note: "Bildstreifen, dann grosse Headline",
          vocabulary: ["staggered gallery"],
          image: PNG.toString("base64"),
          author,
        });
        expect(created.status).toBe(201);
      }

      const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
      // Ohne Zwischenablage: so laeuft jede Kopier-Aktion in den Fallback-Dialog,
      // den das Vorbild als `#copyDialog` kennt.
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          get: () => ({ writeText: () => Promise.reject(new Error("keine Zwischenablage")) }),
        });
      });
      const tab = await context.newPage();
      tab.setDefaultTimeout(15000);
      tab.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

      await tab.goto(`${running.dashboardUrl}/#/references`, {
        waitUntil: "domcontentloaded",
      });

      // Linke Leiste und Karten.
      await tab.waitForSelector(".refs-shell");
      expect(await tab.locator(".refs-sidebar").count()).toBe(1);
      const navText = (await tab.locator(".refs-nav-item").allTextContents()).join(" | ");
      expect(navText).toContain("Alle Referenzen");
      expect(navText).toContain("Stil-Guide");
      expect(navText).toContain("Monumental Editorial");
      await tab.waitForSelector(".refs-card");
      expect(await tab.locator(".refs-card").count()).toBe(2);
      expect(await tab.locator('.refs-card-art:has-text("Referenz öffnen")').count()).toBe(2);

      // Leiste, Karten und Vergleichsauswahl tragen eingebettete SVG-Symbole
      // statt typografischer Zeichen (▦ ◈ ↗ + ✓).
      expect(await tab.locator(".refs-nav-icon svg").count()).toBe(2);
      expect(await tab.locator(".refs-card-arrow svg").count()).toBe(2);
      expect(await tab.locator(".refs-select svg").count()).toBe(2);
      expect(await tab.locator(".refs-sidebar-add svg").count()).toBe(1);

      // Beim Ansichtswechsel bleibt die Liste stehen (Karten mit reduzierter
      // Deckkraft) und der Ladezustand am Fortschrittsbalken ist kurz sichtbar.
      const slowList = (url: URL) => url.pathname === "/api/references";
      await tab.route(slowList, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await route.continue();
      });
      await tab.locator('.refs-nav-item:has-text("Alle Referenzen")').click();
      await expect.poll(async () => tab.locator(".refs-shell.refs-loading").count()).toBe(1);
      expect(await tab.locator(".refs-card").count()).toBe(2);
      await expect
        .poll(async () => tab.locator(".refs-shell.refs-loading").count(), { timeout: 10000 })
        .toBe(0);
      await tab.unroute(slowList);

      // Suche schreibt den Zustand in die Adresse.
      await tab.locator(".refs-search input").fill("sakura");
      await expect.poll(async () => tab.url()).toContain("q=sakura");
      await expect.poll(async () => tab.locator(".refs-card").count()).toBe(1);
      await tab.locator(".refs-search input").fill("");
      await expect.poll(async () => tab.locator(".refs-card").count()).toBe(2);

      // Vergleichsauswahl bis drei, Leiste und gemeinsamer Brief.
      await tab.locator(".refs-select").nth(0).click();
      await tab.locator(".refs-select").nth(1).click();
      await expect.poll(async () => tab.locator(".refs-compare-tray").isVisible()).toBe(true);
      expect(await tab.locator(".refs-tray-count").textContent()).toBe("2 / 3 ausgewählt");
      await tab.locator(".refs-compare-tray .refs-button.primary").click();
      await tab.waitForSelector(".refs-compare-dialog");
      expect(await tab.locator(".refs-compare-dialog").textContent()).toContain(
        "Brief zusammen kopieren",
      );
      await tab.locator(".refs-compare-dialog .refs-icon-button").click();

      // Anlegen-Dialog mit Upload-Weg und URL-Weg.
      await tab.locator('.refs-button:has-text("Referenz hinzufügen")').click();
      await tab.waitForSelector(".refs-add-dialog");
      expect(await tab.locator(".refs-add-dialog .refs-upload-zone").count()).toBe(1);
      await tab.locator('.refs-modal-tabs button:has-text("URL analysieren")').click();
      expect(await tab.locator(".refs-add-url").isVisible()).toBe(true);
      await tab.locator(".refs-add-dialog .refs-icon-button").click();

      // Detailseite: Brief-Spalte, Vokabular-Chips und die zwei Kopier-Aktionen.
      await tab.locator(".refs-card-art").first().click();
      await expect.poll(async () => tab.url()).toContain("#/references/");
      await tab.waitForSelector(".refs-detail");
      expect(await tab.locator(".refs-brief").textContent()).toContain("Die Idee zum Mitnehmen");
      expect(await tab.locator(".refs-brief").textContent()).toContain("Aufbau & Platzierung");
      expect(await tab.locator('.refs-button:has-text("Design-Brief kopieren")').count()).toBe(1);
      expect(await tab.locator('.refs-detail-actions .refs-button:has-text("Vergleich")').count()).toBe(1);

      // Ohne Zwischenablage oeffnet der Fallback den Dialog mit dem Brieftext.
      await tab.locator('.refs-button:has-text("Design-Brief kopieren")').click();
      await tab.waitForSelector(".refs-copy-dialog");
      expect(await tab.locator(".refs-copy-dialog textarea").inputValue()).toContain(
        "Reference: ",
      );
      await tab.locator(".refs-copy-dialog .refs-icon-button").click();

      // Der Zustand ueberlebt das Neuladen.
      await tab.goto(`${running.dashboardUrl}/#/references?q=sakura&sort=name`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector(".refs-shell");
      expect(await tab.locator(".refs-search input").inputValue()).toBe("sakura");
      expect(await tab.locator(".refs-sort select").inputValue()).toBe("name");

      // Stil-Guide: Katalog einspielen und die 18 Familien zeigen. Der Wechsel
      // beginnt ohne Suchbegriff, sonst filtert `q=sakura` den Katalog leer.
      await tab.goto(`${running.dashboardUrl}/#/references`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".refs-shell");
      await post("/api/reference-collections/styles", {});
      await tab.locator('.refs-nav-item:has-text("Stil-Guide")').click();
      await expect.poll(async () => tab.locator(".refs-style-card").count()).toBe(18);
      expect(await tab.locator(".refs-style-card").first().textContent()).toContain(
        "Brief kopieren",
      );

      // Der Katalog steht auch in der Adresse und filtert weiter.
      await expect.poll(async () => tab.url()).toContain("view=styles");
      await tab.locator(".refs-search input").fill("bauhaus");
      await expect.poll(async () => tab.locator(".refs-style-card").count()).toBeLessThan(18);

      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180000);
});
