import { AxeBuilder } from "@axe-core/playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Das Dashboard fragt mit eigenen Dialogen statt mit `prompt()`/`confirm()`:
// Namen eingeben (Enter bestätigt, Esc bricht ab), Papierkorb bestätigen (der
// gefährliche Weg fängt auf „Abbrechen“ an), Fokus kehrt zum Auslöser zurück,
// axe findet nichts. Ein nativer Dialog würde hier unbemerkt weggedrückt; der
// Test zählt ihn deshalb ausdrücklich mit.

describe.skipIf(!browserAvailable)("eigene Dialoge statt prompt() und confirm()", () => {
  it("legt an, benennt um und bestätigt den Papierkorb ohne native Dialoge", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-dialogs-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    const nativeDialogs: string[] = [];
    try {
      const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(15000);
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      tab.on("dialog", (dialog) => {
        nativeDialogs.push(`${dialog.type()}: ${dialog.message()}`);
        void dialog.dismiss();
      });
      await tab.goto(`${running.dashboardUrl}/`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".empty");

      const dialog = tab.locator("dialog.ask-dialog[open]");
      const newButton = tab.getByRole("button", { name: "Neues Projekt" });

      // Anlegen: Das Namensfeld hat den Fokus, Enter bestätigt.
      await newButton.click();
      await dialog.waitFor();
      expect(await dialog.getAttribute("aria-labelledby")).not.toBeNull();
      expect(await tab.getByRole("dialog", { name: "Neues Projekt" }).count()).toBe(1);
      expect(await tab.evaluate("document.activeElement?.tagName")).toBe("INPUT");
      const axe = await new AxeBuilder({ page: tab })
        .include("dialog.ask-dialog")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(axe.violations.map((violation) => violation.id)).toEqual([]);
      await tab.keyboard.type("Dialog-Projekt");
      await tab.keyboard.press("Enter");
      await dialog.waitFor({ state: "detached" });
      await tab.locator(".project-card", { hasText: "Dialog-Projekt" }).waitFor();

      // Esc bricht ab, legt nichts an und gibt den Fokus zurück.
      await newButton.click();
      await dialog.waitFor();
      await tab.keyboard.type("Wird verworfen");
      await tab.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      expect(await tab.locator(".project-card").count()).toBe(1);
      expect(await tab.evaluate("document.activeElement?.textContent")).toBe("Neues Projekt");

      // Umbenennen: das Feld trägt den bisherigen Namen; ein Klick auf den
      // Knopf bestätigt.
      const card = tab.locator(".project-card", { hasText: "Dialog-Projekt" });
      await card.getByRole("button", { name: "Umbenennen" }).click();
      await dialog.waitFor();
      expect(await dialog.locator("input").inputValue()).toBe("Dialog-Projekt");
      await dialog.locator("input").fill("Umbenannt");
      await dialog.getByRole("button", { name: "Umbenennen" }).click();
      await dialog.waitFor({ state: "detached" });
      await tab.locator(".project-card", { hasText: "Umbenannt" }).waitFor();

      // Papierkorb: Die Rückfrage nennt das Projekt, „Abbrechen“ lässt alles
      // stehen, der zweite Anlauf verschiebt es.
      const renamed = tab.locator(".project-card", { hasText: "Umbenannt" });
      await renamed.getByRole("button", { name: "Papierkorb" }).click();
      await dialog.waitFor();
      expect(await dialog.innerText()).toContain("Umbenannt");
      expect(await tab.evaluate("document.activeElement?.textContent")).toBe("Abbrechen");
      await tab.keyboard.press("Enter");
      await dialog.waitFor({ state: "detached" });
      expect(await tab.locator(".project-card").count()).toBe(1);

      await renamed.getByRole("button", { name: "Papierkorb" }).click();
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Verschieben" }).click();
      await dialog.waitFor({ state: "detached" });
      await tab.waitForSelector(".empty");

      expect(nativeDialogs).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
    }
  }, 120000);
});
