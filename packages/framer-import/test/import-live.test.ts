import { listenReachable } from "@senify/core/net";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { editorDocumentToNodeTree } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { chromium } from "playwright";
import { runImport } from "../src/index.ts";

const FIXTURES = resolve(import.meta.dirname, "fixtures");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

function serve(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    let body: Buffer;
    try {
      body = readFileSync(file);
    } catch {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }).end(body);
  });
  return new Promise((done) =>
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const port = (server.address() as { port: number }).port;
      done({ url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((end) => server.close(() => end())) });
    }),
  );
}

describe("URL import against a live server", () => {
  it("fetches the linked stylesheets, so class styles arrive like in an export folder", async () => {
    const root = mkdtempSync(join(tmpdir(), "senify-url-"));
    cpSync(join(FIXTURES, "framer-stupendous-football-158496"), root, { recursive: true });
    const server = await serve(root);
    try {
      const fromFolder = await runImport({ source: { kind: "mirror", rootDir: join(FIXTURES, "framer-stupendous-football-158496") }, mode: "fidelity" });
      const fromUrl = await runImport({ source: { kind: "url", url: `${server.url}/index.html` }, mode: "fidelity" });
      const styled = (run: typeof fromUrl): number =>
        Object.values(run.mapped.document.nodes).filter((node) => Object.keys(node.props).some((key) => key === "backgroundColor" || key === "fontSize")).length;
      expect(styled(fromFolder)).toBeGreaterThan(50);
      // The URL import must find (almost) as many styled nodes as the folder.
      expect(styled(fromUrl)).toBeGreaterThan(styled(fromFolder) * 0.9);
      expect(fromUrl.mapped.rules.length).toBeGreaterThan(fromFolder.mapped.rules.length * 0.9);
    } finally {
      await server.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});

const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

describe.skipIf(!browserAvailable && process.env["SENIFY_REQUIRE_BROWSER"] !== "1")("imported motion in the baked page", () => {
  it("plays a Framer appear effect: starts hidden and offset, ends visible and in place", async () => {
    // This page has NO appear channel and NO inline transform: nothing compiles
    // to keyframes, so the preset path owns the reveal — which is what this test
    // checks (the page script hides the element and releases it). A page WITH a
    // channel plays its reveal as compiled CSS instead; `appear-bake.test.ts`
    // covers that path.
    const html =
      `<html lang="de"><head><title>t</title></head>` +
      `<body><div id="main" data-framer-hydrate-v2><div><p>Wirkung</p></div><p>Ruhig</p></div></body></html>`;
    // A Framer page with an inview registration: the mapper turns that into the
    // `scroll-reveal` preset without needing an appear channel.
    const run = await runImport({ source: { kind: "html", html }, mode: "fidelity" });
    // The sample set is what the mapper maps; it arrives from the browser probe,
    // not from this static HTML. Build the document the way the probe would.
    const withSample = {
      ...run.document,
      motion: [
        {
          nodeKey: run.document.pages[0]?.root.children[0]?.children[0]?.key ?? null,
          library: "waapi" as const,
          trigger: "appear" as const,
          params: { duration: 600, durationUnit: "ms", fromY: 40, fromX: 0, fromScale: 1, delay: 0.2, fromOpacity: 0.001 },
          raw: "waapi appear",
        },
      ],
    };
    const { mapFramerMotion } = await import("../src/index.ts");
    const mapping = mapFramerMotion(withSample).mappings[0];
    expect(mapping).toBeDefined();
    const nodeKey = mapping?.nodeKey ?? "";
    const nodeId = run.mapped.nodeIdByIrKey[nodeKey];
    const node = nodeId === undefined ? undefined : run.mapped.document.nodes[nodeId];
    if (node !== undefined && mapping !== undefined) node.motion = mapping.spec;
    expect(node?.motion?.preset).toBe("fade-up");
    expect(Object.values(run.mapped.document.nodes).some((node) => node.motion?.preset === "fade-up")).toBe(true);
    const out = mkdtempSync(join(tmpdir(), "senify-motion-"));
    const resolved = resolveTheme(defaultTheme());
    await bakeSite(
      {
        siteName: "motion",
        baseUrl: "https://motion.local",
        pages: [{ id: "p", path: "/", title: "t", tree: editorDocumentToNodeTree(run.mapped.document) }],
        themeCss: emitCss(resolved),
        styleRules: run.mapped.rules,
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        aeo: false,
      },
      { outDir: out, selfContained: true },
    );
    const server = await serve(out);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(`${server.url}/index.html`);
      // The lowest opacity on the element and its ancestors: the runtime hides
      // the wrapper, not the paragraph.
      const probe = `(() => { const p = [...document.querySelectorAll("p")].find((e) => (e.textContent || "").trim() === "Wirkung"); let e = p; let min = 1; while (e && e !== document.body) { min = Math.min(min, Number(getComputedStyle(e).opacity)); e = e.parentElement; } return min; })()`;
      const early = (await page.evaluate(probe)) as number;
      // The delay is 0.2 s; a unit slip (milliseconds read as seconds) would
      // keep the element hidden for minutes, so this wait is the real check.
      await page.waitForTimeout(3000);
      const late = (await page.evaluate(probe)) as number;
      expect(late).toBe(1);
      // Hidden or partway at the start, fully shown at the end: the preset ran.
      expect(early).toBeLessThan(1);
    } finally {
      await browser.close();
      await server.close();
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
