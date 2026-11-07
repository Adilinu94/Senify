import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureBrowser, mapFramerMotion, runImport, type IrNode } from "@senify/framer-import";

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

const SCROLL_PAGE = `<!doctype html><html><head><style>
body { margin: 0; height: 3000px; }
.item { height: 80px; }
.fixed { position: fixed; top: 0; }
</style></head><body><main id="main">
<div class="item" data-framer-name="Normal">Normal</div>
<div class="item" data-framer-name="Bewegt">Bewegt</div>
<div class="fixed" data-framer-name="Fixed"><span data-framer-name="Fixed child">Fixed</span></div>
</main><script>
addEventListener('scroll', () => {
  document.querySelector('[data-framer-name="Bewegt"]').style.transform = 'translateY(' + (scrollY / 2) + 'px)';
});
</script></body></html>`;

// A page whose look lives exclusively in a linked stylesheet: the browser
// capture must read the CSSOM, not only the inline critical CSS.
const LINKED_PAGE = `<!doctype html><html><head><link rel="stylesheet" href="/linked.css"></head><body><div id="main"><div class="linked" data-framer-name="Linked">Linked</div></div></body></html>`;
const LINKED_CSS = ".linked{color:#123456}.linked:hover{color:#654321}";

// The capture pins the light scheme; a Framer-style palette swap must not leak
// the dark variant into the IR.
const SCHEME_PAGE = `<!doctype html><html><head><style>
.probe { color: rgb(9, 9, 9); }
@media (prefers-color-scheme: dark) { .probe { color: rgb(1, 2, 3); } }
</style></head><body><div id="main"><div class="probe" data-framer-name="Scheme">Scheme</div></div></body></html>`;

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
  const motion = await startServer((request, response) => {
    if (request.url === "/linked.css") {
      response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
      response.end(LINKED_CSS);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      request.url === "/scroll"
        ? SCROLL_PAGE
        : request.url === "/linked"
          ? LINKED_PAGE
          : request.url === "/scheme"
            ? SCHEME_PAGE
            : MOTION_PAGE,
    );
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
  it("reports deviations at different scroll positions without inventing an animation", async () => {
    const result = await captureBrowser({ url: `${motionOrigin}/scroll`, settleMs: 200, motion: "live" });
    const samples = result.document.motion.filter((sample) => sample.params.observationOnly === true);
    expect(samples.some((sample) => sample.nodeKey === "Normal")).toBe(false);
    expect(samples.some((sample) => sample.nodeKey === "Fixed" || sample.nodeKey === "Fixed child")).toBe(false);
    expect(samples.find((sample) => sample.nodeKey === "Bewegt")?.params.delta).toBe(125);
    const mapping = mapFramerMotion(result.document);
    expect(mapping.mappings.some((entry) => entry.nodeKey === "Bewegt")).toBe(false);
    expect(mapping.findings.some((entry) => entry.sample.nodeKey === "Bewegt")).toBe(true);
  }, 60_000);
  it("captures the SSR-HTML through the static capture and marks the source as browser", async () => {
    const result = await captureBrowser({ url: `${fixtureOrigin}/`, settleMs: 200 });
    expect(result.document.source.kind).toBe("browser");
    expect(result.document.source.url).toBe(`${fixtureOrigin}/`);
    expect(result.document.pages[0]?.root.children.length).toBeGreaterThan(0);
    // The static channels survive the round trip (the fixture is a real export).
    expect(result.document.breakpoints.length).toBeGreaterThan(0);
    expect(result.document.findings.some((finding) => finding.kind === "smooth-scroll")).toBe(true);
  }, 60_000);

  it("uses the browser capture when runImport receives a URL with browser: true", async () => {
    const run = await runImport({ source: { kind: "url", url: `${fixtureOrigin}/` }, browser: true });
    expect(run.document.source.kind).toBe("browser");
    expect(run.document.pages[0]?.root.children.length).toBeGreaterThan(0);
    expect(run.mapped.stats.nodes).toBeGreaterThan(0);
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

  it("collects linked stylesheets and their hover state", async () => {
    const result = await captureBrowser({ url: `${motionOrigin}/linked`, settleMs: 200 });
    const find = (node: IrNode): IrNode | undefined => {
      if (node.baseClasses.includes("linked")) return node;
      for (const child of node.children) {
        const hit = find(child);
        if (hit !== undefined) return hit;
      }
      return undefined;
    };
    const page = result.document.pages[0];
    expect(page).toBeDefined();
    const linked = page === undefined ? undefined : find(page.root);
    expect(linked).toBeDefined();
    expect(linked?.states[0]?.visual["color"]).toBe("rgb(18, 52, 86)");
    expect(linked?.states[0]?.interactive?.hover?.["color"]).toBe("rgb(101, 67, 33)");
  }, 60_000);

  it("pins the light color scheme for deterministic captures", async () => {
    const result = await captureBrowser({ url: `${motionOrigin}/scheme`, settleMs: 200 });
    const page = result.document.pages[0];
    expect(page).toBeDefined();
    const find = (node: IrNode): IrNode | undefined => {
      if (node.name === "Scheme") return node;
      for (const child of node.children) {
        const hit = find(child);
        if (hit !== undefined) return hit;
      }
      return undefined;
    };
    const probe = page === undefined ? undefined : find(page.root);
    expect(probe).toBeDefined();
    expect(probe?.states[0]?.visual["color"]).toBe("rgb(9, 9, 9)");
  }, 60_000);
});
