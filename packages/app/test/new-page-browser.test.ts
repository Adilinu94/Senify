import { AxeBuilder } from "@axe-core/playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserSkip, memoryDb } from "./support.ts";

// "Neue Seite" in the dashboard: title, optional address and a start template.
// Before this the Seiten tab had no way to create a page at all.

type PageBody = {
  id: string;
  path: string;
  title: string;
  draft: {
    rootNodeId: string;
    nodes: Record<string, { type: string; children?: string[] }>;
  };
};

describe.skipIf(browserSkip)("new page with a start template", () => {
  it("creates a page from a template and opens it", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-new-page-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      // Opening the editor fires a burst of requests; like the other browser
      // tests that open it, this one raises the default 60 per minute.
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    try {
      const siteResponse = await fetch(`${running.dashboardUrl}/api/sites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Vorlagen-Test" }),
      });
      const site = (await siteResponse.json()) as { id: string };
      const pagesOf = async (): Promise<{ id: string; path: string; title: string }[]> =>
        ((await (await fetch(`${running.dashboardUrl}/api/sites/${site.id}/pages`)).json()) as {
          pages: { id: string; path: string; title: string }[];
        }).pages;

      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const tab = await context.newPage();
      // 30 s wie in den anderen Browser-Tests, die den Editor öffnen
      // (accessibility, canvas-view, redesign-canvas): dieser Test startet
      // das ganze Programm, lädt das Dashboard und öffnet danach den Editor.
      // Mit 15 s lief er auf einem belasteten CI-Runner in einen Klick-Timeout
      // („locator.click: Timeout 15000ms exceeded“) - die Schicht war zu eng
      // angesetzt, nicht der Test falsch.
      tab.setDefaultTimeout(30000);
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages`, {
        waitUntil: "domcontentloaded",
      });
      await tab.getByRole("button", { name: "Neue Seite" }).click();

      const dialog = tab.locator('dialog[data-role="new-page-dialog"]');
      await dialog.waitFor();
      expect(await dialog.getByRole("heading").innerText()).toBe("Neue Seite");
      // All four templates, the first one ("Leer") preselected.
      const radios = dialog.getByRole("radio");
      expect(await radios.count()).toBe(4);
      expect(await dialog.getByRole("radio", { name: /Leer/ }).isChecked()).toBe(true);

      const axe = await new AxeBuilder({ page: tab })
        .include('dialog[data-role="new-page-dialog"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        axe.violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(" | ")}`,
        ),
      ).toEqual([]);

      // Escape creates nothing.
      await tab.keyboard.press("Escape");
      await expect.poll(async () => dialog.count()).toBe(0);
      expect(await pagesOf()).toEqual([]);

      // A template, a title: the page exists, carries the template's sections
      // and the dashboard opens it.
      await tab.getByRole("button", { name: "Neue Seite" }).click();
      await dialog.waitFor();
      await dialog.getByLabel("Titel").fill("Unser Angebot");
      await dialog.getByRole("radio", { name: /Landingpage/ }).check();
      await dialog.getByRole("button", { name: "Seite anlegen" }).click();
      await expect.poll(async () => (await pagesOf()).length).toBe(1);
      const [created] = await pagesOf();
      expect(created?.title).toBe("Unser Angebot");
      await expect.poll(() => tab.evaluate("location.hash")).toContain(`/pages/${created?.id}`);

      const page = (await (
        await fetch(`${running.dashboardUrl}/api/pages/${created?.id}`)
      ).json()) as PageBody;
      const root = page.draft.nodes[page.draft.rootNodeId];
      expect((root?.children ?? []).map((child) => page.draft.nodes[child]?.type)).toEqual([
        "hero",
        "features",
        "cta",
      ]);

      // A second page: the address is typed, a leading slash is added.
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages`, {
        waitUntil: "domcontentloaded",
      });
      await tab.getByRole("button", { name: "Neue Seite" }).click();
      await dialog.waitFor();
      await dialog.getByLabel("Titel").fill("Kontakt");
      await dialog.getByLabel("Adresse (optional)").fill("kontakt");
      await dialog.getByRole("radio", { name: /Kontakt/ }).check();
      await dialog.getByRole("button", { name: "Seite anlegen" }).click();
      await expect.poll(async () => (await pagesOf()).length).toBe(2);
      expect((await pagesOf()).map((entry) => entry.path).sort()).toEqual(["/", "/kontakt"]);

      // A path the server refuses stays in the dialog as a sentence.
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages`, {
        waitUntil: "domcontentloaded",
      });
      await tab.getByRole("button", { name: "Neue Seite" }).click();
      await dialog.waitFor();
      await dialog.getByLabel("Adresse (optional)").fill("/kontakt");
      await dialog.getByRole("button", { name: "Seite anlegen" }).click();
      await expect.poll(async () => dialog.getByRole("alert").innerText()).toContain("anderen Seite");
      expect(await dialog.count()).toBe(1);
      expect(await pagesOf()).toHaveLength(2);

      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
