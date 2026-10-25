import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBakedSite } from "@senify/core/testing";
import type { Node, NodeTree } from "@senify/section-sdk";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { bakeSite, type BakeResult } from "@senify/renderer";

// The seam between the structure and the payload (step 3 of
// `docs/fahrplan-framer-1zu1.md`).
//
// The Framer runtime hydrates `#main` and therefore belongs to the PAGE, not
// to a section. A carrier that stands for the whole page renders INSTEAD of
// the structure in the release: the original page stands where the structure
// stood, so nothing stands twice. The tree keeps the structure — it is the
// truth the editor works on.

const PAYLOAD_CODE = "export function mount(stage) { stage.innerHTML = '<p>Original</p>'; }";
const INTEGRITY = "a".repeat(64);

function tree(options: { coversPage: boolean }): NodeTree {
  const nodes: Record<string, Node> = {
    root: { id: "root", type: "page", props: {}, children: ["structure", "carrier"] },
    structure: { id: "structure", type: "text", props: { text: "Strukturtext" } },
    carrier: {
      id: "carrier",
      type: "payload",
      props: {
        payloadId: "pay1",
        label: "Original",
        ...(options.coversPage ? { coversPage: true } : {}),
      },
    },
  };
  return { rootNodeId: "root", nodes };
}

const resolved = resolveTheme(defaultTheme());
const baked: BakeResult[] = [];

afterAll(() => {
  for (const result of baked) rmSync(result.outDir, { recursive: true, force: true });
});

async function bake(options: { coversPage: boolean }): Promise<{ html: string; result: BakeResult }> {
  const result = await bakeSite(
    {
      siteName: "Musterstudio",
      baseUrl: "https://beispiel.de",
      pages: [{ id: "p1", path: "/", title: "Start", tree: tree(options) }],
      themeCss: emitCss(resolved),
      motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
      payloads: { pay1: { code: PAYLOAD_CODE, integrity: INTEGRITY, bytes: PAYLOAD_CODE.length } },
      aeo: false,
    },
    { outDir: mkdtempSync(join(tmpdir(), "senify-payload-page-")) },
  );
  baked.push(result);
  const html = await loadBakedSite(result.outDir).read("index.html");
  return { html, result };
}

