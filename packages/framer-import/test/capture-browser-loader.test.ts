import { listenReachable } from "@senify/core/net";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { captureBrowser } from "@senify/framer-import";
import type { IrNode } from "../src/ir.ts";

// The published Origin homepage covers the first paint with a full-screen
// `Preloader (Show Once content)`. The capture must wait for it, remove it, and
// never bake the overlay as content. These fixtures use the same shape and both
// exit channels: a CSS keyframe and an element.animate() call.
const playwright = await import("playwright").catch(() => undefined);
const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

const SECTIONS = Array.from(
  { length: 8 },
  (_, index) => `<section class="section" data-framer-name="Section ${index + 1}">Abschnitt ${index + 1}</section>`,
).join("");

const CSS_LOADER_PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; }
  .loader { position: fixed; inset: 0; z-index: 10; background: #000; opacity: 1; animation: loader-out 0.4s ease 0.6s forwards; }
  @keyframes loader-out { to { opacity: 0; } }
  .section { height: 220px; opacity: 0.001; }
</style></head><body><div id="main">
  <div class="loader framer-br35q9-container" data-framer-name="Preloader (Show Once content)"></div>
  ${SECTIONS}
</div><script>
  window.addEventListener("load", function () {
    setTimeout(function () {
      document.querySelectorAll(".section").forEach(function (element) { element.style.opacity = "1"; });
    }, 900);
  });
</script></body></html>`;

const WAAPI_LOADER_PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; }
  .loader { position: fixed; inset: 0; z-index: 10; background: #000; opacity: 1; }
  .section { height: 220px; opacity: 0.001; }
</style></head><body><div id="main">
  <div class="loader framer-br35q9-container" data-framer-name="Preloader (Show Once content)"></div>
  ${SECTIONS}
</div><script>
  window.addEventListener("load", function () {
    var loader = document.querySelector(".loader");
    if (loader) loader.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 600, fill: "forwards" });
    setTimeout(function () {
      document.querySelectorAll(".section").forEach(function (element) { element.style.opacity = "1"; });
    }, 900);
  });
</script></body></html>`;

const STUCK_LOADER_PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; }
  .loader { position: fixed; inset: 0; z-index: 10; background: #000; opacity: 1; }
  .section { height: 220px; opacity: 0.001; }
</style></head><body><div id="main">
  <div class="loader framer-br35q9-container" data-framer-name="Preloader (Show Once content)"></div>
  ${SECTIONS}
</div></body></html>`;

function startServer(html: string): Promise<{ server: import("node:http").Server; origin: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  return new Promise((done) => {
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const address = server.address();
      done({
        server,
        origin: `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`,
      });
    });
  });
}

function containsLoaderName(node: IrNode): boolean {
  if (/preloader|page[\s_-]*loader|splash|curtain/i.test(node.name ?? "")) return true;
  return node.children.some(containsLoaderName);
}

describe.skipIf(!browserAvailable)("captureBrowser und der Siteloader", () => {
  it("wartet auf einen CSS-animierten Loader und entfernt ihn aus dem Markup", async () => {
    const { server, origin } = await startServer(CSS_LOADER_PAGE);
    try {
      const result = await captureBrowser({ url: `${origin}/`, settleMs: 200, hover: "off" });
      expect(result.document.findings.some((finding) => finding.kind === "loader-skipped")).toBe(true);
      expect(result.earlyMarkup ?? "").not.toContain("Preloader (Show Once content)");
      expect(result.earlyMarkup ?? "").not.toContain("framer-br35q9-container");
      for (const markup of Object.values(result.deviceMarkup ?? {})) {
        expect(markup).not.toContain("Preloader (Show Once content)");
      }
      const page = result.document.pages[0];
      expect(page).toBeDefined();
      expect(containsLoaderName(page?.root as IrNode)).toBe(false);
      expect(page?.root.children.length).toBeGreaterThanOrEqual(8);
      expect(result.completeness?.passes).toBeGreaterThanOrEqual(1);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 120_000);

  it("wartet auch auf einen Loader, der per element.animate() ausblendet", async () => {
    const { server, origin } = await startServer(WAAPI_LOADER_PAGE);
    try {
      const result = await captureBrowser({ url: `${origin}/`, settleMs: 200, hover: "off" });
      expect(result.document.findings.some((finding) => finding.kind === "loader-skipped")).toBe(true);
      expect(result.earlyMarkup ?? "").not.toContain("Preloader (Show Once content)");
      expect(containsLoaderName(result.document.pages[0]?.root as IrNode)).toBe(false);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 120_000);

  it("entfernt einen haengenden Loader nach dem Timeout und meldet ihn", async () => {
    const { server, origin } = await startServer(STUCK_LOADER_PAGE);
    try {
      const result = await captureBrowser({
        url: `${origin}/`,
        settleMs: 200,
        hover: "off",
        loaderTimeoutMs: 400,
      });
      expect(result.document.findings.some((finding) => finding.kind === "loader-dismissed")).toBe(true);
      expect(result.earlyMarkup ?? "").not.toContain("Preloader (Show Once content)");
      expect(containsLoaderName(result.document.pages[0]?.root as IrNode)).toBe(false);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 120_000);
});
