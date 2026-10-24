import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, browserSkip, memoryDb } from "./support.ts";

// Dauerhaftes PNG-Gate. Die versionierten Baselines liegen unter
// packages/app/test/visual-baselines; bei einer Abweichung entstehen im
// Scratch-Ordner erwartete, aktuelle und rot markierte Diff-PNGs.
// UPDATE_VISUAL_SNAPSHOTS=1 ist ausschliesslich fuer eine beabsichtigte
// Baseline-Aktualisierung vorgesehen.

const baselineDir = resolve(process.cwd(), "packages/app/test/visual-baselines");
const artifactDir = resolve(process.cwd(), ".scratch/editor-v2-rebuild/visual-diffs");
const author = { kind: "human", id: "programm", label: "Programm" } as const;
const modes = ["light", "dark"] as const;
const viewports = [
  { width: 1440, height: 1000, label: "1440" },
  { width: 1024, height: 1000, label: "1024" },
] as const;
const maxDiffPixelRatio = 0.01;
const colorThreshold = 0.15;

type Mode = (typeof modes)[number];
type Viewport = (typeof viewports)[number];
type SnapshotName = "settings" | "references" | "editor" | "editor-overflow" | "editor-live";
type Snapshot = { key: string; name: SnapshotName; mode: Mode; viewport: Viewport };

