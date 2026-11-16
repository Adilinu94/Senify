import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootEngine, createTestSite, type BootEnv } from "./helpers.ts";

// A page path arrives percent-encoded and the site stores the decoded name.
//
// Measured on the imported origin site (14.11.2026): Framer links to
// `/work/dendezeiro%C2%AE`, the import kept the encoding in the page path, and
// the bake refused to build with `NoMatchingStaticPathFound` for
// `/work/dendezeiro®/` — the release never arrived.
let env: BootEnv;
let dir: string;

beforeAll(async () => {
  env = await bootEngine();
  dir = mkdtempSync(join(tmpdir(), "senify-import-encoded-path-"));
  mkdirSync(join(dir, "encoded"), { recursive: true });
  writeFileSync(
    join(dir, "encoded", "index.html"),
    `<!doctype html><html><head><title>Dendezeiro</title></head><body>` +
      `<div id="main" data-framer-hydrate-v2='{"routeId":"abc"}'><h1>Dendezeiro</h1></div>` +
      `</body></html>`,
  );
});

afterAll(async () => {
  await env.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("a percent-encoded page path", () => {
  it("lands decoded, so the bake finds its own route", async () => {
    const site = await createTestSite(env.api, "Kodierter Pfad");
    const response = await env.api.request<{
      report: { pageId: string | null };
    }>({
      method: "POST",
      path: `/api/sites/${site.id}/imports/framer`,
      body: {
        source: { rootDir: join(dir, "encoded") },
        pagePath: "/work/dendezeiro%C2%AE",
        write: true,
        output: "structure",
        assets: "skip",
        fonts: "skip",
      },
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const pageId = response.body.report.pageId as string;
    const page = await env.engine.store.getPage(pageId);
    expect(page.path).toBe("/work/dendezeiro®");
  });
});
