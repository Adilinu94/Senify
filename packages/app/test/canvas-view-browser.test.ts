import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// The canvas wired into the editor page (rebuild Phase 0, fifth slice). Since
// E5 slice 1 it is the one visible editor: the page mounts it directly (no
// switch), the inspector is part of the mount, and the old editor stays
// reachable as an explicit `?view=editor` deep link. This run drives the real
// path in a browser: three device frames, a click selects, a widget inserts,
// Undo takes it back, the inspector writes through the store, a save
// round-trips through the engine, and the legacy editor still loads.
// Skipped when Playwright is missing (same contract as the other browser tests).

const author = { kind: "human", id: "programm", label: "Programm" };

describe.skipIf(!browserAvailable)("canvas view in a real browser", () => {
  it("mounts the canvas by default, selects, inserts, undoes, saves and reloads", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-canvas-view-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      // The run fires bursts of edits plus its own API calls.
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const browser = await chromium.launch({ headless: true });
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    // The visual evidence of the run lands in the scratch folder, next to the
    // other phase-0 shots (same place the handoff asks for).
    const shotDir = resolve(process.cwd(), ".scratch/refs/nick/canvas");
    mkdirSync(shotDir, { recursive: true });
    try {
      // Warm the on-demand editor bundle before the browser asks for it.
      expect((await fetch(`${running.dashboardUrl}/editor.js`)).status).toBe(200);

      const site = (await (await post("/api/sites", { name: "Canvas-Ansicht" })).json()) as {
        id: string;
      };
      const page = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      // Seed one real section, so the canvas renders a component and not an
      // empty page.
      const applied = await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: { type: "hero", props: { headline: "Canvas-Prüfung" } },
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
      tab.setDefaultTimeout(30000);
      const isFavicon = (url: string): boolean => url.endsWith("/favicon.ico");
      tab.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
      tab.on("requestfailed", (request) => {
        if (isFavicon(request.url())) return;
        // Der SSE-Kanal wird beim Routenwechsel bewusst geschlossen (Ticket 05);
        // der Browser meldet die laufende Verbindung als abgebrochenen Request.
        if (
          request.url().includes("/api/events") &&
          request.failure()?.errorText === "net::ERR_ABORTED"
        ) {
          return;
        }
        failedRequests.push(`failed: ${request.url()} (${request.failure()?.errorText ?? "?"})`);
      });
      tab.on("response", (response) => {
        if (response.status() < 400 || isFavicon(response.url())) return;
        failedRequests.push(`http ${response.status()}: ${response.url()}`);
      });

      const pageUrl = `${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`;
      let mounted = false;
      for (let attempt = 0; attempt < 3 && !mounted; attempt += 1) {
        await tab.goto(pageUrl, { waitUntil: "domcontentloaded" });
        mounted = await tab
          .waitForSelector(".senify-canvas", { timeout: 30000 })
          .then(() => true)
          .catch(() => false);
      }
      expect(mounted).toBe(true);

      // E5 slice 1: the canvas is the one visible editor — no switch, no
      // `view` parameter needed. The inspector is part of the mount.
      expect(await tab.locator(".editor-switch").count()).toBe(0);
      expect(await tab.locator(".senify-canvas__frame").count()).toBe(3);
      expect(await tab.locator(".senify-canvas__iframe").count()).toBe(3);
      expect(await tab.locator(".senify-inspector").count()).toBe(1);
      await tab.screenshot({ path: join(shotDir, "02-canvas-frames.png") });

      const desktopFrame = () =>
        tab
          .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
          .contentFrame();
      await desktopFrame().locator(`[data-node-id="${heroId}"]`).first().waitFor({
        timeout: 30000,
      });

      // A click selects the hero: stage marker and the store agree.
      await desktopFrame().locator(`[data-node-id="${heroId}"]`).first().click();
      await expect
        .poll(async () => tab.locator(`.senify-canvas[data-selected="${heroId}"]`).count())
        .toBe(1);
      await tab.screenshot({ path: join(shotDir, "03-canvas-selected.png") });

      // Insert a widget behind the selection, then Undo takes it back and Redo
      // puts it in again.
      await tab.selectOption('.senify-canvas__select', "divider");
      await tab.locator('.senify-canvas__button[data-action="insert-after"]').click();
      const dividerCount = (): Promise<number> =>
        desktopFrame().locator('section[data-section="divider"]').count();
      await expect.poll(dividerCount).toBe(1);
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(dividerCount).toBe(0);
      await tab.locator('.senify-canvas__button[data-action="redo"]').click();
      await expect.poll(dividerCount).toBe(1);
      await tab.screenshot({ path: join(shotDir, "04-canvas-insert.png") });

      // The inspector (ticket 02, slice 1): four tabs, the generated field
      // family and the store as the one source. The divider is a registered
      // section, so its `background` style prop round-trips through the real
      // save path; the change must reach the canvas without a reload.
      const dividerNode = desktopFrame().locator('section[data-section="divider"]').first();
      await dividerNode.click();
      await tab.waitForSelector(".senify-inspector", { timeout: 30000 });
      expect(await tab.locator(".senify-inspector__tab").count()).toBe(4);
      expect(await tab.locator(".senify-inspector__tab").allTextContents()).toEqual([
        "Content",
        "Style",
        "Interactions",
        "Advanced",
      ]);
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      const backgroundField = tab.locator(
        '.senify-inspector__field[data-key="background"] input',
      );
      await backgroundField.waitFor({ timeout: 30000 });
      await backgroundField.fill("#123456");
      await backgroundField.dispatchEvent("change");
      await expect
        .poll(async () =>
          dividerNode.evaluate((element) => {
            const target = element as unknown as {
              ownerDocument: {
                defaultView: {
                  getComputedStyle(node: unknown): { backgroundColor: string };
                };
              };
            };
            return target.ownerDocument.defaultView.getComputedStyle(element).backgroundColor;
          }),
        )
        .toBe("rgb(18, 52, 86)");
      await tab.screenshot({ path: join(shotDir, "04b-inspector.png") });

      // Ticket 02 Rest: Geraetepunkte an jedem Style-Control, Token-Picker,
      // Pseudo-Zustaende mit erzwungener Vorschau und die offene Property-Zeile.
      // Die Aenderungen bleiben im Rahmen der v1-Sektion (E2-Strangler): nur
      // Props, die die Divider-Sektion kennt, erreichen die Speicher-Route.
      const backgroundRow = tab.locator('.senify-inspector__field[data-key="background"]');
      expect(await backgroundRow.locator(".senify-inspector__dot").count()).toBe(3);
      expect(
        await backgroundRow
          .locator('.senify-inspector__dot[data-active="true"]')
          .getAttribute("data-dot"),
      ).toBe("desktop");

      // Token-Picker: das Panel oeffnet an einem Style-Feld mit Theme-Familie
      // und listet die Tokens (der Klick selbst schreibt `{ $token: … }` — die
      // Modell- und Transporttests decken den Wert ab).
      const marginRow = tab.locator('.senify-inspector__field[data-key="margin"]');
      await marginRow.locator('[data-control="tokens"]').click();
      await tab.waitForSelector('[data-role="token-panel"]', { timeout: 10000 });
      expect(await tab.locator('[data-role="token-panel"] .ed-token__tile').count()).toBeGreaterThan(0);
      expect(
        await tab.locator('[data-role="token-panel"] .ed-token__tile').first().getAttribute("data-ref"),
      ).toBeTruthy();
      await marginRow.locator('[data-control="tokens"]').click();
      await expect.poll(async () => tab.locator('[data-role="token-panel"]').count()).toBe(0);

      // Geraetepunkt: Ansicht wechseln, am aktiven Punkt den Override anlegen
      // (materialisiert den Wert), Signal und Reset, dann zurueck auf Desktop.
      await backgroundRow.locator('.senify-inspector__dot[data-dot="tablet"]').click();
      await expect
        .poll(async () =>
          tab
            .locator('.senify-canvas__frame[data-device="tablet"]')
            .getAttribute("data-active"),
        )
        .toBe("true");
      await backgroundRow.locator('.senify-inspector__dot[data-dot="tablet"]').click();
      await expect
        .poll(async () =>
          backgroundRow
            .locator('.senify-inspector__dot[data-dot="tablet"]')
            .getAttribute("data-override"),
        )
        .toBe("true");
      await expect
        .poll(async () => backgroundRow.locator('[data-action="reset"]').count())
        .toBe(1);
      await backgroundRow.locator('[data-action="reset"]').click();
      await expect
        .poll(async () =>
          backgroundRow
            .locator('.senify-inspector__dot[data-dot="tablet"]')
            .getAttribute("data-override"),
        )
        .toBe("false");
      await backgroundRow.locator('.senify-inspector__dot[data-dot="desktop"]').click();

      // Pseudo-Zustand: der Chip erzwingt die Vorschau, eine Aenderung landet
      // als scoped Rule mit `:hover` im Frame (Site-Route, nicht Seite).
      await tab.locator('.senify-inspector__state[data-state="hover"]').click();
      await expect
        .poll(async () => tab.locator(".senify-canvas").getAttribute("data-preview-state"))
        .toBe("hover");
      const hoverColor = backgroundRow.locator('input[data-control="color-text"]');
      await hoverColor.fill("#00ff00");
      await hoverColor.dispatchEvent("change");
      await expect
        .poll(async () =>
          tab.evaluate(`(() => {
            const frame = document.querySelector('.senify-canvas__frame[data-device="desktop"] iframe');
            const style = frame && frame.contentDocument.querySelector('style[data-senify-canvas-rules]');
            return style ? style.textContent.includes('.__senify_scope_') && style.textContent.includes(':hover') : false;
          })()`),
        )
        .toBe(true);
      await tab.locator('.senify-inspector__state[data-state="basis"]').click();
      await expect
        .poll(async () => tab.locator(".senify-canvas").getAttribute("data-preview-state"))
        .toBe("none");

      // Offene Property-Zeile: eine eigene Property erreicht die Sektion
      // sofort und erscheint als eigene Zeile (hier eine, die die Sektion
      // kennt — der freie CSS-Fall ist im Modelltest belegt).
      const styleBody = tab.locator('.senify-inspector__body[data-tab="style"]');
      await styleBody.locator('[data-control="prop-name"]').fill("textColor");
      await styleBody.locator('[data-control="prop-value"]').fill("#ff0000");
      await styleBody.locator('[data-action="add-prop"]').click();
      await expect
        .poll(async () =>
          dividerNode.evaluate((element) => {
            const target = element as unknown as {
              ownerDocument: {
                defaultView: {
                  getComputedStyle(node: unknown): { color: string };
                };
              };
            };
            return target.ownerDocument.defaultView.getComputedStyle(element).color;
          }),
        )
        .toBe("rgb(255, 0, 0)");
      expect(
        await tab.locator('.senify-inspector__field[data-key="textColor"]').count(),
      ).toBe(1);

      // The explorer (ticket 03, slice 1): the tree lists the layers, a click
      // selects into the same store, the arrows move the selection and the
      // context menu opens with Shift+F10 and returns the focus on Escape.
      await tab.waitForSelector(".senify-explorer__item", { timeout: 30000 });
      const heroItem = tab.locator(`.senify-explorer__item[data-node="${heroId}"]`);
      await heroItem.click();
      await expect
        .poll(async () => tab.locator(`.senify-canvas[data-selected="${heroId}"]`).count())
        .toBe(1);
      await tab.keyboard.press("ArrowDown");
      await expect
        .poll(async () => tab.locator(`.senify-explorer__item[data-selected="true"]`).count())
        .toBe(1);
      await tab.keyboard.press("ArrowUp");
      await expect
        .poll(async () => tab.locator(`.senify-canvas[data-selected="${heroId}"]`).count())
        .toBe(1);
      await tab.keyboard.press("Shift+F10");
      await expect
        .poll(async () => tab.locator(".senify-explorer__menu").count())
        .toBe(1);
      await tab.keyboard.press("Escape");
      await expect
        .poll(async () => tab.locator(".senify-explorer__menu").count())
        .toBe(0);
      await tab.screenshot({ path: join(shotDir, "04c-explorer.png") });

      // The spotlight (Ctrl+K, ticket 03): search a catalog primitive and
      // insert it behind the selected node — the same insert path as the
      // canvas buttons.
      await tab.keyboard.press("Control+k");
      await tab.waitForSelector('.senify-spotlight[data-open="true"]', { timeout: 30000 });
      await tab.fill(".senify-spotlight__input", "Trenn");
      await expect
        .poll(async () => tab.locator(".senify-spotlight__row").first().textContent())
        .toContain("Trennlinie");
      await tab.keyboard.press("Enter");
      await expect.poll(dividerCount).toBe(2);
      await tab.screenshot({ path: join(shotDir, "04d-spotlight.png") });

      // Plus points (ticket 12): hovering a node shows the insert points in the
      // editor overlay; a click inserts the catalog selection — the same
      // mutation as the top bar button.
      const heroSection = desktopFrame().locator('section[data-section="hero"]').first();
      await heroSection.hover();
      await expect
        .poll(async () => tab.locator('.senify-canvas__plus[data-position="after"]').count())
        .toBe(1);
      await tab.locator('.senify-canvas__plus[data-position="after"]').click();
      await expect.poll(dividerCount).toBe(3);
      await tab.screenshot({ path: join(shotDir, "04e-pluspunkte.png") });

      // Reorder (ticket 12): dragging an existing node moves it with `moveNode`
      // — one undo step, the frame follows the document order.
      await heroSection.hover();
      await tab.mouse.down();
      await tab.mouse.move(10, 10);
      const lastDivider = desktopFrame().locator('section[data-section="divider"]').last();
      await lastDivider.hover();
      await tab.mouse.up();
      await expect
        .poll(async () =>
          tab.evaluate(`(() => {
            const frame = document.querySelector('.senify-canvas__frame[data-device="desktop"] iframe');
            const sections = frame.contentDocument.querySelectorAll('section[data-section]');
            return Array.from(sections).map((el) => el.getAttribute("data-section")).join(",");
          })()`),
        )
        .toMatch(/divider,divider,hero$/);

      // Autosave (decided 18.09.): the pending ops reach the engine after the
      // quiet period, without a click. The button stays as a manual flush.
      const save = tab.locator('[data-action="canvas-save"]');
      await expect.poll(async () => tab.locator("#page-version").textContent()).toMatch(/Draft v[3-9]/);
      await expect.poll(async () => save.isEnabled()).toBe(false);
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent()).toBe(
        "Gespeichert",
      );
      await tab.screenshot({ path: join(shotDir, "05-canvas-saved.png") });

      // Round-trip: reload the canvas and the saved divider is still there.
      // The view state survives too (E5 slice 1): the selected node comes back
      // from the session storage.
      const selectedBeforeReload = await tab
        .locator(".senify-canvas")
        .getAttribute("data-selected");
      expect(selectedBeforeReload).toBeTruthy();
      await tab.reload({ waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".senify-canvas", { timeout: 30000 });
      await expect.poll(dividerCount).toBe(3);
      await expect
        .poll(async () => tab.locator(".senify-canvas").getAttribute("data-selected"))
        .toBe(selectedBeforeReload);

      // Chrome (Ticket 03 Punkt 6): frame labels and the active-breakpoint
      // dimming. The desktop sheet starts active; a click in the tablet sheet
      // activates it — the session mirrors it for the inspector.
      expect(await tab.locator(".senify-canvas__frame-label").count()).toBe(3);
      await expect
        .poll(async () =>
          tab
            .locator('.senify-canvas__frame[data-device="desktop"]')
            .getAttribute("data-active"),
        )
        .toBe("true");
      const tabletFrame = tab
        .locator('.senify-canvas__frame[data-device="tablet"] .senify-canvas__iframe')
        .contentFrame();
      // A programmatic click: the tablet sheet sits far right of the stage, and
      // the coordinate click across the iframe boundary is the known Playwright
      // flake (handoff §8). The handler under test is the same either way.
      await tabletFrame
        .locator(`[data-node-id="${heroId}"]`)
        .first()
        .evaluate((element) => {
          (element as unknown as { click(): void }).click();
        });
      await expect
        .poll(async () =>
          tab
            .locator('.senify-canvas__frame[data-device="tablet"]')
            .getAttribute("data-active"),
        )
        .toBe("true");

      // Zoom footer (Ticket 03 Punkt 6): zoom-in, then Strg+0 resets to 100 %.
      await tab.locator('.senify-canvas__button[data-action="zoom-in"]').click();
      await expect
        .poll(async () => tab.locator('[data-role="zoom"]').textContent())
        .toBe("110%");
      await tab.keyboard.press("Control+0");
      await expect
        .poll(async () => tab.locator('[data-role="zoom"]').textContent())
        .toBe("100%");

      // Design/Live (Ticket 03 Punkt 6 + M4 Stufe 1): live shows the real page
      // — one frame at 100 %, native scroll, the release runtime injected (the
      // same contract the bake writes; Lenis follows the site profile).
      await tab.locator('.senify-canvas__button[data-mode="live"]').click();
      await expect.poll(async () => tab.locator(".senify-canvas__frame").count()).toBe(1);
      await expect
        .poll(async () =>
          tab.locator(".senify-canvas__frame").first().getAttribute("data-device"),
        )
        .toBe("tablet");
      await expect
        .poll(async () =>
          tab.evaluate(`(() => {
            const frame = document.querySelector('.senify-canvas__frame iframe');
            const win = frame && frame.contentWindow;
            const doc = frame && frame.contentDocument;
            return Boolean(
              win && win.gsap && doc && doc.getElementById("motion-data") &&
                doc.querySelector('script[data-senify-motion="runtime"]'),
            );
          })()`),
        )
        .toBe(true);
      await tab.screenshot({ path: join(shotDir, "07-canvas-live.png") });

      // Back in design: the three sheets return, the chrome is back.
      await tab.locator('.senify-canvas__button[data-mode="design"]').click();
      await expect.poll(async () => tab.locator(".senify-canvas__frame").count()).toBe(3);
      await expect.poll(dividerCount).toBe(3);

      // Components (ticket 04, slice 2): the context menu turns the hero into
      // a definition, the components tab inserts a second instance, and the
      // context menu detaches it back into a real subtree. Every step travels
      // the ordinary store/save path (the instance has been saveable since
      // slice 2.1); the canvas renders the instance in place.
      const heroCount = (): Promise<number> =>
        desktopFrame().locator('section[data-section="hero"]').count();
      await tab
        .locator(`.senify-explorer__item[data-node="${heroId}"]`)
        .click({ button: "right" });
      await tab.waitForSelector(".senify-explorer__menu", { timeout: 10000 });
      await tab
        .locator('.senify-explorer__menu-item[data-action="component-create"]')
        .click();
      const definitionItem = tab.locator(".senify-explorer__item", {
        hasText: "Komponente · hero",
      });
      await expect.poll(async () => definitionItem.count()).toBe(1);
      await expect.poll(heroCount).toBe(1);

      // F2 renames the definition (the name is what the tab shows).
      await definitionItem.click({ button: "right" });
      await tab.waitForSelector(".senify-explorer__menu", { timeout: 10000 });
      await tab.locator('.senify-explorer__menu-item[data-action="rename"]').click();
      const renameInput = tab.locator('[data-role="rename-input"]');
      await renameInput.fill("karte");
      await renameInput.press("Enter");
      await expect
        .poll(async () =>
          tab.locator(".senify-explorer__item", { hasText: "Komponente · karte" }).count(),
        )
        .toBe(1);
      await tab.screenshot({ path: join(shotDir, "08-komponente-angelegt.png") });

      // The components tab lists the definition with its instance count; a
      // click inserts another instance behind the definition.
      await tab.locator('.senify-explorer__tab[data-tab="components"]').click();
      const componentItem = tab.locator(".senify-explorer__tabitem", {
        hasText: "karte",
      });
      await expect.poll(async () => componentItem.count()).toBe(1);
      expect(await componentItem.textContent()).toContain("1 Instanz");
      await componentItem.click();
      await expect.poll(heroCount).toBe(2);
      await tab.locator('.senify-explorer__tab[data-tab="layers"]').click();
      await tab.screenshot({ path: join(shotDir, "09-komponenten-tab.png") });

      // The new instance is selected; detaching it leaves a real copy and
      // keeps the definition with its first instance.
      await tab
        .locator('.senify-explorer__item[data-selected="true"]')
        .click({ button: "right" });
      await tab.waitForSelector(".senify-explorer__menu", { timeout: 10000 });
      await tab
        .locator('.senify-explorer__menu-item[data-action="component-detach"]')
        .click();
      await expect
        .poll(async () =>
          tab.locator(".senify-explorer__item", { hasText: "Instanz · karte" }).count(),
        )
        .toBe(1);
      await expect.poll(heroCount).toBe(2);

      // Versions (slice 3): the definition bumps to v2 from the context menu,
      // the remaining instance shows the drift badge, and pulling it up from
      // the definition's menu clears the badge again.
      const renamedDefinition = tab.locator(".senify-explorer__item", {
        hasText: "Komponente · karte",
      });
      await renamedDefinition.click({ button: "right" });
      await tab.waitForSelector(".senify-explorer__menu", { timeout: 10000 });
      await tab
        .locator('.senify-explorer__menu-item[data-action="component-bump"]')
        .click();
      const instanceItem = tab.locator(".senify-explorer__item", {
        hasText: "Instanz · karte",
      });
      await expect
        .poll(async () => instanceItem.locator('[data-role="drift"]').count())
        .toBe(1);
      await tab.screenshot({ path: join(shotDir, "10-komponente-version.png") });

      await renamedDefinition.click({ button: "right" });
      await tab.waitForSelector(".senify-explorer__menu", { timeout: 10000 });
      await tab
        .locator('.senify-explorer__menu-item[data-action="component-update"]')
        .click();
      await expect
        .poll(async () => instanceItem.locator('[data-role="drift"]').count())
        .toBe(0);

      // Live-Mitverfolgung (Ticket 05): eine fremde Mutation (hier direkt über
      // die API) kommt per SSE an — die offene Seite lädt nach, der geänderte
      // Knoten blinkt, das Bau-Protokoll nennt Akteur und Aktion.
      await tab.locator('button[data-action="canvas-save"]').click();
      await expect
        .poll(async () => (await tab.locator('[data-role="canvas-status"]').textContent()) ?? "")
        .toContain("Gespeichert");

      const before = (await (
        await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)
      ).json()) as { draftVersion: number; draft: { rootNodeId: string } };
      // Ein eigener Agenten-Token: nur fremde Akteure loesen die Mitverfolgung
      // aus (der Programm-Token ist der eigene).
      const agentToken = (await (
        await post("/api/tokens", {
          name: "browser-agent",
          kind: "agent",
          scopes: ["read", "write"],
        })
      ).json()) as { secret: string };
      const remote = await fetch(
        `${running.dashboardUrl}/api/pages/${page.id}/mutations`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${agentToken.secret}`,
          },
          body: JSON.stringify({
            baseDraftVersion: before.draftVersion,
            mutations: [
              {
                op: "updateNodeProps",
                id: heroId,
                patch: { headline: "Live geändert" },
              },
            ],
          }),
        },
      );
      expect(remote.status).toBe(200);

      await expect
        .poll(async () => tab.locator('[data-role="protocol"]').isVisible())
        .toBe(true);
      await expect
        .poll(
          async () => tab.locator(".senify-canvas__flash-ring:visible").count(),
          { timeout: 10000 },
        )
        .toBeGreaterThan(0);
      const protocolText = (await tab.locator('[data-role="protocol"]').textContent()) ?? "";
      expect(protocolText).toContain("geändert");
      expect(protocolText).toContain("browser-agent");
      await tab.screenshot({ path: join(shotDir, "11-live-follow.png") });

      // Nach dem Blitz verschwinden die Ringe wieder.
      await expect
        .poll(
          async () => tab.locator(".senify-canvas__flash-ring:visible").count(),
          { timeout: 10000 },
        )
        .toBe(0);

      // Vorschau-Follow (Ticket 05, Punkt 4): im Live-Modus laedt die echte
      // Seite bei einer fremden Aenderung neu — das Dokument wird ersetzt
      // (nicht gepatcht), die Release-Runtime wird frisch injiziert und der
      // Ring landet auf dem neuen Frame.
      await tab.locator('.senify-canvas__button[data-mode="live"]').click();
      await expect.poll(async () => tab.locator(".senify-canvas__frame").count()).toBe(1);
      const liveProbe = (): Promise<string> =>
        tab.evaluate(`(() => {
          const frame = document.querySelector('.senify-canvas__frame iframe');
          const doc = frame && frame.contentDocument;
          if (!doc) return "kein Frame";
          if (doc.__senifyProbe === "vorher") return "altes Dokument";
          if (!doc.getElementById("motion-data")) return "keine Runtime";
          const text = doc.body ? doc.body.textContent : "";
          return text.includes("Live-Vorschau frisch") ? "frisch" : "alter Inhalt";
        })()`);
      await expect
        .poll(async () =>
          tab.evaluate(`(() => {
            const frame = document.querySelector('.senify-canvas__frame iframe');
            const doc = frame && frame.contentDocument;
            return Boolean(doc && doc.getElementById("motion-data"));
          })()`),
        )
        .toBe(true);
      await tab.evaluate(`(() => {
        const frame = document.querySelector('.senify-canvas__frame iframe');
        if (frame && frame.contentDocument) frame.contentDocument.__senifyProbe = "vorher";
      })()`);

      const beforeLive = (await (
        await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)
      ).json()) as {
        draftVersion: number;
        draft: { rootNodeId: string };
      };
      const remoteLive = await fetch(
        `${running.dashboardUrl}/api/pages/${page.id}/mutations`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${agentToken.secret}`,
          },
          body: JSON.stringify({
            baseDraftVersion: beforeLive.draftVersion,
            mutations: [
              {
                op: "insertNode",
                parent: { nodeId: beforeLive.draft.rootNodeId },
                index: 0,
                node: {
                  id: "banner00001",
                  type: "banner",
                  props: { text: "Live-Vorschau frisch" },
                },
              },
            ],
          }),
        },
      );
      expect(remoteLive.status).toBe(200);
      // Der Blitz gehoert zum Reload: er wird erst auf dem frischen Frame
      // gezeichnet und ist kurzlebig, deshalb zuerst pruefen.
      await expect
        .poll(async () => tab.locator(".senify-canvas__flash-ring:visible").count(), {
          timeout: 10000,
        })
        .toBeGreaterThan(0);
      await expect.poll(liveProbe, { timeout: 10000 }).toBe("frisch");
      await tab.screenshot({ path: join(shotDir, "12-live-vorschau-follow.png") });
      await tab.locator('.senify-canvas__button[data-mode="design"]').click();
      await expect.poll(async () => tab.locator(".senify-canvas__frame").count()).toBe(3);

      // Agent-Vorschau (Ticket 05, Punkt 5): der Schalter ist an; legt der
      // Agent eine neue Seite an, zieht die Ansicht mit ("Agent baut, Nutzer
      // sieht es im Canvas wachsen") und die Seitenliste kennt die Seite.
      const followButton = tab.locator('button[data-action="canvas-follow"]');
      await expect.poll(async () => followButton.getAttribute("aria-pressed")).toBe("true");
      const created = await fetch(`${running.dashboardUrl}/api/sites/${site.id}/pages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${agentToken.secret}`,
        },
        body: JSON.stringify({ title: "Agent-Seite", path: "/agent" }),
      });
      expect(created.status).toBe(201);
      const createdPage = (await created.json()) as { id: string };
      await expect
        .poll(async () => tab.evaluate("location.hash"), { timeout: 10000 })
        .toContain(createdPage.id);
      await tab.locator('.senify-explorer__tab[data-tab="pages"]').click();
      await expect
        .poll(async () =>
          tab
            .locator('.senify-explorer__tabitem', { hasText: "Agent-Seite" })
            .count(),
        )
        .toBeGreaterThan(0);
      await tab.screenshot({ path: join(shotDir, "13-agent-vorschau.png") });

      // The old editor stays reachable as an explicit deep link (strangler E2)
      // and still lays out its frames.
      await tab.goto(`${pageUrl}?view=editor`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".senify-editor", { timeout: 60000 });
      expect(await tab.locator(".senify-editor__iframe").count()).toBe(3);
      await tab.screenshot({ path: join(shotDir, "06-editor-again.png") });

      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180000);
});
