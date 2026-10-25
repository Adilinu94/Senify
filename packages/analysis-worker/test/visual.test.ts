import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  captureScreenshots,
  diffScreenshots,
  recordMotion,
} from "@senify/analysis-worker";

// The visual harness (T07/T14): screenshots with frozen motion, a per-pixel
// diff and a motion video. Skipped when playwright or its chromium is missing
// (same contract as the other browser tests).

const playwright = await import("playwright").catch(() => undefined);
const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

function fixture(html: string): string {
  const root = mkdtempSync(join(tmpdir(), "senify-visual-"));
  const file = join(root, "page.html");
  writeFileSync(file, html, "utf8");
  return file;
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin: 0; font: 16px/1.5 system-ui; }
header { height: 60px; background: #111; color: #fff; position: sticky; top: 0; }
section { height: 700px; padding: 24px; }
section:nth-of-type(odd) { background: #f4f4f5; }
.spinner { width: 40px; height: 40px; background: #d004d4; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style></head><body>
<header>Senify</header>
<section id="one"><h1>Erster Abschnitt</h1><div class="spinner"></div></section>
<section id="two"><h1>Zweiter Abschnitt</h1></section>
<section id="three"><h1>Dritter Abschnitt</h1></section>
</body></html>`;

describe.skipIf(!browserAvailable)("visual harness", () => {
  it("captures screenshots per breakpoint with frozen motion", async () => {
    const file = fixture(PAGE);
    const outDir = join(file, "..", "shots");
    try {
      const captures = await captureScreenshots({
        url: `file:///${file.replace(/\\/g, "/")}`,
        browser: { allowFile: true },
        outDir,
        breakpoints: ["desktop", "mobile"],
      });
      expect(captures).toHaveLength(2);
      const desktop = captures.find((entry) => entry.breakpoint === "desktop");
      expect(desktop?.width).toBe(1440);
      expect(desktop?.height).toBeGreaterThan(1500);
      expect(desktop?.bytes).toBeGreaterThan(1000);
      for (const capture of captures) {
        expect(existsSync(capture.path)).toBe(true);
      }
    } finally {
      rmSync(file, { recursive: true, force: true });
    }
  }, 120000);

  it("diffs two snapshots into a report with a bounding box", async () => {
    const file = fixture(PAGE);
    const changed = fixture(PAGE.replace("Erster Abschnitt", "Geaenderter Abschnitt"));
    const root = join(file, "..");
    const outDir = join(root, "diffs");
    try {
      const beforeShots = join(root, "before");
      const afterShots = join(root, "after");
      await captureScreenshots({
        url: `file:///${file.replace(/\\/g, "/")}`,
        browser: { allowFile: true },
        outDir: beforeShots,
        breakpoints: ["desktop"],
      });
      const identity = await diffScreenshots({
        before: join(beforeShots, "desktop.png"),
        after: join(beforeShots, "desktop.png"),
        outDir,
        name: "identity",
      });
      expect(identity.changedPixels).toBe(0);
      expect(identity.bounds).toBeNull();
      expect(existsSync(identity.path)).toBe(true);

      await captureScreenshots({
        url: `file:///${changed.replace(/\\/g, "/")}`,
        browser: { allowFile: true },
        outDir: afterShots,
        breakpoints: ["desktop"],
      });
      const report = await diffScreenshots({
        before: join(beforeShots, "desktop.png"),
        after: join(afterShots, "desktop.png"),
        outDir,
        name: "headline",
      });
      expect(report.changedPixels).toBeGreaterThan(0);
      expect(report.bounds).not.toBeNull();
      expect(report.ratio).toBeGreaterThan(0);
      expect(report.bounds?.top).toBeLessThan(700);
    } finally {
      rmSync(file, { recursive: true, force: true });
    }
  }, 180000);

  it("compares images of different heights against the taller canvas", async () => {
    // A baked page is never exactly as tall as its source. The diff used to be
    // read as if that were a broken input; here the taller canvas is the frame
    // and the pixels the shorter image does not reach count as different — an
    // import 200 px too short must not pass as "identical below the fold".
    const short = fixture(PAGE);
    const tall = fixture(PAGE.replace("</body>", `<section style="height:400px"></section></body>`));
    const outDir = join(short, "..", "height-diff");
    try {
      const shortShots = join(outDir, "short");
      const tallShots = join(outDir, "tall");
      await captureScreenshots({
        url: `file:///${short.replace(/\\/g, "/")}`,
        browser: { allowFile: true },
        outDir: shortShots,
        breakpoints: ["desktop"],
      });
      await captureScreenshots({
        url: `file:///${tall.replace(/\\/g, "/")}`,
        browser: { allowFile: true },
        outDir: tallShots,
        breakpoints: ["desktop"],
      });
      const report = await diffScreenshots({
        before: join(tallShots, "desktop.png"),
        after: join(shortShots, "desktop.png"),
        outDir,
        name: "height",
      });
      // The frame is the taller image …
      expect(report.height).toBeGreaterThanOrEqual(400);
      // … and the missing strip is counted, not silently cut off.
      expect(report.changedPixels).toBeGreaterThan(0);
      expect(report.bounds?.bottom).toBeGreaterThan(report.height - 450);
      expect(report.ratio).toBeGreaterThan(0);
    } finally {
      rmSync(short, { recursive: true, force: true });
      rmSync(tall, { recursive: true, force: true });
    }
  }, 180000);

  it("records a motion video while scrolling", async () => {
    const file = fixture(PAGE);
    const outDir = join(file, "..", "video");
    try {
      const video = await recordMotion({
        url: `file:///${file.replace(/\\/g, "/")}`,
        browser: { allowFile: true },
        outDir,
        durationMs: 1500,
      });
      expect(existsSync(video.path)).toBe(true);
      expect(video.bytes).toBeGreaterThan(0);
      expect(video.path.endsWith(".webm")).toBe(true);
    } finally {
      rmSync(file, { recursive: true, force: true });
    }
  }, 120000);

  it("gates a motion page through the kill-switch (freeze counterproof)", async () => {
    // Mimics the baked runtime contract: content hides until the page script
    // reveals it, and the script refuses to run when the kill-switch is set.
    const file = fixture(`<!doctype html><html><head><meta charset="utf-8"><style>
body { margin: 0; }
[data-motion-pending] { opacity: 0; }
#revealed { width: 320px; height: 160px; background: #d004d4; }
</style></head><body>
<div id="revealed" data-motion-pending></div>
<script>
if (window.__SENIFY_MOTION__ !== "off") {
  setTimeout(function () {
    document.getElementById("revealed").removeAttribute("data-motion-pending");
  }, 50);
}
</script>
</body></html>`);
    const root = join(file, "..");
    const frozen = join(root, "frozen");
    const live = join(root, "live");
    const outDir = join(root, "diffs");
    try {
      const url = `file:///${file.replace(/\\/g, "/")}`;
      await captureScreenshots({ url, browser: { allowFile: true }, outDir: frozen, breakpoints: ["desktop"] });
      await captureScreenshots({
        url,
        browser: { allowFile: true },
        outDir: live,
        breakpoints: ["desktop"],
        motion: "live",
      });
      const report = await diffScreenshots({
        before: join(frozen, "desktop.png"),
        after: join(live, "desktop.png"),
        outDir,
        name: "kill-switch",
      });
      expect(report.changedPixels).toBeGreaterThan(0);
    } finally {
      rmSync(file, { recursive: true, force: true });
    }
  }, 180000);
});