describe("the page-level payload", () => {
  it("renders the carrier instead of the structure", async () => {
    const { html } = await bake({ coversPage: true });
    // The carrier stands.
    expect(html).toContain('data-island="payload"');
    expect(html).toContain('data-payload-id="pay1"');
    expect(html).toContain('data-payload-covers-page="1"');
    // The structure does NOT — nothing stands twice.
    expect(html).not.toContain("Strukturtext");
  });

  it("keeps the structure when the carrier stands for a section only", async () => {
    // The counter-proof: without `coversPage` the carrier is an ordinary
    // node and the structure stays.
    const { html } = await bake({ coversPage: false });
    expect(html).toContain("Strukturtext");
    expect(html).toContain('data-island="payload"');
    expect(html).not.toContain('data-payload-covers-page="1"');
  });

  it("keeps the structure when this build does not deliver the payload", async () => {
    // A missing page-level payload must not empty the page AND must not leave a
    // carrier behind: the structure IS the page then. (Measured: a carrier that
    // stayed with its plate added 96 px — 6 rem — below every page.)
    const result = await bakeSite(
      {
        siteName: "Musterstudio",
        baseUrl: "https://beispiel.de",
        pages: [{ id: "p1", path: "/", title: "Start", tree: tree({ coversPage: true }) }],
        themeCss: emitCss(resolved),
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        // No payloads: the build delivers none.
        aeo: false,
      },
      { outDir: mkdtempSync(join(tmpdir(), "senify-payload-page-")) },
    );
    baked.push(result);
    const html = await loadBakedSite(result.outDir).read("index.html");
    // The structure stands ...
    expect(html).toContain("Strukturtext");
    // ... and the carrier is gone: no island, no plate, no empty stage.
    expect(html).not.toContain('data-island="payload"');
    expect(html).not.toContain('class="w-payload--plate"');
    // The bake still says that a payload is missing.
    expect(result.warnings.some((warning) => warning.code === "payload-missing")).toBe(true);
  });

  it("writes the payload and hands its URL to the island script", async () => {
    const { result } = await bake({ coversPage: true });
    const payload = result.payloads.find((entry) => entry.id === "pay1");
    expect(payload).toBeDefined();
    expect(payload?.url).toBe(`/assets/payloads/pay1.${INTEGRITY.slice(0, 8)}.js`);
    // The island script knows the URL — that is what mounts the payload.
    const islands = await loadBakedSite(result.outDir).read("assets/islands.js");
    expect(islands).toContain("/assets/payloads/pay1.");
  });

  it("shows the poster when the payload fails — also on a page-level carrier", async () => {
    // ADR-0010 §7: payload → poster → plate, in that order. A page-level
    // carrier used to render NEITHER, so a payload that failed to load left an
    // empty page. The poster is the fallback; the plate is the last resort.
    const nodes: Record<string, Node> = {
      root: { id: "root", type: "page", props: {}, children: ["carrier"] },
      carrier: {
        id: "carrier",
        type: "payload",
        props: {
          payloadId: "pay1",
          label: "Original",
          alt: "Startseite der Quelle",
          poster: { assetId: "asset-poster" },
          coversPage: true,
        },
      },
    };
    const result = await bakeSite(
      {
        siteName: "Musterstudio",
        baseUrl: "https://beispiel.de",
        pages: [{ id: "p1", path: "/", title: "Start", tree: { rootNodeId: "root", nodes } }],
        themeCss: emitCss(resolved),
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        assets: { "asset-poster": { src: "/assets/asset-poster/poster.png", width: 1200, height: 630 } },
        payloads: { pay1: { code: PAYLOAD_CODE, integrity: INTEGRITY, bytes: PAYLOAD_CODE.length } },
        aeo: false,
      },
      { outDir: mkdtempSync(join(tmpdir(), "senify-payload-poster-")) },
    );
    baked.push(result);
    const html = await loadBakedSite(result.outDir).read("index.html");
    // The poster is rendered, with the asset the carrier names.
    expect(html).toContain("w-payload--poster");
    expect(html).toContain("asset-poster");
    // The stage and the plate exist as well: the script flips the state.
    expect(html).toContain("w-payload--plate");
    expect(html).toContain('data-payload-state="pending"');
  });

  it("keeps a carrier without a poster on its plate", async () => {
    // A SECTION-level carrier (no `coversPage`): its plate is the last fallback
    // and says why it stands — that is where a plate belongs.
    const nodes: Record<string, Node> = {
      root: { id: "root", type: "page", props: {}, children: ["structure", "carrier"] },
      structure: { id: "structure", type: "text", props: { text: "Strukturtext" } },
      carrier: { id: "carrier", type: "payload", props: { payloadId: "pay1", label: "Hero" } },
    };
    const result = await bakeSite(
      {
        siteName: "Musterstudio",
        baseUrl: "https://beispiel.de",
        pages: [{ id: "p1", path: "/", title: "Start", tree: { rootNodeId: "root", nodes } }],
        themeCss: emitCss(resolved),
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        payloads: { pay1: { code: PAYLOAD_CODE, integrity: INTEGRITY, bytes: PAYLOAD_CODE.length } },
        aeo: false,
      },
      { outDir: mkdtempSync(join(tmpdir(), "senify-payload-plate-")) },
    );
    baked.push(result);
    const html = await loadBakedSite(result.outDir).read("index.html");
    expect(html).not.toMatch(/<img[^>]*data-asset=/);
    expect(html).toContain('class="w-payload--plate"');
    expect(html).toContain("Hero — der Fremd-Code ließ sich nicht laden");
  });
});
