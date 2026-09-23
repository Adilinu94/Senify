import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// The entry preview (T10): a draft article renders through the same bake chain
// as the release, and unsaved typing reaches the preview through the POST
// overlay. Skipped when playwright is not installed.

const author = { kind: "human", id: "programm", label: "Programm" };

describe.skipIf(!browserAvailable)("entry preview in the article editor (T10)", () => {
  it("renders a draft entry and follows unsaved typing", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-preview-browser-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const put = (path: string, body: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    try {
      const site = (await (await post("/api/sites", { name: "Preview-Projekt" })).json()) as {
        id: string;
      };
      const collection = (await (
        await post(`/api/sites/${site.id}/collections/from-fields`, {
          name: "Blog",
          slug: "blog",
          fields: [
            { key: "text", label: "Text", description: "Artikeltext.", type: "richtext" },
          ],
        })
      ).json()) as { id: string; fields: { id: string; key: string }[] };
      const titleId = collection.fields.find((field) => field.key === "title")?.id ?? "";
      const bodyId = collection.fields.find((field) => field.key === "text")?.id ?? "";
      expect(titleId).not.toBe("");
      expect(bodyId).not.toBe("");

      const layout = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Standard", path: "/layout" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const layoutTree = await post(`/api/pages/${layout.id}/mutations`, {
        baseDraftVersion: layout.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: layout.draft.rootNodeId },
            node: { type: "hero", props: { headline: "Blog-Kopf" } },
          },
          {
            op: "insertNode",
            parent: { nodeId: layout.draft.rootNodeId },
            node: { type: "outlet" },
          },
        ],
      });
      expect(layoutTree.status).toBe(200);
      expect(
        (
          // The layout label is the page title at read time; nothing is sent.
          await put(`/api/pages/${layout.id}/template`, {
            template: { kind: "layout" },
            author,
          })
        ).status,
      ).toBe(200);

      const entryTemplate = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Blog-Artikel", path: "/vorlagen/blog" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const templateTree = await post(`/api/pages/${entryTemplate.id}/mutations`, {
        baseDraftVersion: entryTemplate.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: entryTemplate.draft.rootNodeId },
            node: { type: "content", props: { body: "Artikel: {entry.title}" } },
          },
          {
            op: "insertNode",
            parent: { nodeId: entryTemplate.draft.rootNodeId },
            node: { type: "outlet" },
          },
        ],
      });
      expect(templateTree.status).toBe(200);
      expect(
        (
          await put(`/api/pages/${entryTemplate.id}/template`, {
            template: { kind: "collection", collectionIds: [collection.id], priority: 1 },
            layoutId: layout.id,
            author,
          })
        ).status,
      ).toBe(200);

      const created = await post(`/api/sites/${site.id}/entries`, {
        collectionId: collection.id,
        cells: { [titleId]: "Entwurf Beitrag", [bodyId]: "**Frisch** getippt" },
        author,
      });
      expect(created.status).toBe(201);
      const entry = (await created.json()) as { id: string; status: string };
      expect(entry.status).toBe("draft");

      const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(20000);
      tab.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      tab.on("response", (response) => {
        if (response.status() >= 400) {
          errors.push(`http ${response.status()}: ${response.url()}`);
        }
      });

      await tab.goto(
        `${running.dashboardUrl}/#/projects/${site.id}/articles/${entry.id}`,
        { waitUntil: "domcontentloaded" },
      );
      await tab.waitForSelector("#cell-" + titleId);
      // Der Vorschau-Knopf erscheint erst nach dem Mount der Artikelansicht;
      // unter der Last der vollen Suite (alle Worker belegt) braucht der
      // Renderer da laenger als das 20s-Budget des Klicks. Auto-Waiting
      // verlaengert das Budget, statt blind zu klicken.
      await tab.locator('button:has-text("Vorschau")').click({ timeout: 60_000 });

      const srcdoc = () => tab.locator("iframe.entry-preview-frame").getAttribute("srcdoc");
      await expect
        .poll(async () => (await srcdoc()) ?? "", { timeout: 90000 })
        .toContain("Artikel: Entwurf Beitrag");
      expect(await srcdoc()).toContain("<strong>Frisch</strong> getippt");
      expect(await srcdoc()).toContain("Blog-Kopf");

      // Unsaved typing lands in the preview after the debounce.
      await tab.fill(`#cell-${titleId}`, "Neuer Zwischenstand");
      await expect
        .poll(async () => (await srcdoc()) ?? "", { timeout: 90000 })
        .toContain("Artikel: Neuer Zwischenstand");
      expect(await srcdoc()).not.toContain("Artikel: Entwurf Beitrag");

      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 300000);
});
