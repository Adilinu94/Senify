import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { listenReachable } from "@senify/core/net";
import { captureScreenshots } from "@senify/analysis-worker";

// The visual harness opens a real browser - and a browser follows what the
// page points at: a redirect, a sub-resource, a `fetch()` from the page's
// script. Without a check at the browser, a public page could point it at a
// cloud metadata service or at a service in the LAN, and the answer would
// end up in the capture (ADR-0022).
//
// The check sits at the browser, not at the call site: the order in which the
// calls happen must not decide whether the address is checked.
//
// The proof is the counter: the server below counts its requests. If the
// guard does not hold, the counter is not zero.

const playwright = await import("playwright").catch(() => undefined);
const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

async function startServer(): Promise<{
  origin: string;
  hits: () => number;
  close: () => Promise<void>;
}> {
  let hits = 0;
  const server = createServer((_request, response) => {
    hits += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body><h1>Lokal</h1></body></html>");
  });
  await new Promise<void>((done) =>
    listenReachable(server, 0, "127.0.0.1").then(() => done()),
  );
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    origin: `http://127.0.0.1:${port}`,
    hits: () => hits,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

describe.skipIf(!browserAvailable)("the visual harness guards the browser", () => {
  it("never reaches a server on a private address", async () => {
    const server = await startServer();
    const outDir = mkdtempSync(join(tmpdir(), "senify-visual-guard-"));
    // The switch of the operator is off: the private address of the test
    // server is a private address like any other.
    vi.stubEnv("SENIFY_ALLOW_PRIVATE_URLS", "");
    try {
      await expect(
        captureScreenshots({
          url: `${server.origin}/`,
          outDir,
          breakpoints: ["desktop"],
        }),
      ).rejects.toThrow(/nicht öffentlichen Adresse/);
      expect(server.hits()).toBe(0);
    } finally {
      vi.unstubAllEnvs();
      await server.close();
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 120000);

  it("reaches the server the product started itself", async () => {
    // The preview server and the offline mirror run on the loopback
    // interface. Without them there is no preview at all - they are the
    // servers the capture is allowed to open.
    const server = await startServer();
    const outDir = mkdtempSync(join(tmpdir(), "senify-visual-guard-"));
    vi.stubEnv("SENIFY_ALLOW_PRIVATE_URLS", "");
    try {
      const captures = await captureScreenshots({
        url: `${server.origin}/`,
        outDir,
        breakpoints: ["desktop"],
        browser: { allowOrigins: [server.origin] },
      });
      expect(captures).toHaveLength(1);
      expect(server.hits()).toBeGreaterThan(0);
    } finally {
      vi.unstubAllEnvs();
      await server.close();
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 120000);
});
