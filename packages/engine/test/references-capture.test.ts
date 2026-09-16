import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPlaywrightCaptureDriver } from "@senify/engine";

// Live capture needs a real browser. Without one (a CI that only installed the
// package but not `playwright install chromium`) this block is skipped and the
// rest of the suite stays green. No network: the page is a data: URL.
const playwright = await import("playwright").catch(() => undefined);

function browserReady(): boolean {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
}

describe.skipIf(!browserReady())("reference live capture (T14)", () => {
  it("captures a data URL through chromium", async () => {
    const driver = createPlaywrightCaptureDriver();
    const result = await driver({
      url: "data:text/html,<style>h1{color:%23ff0044;font-size:48px}</style><h1>Studio Nord</h1>",
      breakpoints: [390, 810],
    });
    expect(result.markup).toContain("Studio Nord");
    // The in-page probe really ran: runtime samples came back, not undefined.
    expect(result.computedSamples?.some((sample) => sample.kind === "color")).toBe(true);
    expect(result.screenshots?.map((shot) => shot.breakpoint)).toEqual(["390", "810"]);
    for (const shot of result.screenshots ?? []) {
      expect(shot.bytes.subarray(0, 8)).toEqual(Buffer.from("89504e470d0a1a0a", "hex"));
    }
    // The motion recording (T14) is a real WebM container with a duration.
    expect(result.video).toBeDefined();
    expect(result.video?.bytes.subarray(0, 4)).toEqual(
      Buffer.from("1a45dfa3", "hex"),
    );
    expect(result.video?.bytes.byteLength).toBeGreaterThan(1_000);
    expect(result.video?.durationMs).toBeGreaterThan(0);
  }, 120_000);

  it("skips the motion recording when it is turned off", async () => {
    const driver = createPlaywrightCaptureDriver({ recordMotion: false });
    const result = await driver({
      url: "data:text/html,<h1>Ohne Video</h1>",
      breakpoints: [390],
    });
    expect(result.screenshots).toHaveLength(1);
    expect(result.video).toBeUndefined();
  }, 60_000);
});
