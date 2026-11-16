import { listenReachable } from "@senify/core/net";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { captureBrowser } from "@senify/framer-import";
import type { IrNode } from "../src/ir.ts";

// The published Origin page loads its project images and reveals its sections
// only after the page is scrolled. The capture must scroll section by section,
// wait for lazy images, and repeat the pass when the document grew. This
// fixture mounts its images through an IntersectionObserver, so a capture that
// never scrolls cannot see them.
const playwright = await import("playwright").catch(() => undefined);
const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

// A valid 4x4 PNG, served by the local test server.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGO4I6cBRwzEcQDiwxIhcqFjJAAAAABJRU5ErkJggg==",
  "base64",
);

const SECTIONS = Array.from({ length: 12 }, (_, index) => {
  const image =
    index < 3
      ? `<img data-src="/pixel.png" width="20" height="20" alt="" />`
      : "";
  return `<section class="section" data-framer-name="Section ${index + 1}" style="opacity:0.001">${image}<span>Abschnitt ${index + 1}</span></section>`;
}).join("");

const SCROLL_PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; }
  .section { height: 300px; }
</style></head><body><div id="main">${SECTIONS}</div><script>
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var image = entry.target.querySelector("img[data-src]");
      if (image) {
        image.src = image.getAttribute("data-src");
        image.removeAttribute("data-src");
      }
      entry.target.style.opacity = "1";
    });
  }, { rootMargin: "200px" });
  document.querySelectorAll(".section").forEach(function (section) { observer.observe(section); });
</script></body></html>`;

function startServer(): Promise<{ server: import("node:http").Server; origin: string }> {
  const server = createServer((request, response) => {
    if (request.url === "/pixel.png") {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(PIXEL);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(SCROLL_PAGE);
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

function collectImages(node: IrNode, out: IrNode[] = []): IrNode[] {
  if (node.kind === "image") out.push(node);
  for (const child of node.children) collectImages(child, out);
  return out;
}

describe.skipIf(!browserAvailable)("captureBrowser und der Scroll-Settle", () => {
  it("scrollt durch alle Sektionen, laedt lazy Bilder und meldet die Vollstaendigkeit", async () => {
    const { server, origin } = await startServer();
    try {
      const result = await captureBrowser({ url: `${origin}/`, settleMs: 200, hover: "off" });
      const page = result.document.pages[0];
      expect(page).toBeDefined();
      expect(page?.root.children.length).toBeGreaterThanOrEqual(12);
      const images = collectImages(page?.root as IrNode);
      expect(images).toHaveLength(3);
      expect(images.every((image) => (image.assetUrl ?? "").includes("/pixel.png"))).toBe(true);
      expect(result.completeness?.passes).toBeGreaterThanOrEqual(1);
      expect(result.completeness?.imagesPending).toBe(0);
      expect(result.completeness?.heightSettled).toBeGreaterThanOrEqual(
        result.completeness?.heightStart ?? 0,
      );
      expect(result.document.findings.some((finding) => finding.kind === "capture-fallback")).toBe(false);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 120_000);
});
