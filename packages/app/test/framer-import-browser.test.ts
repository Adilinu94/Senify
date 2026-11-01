import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

describe.skipIf(!browserAvailable)("Framer import dialog", () => {
  it("analysiert HTML, zeigt den Report und übernimmt den Write in den Editor", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-framer-dialog-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const html = `<!doctype html><html><head><title>Import Dialog</title></head><body><div id="main"><main><h1>Import Dialog</h1><p>Bericht sichtbar</p></main></div></body></html>`;
    const sourceFile = join(dataDir, "source.html");
    writeFileSync(sourceFile, html, "utf8");
    const browser = await chromium.launch({ headless: true });
    const pageErrors: string[] = [];
    try {
      const post = (path: string, body: unknown): Promise<Response> =>
        fetch(`${running.dashboardUrl}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      const site = (await (await post("/api/sites", { name: "Import Dialog" })).json()) as { id: string };
      const page = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.on("pageerror", (error) => pageErrors.push(error.message));
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector('[data-action="canvas-overflow"]', { timeout: 30000 });
      await tab.locator('[data-action="canvas-overflow"]').click();
      await tab.waitForSelector('[data-action="framer-import-open"]', { state: "visible" });
      await tab.locator('[data-action="framer-import-open"]').click();
      await tab.waitForSelector('[data-role="framer-import-dialog"]', { timeout: 10000 });
      await tab.selectOption('[data-role="framer-source-mode"]', "mirror");
      await tab.fill('[data-role="framer-source-input"]', join(dataDir, "mirror"));
      const mirrorDir = join(dataDir, "mirror");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(mirrorDir, { recursive: true });
      writeFileSync(join(mirrorDir, "index.html"), html, "utf8");
      await tab.selectOption('[data-role="framer-target"]', "current");
      await tab.locator('[data-action="framer-import-apply"]').isDisabled();
      await tab.locator('[data-role="framer-import-dialog"] button[type="submit"]').click();
      await tab.waitForSelector('[data-role="framer-import-report"] .framer-report', {
        timeout: 30000,
      });
      expect(await tab.locator('[data-role="framer-import-report"]').textContent()).toContain(
        "Import-Bericht",
      );
      // The honest split (step 7 of the 1:1 plan): the dialog says how much of
      // the page the editor edits and how much runs as original code.
      const share = await tab
        .locator('[data-role="framer-editable-share"]')
        .textContent();
      expect(share).toMatch(/\d+ % bearbeitbar, \d+ % Original-Code/);
      expect(await tab.locator('[data-action="framer-import-apply"]').isEnabled()).toBe(true);

      // The preview: the source and the import side by side at three widths.
      await tab.locator('[data-action="framer-import-preview"]').click();
      await tab.waitForSelector('[data-role="framer-preview"] img', { timeout: 90000 });
      expect(await tab.locator('[data-role="framer-preview"] .framer-preview-row').count()).toBe(3);
      expect(await tab.locator('[data-role="framer-preview"] img').count()).toBe(6);
      const sizes = await tab.locator('[data-role="framer-preview"] img').evaluateAll((images) =>
        images.map((image) => (image as unknown as { naturalWidth: number }).naturalWidth),
      );
      expect(sizes.every((width) => width > 100)).toBe(true);
      await tab.locator('[data-action="framer-import-apply"]').click();
      // The page existed, so the import replaced its draft: the dialog stays
      // open and offers the way back before it closes.
      await tab.waitForSelector('[data-action="framer-import-undo"]', { timeout: 30000 });
      // Der Erfolgs-Text in `canvas-status` ist flüchtig: jede Session-Emission
      // schreibt ihn über `applyState` neu. Belastbar ist das Schreibergebnis,
      // das unten über Draft-Version und Knoten-Inhalt belegt wird.
      const fresh = await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json() as {
        draftVersion: number;
        draft: { nodes: Record<string, { props?: Record<string, unknown> }> };
      };
      expect(fresh.draftVersion).toBe(page.draftVersion + 1);
      expect(Object.values(fresh.draft.nodes).some((node) => node.props?.text === "Import Dialog")).toBe(true);

      // Undo: the replaced draft comes back from its revision.
      await tab.locator('[data-action="framer-import-undo"]').click();
      await expect.poll(async () => tab.locator('[data-action="framer-import-undo"]').textContent(), { timeout: 20000 }).toBe("Rückgängig gemacht");
      const restored = await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json() as {
        draft: { nodes: Record<string, { props?: Record<string, unknown> }> };
      };
      expect(Object.values(restored.draft.nodes).some((node) => node.props?.text === "Import Dialog")).toBe(false);
      await tab.locator('[data-action="framer-import-close"]').click();
      await expect.poll(
        async () => tab.locator('[data-role="framer-import-dialog"]').count(),
        { timeout: 20000 },
      ).toBe(0);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120_000);

  it("importiert ein Framer-Projekt nur mit Lizenzbestaetigung und ohne Vorschau", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-framer-project-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const projectXml = `<Project name="Mini">
  <Pages><Page nodeId="page-home" path="/" /></Pages>
  <TextStyles><TextStyle path="/Heading/H1" tag="h1" fontSize="64px" lineHeight="1.1" /></TextStyles>
</Project>`;
    const pageXml = `<Page nodeId="page-home" path="/">
  <Container nodeId="hero" layout="stack" stackDirection="vertical" gap="16px">
    <Heading nodeId="title" inlineTextStyle="/Heading/H1" text="Hallo aus dem Projekt" />
  </Container>
</Page>`;
    const projectFile = join(dataDir, "project.xml");
    const pageFile = join(dataDir, "page-home.xml");
    writeFileSync(projectFile, projectXml, "utf8");
    writeFileSync(pageFile, pageXml, "utf8");
    const browser = await chromium.launch({ headless: true });
    const pageErrors: string[] = [];
    try {
      const post = (path: string, body: unknown): Promise<Response> =>
        fetch(`${running.dashboardUrl}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      const site = (await (await post("/api/sites", { name: "Projekt Dialog" })).json()) as { id: string };
      const page = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
      ).json()) as { id: string };
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.on("pageerror", (error) => pageErrors.push(error.message));
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector('[data-action="canvas-overflow"]', { timeout: 30000 });
      await tab.locator('[data-action="canvas-overflow"]').click();
      await tab.waitForSelector('[data-action="framer-import-open"]', { state: "visible" });
      await tab.locator('[data-action="framer-import-open"]').click();
      await tab.waitForSelector('[data-role="framer-import-dialog"]', { timeout: 10000 });

      await tab.selectOption('[data-role="framer-source-mode"]', "project");
      // The project path has its own fields, its license confirmation and no
      // preview: the XML carries no original page to compare.
      expect(await tab.locator('[data-role="framer-project-xml"]').isVisible()).toBe(true);
      expect(await tab.locator('[data-role="framer-project-license"]').isVisible()).toBe(true);
      expect(await tab.locator('[data-action="framer-import-preview"]').isHidden()).toBe(true);
      await tab.setInputFiles('[data-role="framer-project-xml"]', projectFile);
      await tab.setInputFiles('[data-role="framer-page-xml"]', pageFile);

      // Without the confirmation nothing leaves the dialog.
      await tab.locator('[data-role="framer-import-dialog"] button[type="submit"]').click();
      await tab.waitForSelector('[data-role="framer-import-dialog"] .refs-form-error:not(:empty)', {
        timeout: 10000,
      });
      expect(await tab.locator('[data-role="framer-import-dialog"] .refs-form-error').textContent()).toContain(
        "nur für private Nutzung",
      );

      await tab.locator('[data-role="framer-project-license"]').check();
      await tab.fill('.framer-import-dialog input[placeholder="/landingpage"]', "/aus-projekt");
      await tab.locator('[data-role="framer-import-dialog"] button[type="submit"]').click();
      await tab.waitForSelector('[data-role="framer-import-report"] .framer-report', {
        timeout: 30000,
      });
      const reportText = await tab.locator('[data-role="framer-import-report"]').textContent();
      expect(reportText).toContain("Framer-Projekt-XML");
      expect(reportText).toContain("motion-absent");
      // The project is one page: no "Weitere Seiten" offer.
      expect(await tab.locator('[data-role="framer-site-pages"]').isHidden()).toBe(true);

      await tab.locator('[data-action="framer-import-apply"]').click();
      await expect.poll(
        async () => tab.locator('[data-role="framer-import-dialog"]').count(),
        { timeout: 30000 },
      ).toBe(0);
      const pages = (await (await fetch(`${running.dashboardUrl}/api/sites/${site.id}/pages`)).json()) as {
        pages: { id: string; path: string }[];
      };
      const written = pages.pages.find((entry) => entry.path === "/aus-projekt");
      expect(written).toBeDefined();
      const draft = (await (
        await fetch(`${running.dashboardUrl}/api/pages/${written?.id ?? ""}`)
      ).json()) as { draft: { nodes: Record<string, { props?: Record<string, unknown> }> } };
      expect(
        Object.values(draft.draft.nodes).some((node) => node.props?.text === "Hallo aus dem Projekt"),
      ).toBe(true);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120_000);
});
