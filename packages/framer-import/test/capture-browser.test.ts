import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureBrowser } from "@senify/framer-import";

// The browser capture (plan S2.1/S2.2) against local servers, so the whole
// path runs offline and deterministic:
//   * the fixture export proves the SSR round trip (static channels) —
//     its Framer runtime is intentionally trimmed (fixtures README), so the
//     motion inventory there is expected to stay empty;
//   * a minimal motion page carries a real IntersectionObserver and a real
//     endless WAAPI loop (the measured loop form: long duration, translate,
//     `iterations: Infinity`), which the probes must count.
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

const FIXTURE = join(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  "fixtures",
  "framer-stupendous-football-158496",
);

// A page that behaves like the measured Framer pages in miniature: one IO
// registration (reveal) and one endless WAAPI loop (the ticker shape). The
// page honours the freeze kill-switch (`__SENIFY_MOTION__ === "off"` set by
// the capture before load) exactly the way the freeze spec wants the runtime
// to behave: no observer, no loop in the frozen baseline.
const MOTION_PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-200px); } }
.ticker { animation: ticker 40s linear infinite; width: 400px; white-space: nowrap; }
.reveal { height: 100px; }
</style></head><body>
<div id="main"><div class="ticker">TICKER</div><div class="reveal">Reveal</div></div>
<script>
  var frozen = window.__SENIFY_MOTION__ === "off";
  if (!frozen) {
    new IntersectionObserver((entries) => { for (var i = 0; i < entries.length; i++) entries[i].target.dataset.seen = "1"; })
      .observe(document.querySelector(".reveal"));
    document.querySelector(".ticker").animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-200px)" }],
      { duration: 40000, iterations: Infinity, easing: "linear" }
    );
  }
</script>
</body></html>`;

let fixtureServer: import("node:http").Server;
let fixtureOrigin: string;
let motionServer: import("node:http").Server;
let motionOrigin: string;

function startServer(
  handler: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => void,
): Promise<{ server: import("node:http").Server; origin: string }> {
  const server = http.createServer(handler);
  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const origin = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
      done({ server, origin });
    });
  });
}
beforeAll(async () => {
  const fixture = await startServer((_request, response) => {
    try {
      const body = readFileSync(join(FIXTURE, "index.html"));
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  fixtureServer = fixture.server;
  fixtureOrigin = fixture.origin;
  const motion = await startServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(MOTION_PAGE);
  });
  motionServer = motion.server;
  motionOrigin = motion.origin;
});

afterAll(async () => {
  await Promise.all([
    new Promise<void>((done) => fixtureServer.close(() => done())),
    new Promise<void>((done) => motionServer.close(() => done())),
  ]);
});

describe.skipIf(!browserAvailable)("captureBrowser", () => {
  it("captures the SSR-HTML through the static capture and marks the source as browser", async () => {
    const result = await captureBrowser({ url: `${fixtureOrigin}/`, settleMs: 200 });
    expect(result.document.source.kind).toBe("browser");
    expect(result.document.source.url).toBe(`${fixtureOrigin}/`);
    expect(result.document.pages[0]?.root.children.length).toBeGreaterThan(0);
    // The static channels survive the round trip (the fixture is a real export).
    expect(result.document.breakpoints.length).toBeGreaterThan(0);
    expect(result.document.findings.some((finding) => finding.kind === "smooth-scroll")).toBe(true);
  }, 60_000);

  it("measures IO registrations and the endless WAAPI loop with the probes", async () => {
    // The motion inventory needs the page's own runtime: motion "live" is the
    // measurement scenario (S0/B8); the frozen baseline cannot register the
    // observer or run the loop it is supposed to count.
    const result = await captureBrowser({ url: `${motionOrigin}/`, settleMs: 200, motion: "live" });
    expect(result.probe.instrumented).toBe(true);
    expect(result.probe.io).toBe(1);
    // Two loop forms: the CSS ticker keyframe animation AND the JS
    // element.animate() loop — exactly the pair `document.getAnimations()`
    // reports on the measured Framer pages.
    expect(result.probe.waapi.total).toBe(2);
    expect(result.probe.waapi.loops).toBe(2);
    // Both loops land as motion samples with the endless marker.
    const endless = result.document.motion.filter(
      (sample) => sample.params.iterations === "endless",
    );
    expect(endless).toHaveLength(2);
    expect(endless.every((sample) => sample.trigger === "time")).toBe(true);
    // The measured finding kind fires, never silently dropped.
    expect(
      result.document.findings.some((finding) => finding.kind === "loop-animation"),
    ).toBe(true);
  }, 60_000);

  it("keeps the frozen baseline free of motion samples (freeze kill-switch)", async () => {
    const result = await captureBrowser({ url: `${motionOrigin}/`, settleMs: 200 });
    expect(result.probe.waapi.total).toBe(0);
    expect(result.probe.io).toBe(0);
  }, 60_000);

  it("runs the offline mirror without network (file:// URL)", async () => {
    const result = await captureBrowser({
      url: `file:///${join(FIXTURE, "index.html").replace(/\\/g, "/")}`,
      rootDir: FIXTURE,
      settleMs: 200,
    });
    expect(result.document.pages[0]?.root.children.length).toBeGreaterThan(0);
    expect(result.probe.instrumented).toBe(true);
  }, 60_000);

  it("throws a clear error when the URL is unreachable", async () => {
    await expect(
      captureBrowser({ url: "http://127.0.0.1:1/", settleMs: 10 }),
    ).rejects.toThrow();
  }, 30_000);
});
