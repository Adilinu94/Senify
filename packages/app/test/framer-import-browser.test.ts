import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { bakePages, Store } from "@senify/engine";
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
    const html = `<!doctype html><html><head><title>Import Dialog</title></head><body><div id="main"><main><h1>Import Dialog</h1><p>Bericht sichtbar</p><a href="/ziel">Hallo <strong>Welt</strong> fertig</a></main></div></body></html>`;
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

      // The output choice is part of the request: re-analyse with structure and
      // the report names request and carrier; the editable-share guess is left
      // out because the structure path makes no claim about runtime freedom.
      await tab.selectOption('[data-role="framer-output"]', "structure");
      await tab.locator('[data-role="framer-import-dialog"] button[type="submit"]').click();
      await expect.poll(
        async () => tab.locator('[data-role="framer-import-report"]').textContent(),
        { timeout: 30000 },
      ).toContain("Ausgabe: structure");
      expect(await tab.locator('[data-role="framer-import-report"]').textContent()).toContain(
        "Träger: structure",
      );
      expect(await tab.locator('[data-role="framer-editable-share"]').count()).toBe(0);
      await tab.locator('[data-action="framer-import-apply"]').click();
      // The page existed, so the import replaced its draft: the dialog stays
      // open and offers the way back before it closes.
      await tab.waitForSelector('[data-action="framer-import-undo"]', { timeout: 30000 });
      // Der Erfolgs-Text in `canvas-status` ist flüchtig: jede Session-Emission
      // schreibt ihn über `applyState` neu. Belastbar ist das Schreibergebnis,
      // das unten über Draft-Version und Knoten-Inhalt belegt wird.
      const fresh = await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json() as {
        draftVersion: number;
        draft: {
          rootNodeId: string;
          nodes: Record<string, { props?: Record<string, unknown>; framerImport?: { output: string } }>;
        };
      };
      expect(fresh.draftVersion).toBe(page.draftVersion + 1);
      expect(Object.values(fresh.draft.nodes).some((node) => node.props?.text === "Import Dialog")).toBe(true);
      expect(fresh.draft.nodes[fresh.draft.rootNodeId]?.framerImport).toEqual({ output: "structure" });

      // Undo: the replaced draft comes back from its revision, including its
      // output state (the empty page had none).
      await tab.locator('[data-action="framer-import-undo"]').click();
      await expect.poll(async () => tab.locator('[data-action="framer-import-undo"]').textContent(), { timeout: 20000 }).toBe("Rückgängig gemacht");
      const restored = await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json() as {
        draft: {
          rootNodeId: string;
          nodes: Record<string, { props?: Record<string, unknown>; framerImport?: { output: string } }>;
        };
      };
      expect(Object.values(restored.draft.nodes).some((node) => node.props?.text === "Import Dialog")).toBe(false);
      expect(restored.draft.nodes[restored.draft.rootNodeId]?.framerImport).toBeUndefined();
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

  it("zeigt den gemischten Link im Editor mit Beschriftung und Inhalt", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-framer-link-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const html = `<!doctype html><html><head><title>Link</title></head><body><div id="main"><main><a href="/ziel">Hallo <strong>Welt</strong> fertig</a></main></div></body></html>`;
    const mirrorDir = join(dataDir, "mirror");
    mkdirSync(mirrorDir, { recursive: true });
    writeFileSync(join(mirrorDir, "index.html"), html, "utf8");
    const browser = await chromium.launch({ headless: true });
    try {
      const post = (path: string, body: unknown): Promise<Response> =>
        fetch(`${running.dashboardUrl}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      const site = (await (await post("/api/sites", { name: "Link-Import" })).json()) as { id: string };
      const page = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
      ).json()) as { id: string };
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector('[data-action="canvas-overflow"]', { timeout: 30000 });
      await tab.locator('[data-action="canvas-overflow"]').click();
      await tab.waitForSelector('[data-action="framer-import-open"]', { state: "visible" });
      await tab.locator('[data-action="framer-import-open"]').click();
      await tab.waitForSelector('[data-role="framer-import-dialog"]', { timeout: 10000 });
      await tab.selectOption('[data-role="framer-source-mode"]', "mirror");
      await tab.fill('[data-role="framer-source-input"]', mirrorDir);
      await tab.selectOption('[data-role="framer-output"]', "structure");
      await tab.selectOption('[data-role="framer-target"]', "current");
      await tab.locator('[data-role="framer-import-dialog"] button[type="submit"]').click();
      await tab.waitForSelector('[data-role="framer-import-report"] .framer-report', { timeout: 30000 });
      await tab.locator('[data-action="framer-import-apply"]').click();
      await tab.waitForSelector('[data-action="framer-import-close"]', { timeout: 30000 });
      await tab.locator('[data-action="framer-import-close"]').click();

      const rahmen = tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').contentFrame();
      await expect.poll(() => rahmen.locator('[data-widget="link"]').count(), { timeout: 20000 }).toBe(1);
      await rahmen.locator('[data-widget="link"]').click();
      await expect.poll(
        () => tab.locator('.senify-inspector__field[data-key="label"]').count(),
        { timeout: 10000 },
      ).toBe(1);
      expect(
        await tab.locator('.senify-inspector__field[data-key="label"] input').inputValue(),
      ).toBe("Hallo Welt fertig");
      expect(
        await tab.locator('.senify-inspector__field[data-key="html"] textarea').inputValue(),
      ).toContain("<strong>Welt</strong>");
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
    // Die Sammlungen sind ein optionaler dritter Teil: ohne Datei bleibt der
    // Lauf ein reiner Seiten-Import, mit Datei entstehen sie im selben Commit.
    const cmsFile = join(dataDir, "collections.json");
    writeFileSync(
      cmsFile,
      JSON.stringify([
        {
          id: "col-blog",
          name: "Blog",
          fields: [
            { id: "f-title", name: "Titel", type: "string" },
            { id: "f-body", name: "Text", type: "string", multiline: true },
          ],
        },
      ]),
      "utf8",
    );
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
      expect(await tab.locator('[data-role="framer-project-style-url"]').isVisible()).toBe(true);
      expect(await tab.locator('[data-role="framer-project-license"]').isVisible()).toBe(true);
      expect(await tab.locator('[data-action="framer-import-preview"]').isHidden()).toBe(true);
      await tab.setInputFiles('[data-role="framer-project-xml"]', projectFile);
      await tab.setInputFiles('[data-role="framer-page-xml"]', pageFile);
      // Die Sammlungsdatei ist optional und nur im Projekt-Modus sichtbar.
      expect(await tab.locator('[data-role="framer-cms-row"]').isVisible()).toBe(true);
      await tab.setInputFiles('[data-role="framer-cms-collections"]', cmsFile);

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
      // Der Bericht nennt die Sammlung samt Ausgang, bevor geschrieben wird.
      expect(await tab.locator('[data-role="framer-report-cms"]').textContent()).toContain(
        "Blog (wird angelegt, 2 Felder)",
      );
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
      // Die Sammlung ist mit demselben Commit entstanden; das Titelfeld steht
      // vorne, der mehrzeilige String wurde zum langen Text.
      const collections = (await (
        await fetch(`${running.dashboardUrl}/api/sites/${site.id}/collections`)
      ).json()) as { collections: { slug: string; fields: { key: string; type: string }[] }[] };
      const blog = collections.collections.find((collection) => collection.slug === "blog");
      expect(blog?.fields.map((field) => [field.key, field.type])).toEqual([
        ["title", "text"],
        ["titel", "text"],
        ["text", "longText"],
      ]);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120_000);

  it("importiert eine Strukturseite, bearbeitet sie im Editor und baut die Aenderung", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-framer-structure-e2e-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      reviewVisuals: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const post = (path: string, body: unknown): Promise<Response> =>
        fetch(`${running.dashboardUrl}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      const site = (await (await post("/api/sites", { name: "Struktur E2E" })).json()) as { id: string };
      const html = `<!doctype html><html><head><title>Struktur E2E</title></head><body><div id="main"><main><h1>Import Dialog</h1><p>Bericht sichtbar</p></main></div></body></html>`;
      const imported = (await (
        await post(`/api/sites/${site.id}/imports/framer`, {
          source: { html },
          pagePath: "/struktur-e2e",
          write: true,
          output: "structure",
          assets: "skip",
          fonts: "skip",
        })
      ).json()) as { report: { pageId: string; storedOutput: string; runtimeCarrier: string } };
      expect(imported.report.storedOutput).toBe("structure");
      expect(imported.report.runtimeCarrier).toBe("structure");
      const pageId = imported.report.pageId;

      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      const pageErrors: string[] = [];
      tab.on("pageerror", (error) => pageErrors.push(error.message));
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${pageId}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector(".senify-canvas__iframe", { timeout: 30000 });
      const frame = tab
        .locator('.senify-canvas__frame[data-device="desktop"] iframe')
        .contentFrame();
      const inline = frame.locator("[data-inline]").filter({ hasText: "Import Dialog" }).first();
      await inline.waitFor({ timeout: 20000 });
      await inline.dblclick();
      await expect.poll(() => inline.getAttribute("contenteditable")).toBe("plaintext-only");
      await inline.fill("Struktur bearbeitet");
      await tab.keyboard.press("Enter");
      const textOfPage = async () => {
        const current = (await (
          await fetch(`${running.dashboardUrl}/api/pages/${pageId}`)
        ).json()) as { draft: { nodes: Record<string, { props?: Record<string, unknown> }> } };
        return Object.values(current.draft.nodes).map((node) => node.props?.text).filter((text) => typeof text === "string");
      };
      await expect.poll(textOfPage, { timeout: 20000 }).toContain("Struktur bearbeitet");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");

      // Reload: the edit is the saved draft, not a canvas state.
      await tab.reload();
      await tab.waitForSelector(".senify-canvas__iframe", { timeout: 30000 });
      const reloaded = tab
        .locator('.senify-canvas__frame[data-device="desktop"] iframe')
        .contentFrame();
      await expect.poll(async () => (await reloaded.locator("body").textContent())?.includes("Struktur bearbeitet"), { timeout: 20000 }).toBe(true);

      // Undo and redo the tested edit; the output state stays on the page.
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(textOfPage, { timeout: 20000 }).toContain("Import Dialog");
      await tab.locator('.senify-canvas__button[data-action="redo"]').click();
      await expect.poll(textOfPage, { timeout: 20000 }).toContain("Struktur bearbeitet");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");

      const store = new Store(database.db);
      const persistedSite = await store.getSite(site.id);
      const outDir = join(dataDir, "structure-bake");
      await bakePages(store, {
        site: persistedSite,
        pages: await store.listPageDrafts(site.id),
        outDir,
        dataDir,
      });
      const builtHtml = readFileSync(join(outDir, "struktur-e2e", "index.html"), "utf8");
      expect(builtHtml).toContain("Struktur bearbeitet");
      expect(builtHtml).not.toContain("framerImport");

      // The built file, opened as a browser document, shows the edit and no
      // page-wide Framer runtime carrier.
      const builtTab = await context.newPage();
      await builtTab.goto(pathToFileURL(join(outDir, "struktur-e2e", "index.html")).href);
      expect(await builtTab.locator("body").textContent()).toContain("Struktur bearbeitet");
      expect(await builtTab.locator("[data-framer-runtime], [data-framer-bundle]").count()).toBe(0);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180_000);
});