async function postJson(url: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function baselinePath(snapshot: Snapshot): string {
  return join(baselineDir, `${snapshot.viewport.label}-${snapshot.name}-${snapshot.mode}.png`);
}

function writeArtifact(name: string, data: Buffer): string {
  mkdirSync(artifactDir, { recursive: true });
  const path = join(artifactDir, name);
  writeFileSync(path, data);
  return path;
}

async function waitForStableUi(tab: import("playwright").Page, snapshot: Snapshot): Promise<void> {
  await tab.evaluate(`(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.complete ? Promise.resolve() : new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        }),
      ),
    );
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        await frame.contentDocument?.fonts.ready;
      } catch {
        // Das Dokument kann beim Routenwechsel kurz getrennt sein.
      }
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);

  if (snapshot.name === "references") {
    await tab.waitForFunction('!document.querySelector(".refs-shell")?.classList.contains("refs-loading")');
  }
  if (snapshot.name.startsWith("editor")) {
    await tab.waitForSelector(".senify-canvas", { timeout: 30000 });
    // One frame, in design and in live.
    await tab.waitForFunction('document.querySelectorAll(".senify-canvas__frame").length === 1');
    await tab.waitForSelector(".senify-canvas__iframe", { timeout: 30000 });
  }
  await tab.waitForTimeout(250);
}

async function settledScreenshot(tab: import("playwright").Page, snapshot: Snapshot): Promise<Buffer> {
  const masks = snapshot.name === "settings"
    ? [
        tab.locator(".panel table tbody td:nth-child(3)"),
        tab.locator(".panel table tbody td:nth-child(4)"),
      ]
    : snapshot.name.startsWith("editor")
      ? [tab.locator('[data-role="canvas-status"]:visible'), tab.locator('[data-role="bake-status"]:visible')]
      : [];
  const options = {
    animations: "disabled" as const,
    caret: "hide" as const,
    fullPage: false,
    mask: masks,
    maskColor: "#000000",
  };
  const first = await tab.screenshot(options);
  await tab.waitForTimeout(120);
  const second = await tab.screenshot(options);
  let settled = second.equals(first);
  if (!settled) {
    const firstPng = PNG.sync.read(first);
    const secondPng = PNG.sync.read(second);
    if (firstPng.width === secondPng.width && firstPng.height === secondPng.height) {
      const changedPixels = pixelmatch(
        firstPng.data,
        secondPng.data,
        undefined,
        firstPng.width,
        firstPng.height,
        { threshold: colorThreshold, includeAA: true },
      );
      settled = changedPixels / (firstPng.width * firstPng.height) <= maxDiffPixelRatio;
    }
  }
  expect(
    settled,
    `Visueller Snapshot ist nicht settled: ${snapshot.key}. Status, Fonts oder SSE können noch asynchron sein.`,
  ).toBe(true);
  return first;
}

function compareSnapshot(snapshot: Snapshot, actualBuffer: Buffer): string | null {
  const expectedPath = baselinePath(snapshot);
  if (!existsSync(expectedPath)) return `fehlende Baseline: ${expectedPath}`;
  const actual = PNG.sync.read(actualBuffer);
  const expected = PNG.sync.read(readFileSync(expectedPath));
  if (actual.width !== expected.width || actual.height !== expected.height) {
    return `Größenänderung: ${actual.width}x${actual.height} statt ${expected.width}x${expected.height}`;
  }
  const diff = new PNG({ width: actual.width, height: actual.height });
  const changedPixels = pixelmatch(
    actual.data,
    expected.data,
    diff.data,
    actual.width,
    actual.height,
    { threshold: colorThreshold, includeAA: true },
  );
  const ratio = changedPixels / (actual.width * actual.height);
  if (ratio <= maxDiffPixelRatio) return null;
  // Named like the baseline, so an actual from CI can replace it directly.
  const stem = `${snapshot.viewport.label}-${snapshot.key}-${snapshot.mode}`;
  writeArtifact(`${stem}-expected.png`, readFileSync(expectedPath));
  writeArtifact(`${stem}-actual.png`, actualBuffer);
  writeArtifact(`${stem}-diff.png`, PNG.sync.write(diff));
  return `${(ratio * 100).toFixed(3)} % geänderte Pixel (${changedPixels})`;
}

describe.skipIf(browserSkip)("desktop visual snapshots", () => {
  it("hält Settings, Referenzen und Editor bei 1440/1024 px stabil", async () => {
    if (!browserAvailable) {
      throw new Error(
        "Visual-Gate: Browser fehlt, aber SENIFY_REQUIRE_BROWSER=1 ist gesetzt. " +
          "Bitte Chromium mit `pnpm exec playwright install chromium` installieren.",
      );
    }
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = join(tmpdir(), `senify-visual-snapshot-${process.pid}-${Date.now()}`);
    mkdirSync(dataDir, { recursive: true });
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    // Festes Text-Rendering über Betriebssysteme hinweg: Graustufen-Antialiasing
    // ohne Hinting bei sRGB. Ohne diese Flags unterscheiden sich die Baselines
    // zwischen Windows und Linux in jedem Glyph (.scratch/senify-v1/research/19-approval-tooling.md).
    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-lcd-text", "--font-render-hinting=none", "--force-color-profile=srgb"],
    });
    const update = process.env["UPDATE_VISUAL_SNAPSHOTS"] === "1";
    const errors: string[] = [];
    const mismatches: string[] = [];
    rmSync(artifactDir, { recursive: true, force: true });

    try {
      const site = (await (await postJson(running.dashboardUrl, "/api/sites", { name: "Visual QA" })).json()) as {
        id: string;
      };
      const page = (await (
        await postJson(running.dashboardUrl, `/api/sites/${site.id}/pages`, { title: "Visual QA", path: "/" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      await postJson(running.dashboardUrl, `/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: { type: "hero", props: { headline: "Visual QA" } },
          },
        ],
      });
      await postJson(running.dashboardUrl, "/api/reference-collections", {
        name: "Visual QA Collection",
        description: "Stable collection for the visual gate.",
        accent: "#b98a52",
      });

      const editorHash = `#/projects/${site.id}/pages/${page.id}`;
      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
        const tab = await context.newPage();
        tab.setDefaultTimeout(30000);
        // SSE ist absichtlich ein kontrollierter Stub: der Screenshot misst die
        // Produktoberflaeche, nicht einen zeitabhaengigen Server-Stream.
        await context.addInitScript(`class StableEventSource {
          addEventListener() {}
          removeEventListener() {}
          close() {}
        }
        Object.defineProperty(window, "EventSource", { configurable: true, writable: true, value: StableEventSource });`);
        tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
        tab.on("console", (message) => {
          if (message.type() === "error") errors.push(`console: ${message.text()}`);
        });

        for (const mode of modes) {
          await tab.goto(`${running.dashboardUrl}/?visual=${mode}#/`, { waitUntil: "domcontentloaded" });
          await tab.evaluate((value) => {
            localStorage.setItem("senify-mode", value);
            localStorage.removeItem("senify-agent-preview");
          }, mode);
          await tab.reload({ waitUntil: "domcontentloaded" });

          const snapshots: Snapshot[] = [
            { key: "settings", name: "settings", mode, viewport },
            { key: "references", name: "references", mode, viewport },
            { key: "editor", name: "editor", mode, viewport },
            { key: "editor-overflow", name: "editor-overflow", mode, viewport },
            { key: "editor-live", name: "editor-live", mode, viewport },
          ];
          for (const snapshot of snapshots) {
            if (snapshot.name.startsWith("editor")) {
              await tab.goto(`${running.dashboardUrl}/${editorHash}`, { waitUntil: "domcontentloaded" });
              await tab.evaluate((pageId) => localStorage.removeItem(`senify-editor-session:${pageId}`), page.id);
              await tab.reload({ waitUntil: "domcontentloaded" });
              if (snapshot.name === "editor-overflow") {
                await tab.locator('[data-action="canvas-overflow"]').click();
                await tab.locator(".toolbar-overflow__menu").waitFor({ state: "visible" });
              } else if (snapshot.name === "editor-live") {
                // Die Vorschau gilt erst, wenn der Editor samt Leiste steht.
                await tab.waitForSelector(".senify-canvas__frame");
                await tab.locator('button[data-action="canvas-preview"]').click();
                await tab.waitForSelector('.senify-canvas[data-mode="live"]');
              }
            } else {
              const hash = snapshot.name === "settings" ? "#/settings" : "#/references";
              await tab.goto(`${running.dashboardUrl}/${hash}`, { waitUntil: "domcontentloaded" });
            }
            await waitForStableUi(tab, snapshot);
            const actual = await settledScreenshot(tab, snapshot);
            if (update) {
              mkdirSync(baselineDir, { recursive: true });
              writeFileSync(baselinePath(snapshot), actual);
            } else {
              const mismatch = compareSnapshot(snapshot, actual);
              if (mismatch !== null) mismatches.push(`${snapshot.viewport.label}-${snapshot.key}-${snapshot.mode}: ${mismatch}`);
            }
          }
        }
        await context.close();
      }

      expect(errors).toEqual([]);
      expect(mismatches, mismatches.join("\n")).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 300000);
});
