import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { importFramerSite } from "../src/framer-site-import.ts";
import type { EngineClient } from "../src/client.ts";

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "senify-site-import-"));
  mkdirSync(join(root, "blog"));
  writeFileSync(join(root, "index.html"), '<div id="main">Home</div>');
  writeFileSync(join(root, "blog", "item.html"), '<div id="main">Item</div>');
  return root;
}

describe("importFramerSite", () => {
  it("preflights all pages and creates them without replacing existing drafts", async () => {
    const rootDir = fixture();
    try {
      const request = vi.fn().mockImplementation(async (_method, _path, body) => ({ job: { status: "succeeded" }, report: { irHash: `hash${body.pagePath}`, pageId: body.write ? `id${body.pagePath}` : null, findings: [], assets: { failed: 0 } } }));
      const result = await importFramerSite({ request } as unknown as EngineClient, { siteId: "s1", rootDir, write: true });
      expect(result.status).toBe("imported");
      expect(result.runtimeFreeVerified).toBe(false);
      expect(result.pages.map((page) => page.state)).toEqual(["imported", "imported"]);
      expect(request).toHaveBeenCalledTimes(4);
      expect(request.mock.calls[2]?.[2]).toMatchObject({ createOnly: true, expectedIrHash: "hash/", source: { sourcePagePath: "/" } });
    } finally { rmSync(rootDir, { recursive: true, force: true }); }
  });

  it("blocks a write before any page changes when a destination exists", async () => {
    const rootDir = fixture();
    try {
      const request = vi.fn().mockImplementation(async (_method, _path, body) => ({ job: { status: "succeeded" }, report: { irHash: "h", pageId: null, findings: [], assets: { failed: 0 }, ...(body.pagePath === "/" ? { existingPage: { pageId: "already" } } : {}) } }));
      const result = await importFramerSite({ request } as unknown as EngineClient, { siteId: "s1", rootDir, write: true });
      expect(result.status).toBe("blocked");
      expect(request.mock.calls.every((call) => call[2].write === false)).toBe(true);
    } finally { rmSync(rootDir, { recursive: true, force: true }); }
  });

  it("reports a failed page as partial and stops instead of claiming success", async () => {
    const rootDir = fixture();
    try {
      const request = vi.fn().mockImplementation(async (_method, _path, body) => {
        if (body.write && body.pagePath !== "/") throw new Error("Speicherfehler");
        return { job: { status: "succeeded" }, report: { irHash: "h", pageId: body.write ? "id" : null, findings: [], assets: { failed: 0 } } };
      });
      const result = await importFramerSite({ request } as unknown as EngineClient, { siteId: "s1", rootDir, write: true });
      expect(result.status).toBe("partial");
      expect(result.pages.map((page) => page.state)).toEqual(["imported", "failed"]);
    } finally { rmSync(rootDir, { recursive: true, force: true }); }
  });
});
