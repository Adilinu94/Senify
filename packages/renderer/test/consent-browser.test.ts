import { listenReachable } from "@senify/core/net";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { chromium } from "playwright";
import { bakeSite, type BakeResult } from "../src/index.ts";
import type { Node, NodeTree } from "@senify/section-sdk";

// The consent gate in a real browser: nothing from a third party is requested
// before the visitor agrees; one click loads one frame; accepting in the cookie
// notice loads all of them, also on the next page view; withdrawing brings the
// placeholders back.

const BROWSER_REQUIRED = process.env["SENIFY_REQUIRE_BROWSER"] === "1";
const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

const resolved = resolveTheme(defaultTheme());
if (resolved.issues.length > 0) throw new Error("Default theme does not resolve");

const MAP_A = "https://maps.example-third-party.test/embed/a";
const MAP_B = "https://maps.example-third-party.test/embed/b";

function tree(): NodeTree {
  const nodes: Record<string, Node> = {
    root: { id: "root", type: "page", props: {}, children: ["e1", "e2", "c1"] } as unknown as Node,
    e1: { id: "e1", type: "embed", variant: "iframe", props: { url: MAP_A, title: "Karte A" } } as unknown as Node,
    e2: { id: "e2", type: "embed", variant: "iframe", props: { url: MAP_B, title: "Karte B" } } as unknown as Node,
    c1: {
      id: "c1",
      type: "cookie-note",
      props: { text: "Wir nutzen externe Inhalte.", acceptLabel: "Alle laden", declineLabel: "Nein" },
    } as unknown as Node,
  };
  return { rootNodeId: "root", nodes };
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
};

function serve(root: string): Promise<{ server: Server; origin: string }> {
  return new Promise((resolveServer) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      let file = normalize(join(root, url.pathname));
      if (!file.startsWith(root)) file = root;
      if (url.pathname.endsWith("/")) file = join(file, "index.html");
      if (!existsSync(file)) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
      response.end(readFileSync(file));
    });
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolveServer({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

let baked: BakeResult | undefined;
afterAll(() => {
  if (baked) rmSync(baked.outDir, { recursive: true, force: true });
});

describe.skipIf(!browserAvailable && !BROWSER_REQUIRED)("consent gate (browser)", () => {
  it("loads third-party frames only after consent", async () => {
    baked = await bakeSite(
      {
        siteName: "Muster",
        baseUrl: "https://beispiel.de",
        pages: [{ id: "p", path: "/", title: "Start", tree: tree() }],
        themeCss: emitCss(resolved),
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        profile: "standard",
      },
      { outDir: join(mkdtempSync(join(tmpdir(), "senify-consent-")), "dist") },
    );
    const { server, origin } = await serve(baked.outDir);
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      const thirdParty: string[] = [];
      await context.route("https://maps.example-third-party.test/**", async (route) => {
        thirdParty.push(route.request().url());
        await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>karte</title>" });
      });
      const page = await context.newPage();

      // 1. First visit: placeholders, no request to the third party.
      await page.goto(`${origin}/`, { waitUntil: "load" });
      await page.waitForTimeout(300);
      expect(await page.locator("[data-consent-placeholder]").count()).toBe(2);
      expect(thirdParty).toEqual([]);
      expect(await page.locator("iframe[data-consent-src]").count()).toBe(2);

      // 2. One click loads exactly one frame.
      await page.locator("[data-consent-load]").first().click();
      await page.waitForFunction("document.querySelectorAll('iframe[src]').length === 1");
      // The `src` attribute is set before the request reaches the route handler.
      await expect.poll(() => thirdParty).toEqual([MAP_A]);
      expect(await page.locator("[data-consent-placeholder]").count()).toBe(1);

      // 3. Declining changes nothing for the remaining frame.
      await page.locator('[data-consent="decline"]').click();
      await page.waitForTimeout(200);
      expect(thirdParty).toEqual([MAP_A]);
      expect(await page.evaluate("window.localStorage.getItem('senify-consent')")).toBe("decline");

      // 4. Withdraw, then accept in the notice: everything loads.
      await page.evaluate("window.senifyConsent.clear()");
      await page.reload({ waitUntil: "load" });
      expect(await page.locator('[data-island="consent"]').isVisible()).toBe(true);
      await page.locator('[data-consent="accept"]').click();
      await page.waitForFunction("document.querySelectorAll('iframe[src]').length === 2");
      await expect.poll(() => thirdParty).toContain(MAP_B);
      expect(await page.locator("[data-consent-placeholder]").count()).toBe(0);

      // 5. The choice sticks: the next view loads at once and the notice stays away.
      thirdParty.length = 0;
      await page.reload({ waitUntil: "load" });
      await page.waitForFunction("document.querySelectorAll('iframe[src]').length === 2");
      expect(await page.locator('[data-island="consent"]').isVisible()).toBe(false);
    } finally {
      await browser.close();
      server.close();
    }
  }, 120000);
});
