import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { createImportPreviewDriver, previewFramerImport } from "@senify/engine";

const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

// The production photographer against a real browser: an export folder is
// served, imported in memory, baked and photographed at three widths.
describe.skipIf(!browserAvailable && process.env["SENIFY_REQUIRE_BROWSER"] !== "1")("import preview with a real browser", () => {
  it("returns a small picture of the original and of the import at each width", async () => {
    const root = mkdtempSync(join(tmpdir(), "senify-preview-"));
    try {
      writeFileSync(
        join(root, "index.html"),
        '<!doctype html><html lang="de"><head><title>Vorschau</title><style>.hero{background-color:#2f6fed;color:#fff;padding:40px}</style></head><body><div id="main" data-framer-hydrate-v2><section class="hero"><h1>Willkommen</h1><p>Ein Absatz</p><a href="/kontakt">Kontakt</a></section></div></body></html>',
        "utf8",
      );
      const preview = await previewFramerImport({
        source: { kind: "mirror", rootDir: root, pagePath: "/" },
        pagePath: "/",
        mode: "fidelity",
        themeCss: "",
        motionTokens: { ease: {}, baseDurationMs: 300, baseStaggerMs: 80 },
        siteName: "Vorschau",
        driver: createImportPreviewDriver(),
      });
      expect(preview.shots.map((shot) => shot.breakpoint)).toEqual(["desktop", "tablet", "mobile"]);
      expect(preview.shots.map((shot) => shot.width)).toEqual([1440, 900, 390]);
      for (const shot of preview.shots) {
        expect(shot.before.startsWith("data:image/png;base64,")).toBe(true);
        expect(shot.after.startsWith("data:image/png;base64,")).toBe(true);
        expect(shot.beforeHeight).toBeGreaterThan(0);
        expect(shot.afterHeight).toBeGreaterThan(0);
        // A thumbnail, not a full-size shot: well under a megabyte each.
        expect(shot.before.length).toBeLessThan(900_000);
        expect(shot.after.length).toBeLessThan(900_000);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);
});
