import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bakePages } from "@senify/engine";
import { bootEngine, createTestPage, createTestSite, HUMAN_AUTHOR } from "./helpers.ts";

describe("bake of assets referenced by style rules", () => {
  it("delivers same-site SVG masks referenced only in base and hover CSS", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "CSS masks");
      const otherSite = await createTestSite(env.api, "Other site");
      const page = await createTestPage(env.api, site.id, { path: "/" });
      async function upload(siteId: string, filename: string, color: string) {
        const data = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path fill="${color}" d="M0 0h8v8H0z"/></svg>`);
        const ticket = await env.api.request<{ url: string }>({ method: "POST", path: `/api/sites/${siteId}/assets/upload-url`, body: { filename, mime: "image/svg+xml", byteSize: data.length } });
        expect(ticket.status).toBe(201);
        const response = await fetch(`${env.server.origin}${ticket.body.url}`, { method: "PUT", headers: { "content-type": "image/svg+xml" }, body: new Uint8Array(data) });
        expect(response.status).toBe(201);
        const result = await response.json() as { asset: { id: string; filename: string } };
        return result.asset;
      }
      const base = await upload(site.id, "base.svg", "red");
      const hover = await upload(site.id, "hover.svg", "blue");
      const tablet = await upload(site.id, "tablet.svg", "orange");
      const context = await upload(site.id, "context.svg", "black");
      const unused = await upload(site.id, "unused.svg", "green");
      const foreign = await upload(otherSite.id, "foreign.svg", "purple");
      const url = (asset: { id: string; filename: string }) => `/assets/${asset.id}/${asset.filename}`;
      await env.engine.store.createStyleRule(site.id, {
        kind: "ambient", name: "body", selector: "body",
        styles: { mask: `url("${url(base)}") no-repeat`, mask_tablet: `url("${url(tablet)}")`, backgroundImage: `url("${url(foreign)}")` },
        states: { hover: { mask: `url("${url(hover)}") no-repeat` } },
        contextStyles: { wide: { mask: `url("${url(context)}")` } },
      }, HUMAN_AUTHOR);
      const outDir = join(env.engine.dataDir, "style-assets-bake");
      await bakePages(env.engine.store, { site: await env.engine.store.getSite(site.id), pages: [await env.engine.store.getPage(page.id)], outDir, dataDir: env.engine.dataDir });
      const css = readFileSync(join(outDir, "assets", "style-rules.css"), "utf8");
      expect(css).toContain(url(base));
      expect(css).toContain(url(hover));
      expect(existsSync(join(outDir, "assets", base.id, base.filename))).toBe(true);
      expect(existsSync(join(outDir, "assets", hover.id, hover.filename))).toBe(true);
      expect(existsSync(join(outDir, "assets", tablet.id, tablet.filename))).toBe(true);
      expect(existsSync(join(outDir, "assets", context.id, context.filename))).toBe(true);
      expect(existsSync(join(outDir, "assets", unused.id, unused.filename))).toBe(false);
      expect(existsSync(join(outDir, "assets", foreign.id, foreign.filename))).toBe(false);
    } finally {
      await env.close();
    }
  }, 120_000);
});
