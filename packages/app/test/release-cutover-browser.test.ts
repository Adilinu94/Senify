import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { diffScreenshots } from "@senify/analysis-worker";
import { browserAvailable, browserSkip, memoryDb } from "./support.ts";

// Ticket 17: the release cutover. The editor publishes through the real route
// (`POST /api/sites/:siteId/releases` — the same path the MCP tool uses), the
// release is delivered from its build directory, the parity measurement runs
// against that release, and a rollback flips the served state back.
//
// The O9 curtain (static release checks) runs inside the publish path; this
// test proves the route, the revisions, the active release and the rollback.
//
// This test IS the parity gate (ticket 17 point 5, L4): `pnpm verify:parity`
// runs it with SENIFY_REQUIRE_BROWSER=1, so a missing browser turns the gate
// red instead of skipping it. The ratio budget stays at 0.01 (O3).

const author = { kind: "human", id: "programm", label: "Programm" };
const PARITY_RATIO = 0.01;

describe.skipIf(browserSkip)("release cutover (ticket 17)", () => {
  it("publishes via the route, serves the release, measures parity and rolls back", async () => {
    if (!browserAvailable) {
      throw new Error(
        "Paritaets-Tor: Browser fehlt, aber SENIFY_REQUIRE_BROWSER=1 ist gesetzt. " +
          "Erst `pnpm exec playwright install chromium` ausfuehren.",
      );
    }
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-release-cutover-"));
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
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const shotDir = resolve(process.cwd(), ".scratch/refs/nick/release");
    mkdirSync(shotDir, { recursive: true });
    try {
      expect((await fetch(`${running.dashboardUrl}/editor.js`)).status).toBe(200);

      const site = (await (await post("/api/sites", { name: "Release-Cutover" })).json()) as {
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
            node: {
              type: "hero",
              variant: "centered",
              props: { headline: "Release-Prüfung" },
            },
          },
        ],
      });
      expect(applied.status).toBe(200);
      const themed = await fetch(`${running.dashboardUrl}/api/sites/${site.id}/theme`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          theme: {
            scales: { typeBase: 18, typeRatio: 1.3 },
            tokens: {
              semantic: { "fg.base": { $ref: "color.brand-700" } },
              modes: { light: { "fg.base": { $ref: "color.brand-700" } } },
            },
          },
        }),
      });
      expect(themed.status).toBe(200);

      // The window must be wide enough for the whole editor shell: the canvas
      // stage fits the three design frames side by side at 100 % zoom (2598 px
      // plus gaps), so the desktop frame stays clear of the inspector column.
      // Otherwise the frame runs underneath the sidebars and the element
      // screenshot of the hero captures editor chrome instead of page pixels,
      // which would make the parity gate compare the wrong picture.
      const context = await browser.newContext({ viewport: { width: 3600, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      const isFavicon = (url: string): boolean => url.endsWith("/favicon.ico");
      tab.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
      tab.on("requestfailed", (request) => {
        if (!isFavicon(request.url())) {
          failedRequests.push(`failed: ${request.url()}`);
        }
      });
      tab.on("response", (response) => {
        if (response.status() < 400 || isFavicon(response.url())) return;
        failedRequests.push(`http ${response.status()}: ${response.url()}`);
      });

      // The editor mounts the canvas with the seeded hero.
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
      const desktopFrame = () =>
        tab
          .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
          .contentFrame();
      const canvasTypeSize = await desktopFrame().locator("html").evaluate((element) => {
        const target = element as unknown as {
          ownerDocument: { defaultView: { getComputedStyle(node: never): { getPropertyValue(name: string): string } } };
        };
        return target.ownerDocument.defaultView
          .getComputedStyle(element as never)
          .getPropertyValue("--type-body-size")
          .trim();
      });
      expect(canvasTypeSize).not.toBe("");
      expect(canvasTypeSize).not.toBe("1rem");
      const canvasHero = desktopFrame().locator('[data-section="hero"]').first();
      await canvasHero.waitFor({ timeout: 30000 });
      const headline = canvasHero.locator("h1").first();
      await expect.poll(async () => headline.textContent()).toContain("Release-Prüfung");
      // The web fonts must be ready before the picture: a screenshot taken
      // during the swap would compare a fallback face against Sora.
      await desktopFrame()
        .locator("body")
        .evaluate(
          `(async (element) => {
            const doc = element.ownerDocument;
            await doc.fonts.load("700 48px Sora");
            await doc.fonts.ready;
            return true;
          })`,
        );

      // A screenshot of an element inside the canvas only shows page pixels
      // while the frame is visible as a whole: at 100 % zoom and inside the
      // stage box. Both conditions are asserted instead of assumed.
      // Der Editor startet eingepasst. Erst den Start-Fit abwarten, sonst
      // ueberschreibt er den Reset, dann auf 100 % zuruecksetzen.
      await tab
        .locator('.canvas-view__stage[data-start-fit="done"], .canvas-view__stage[data-start-fit="skipped"]')
        .waitFor({ state: "attached" });
      await tab.locator('[data-role="zoom"]').click();
      await expect
        .poll(async () => tab.locator('[data-role="zoom"]').textContent())
        .toBe("100%");
      const frameBox = await tab
        .locator('.senify-canvas__frame[data-device="desktop"]')
        .boundingBox();
      const stageBox = await tab.locator(".canvas-view__stage").boundingBox();
      const heroBox = await canvasHero.boundingBox();
      if (frameBox === null || stageBox === null || heroBox === null) {
        throw new Error("Canvas-Geometrie nicht messbar");
      }
      expect(Math.round(frameBox.width)).toBe(1440);
      expect(heroBox.x).toBeGreaterThanOrEqual(stageBox.x);
      expect(heroBox.x + heroBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width);
      expect(heroBox.y).toBeGreaterThanOrEqual(stageBox.y);
      expect(heroBox.y + heroBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height);

      const measure = (scope: typeof canvasHero) =>
        scope.evaluate((element) => {
          const node = element as unknown as {
            ownerDocument: {
              defaultView: { getComputedStyle(node: never): Record<string, string> };
            };
            querySelector(selector: string): unknown;
            getBoundingClientRect(): { width: number; height: number };
          };
          const style = node.ownerDocument.defaultView.getComputedStyle(element as never);
          const heading = node.querySelector("h1") as unknown as {
            ownerDocument: { defaultView: { getComputedStyle(node: never): Record<string, string> } };
          } | null;
          const headingStyle =
            heading === null
              ? {}
              : heading.ownerDocument.defaultView.getComputedStyle(heading as never);
          const headingRect =
            heading === null
              ? { left: 0, top: 0 }
              : (heading as unknown as { getBoundingClientRect(): { left: number; top: number } }).getBoundingClientRect();
          return {
            width: Math.round(node.getBoundingClientRect().width),
            height: Math.round(node.getBoundingClientRect().height),
            maxWidth: style["maxWidth"] ?? "",
            headingFontSize: headingStyle["fontSize"] ?? "",
            headingFamily: headingStyle["fontFamily"] ?? "",
            headingColor: headingStyle["color"] ?? "",
            headingLineHeight: headingStyle["lineHeight"] ?? "",
            headingWeight: headingStyle["fontWeight"] ?? "",
            headingLeft: Math.round(headingRect.left),
            sectionBackground: style["backgroundColor"] ?? "",
            sectionPadding: `${style["paddingTop"] ?? ""}/${style["paddingBottom"] ?? ""}`,
            sectionClass: (element as unknown as { className?: string }).className ?? "",
          };
        });
      const canvasMetrics = await measure(canvasHero);
      const canvasShot = join(shotDir, "cutover-canvas.png");
      const canvasHeadShot = join(shotDir, "cutover-canvas-head.png");

      // ---------------------------------------------------- publish (button)
      await tab.locator('[data-action="canvas-publish"]').click();
      await expect
        .poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), {
          timeout: 60000,
        })
        .toContain("aktiv");
      await tab.screenshot({ path: join(shotDir, "cutover-published.png") });

      const releases = (await (
        await fetch(`${running.dashboardUrl}/api/sites/${site.id}/releases`)
      ).json()) as {
        releases: { id: string; basisReleaseId: string | null }[];
        activeReleaseId: string | null;
      };
      expect(releases.releases).toHaveLength(1);
      const first = releases.releases[0];
      expect(first).toBeDefined();
      expect(releases.activeReleaseId).toBe(first?.id);

      const revisions = (await (
        await fetch(`${running.dashboardUrl}/api/pages/${page.id}/revisions`)
      ).json()) as { revisions: { id: string }[] };
      expect(revisions.revisions.length).toBeGreaterThanOrEqual(1);

      // The release is served from its build directory (public route).
      const releaseUrl = `${running.dashboardUrl}/api/releases/${first?.id}/files/index.html`;
      const releaseHtml = await (await fetch(releaseUrl)).text();
      expect(releaseHtml).toContain("Release-Prüfung");

      const releaseTab = await context.newPage();
      releaseTab.setDefaultTimeout(30000);
      // Same width as the desktop frame, so the parity numbers compare.
      await releaseTab.setViewportSize({ width: 1440, height: 1000 });
      releaseTab.on("pageerror", (error) => consoleErrors.push(`release pageerror: ${error.message}`));
      releaseTab.on("response", (response) => {
        if (response.status() >= 400 && !isFavicon(response.url())) {
          failedRequests.push(`release http ${response.status()}: ${response.url()}`);
        }
      });
      await releaseTab.goto(
        `${running.dashboardUrl}/api/releases/${first?.id}/files/`,
        { waitUntil: "load" },
      );
      const releaseHero = releaseTab.locator('[data-section="hero"]').first();
      await releaseHero.waitFor({ timeout: 30000 });
      await releaseTab.evaluate(
        `(async () => {
          await document.fonts.load("700 48px Sora");
          await document.fonts.ready;
          return true;
        })()`,
      );
      const releaseMetrics = await measure(releaseHero as typeof canvasHero);
      const releaseShot = join(shotDir, "cutover-release.png");
      const releaseHead = releaseTab.locator('[data-section="hero"] h1').first();
      const releaseHeadShot = join(shotDir, "cutover-release-head.png");

      // Both sides at the same integer grid: the element boxes can differ by a
      // subpixel (rounding), and a one-row difference would dominate the ratio.
      // The clip takes the smaller box of both, so the diff measures the
      // rendering and not the rounding.
      const clipOf = (
        box: { x: number; y: number; width: number; height: number } | null,
        width: number,
        height: number,
      ) => ({
        x: Math.round(box?.x ?? 0),
        y: Math.round(box?.y ?? 0),
        width,
        height,
      });
      const canvasBox = await canvasHero.boundingBox();
      const releaseBox = await releaseHero.boundingBox();
      const sectionWidth = Math.floor(Math.min(canvasBox?.width ?? 0, releaseBox?.width ?? 0));
      const sectionHeight = Math.floor(Math.min(canvasBox?.height ?? 0, releaseBox?.height ?? 0));
      await tab.screenshot({
        path: canvasShot,
        clip: clipOf(canvasBox, sectionWidth, sectionHeight),
      });
      await releaseTab.screenshot({
        path: releaseShot,
        clip: clipOf(releaseBox, sectionWidth, sectionHeight),
      });
      const canvasHeadBox = await headline.boundingBox();
      const releaseHeadBox = await releaseHead.boundingBox();
      const headWidth = Math.floor(Math.min(canvasHeadBox?.width ?? 0, releaseHeadBox?.width ?? 0));
      const headHeight = Math.floor(
        Math.min(canvasHeadBox?.height ?? 0, releaseHeadBox?.height ?? 0),
      );
      await tab.screenshot({
        path: canvasHeadShot,
        clip: clipOf(canvasHeadBox, headWidth, headHeight),
      });
      await releaseTab.screenshot({
        path: releaseHeadShot,
        clip: clipOf(releaseHeadBox, headWidth, headHeight),
      });
      const headDiff = await diffScreenshots({
        before: canvasHeadShot,
        after: releaseHeadShot,
        outDir: shotDir,
        name: "cutover-parity-head",
        threshold: 24,
      });
      console.log("CUTOVER-PARITY-HEAD", JSON.stringify({ head: headDiff.ratio, bounds: headDiff.bounds }));

      // The parity gate on the real publish path: identical numbers, the
      // picture within tolerance.
      console.log("CUTOVER-METRICS", JSON.stringify({ canvasMetrics, releaseMetrics }));
      expect(canvasMetrics).toEqual(releaseMetrics);
      const diff = await diffScreenshots({
        before: canvasShot,
        after: releaseShot,
        outDir: shotDir,
        name: "cutover-parity",
        threshold: 24,
      });
      console.log(
        "CUTOVER-PARITY",
        JSON.stringify({ head: headDiff.ratio, section: diff.ratio, bounds: diff.bounds }),
      );
      expect(diff.ratio).toBeLessThanOrEqual(PARITY_RATIO);

      // ------------------------------------------------- publish a second time
      const fresh = (await (
        await fetch(`${running.dashboardUrl}/api/pages/${page.id}`)
      ).json()) as { draftVersion: number; draft: { rootNodeId: string; nodes: Record<string, { children?: string[] }> } };
      const heroId = (fresh.draft.nodes[fresh.draft.rootNodeId]?.children ?? [])[0] ?? "";
      const changed = await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: fresh.draftVersion,
        author,
        mutations: [
          { op: "updateNodeProps", id: heroId, patch: { headline: "Zweite Fassung" } },
        ],
      });
      expect(changed.status).toBe(200);
      await tab.reload({ waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".senify-canvas", { timeout: 30000 });
      await expect
        .poll(async () => headline.textContent())
        .toContain("Zweite Fassung");
      await tab.locator('[data-action="canvas-publish"]').click();
      await expect
        .poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), {
          timeout: 60000,
        })
        .toContain("aktiv");

      const afterSecond = (await (
        await fetch(`${running.dashboardUrl}/api/sites/${site.id}/releases`)
      ).json()) as { releases: { id: string; basisReleaseId: string | null }[]; activeReleaseId: string | null };
      expect(afterSecond.releases).toHaveLength(2);
      const second = afterSecond.releases.find((release) => release.id !== first?.id);
      expect(second).toBeDefined();
      expect(afterSecond.activeReleaseId).toBe(second?.id);
      const secondHtml = await (
        await fetch(`${running.dashboardUrl}/api/releases/${second?.id}/files/index.html`)
      ).text();
      expect(secondHtml).toContain("Zweite Fassung");

      // ------------------------------------------------------------- rollback
      const rolled = await post(`/api/sites/${site.id}/releases`, {
        author,
        basisReleaseId: first?.id,
        note: "Rollback auf die erste Fassung",
      });
      expect(rolled.status).toBe(201);
      const rollback = (await rolled.json()) as { release: { id: string; basisReleaseId: string | null } };
      expect(rollback.release.basisReleaseId).toBe(first?.id);

      const afterRollback = (await (
        await fetch(`${running.dashboardUrl}/api/sites/${site.id}/releases`)
      ).json()) as { releases: { id: string }[]; activeReleaseId: string | null };
      expect(afterRollback.releases).toHaveLength(3);
      expect(afterRollback.activeReleaseId).toBe(rollback.release.id);
      const rolledHtml = await (
        await fetch(`${running.dashboardUrl}/api/releases/${rollback.release.id}/files/index.html`)
      ).text();
      expect(rolledHtml).toContain("Release-Prüfung");
      expect(rolledHtml).not.toContain("Zweite Fassung");

      // The editor shows the rolled-back state after a reload (the drafts were
      // restored by the rollback).
      await tab.reload({ waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".senify-canvas", { timeout: 30000 });
      await expect
        .poll(async () => headline.textContent())
        .toContain("Release-Prüfung");
      await tab.screenshot({ path: join(shotDir, "cutover-rollback.png") });

      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 240000);
});
