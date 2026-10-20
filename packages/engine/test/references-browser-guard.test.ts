import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { chromium } from "playwright";
import { listenReachable } from "@senify/core/net";
import { createPlaywrightCaptureDriver } from "@senify/engine";

const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

// ADR-0022: the browser path goes through the same address check as the node
// path. The browser follows what the page points at - a redirect, a
// sub-resource, a `fetch()` from the page's script. Without the route, the
// browser would talk to a metadata service or to a service in the LAN while
// the node path refuses the same address.
//
// The proof is the counter: the server below counts its requests. If the guard
// does not hold, the counter is not zero.
describe.skipIf(
  !browserAvailable && process.env["SENIFY_REQUIRE_BROWSER"] !== "1",
)("the browser capture refuses a private address", () => {
  it("never reaches a server on a private address", async () => {
    let hits = 0;
    const server = createServer((_request, response) => {
      hits += 1;
      response.writeHead(200, { "content-type": "text/html" }).end("<html></html>");
    });
    await new Promise<void>((done) => listenReachable(server, 0, "127.0.0.1").then(() => done()));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    vi.stubEnv("SENIFY_ALLOW_PRIVATE_URLS", "");
    try {
      const capture = createPlaywrightCaptureDriver({ recordMotion: false });
      await expect(
        capture({ url: `http://127.0.0.1:${port}/seite`, breakpoints: [1440] }),
      ).rejects.toThrow();
      expect(hits).toBe(0);
    } finally {
      vi.unstubAllEnvs();
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 120_000);
});
