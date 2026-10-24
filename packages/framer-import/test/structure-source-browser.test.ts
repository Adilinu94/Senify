import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureBrowser } from "../src/index.ts";

// The hydrated page as a STRUCTURE source (24.10.2026).
//
// `captureBrowser` existed since the browser slice, but nothing called it: the
// import always read the server HTML. That is why two boundaries looked like
// import bugs - the rating stars and the card graphics of `unifiersofjapan`.
// Measured with the same import over both sources (1440 px, structure bake,
// exact height on both sides):
//
//   server HTML   15,74 %   `viewBox="0 0 524 676"` 0x
//   hydrated      11,25 %   `viewBox="0 0 524 676"` 49x
//
// The trade-off is the reason this stays opt-in and not the default: hydration
// REMOVES the appear markers (`donutshop` 52 -> 18) and the breakpoint CSS
// channel, so a page whose reveals come from the derived start state loses
// them. The default therefore stays the SSR, and these tests pin the contract:
// the browser path produces a document, and it says so in its findings.
//
// Skipped when playwright or its chromium is missing (same contract as the
// other browser tests).

const playwright = await import("playwright").catch(() => undefined);
const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

// A page that fills itself in the browser: the server HTML ships an EMPTY
// container, the script writes a child into it. That is the shape every Framer
// code component has.
const SELF_FILLING = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>t</title></head>
<body><div id="main" data-framer-hydrate-v2>
  <div class="framer-hero" data-framer-name="Hero">
    <div class="framer-slot" data-framer-name="Graphic">
      <div style="height:100%;width:100%"></div>
    </div>
    <p>Sichtbarer Text</p>
  </div>
</div>
<script>
  // The runtime's job: fill the placeholder.
  const slot = document.querySelector(".framer-slot > div");
  slot.innerHTML = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"></circle></svg>';
</script>
</body></html>`;

describe.runIf(browserAvailable)("the hydrated page as a structure source", () => {
  it("reads what the runtime filled, not the empty placeholder", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { pathToFileURL } = await import("node:url");
    const dir = mkdtempSync(join(tmpdir(), "senify-hydrated-"));
    const file = join(dir, "index.html");
    writeFileSync(file, SELF_FILLING, "utf8");

    const result = await captureBrowser({ url: pathToFileURL(file).href, pagePath: "/" });
    const tree = JSON.stringify(result.document.pages[0]?.root ?? {});
    // The circle only exists after the script ran.
    expect(tree).toContain("circle");
    // And the source is marked as the browser, so the report cannot confuse it
    // with a server capture.
    expect(result.document.source.kind).toBe("browser");
  });

  it("reports the probe numbers it measured instead of guessing", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { pathToFileURL } = await import("node:url");
    const dir = mkdtempSync(join(tmpdir(), "senify-hydrated-probe-"));
    const file = join(dir, "index.html");
    writeFileSync(file, SELF_FILLING, "utf8");

    const result = await captureBrowser({ url: pathToFileURL(file).href, pagePath: "/" });
    expect(result.probe.url).toBe(pathToFileURL(file).href);
    // A plain page registers nothing - the numbers must be 0, not absent.
    expect(result.probe.io).toBe(0);
    expect(result.probe.waapi.total).toBe(0);
    expect(typeof result.probe.instrumented).toBe("boolean");
  });
});
