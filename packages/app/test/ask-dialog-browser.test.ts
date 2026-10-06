import { AxeBuilder } from "@axe-core/playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserSkip, memoryDb } from "./support.ts";

// The dashboard asks its questions in its own <dialog>, not in window.prompt /
// window.confirm: a named title, a labelled field, a button that says what it
// does, Enter confirms, Escape and the backdrop cancel. A native dialog would
// show up as a Playwright "dialog" event — the test fails on the first one.

async function sites(dashboardUrl: string): Promise<{ id: string; name: string }[]> {
  const body = (await (await fetch(`${dashboardUrl}/api/sites`)).json()) as
    | { id: string; name: string }[]
    | { sites: { id: string; name: string }[] };
  return Array.isArray(body) ? body : body.sites;
}

describe.skipIf(browserSkip)("question dialogs in the dashboard", () => {
  it("asks for a name, a rename and a confirmation without native dialogs", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-ask-dialog-"));
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
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(15000);
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      tab.on("dialog", (dialog) => {
        nativeDialogs.push(`${dialog.type()}: ${dialog.message()}`);
        void dialog.dismiss();
      });
      await tab.goto(`${running.dashboardUrl}/#/`, { waitUntil: "domcontentloaded" });
      const dialog = tab.locator('dialog[data-role="ask-dialog"]');

      // --- text question: create a project --------------------------------
      await tab.getByRole("button", { name: "Neues Projekt" }).click();
      await dialog.waitFor();
      expect(await dialog.getAttribute("aria-labelledby")).not.toBeNull();
      expect(await dialog.getByRole("heading").innerText()).toBe("Neues Projekt");
      // The field is named and has the focus.
      const field = dialog.getByLabel("Name des Projekts");
      expect(await tab.evaluate("document.activeElement?.id")).toBe(await field.getAttribute("id"));

      // An empty answer is refused in the dialog, which stays open.
      await dialog.getByRole("button", { name: "Anlegen" }).click();
      expect(await dialog.getByRole("alert").innerText()).toBe("Bitte einen Namen eingeben.");
      expect(await field.getAttribute("aria-invalid")).toBe("true");
      expect(await dialog.count()).toBe(1);

      const axe = await new AxeBuilder({ page: tab })
        .include('dialog[data-role="ask-dialog"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        axe.violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes
              .map((node) => `${node.target.join(" ")} ${node.any[0]?.message ?? ""}`)
              .join(" | ")}`,
        ),
      ).toEqual([]);

      // Enter in the field confirms (it must never hit "Abbrechen").
      await field.fill("  Dialog-Test  ");
      await tab.keyboard.press("Enter");
      await expect.poll(async () => dialog.count()).toBe(0);
      await expect
        .poll(async () => (await sites(running.dashboardUrl)).map((site) => site.name))
        .toEqual(["Dialog-Test"]);

      // --- Escape cancels a rename ------------------------------------------
      await tab.getByRole("button", { name: "Umbenennen" }).first().click();
      await dialog.waitFor();
      const rename = dialog.getByLabel("Neuer Name");
      expect(await rename.inputValue()).toBe("Dialog-Test");
      await rename.fill("Anderer Name");
      await tab.keyboard.press("Escape");
      await expect.poll(async () => dialog.count()).toBe(0);
      expect((await sites(running.dashboardUrl)).map((site) => site.name)).toEqual(["Dialog-Test"]);

      // --- confirmation: cancel keeps, confirm moves ------------------------
      await tab.getByRole("button", { name: "Papierkorb" }).first().click();
      await dialog.waitFor();
      expect(await dialog.getByRole("heading").innerText()).toBe("In den Papierkorb verschieben?");
      await dialog.getByRole("button", { name: "Abbrechen" }).click();
      await expect.poll(async () => dialog.count()).toBe(0);
      expect((await sites(running.dashboardUrl)).map((site) => site.name)).toEqual(["Dialog-Test"]);
      // The focus is back on the button that opened the dialog.
      expect(
        await tab.evaluate(`document.activeElement?.textContent`),
      ).toBe("Papierkorb");

      await tab.getByRole("button", { name: "Papierkorb" }).first().click();
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Verschieben" }).click();
      await expect.poll(async () => dialog.count()).toBe(0);
      await expect.poll(async () => (await sites(running.dashboardUrl)).length).toBe(0);

      expect(nativeDialogs).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
