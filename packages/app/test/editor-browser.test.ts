import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// The workbench in a real browser (T13): the program shell mounts the editor
// bundle, the frame manager lays out its iframes, a click inside a frame
// selects, a panel edit emits a canonical mutation and a deep link survives a
// reload. Skipped when playwright is not installed (same contract as the
// reference capture test).

const author = { kind: "human", id: "programm", label: "Programm" };

describe.skipIf(!browserAvailable)("editor in a real browser (T13)", () => {
  it("lays out the frames, edits through them and reloads a deep link", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-editor-browser-"));
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
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    try {
      // Warm the on-demand bundle build before the browser asks for it.
      expect((await fetch(`${running.dashboardUrl}/editor.js`)).status).toBe(200);
      // The frame stylesheet compiles on demand: Tailwind utilities for the
      // registry components plus their runtime styles.
      const frameCssResponse = await fetch(`${running.dashboardUrl}/editor-frame.css`);
      expect(frameCssResponse.status).toBe(200);
      const frameCss = await frameCssResponse.text();
      expect(frameCss).toContain(".mx-auto");
      expect(frameCss).toContain(".marquee-track");

      const site = (await (await post("/api/sites", { name: "Browser-Prüfung" })).json()) as {
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
            node: { type: "hero", props: { headline: "Browser-Prüfung" } },
          },
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: { type: "features", props: {} },
          },
        ],
      });
      expect(applied.status).toBe(200);
      const fresh = (await (
        await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)
      ).json()) as {
        draft: { rootNodeId: string; nodes: Record<string, { children?: string[] }> };
      };
      const heroId = (fresh.draft.nodes[fresh.draft.rootNodeId]?.children ?? [])[0] ?? "";
      expect(heroId).not.toBe("");

      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(15000);
      tab.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

      const url = `${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`;
      let mounted = false;
      for (let attempt = 0; attempt < 3 && !mounted; attempt += 1) {
        await tab.goto(url, { waitUntil: "domcontentloaded" });
        mounted = await tab
          .waitForSelector(".senify-editor", { timeout: 30000 })
          .then(() => true)
          .catch(() => false);
      }
      expect(mounted).toBe(true);

      // Design mode: three breakpoint frames with real media queries.
      expect(await tab.locator(".senify-editor__iframe").count()).toBe(3);

      // The stage sits right of the rail, the frames inside the stage; the
      // settings/catalog panel is the leftmost column (Elementor layout).
      const panelBox = await tab.locator(".senify-editor__panels").boundingBox();
      const railBox = await tab.locator(".senify-editor__rail").boundingBox();
      const stageBox = await tab.locator(".senify-editor__stage").boundingBox();
      const frameBox = await tab.locator(".senify-editor__frame").first().boundingBox();
      expect(panelBox).not.toBeNull();
      expect(railBox).not.toBeNull();
      expect(stageBox).not.toBeNull();
      expect(frameBox).not.toBeNull();
      expect((panelBox?.x ?? 0) + (panelBox?.width ?? 0)).toBeLessThanOrEqual(
        (railBox?.x ?? 0) + 1,
      );
      expect((railBox?.x ?? 0) + (railBox?.width ?? 0)).toBeLessThanOrEqual(
        (stageBox?.x ?? 0) + 1,
      );
      expect(frameBox?.x ?? 0).toBeGreaterThanOrEqual(stageBox?.x ?? 0);

      // A click inside a frame selects the node: rail highlight, selection
      // ring and the generated property panels.
      const firstFrame = tab.locator(".senify-editor__iframe").first().contentFrame();
      // The canvas renders the real section components, not stub boxes.
      await firstFrame.locator('section[data-section="hero"]').waitFor({ timeout: 60000 });
      expect(await firstFrame.locator(".senify-node").count()).toBe(0);
      const heroHeadline = firstFrame.locator("h1").first();
      expect((await heroHeadline.textContent())?.trim()).toBe("Browser-Prüfung");
      // Tailwind utilities and the theme CSS reached the frame: px-4 is 1rem,
      // the headline font comes from the theme token.
      const heroBox = firstFrame.locator('[data-section="hero"] > div').first();
      const heroPadding = () =>
        heroBox.evaluate((el) => {
          const target = el as unknown as {
            ownerDocument: {
              defaultView: { getComputedStyle(node: unknown): { paddingLeft: string } };
            };
          };
          return target.ownerDocument.defaultView.getComputedStyle(el).paddingLeft;
        });
      await expect.poll(heroPadding, { timeout: 30000 }).toBe("16px");
      const headlineFamily = () =>
        heroHeadline.evaluate((el) => {
          const target = el as unknown as {
            ownerDocument: {
              defaultView: { getComputedStyle(node: unknown): { fontFamily: string } };
            };
          };
          return target.ownerDocument.defaultView.getComputedStyle(el).fontFamily;
        });
      await expect.poll(headlineFamily, { timeout: 30000 }).toContain("Sora");
      await firstFrame.locator(`[data-node-id="${heroId}"] h1`).click();
      await expect
        .poll(async () =>
          tab.locator(`.senify-editor__row[data-node="${heroId}"][data-active="true"]`).count(),
        )
        .toBe(1);
      expect(await tab.locator(".senify-editor__panel").count()).toBeGreaterThan(0);
      expect(
        await firstFrame.locator(`[data-node-id="${heroId}"][data-selected="true"]`).count(),
      ).toBeGreaterThan(0);

      // A panel edit emits a canonical mutation: version badge and all three
      // frames follow.
      const headline = tab
        .locator('[data-key="headline"] textarea, [data-key="headline"] input')
        .first();
      await headline.fill("Neue Headline");
      await headline.press("Tab");
      await expect.poll(async () => tab.locator("#page-version").textContent()).toBe("Draft v3");
      for (const index of [0, 1, 2]) {
        const text = await tab
          .locator(".senify-editor__iframe")
          .nth(index)
          .contentFrame()
          .locator("h1")
          .first()
          .textContent();
        expect(text?.trim()).toBe("Neue Headline");
      }

      // The deep link carries the selection and survives a reload; the
      // rendered heading keeps its inline anchor (double-click edits it).
      await expect.poll(async () => tab.url()).toContain(`node=${heroId}`);
      await tab.reload({ waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".senify-editor", { timeout: 30000 });
      await expect
        .poll(async () =>
          tab.locator(`.senify-editor__row[data-node="${heroId}"][data-active="true"]`).count(),
        )
        .toBe(1);
      const renderedHeadline = firstFrame.locator("h1").first();
      await expect.poll(async () => renderedHeadline.getAttribute("data-inline")).toBe("true");
      await renderedHeadline.dblclick();
      await expect
        .poll(async () => renderedHeadline.getAttribute("contenteditable"))
        .toBe("plaintext-only");
      await tab.keyboard.press("Escape");

      // --- Elementor-like chrome (T17/M2) ---
      // Top bar with device switcher, structure toggle and publish.
      expect(await tab.locator(".senify-editor__topbar").count()).toBe(1);
      expect(
        await tab.locator(".senify-editor__devices .senify-editor__button[data-bp]").count(),
      ).toBe(3);
      expect(await tab.locator(".senify-editor__publish").count()).toBe(1);

      // The device switcher moves the active flag without re-creating frames.
      await tab.locator('.senify-editor__devices [data-bp="tablet"]').click();
      await expect
        .poll(async () =>
          tab
            .locator('.senify-editor__devices [data-bp="tablet"][data-active="true"]')
            .count(),
        )
        .toBe(1);
      expect(await tab.locator(".senify-editor__iframe").count()).toBe(3);
      await tab.locator('.senify-editor__devices [data-bp="desktop"]').click();

      // Structure button hides and restores the rail.
      await tab.locator('.senify-editor__button[data-action="structure"]').click();
      expect(await tab.locator(".senify-editor__rail").isVisible()).toBe(false);
      await tab.locator('.senify-editor__button[data-action="structure"]').click();
      expect(await tab.locator(".senify-editor__rail").isVisible()).toBe(true);

      // Settings tabs: Content → Style → Advanced (Motion + Sichtbarkeit).
      await tab.locator('.senify-editor__ptab[data-ptab="style"]').click();
      await expect
        .poll(async () =>
          tab.locator('.senify-editor__ptab[data-ptab="style"][data-active="true"]').count(),
        )
        .toBe(1);
      await tab.locator('.senify-editor__ptab[data-ptab="advanced"]').click();
      await expect
        .poll(async () => tab.locator('.senify-editor__panel[data-group="motion"]').count())
        .toBe(1);
      expect(await tab.locator('.senify-editor__panel[data-group="visibility"]').count()).toBe(1);
      await tab.locator('.senify-editor__ptab[data-ptab="content"]').click();

      // Selection handle: duplicate and delete right from the canvas.
      const heroSections = (): Promise<number> =>
        firstFrame.locator('section[data-section="hero"]').count();
      const heroesBefore = await heroSections();
      await tab.locator('.senify-editor__handle [data-action="duplicate"]').click();
      await expect.poll(heroSections).toBe(heroesBefore + 1);
      await tab.locator('.senify-editor__handle [data-action="delete"]').click();
      await expect.poll(heroSections).toBe(heroesBefore);

      // "+" insert point: opens the catalog with a hint, the picked widget
      // lands next to the selected section.
      await firstFrame.locator("h1").first().click();
      const insertAfter = tab.locator('.senify-editor__insert[data-action="insert-after"]');
      await expect.poll(async () => insertAfter.count()).toBe(1);
      await insertAfter.click();
      await expect.poll(async () => tab.locator(".senify-editor__hint").count()).toBe(1);
      await tab.locator('.senify-editor__widget-card[data-widget="divider"]').click();
      await expect
        .poll(async () => firstFrame.locator('section[data-section="divider"]').count())
        .toBe(1);

      // Right-click inside a frame opens the element context menu; clicking
      // the gray stage closes it again.
      await firstFrame.locator("h1").first().click({ button: "right" });
      await expect.poll(async () => tab.locator(".senify-editor__context").count()).toBe(1);
      await tab.locator(".senify-editor__stage").click({ position: { x: 6, y: 6 } });
      await expect.poll(async () => tab.locator(".senify-editor__context").count()).toBe(0);

      // Zoom lives in the footer (Elementor's bottom bar).
      await tab.locator('.senify-editor__zoom [data-action="zoom-in"]').click();
      await expect
        .poll(async () =>
          tab.locator('.senify-editor__zoom [data-action="zoom-reset"]').textContent(),
        )
        .toContain("60");
      await tab.locator('.senify-editor__zoom [data-action="zoom-reset"]').click();

      // Live mode: one frame in real size, switching back keeps the state.
      await tab.locator('.senify-editor__button[data-mode="live"]').click();
      expect(await tab.locator(".senify-editor__iframe").count()).toBe(1);
      await tab.locator('.senify-editor__button[data-mode="design"]').click();
      expect(await tab.locator(".senify-editor__iframe").count()).toBe(3);

      // The explorer pages tab is wired to the site's pages.
      await tab.locator('.senify-editor__tab[data-tab="pages"]').click();
      await expect
        .poll(async () => tab.locator(".senify-editor__row", { hasText: "Start" }).count())
        .toBeGreaterThan(0);

      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180000);
});
