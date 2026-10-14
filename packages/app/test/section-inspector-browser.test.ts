import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// The Content tab of a section. A features block used to show an empty tab; its
// fields are the section registry's, including the list of entries, which the
// inspector now edits as a list: expand an entry, change it, add one, move it,
// remove it. Every edit is written through the store and saved to the page.

const author = { kind: "human", id: "programm", label: "Programm" };

type Entry = { title: string; text: string };

describe.skipIf(!browserAvailable)("section content in the inspector", () => {
  it("edits a headline and a list of entries and saves them", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-section-inspector-"));
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
    const errors: string[] = [];
    try {
      expect((await fetch(`${running.dashboardUrl}/editor.js`)).status).toBe(200);
      const site = (await (await post("/api/sites", { name: "Inhalt-Tab" })).json()) as { id: string };
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
            node: {
              type: "features",
              variant: "grid",
              props: {
                title: "Das bieten wir",
                items: [
                  { title: "Erstens", text: "Schnell." },
                  { title: "Zweitens", text: "Sauber." },
                ],
              },
            },
          },
        ],
      });
      expect(applied.status).toBe(200);
      const readPage = async () =>
        (await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json()) as {
          draft: {
            rootNodeId: string;
            nodes: Record<string, { children?: string[]; props: { title?: string; items?: Entry[] } }>;
          };
        };
      const fresh = await readPage();
      const sectionId = (fresh.draft.nodes[fresh.draft.rootNodeId]?.children ?? [])[0] ?? "";
      expect(sectionId).not.toBe("");
      const savedItems = async (): Promise<Entry[]> =>
        ((await readPage()).draft.nodes[sectionId]?.props.items ?? []) as Entry[];
      const savedTitle = async (): Promise<string | undefined> =>
        (await readPage()).draft.nodes[sectionId]?.props.title;

      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector(".senify-canvas");
      await tab.waitForSelector(".senify-explorer__item");
      await tab.locator(`.senify-explorer__item[data-node="${sectionId}"]`).click();
      await tab.waitForSelector('.senify-inspector__field[data-key="title"]');

      // The Content tab shows the section's own fields in German.
      const body = tab.locator('.senify-inspector__body[data-tab="content"]');
      expect(await body.locator('[data-key="title"] .senify-inspector__field-label').innerText()).toBe("Titel");
      expect(await body.locator('[data-key="items"] .senify-inspector__field-label').innerText()).toBe("Einträge");
      // Not responsive: no device dots on section content.
      expect(await body.locator('[data-key="title"] .senify-inspector__dot').count()).toBe(0);

      // A headline with a colon and a semicolon (the old CSS grammar refused it).
      const title = body.locator('[data-key="title"] input');
      expect(await title.inputValue()).toBe("Das bieten wir");
      await title.fill("Warum wir: schnell; sauber");
      await title.blur();
      await expect.poll(savedTitle, { timeout: 8000 }).toBe("Warum wir: schnell; sauber");

      // The list: collapsed entries with their first text as the name.
      const toggles = body.locator(".senify-repeater__toggle");
      expect(await toggles.allTextContents()).toEqual(["1. Erstens", "2. Zweitens"]);
      expect(await body.locator('[data-action="up"]').first().isDisabled()).toBe(true);
      expect(await body.locator('[data-action="down"]').last().isDisabled()).toBe(true);

      // Open the second entry and change its text.
      await toggles.nth(1).click();
      const entryText = body.locator('.senify-repeater__item[data-index="1"] [data-key="text"] textarea');
      await entryText.fill("Sauber: ohne Umwege.");
      await entryText.blur();
      await expect.poll(async () => (await savedItems())[1]?.text, { timeout: 8000 }).toBe("Sauber: ohne Umwege.");

      // Emptying a required text is refused and the panel shows the stored value again.
      const entryTitle = body.locator('.senify-repeater__item[data-index="1"] [data-key="title"] input');
      await entryTitle.fill("");
      await entryTitle.blur();
      await expect.poll(async () => body.locator('.senify-repeater__item[data-index="1"] [data-key="title"] input').inputValue()).toBe("Zweitens");
      expect((await savedItems())[1]?.title).toBe("Zweitens");

      // Add an entry: it starts valid and open.
      await body.locator('[data-action="add-entry"]').click();
      await expect.poll(async () => (await savedItems()).length, { timeout: 8000 }).toBe(3);
      expect((await savedItems())[2]).toEqual({ title: "Titel", text: "Text" });
      expect(await toggles.count()).toBe(3);

      // Move the last entry up, then remove the first.
      await body.locator('.senify-repeater__item[data-index="2"] [data-action="up"]').click();
      await expect.poll(async () => (await savedItems()).map((entry) => entry.title), { timeout: 8000 }).toEqual([
        "Erstens",
        "Titel",
        "Zweitens",
      ]);
      await body.locator('.senify-repeater__item[data-index="0"] [data-action="remove"]').click();
      await expect.poll(async () => (await savedItems()).map((entry) => entry.title), { timeout: 8000 }).toEqual([
        "Titel",
        "Zweitens",
      ]);

      // Undo takes the removal back.
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(async () => (await savedItems()).length, { timeout: 8000 }).toBe(3);

      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180000);

  it("switches the variant of a section, saves it and takes it back with undo", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-section-variant-"));
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
    const errors: string[] = [];
    try {
      const site = (await (await post("/api/sites", { name: "Variante" })).json()) as { id: string };
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
            node: {
              type: "features",
              variant: "grid",
              props: { title: "Das bieten wir", items: [{ title: "Erstens", text: "Schnell." }] },
            },
          },
        ],
      });
      expect(applied.status).toBe(200);
      const readPage = async () =>
        (await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json()) as {
          draft: {
            rootNodeId: string;
            nodes: Record<string, { children?: string[]; variant?: string }>;
          };
        };
      const fresh = await readPage();
      const sectionId = (fresh.draft.nodes[fresh.draft.rootNodeId]?.children ?? [])[0] ?? "";
      expect(sectionId).not.toBe("");
      const savedVariant = async (): Promise<string | undefined> =>
        (await readPage()).draft.nodes[sectionId]?.variant;

      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector(".senify-canvas");
      await tab.waitForSelector(".senify-explorer__item");
      await tab.locator(`.senify-explorer__item[data-node="${sectionId}"]`).click();
      const body = tab.locator('.senify-inspector__body[data-tab="content"]');
      await body.locator('[data-key="variant"] [role="radiogroup"]').waitFor();

      // The choice leads the Content tab as tiles with a preview each and shows the
      // stored variant as the checked one.
      expect(await body.locator('[data-key="variant"] .senify-inspector__field-label').innerText()).toBe("Variante");
      const tiles = body.locator('[data-key="variant"] [role="radio"]');
      expect(await tiles.locator(".senify-inspector__variant-label").allTextContents()).toEqual([
        "Raster",
        "Wechselnd",
        "Liste",
      ]);
      expect([
        await tiles.nth(0).getAttribute("aria-checked"),
        await tiles.nth(1).getAttribute("aria-checked"),
        await tiles.nth(2).getAttribute("aria-checked"),
      ]).toEqual(["true", "false", "false"]);
      expect(await savedVariant()).toBe("grid");

      // Every tile shows its preview picture: the file is served and decodes.
      const pictures = tiles.locator("img");
      expect(await pictures.count()).toBe(3);
      await expect
        .poll(
          () =>
            pictures.evaluateAll((all) =>
              all.every((img) => (img as unknown as { naturalWidth: number }).naturalWidth > 0),
            ),
          { timeout: 8000 },
        )
        .toBe(true);

      // Switching writes the variant and nothing else.
      await body.locator('[data-key="variant"] [data-value="list"]').click();
      await expect.poll(savedVariant, { timeout: 8000 }).toBe("list");
      expect(
        await body
          .locator('[data-key="variant"] [data-value="list"]')
          .getAttribute("aria-checked"),
      ).toBe("true");
      expect(
        await body.locator('[data-key="title"] input').inputValue(),
      ).toBe("Das bieten wir");

      // Undo takes the switch back.
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(savedVariant, { timeout: 8000 }).toBe("grid");

      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180000);
  it("picks the image of a section from the media library, empties it and takes it back with undo", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-section-image-"));
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
    // Two 1x1 PNGs of different colour: the upload merges identical bytes into
    // one asset, so two names need two different pictures.
    const red = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4IScHAAK2AQU0pnWqAAAAAElFTkSuQmCC", "base64");
    const blue = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQkzsBAAFiAQURG6MhAAAAAElFTkSuQmCC", "base64");
    const upload = async (siteId: string, filename: string, png: Buffer): Promise<string> => {
      const ticket = (await (
        await post(`/api/sites/${siteId}/assets/upload-url`, {
          filename,
          mime: "image/png",
          byteSize: png.length,
        })
      ).json()) as { url: string };
      const response = await fetch(`${running.dashboardUrl}${ticket.url}`, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: new Uint8Array(png),
      });
      expect(response.status).toBe(201);
      return ((await response.json()) as { asset: { id: string } }).asset.id;
    };
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    try {
      const site = (await (await post("/api/sites", { name: "Bildfeld" })).json()) as { id: string };
      const titel = await upload(site.id, "titel.png", red);
      await upload(site.id, "team.png", blue);
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
            node: { type: "media", variant: "image", props: {} },
          },
        ],
      });
      expect(applied.status).toBe(200);
      const readPage = async () =>
        (await (await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)).json()) as {
          draft: {
            rootNodeId: string;
            nodes: Record<string, { children?: string[]; props: { asset?: { assetId: string } } }>;
          };
        };
      const fresh = await readPage();
      const sectionId = (fresh.draft.nodes[fresh.draft.rootNodeId]?.children ?? [])[0] ?? "";
      expect(sectionId).not.toBe("");
      const savedAsset = async (): Promise<string | undefined> =>
        (await readPage()).draft.nodes[sectionId]?.props.asset?.assetId;

      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector(".senify-canvas");
      await tab.waitForSelector(".senify-explorer__item");
      await tab.locator(`.senify-explorer__item[data-node="${sectionId}"]`).click();
      const select = tab.locator('.senify-inspector__body[data-tab="content"] [data-key="asset"] select');
      await select.waitFor();

      // The library's pictures by name, "no image" first, nothing chosen yet.
      expect(await select.locator("option").allTextContents()).toEqual(["Kein Bild", "team.png", "titel.png"]);
      expect(await select.inputValue()).toBe("");

      // A pick is saved as a reference.
      await select.selectOption({ label: "titel.png" });
      await expect.poll(savedAsset, { timeout: 8000 }).toBe(titel);

      // "No image" takes the prop away again.
      await select.selectOption({ label: "Kein Bild" });
      await expect.poll(savedAsset, { timeout: 8000 }).toBeUndefined();

      // Undo brings the picture back.
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(savedAsset, { timeout: 8000 }).toBe(titel);

      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180000);
});
