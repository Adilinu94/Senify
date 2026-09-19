import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootEngine, type BootEnv } from "./helpers.ts";

let env: BootEnv;

beforeAll(async () => {
  env = await bootEngine();
});

afterAll(async () => {
  await env.close();
});

// The editor's play preview (ticket 19, M4) loads the self-hosted runtime from
// the engine; the local program proxies `/api/` with its operator token, so the
// frame can fetch these without a token of its own.
describe("motion vendor route", () => {
  it("serves the four self-hosted runtime files", async () => {
    for (const name of [
      "gsap.min.js",
      "ScrollTrigger.min.js",
      "SplitText.min.js",
      "lenis.min.js",
    ]) {
      const response = await env.api.request({
        method: "GET",
        path: `/api/motion-vendor/${name}`,
      });
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/javascript");
    }
  });

  it("rejects unknown vendor files", async () => {
    const response = await env.api.request({
      method: "GET",
      path: "/api/motion-vendor/evil.js",
    });
    expect(response.status).toBe(404);
  });
});
