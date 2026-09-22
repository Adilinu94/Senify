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
      // The browser test drives many edits plus its own API calls in a burst;
      // the default token bucket (60/min, burst 20) is meant for one typist.
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
      // Bildgenerierung (Ticket 04): in diesem Test ist der Provider aus — der
      // Erzeugen-Bereich zeigt den deaktivierten Zustand, der Absendeversuch
      // liefert die lesbare Fehlermeldung der Engine (kein echter Lauf).
      const disabled = await fetch(`${running.dashboardUrl}/api/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: { provider: "off" } }),
      });
      expect(disabled.status).toBe(200);
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
      tab.on("response", (response) => {
        if (response.status() >= 400) {
          errors.push(`http-${response.status()}: ${response.url()}`);
        }
      });

      // The legacy editor is an explicit deep link since E5 slice 1 (the
      // canvas is the default path).
      const url = `${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}?view=editor`;
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

      // DEFERRED — Ticket 03 "Editor-Chrome" (Phase 3) owns the undo/redo *UI*
      // contract: "Undo/Redo-History im UI" and "Keyboard: Cmd+Z/Shift+Z"
      // (.scratch/editor-v2-rebuild/issues/03-editor-chrome.md). The rebuild's
      // chrome does not carry that keyboard contract yet, so this browser check
      // is deliberately skipped, not deleted: the block below is kept verbatim
      // and is switched on together with Ticket 03. The store-level patch
      // history (Ticket 01, Phase 0) is covered by
      // packages/editor/test/state/store.test.ts and
      // packages/editor/test/history.test.ts.
      const editorChromeUndoReady = false;
      if (editorChromeUndoReady) {
        const storedHeadline = async (): Promise<string | undefined> => {
          const response = await fetch(`${running.dashboardUrl}/api/pages/${page.id}`);
          expect(response.status).toBe(200);
          const saved = await response.json() as {
            draft: { nodes: Record<string, { props: { headline?: string } }> };
          };
          return saved.draft.nodes[heroId]?.props.headline;
        };
        await tab.route(`**/api/pages/${page.id}/mutations`, async (route) => {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: { message: "Testweise fehlgeschlagener Schreibzugriff" } }),
          });
        }, { times: 1 });
        await tab.locator(".senify-editor__stage").click({ position: { x: 6, y: 6 } });
        await tab.keyboard.press("Control+z");
        await expect.poll(async () => tab.locator(".senify-editor").textContent())
          .toContain("Testweise fehlgeschlagener Schreibzugriff");
        expect(await storedHeadline()).toBe("Neue Headline");
        expect(
          errors.every((error) => error.startsWith("console:") && error.includes("500")),
        ).toBe(true);
        errors.length = 0;
        for (const expected of ["Browser-Prüfung", "Neue Headline", "Browser-Prüfung", "Neue Headline"]) {
          await tab.locator(".senify-editor__stage").click({ position: { x: 6, y: 6 } });
          await tab.keyboard.press(expected === "Browser-Prüfung" ? "Control+z" : "Control+y");
          await expect.poll(storedHeadline).toBe(expected);
          for (const index of [0, 1, 2]) {
            await expect.poll(async () => tab.locator(".senify-editor__iframe")
              .nth(index).contentFrame().locator("h1").first().textContent()).toBe(expected);
          }
        }
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

      // Site profile (ticket 20): the top bar carries the site's level.
      const profileSelect = tab.locator('[data-control="site-profile"]');
      expect(await profileSelect.count()).toBe(1);
      expect(await profileSelect.inputValue()).toBe("standard");

      // Motion play preview (M4): the button injects the runtime contract into
      // the active frame and stopping recreates the baseline frames.
      const motionButton = tab.locator('.senify-editor__button[data-action="motion-play"]');
      expect(await motionButton.count()).toBe(1);
      await motionButton.click();
      await expect
        .poll(async () => firstFrame.locator('[data-senify-motion="runtime"]').count())
        .toBe(1);
      // The vendor really loaded (a failed fetch would leave window.gsap unset).
      await expect
        .poll(async () =>
          firstFrame.locator("body").evaluate((element) => {
            const view = (
              element as unknown as {
                ownerDocument?: { defaultView?: { gsap?: unknown } };
              }
            ).ownerDocument?.defaultView;
            return typeof view?.gsap !== "undefined";
          }),
        )
        .toBe(true);
      await motionButton.click();
      await expect
        .poll(async () => firstFrame.locator('[data-senify-motion="runtime"]').count())
        .toBe(0);

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
      // The full spec is editable (M3): cap hint, RM variant, enabled switch.
      expect(await tab.locator('[data-role="motion-cap"]').count()).toBe(1);
      expect(await tab.locator('[data-control="motion-reduced"]').count()).toBe(1);
      expect(await tab.locator('[data-control="motion-enabled"]').count()).toBe(1);
      expect(await tab.locator('[data-control="motion-ease"]').count()).toBe(1);
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

      // --- Interactions (T17/M3) ---
      // Inline editing shows the toolbar; "Fertig" ends the edit.
      await firstFrame.locator("h1").first().dblclick();
      await expect.poll(async () => tab.locator(".senify-editor__inline-bar").count()).toBe(1);
      await tab.locator('.senify-editor__inline-bar [data-action="inline-done"]').click();
      await expect.poll(async () => renderedHeadline.getAttribute("contenteditable")).toBeNull();
      await expect.poll(async () => tab.locator(".senify-editor__inline-bar").count()).toBe(0);

      // Widget drag from the catalog into the canvas. Playwright's dragTo does
      // not carry HTML5 drag data across the frame boundary, so the test
      // drives the real dragstart/dragover/drop handlers with DragEvents.
      await tab.locator('.senify-editor__button[data-action="add"]').click();
      await tab.evaluate(`(() => {
        const card = document.querySelector('.senify-editor__widget-card[data-widget="banner"]');
        const frame = document.querySelector(".senify-editor__frame iframe");
        const target = frame.contentDocument.querySelector('section[data-section="features"]');
        const transfer = new DataTransfer();
        const fire = (element, type, extra) => {
          const DragEventCtor = element.ownerDocument.defaultView.DragEvent;
          element.dispatchEvent(new DragEventCtor(type, {
            bubbles: true, cancelable: true, dataTransfer: transfer, ...extra,
          }));
        };
        const rect = target.getBoundingClientRect();
        const mid = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
        fire(card, "dragstart");
        fire(target, "dragenter", mid);
        fire(target, "dragover", mid);
        fire(target, "drop", mid);
        fire(card, "dragend");
      })()`);
      const sectionOrder = (): Promise<string[]> =>
        firstFrame.locator("section[data-section]").evaluateAll((all) =>
          all.map(
            (element) =>
              (
                element as unknown as { getAttribute(name: string): string | null }
              ).getAttribute("data-section") ?? "",
          ),
        );
      await expect
        .poll(async () => (await sectionOrder()).includes("banner"))
        .toBe(true);
      const orderAfterDrop = await sectionOrder();
      expect(orderAfterDrop[orderAfterDrop.indexOf("banner") + 1]).toBe("features");

      // Structure column: drag a row to reorder, then toggle the eye.
      const draftNow = ((await (
        await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)
      ).json()) as {
        draft: {
          rootNodeId: string;
          nodes: Record<string, { type: string; children?: string[] }>;
        };
      }).draft;
      const rootChildren = draftNow.nodes[draftNow.rootNodeId]?.children ?? [];
      const bannerId = rootChildren.find((id) => draftNow.nodes[id]?.type === "banner") ?? "";
      const heroRowId = rootChildren.find((id) => draftNow.nodes[id]?.type === "hero") ?? "";
      expect(bannerId).not.toBe("");
      expect(heroRowId).not.toBe("");

      // Reorder in the structure column: drag the banner row onto the hero row
      // (before it). Playwright cannot carry HTML5 drag data across the frame
      // boundary, so the test drives the real dragstart/dragover/drop handlers
      // with synthetic DragEvents.
      await tab.evaluate(`(() => {
        const source = document.querySelector('.senify-editor__row[data-node="${bannerId}"]');
        const target = document.querySelector('.senify-editor__row[data-node="${heroRowId}"]');
        const transfer = new DataTransfer();
        const fire = (element, type, extra) =>
          element.dispatchEvent(new DragEvent(type, {
            bubbles: true, cancelable: true, dataTransfer: transfer, ...extra,
          }));
        const rect = target.getBoundingClientRect();
        const mid = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
        fire(source, "dragstart");
        fire(target, "dragenter", mid);
        fire(target, "dragover", mid);
        fire(target, "drop", mid);
        fire(source, "dragend");
      })()`);
      await expect.poll(async () => (await sectionOrder())[0]).toBe("banner");

      // The structure column's eye hides the node: rail row and frame agree.
      await tab
        .locator(`.senify-editor__row[data-node="${heroRowId}"] .senify-editor__eye`)
        .click();
      await expect
        .poll(async () =>
          tab
            .locator(`.senify-editor__row[data-node="${heroRowId}"]`)
            .getAttribute("data-hidden"),
        )
        .toBe("true");
      await expect
        .poll(async () =>
          firstFrame.locator('section[data-section="hero"][data-hidden="true"]').count(),
        )
        .toBeGreaterThan(0);

      // The design zoom survives the live round trip (Ticket 03: live runs at
      // 100%, design keeps its own zoom).
      const zoomLabel = (): Promise<string> =>
        tab.locator('.senify-editor__zoom button[data-action="zoom-reset"]').innerText();
      const zoomBefore = await zoomLabel();
      await tab.locator('.senify-editor__zoom button[data-action="zoom-out"]').click();
      const zoomChanged = await zoomLabel();
      expect(zoomChanged).not.toBe(zoomBefore);

      // Live mode: one frame in real size, and the real page plays motion with
      // the site profile (standard → Lenis). Switching back restores the frames.
      await tab.locator('.senify-editor__button[data-mode="live"]').click();
      await tab.waitForTimeout(150);
      expect(await tab.locator(".senify-editor__iframe").count()).toBe(1);
      // Native page scroll: the stage never scrolls and carries no zoom group;
      // the sheet sits in the layout flow at stage size, so the frame document
      // itself scrolls — exactly like the release page.
      expect(await tab.locator(".senify-editor__zoom").count()).toBe(0);
      const liveStage = (await tab.locator(".senify-editor__stage").evaluate(`(() => {
        const element = document.querySelector(".senify-editor__stage");
        return { overflow: getComputedStyle(element).overflow, scrollTop: element.scrollTop };
      })()`)) as { overflow: string; scrollTop: number };
      expect(liveStage.overflow).toBe("hidden");
      expect(liveStage.scrollTop).toBe(0);
      const liveSheet = (await tab
        .locator(".senify-editor__frame")
        .first()
        .evaluate(`(() => {
          const style = getComputedStyle(document.querySelector(".senify-editor__frame"));
          return { position: style.position, boxShadow: style.boxShadow, radius: style.borderRadius };
        })()`)) as { position: string; boxShadow: string; radius: string };
      expect(liveSheet.position).toBe("relative");
      expect(liveSheet.boxShadow).toBe("none");
      expect(liveSheet.radius).toBe("0px");
      const liveFrame = tab.locator(".senify-editor__iframe").first().contentFrame();
      // The frame document is the scroll container (Ticket 03 acceptance:
      // live shows native scroll, the stage never scrolls). The test page is
      // shorter than the stage, so the probe extends the document briefly.
      const liveScrollTop = (await liveFrame
        .locator("body")
        .evaluate(`(() => {
          const scrolling = document.scrollingElement ?? document.documentElement;
          const spacer = document.createElement("div");
          spacer.style.height = "2000px";
          document.body.appendChild(spacer);
          scrolling.scrollTop = 300;
          const scrollTop = scrolling.scrollTop;
          spacer.remove();
          scrolling.scrollTop = 0;
          return scrollTop;
        })()`)) as number;
      expect(liveScrollTop).toBeGreaterThan(0);
      await expect
        .poll(async () => liveFrame.locator('[data-senify-motion="runtime"]').count())
        .toBe(1);
      // The profile contract reached the frame: Lenis is part of the live page.
      await expect
        .poll(async () =>
          liveFrame.locator("body").evaluate((element) => {
            const view = (
              element as unknown as {
                ownerDocument?: { defaultView?: { Lenis?: unknown } };
              }
            ).ownerDocument?.defaultView;
            return typeof view?.Lenis !== "undefined";
          }),
        )
        .toBe(true);
      // The live page keeps its own behaviour: a click selects nothing. The
      // click goes to the link-free divider — the first section is the banner,
      // whose link would navigate the frame to its (unrouted) target.
      await liveFrame.locator('section[data-section="divider"]').click();
      await expect
        .poll(async () => tab.locator(".senify-editor__handle").count())
        .toBe(0);
      await tab.locator('.senify-editor__button[data-mode="design"]').click();
      expect(await tab.locator(".senify-editor__iframe").count()).toBe(3);
      expect(await zoomLabel()).toBe(zoomChanged);

      // The explorer pages tab is wired to the site's pages.
      await tab.locator('.senify-editor__tab[data-tab="pages"]').click();
      await expect
        .poll(async () => tab.locator(".senify-editor__row", { hasText: "Start" }).count())
        .toBeGreaterThan(0);

      // Medien-Tab mit Erzeugen-Bereich (Bildgenerierung Ticket 04): der
      // deaktivierte Provider wird benannt, das Formular ist bedienbar und der
      // Absendeversuch scheitert lesbar statt still.
      await tab.locator('.senify-editor__tab[data-tab="media"]').click();
      await tab.locator(".senify-editor__generate").waitFor({ timeout: 15000 });
      await expect
        .poll(async () =>
          tab.locator('.senify-editor__hint:has-text("deaktiviert")').count(),
        )
        .toBe(1);
      await tab
        .locator(".senify-editor__generate textarea")
        .fill("Eine rote Teekanne auf einem Holztisch");
      await tab.locator('.senify-editor__generate button:has-text("Erzeugen")').click();
      await expect
        .poll(async () =>
          tab.locator('.senify-editor__hint:has-text("deaktiviert")').count(),
        )
        .toBe(2);

      // Der Job-Start scheitert absichtlich (provider: off) — alle anderen
      // Antworten des Laufs bleiben fehlerfrei (der 400er erscheint nur als
      // Konsolen-Zeile "Failed to load resource").
      expect(
        errors.filter(
          (entry) =>
            !entry.includes("/images/jobs") && !entry.includes("status of 400"),
        ),
      ).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180000);
});
