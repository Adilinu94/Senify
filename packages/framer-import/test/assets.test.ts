import { listenReachable } from "@senify/core/net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { importAssets } from "@senify/framer-import";
import type { FramerIrDocument } from "@senify/framer-import";

// The asset pipeline (plan S2.3/S2.3b), offline: a local HTTP server plays
// the CDN, so the download/dedupe/rewrite rules run deterministic without
// network. The DSGVO font path is the core: files are fetched once, deduped
// by content hash, and the IR's font src lists point at local paths after
// the run — no font request leaves the installation afterwards.

function fakeFont(weight: number): Buffer {
  return Buffer.concat([
    Buffer.from(`wOF2-fake-${weight}-`, "utf8"),
    Buffer.alloc(120, weight),
  ]);
}

function fakeImage(seed: string): Buffer {
  return Buffer.concat([Buffer.from(`PNG-fake-${seed}-`, "utf8"), Buffer.alloc(64, 7)]);
}

let server: Server;
let origin: string;
const served = new Map<string, Buffer>();
let requestCount = 0;

beforeAll(async () => {
  served.set("/assets/a.woff2", fakeFont(400));
  served.set("/assets/b.woff2", fakeFont(600));
  served.set("/assets/a-duplicate.woff2", fakeFont(400)); // same bytes as a
  // One file for two weights (a variable font).
  served.set("/assets/variable.woff2", fakeFont(600));
  served.set("/images/hero.png", fakeImage("hero"));
  served.set("/images/hero-copy.png", fakeImage("hero")); // same bytes
  server = createServer((request, response) => {
    requestCount += 1;
    const url = request.url ?? "/";
    const body = served.get(url);
    if (body === undefined) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": url.endsWith(".woff2") ? "font/woff2" : "image/png" });
    response.end(body);
  });
  await new Promise<void>((done) => {
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const address = server.address();
      origin = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
      done();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

function irDocument(): FramerIrDocument {
  const outDir = mkdtempSync(join(tmpdir(), "senify-assets-"));
  const document = {
    ir: 1 as const,
    source: {
      kind: "html" as const,
      url: null,
      projectId: null,
      capturedAt: "2026-09-23T00:00:00.000Z",
      contentHash: "test",
    },
    breakpoints: [],
    pages: [
      {
        path: "/",
        title: null,
        root: {
          key: "root",
          kind: "frame" as const,
          name: null,
          componentType: null,
          baseClasses: [],
          tag: "root",
          href: null,
          states: [],
          children: [],
          appearId: null,
          stylesPresetId: null,
          svg: null,
        },
      },
    ],
    styles: {
      colors: [],
      textPresets: [],
      fonts: [
        {
          family: "Inter",
          weight: 400,
          style: "normal",
          src: [`${origin}/assets/a.woff2`, `${origin}/assets/a-duplicate.woff2`],
          unicodeRange: "U+0000-00FF",
        },
        {
          family: "Inter",
          weight: 600,
          style: "normal",
          src: [`${origin}/assets/b.woff2`],
          unicodeRange: "U+0000-00FF",
        },
      ],
    },
    assets: [
      {
        url: `${origin}/images/hero.png`,
        kind: "image" as const,
        hash: null,
        alt: "Hero",
        width: 800,
        height: 600,
      },
      {
        url: `${origin}/images/hero-copy.png`,
        kind: "image" as const,
        hash: null,
        alt: null,
        width: 800,
        height: 600,
      },
    ],
    motion: [],
    findings: [],
  };
  rmSync(outDir, { recursive: true, force: true });
  return document;
}

describe("importAssets", () => {
  it("downloads every asset once and dedupes identical content by hash", async () => {
    const requestsBefore = requestCount;
    const outDir = mkdtempSync(join(tmpdir(), "senify-assets-"));
    const result = await importAssets({ document: irDocument(), outDir });
    // Two image URLs share one content: one download entry, one dedupe —
    // the report counts unique contents, the request count shows the raw
    // fetches (5: 2 images + 3 font urls).
    expect(result.report.downloads).toHaveLength(1);
    expect(result.report.deduped).toBe(2);
    expect(requestCount - requestsBefore).toBe(5);
    const hashes = result.report.downloads.map((download) => download.hash);
    expect(hashes.every((hash) => /^[0-9a-f]{64}$/.test(hash))).toBe(true);
  });

  it("rewrites font src to local paths and dedupes font subsets (DSGVO)", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "senify-assets-"));
    const result = await importAssets({ document: irDocument(), outDir });
    // The duplicate file of the 400-weight was rewritten to the SAME local
    // path as the first: one file per unique content.
    const regular = result.document.styles.fonts[0];
    expect(regular?.src).toHaveLength(1);
    expect(regular?.src[0]).not.toContain(origin);
    // The CDN URL is gone from the IR entirely (the DSGVO point).
    const serialized = JSON.stringify(result.document.styles.fonts);
    expect(serialized).not.toContain("/assets/a.woff2");
    expect(result.report.fonts).toHaveLength(2);
    expect(result.report.fonts.every((font) => font.hash !== "")).toBe(true);
    // The local file exists and holds the right bytes.
    const path = regular?.src[0] ?? "";
    expect(readFileSync(path).equals(fakeFont(400))).toBe(true);
  });

  it("names every weight of a font that shares one file", async () => {
    // A variable font serves several weights from one file (Manrope 600 and
    // 700 share it). The theme writes one `@font-face` per weight, so the
    // report has to name the weight even when the file is already there.
    const document = irDocument();
    document.styles.fonts = [
      {
        family: "Manrope",
        weight: 600,
        style: "normal",
        src: [`${origin}/assets/variable.woff2`],
        unicodeRange: "U+0000-00FF",
      },
      {
        family: "Manrope",
        weight: 700,
        style: "normal",
        src: [`${origin}/assets/variable.woff2`],
        unicodeRange: "U+0000-00FF",
      },
    ];
    const outDir = mkdtempSync(join(tmpdir(), "senify-assets-"));
    try {
      const result = await importAssets({ document, outDir });
      expect(result.report.fonts).toHaveLength(2);
      expect(result.report.fonts.map((font) => font.weight).sort()).toEqual([600, 700]);
      // One file for both weights: the second face reuses it.
      expect(result.report.fonts[0]?.files[0]).toBe(result.report.fonts[1]?.files[0]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("routes bytes through the uploader and returns its URLs", async () => {
    const uploads: { filename: string; bytes: number }[] = [];
    const result = await importAssets({
      document: irDocument(),
      uploader: ({ filename, data }) => {
        uploads.push({ filename, bytes: data.length });
        return `/assets/up-${uploads.length}/${filename}`;
      },
    });
    expect(uploads.length).toBeGreaterThanOrEqual(3);
    expect(uploads.every((upload) => upload.bytes > 0)).toBe(true);
    expect(result.document.styles.fonts[0]?.src[0]).toMatch(/^\/assets\/up-\d+\//);
    expect(result.report.downloads[0]?.localUrl).toMatch(/^\/assets\/up-/);
  });

  it("reports a finding when a font file is unreachable", async () => {
    const document = irDocument();
    document.styles.fonts = [
      {
        family: "Broken",
        weight: 400,
        style: "normal",
        src: [`${origin}/assets/missing.woff2`],
        unicodeRange: null,
      },
    ];
    const outDir = mkdtempSync(join(tmpdir(), "senify-assets-"));
    const result = await importAssets({ document, outDir });
    expect(result.report.failed).toBe(1);
    expect(result.document.styles.fonts[0]?.src).toHaveLength(0);
    expect(
      result.document.findings.some(
        (finding) => finding.kind === "asset-blocked" && finding.evidence.includes("missing.woff2"),
      ),
    ).toBe(true);
  });

  it("throws when assets exist but neither uploader nor outDir is given", async () => {
    await expect(importAssets({ document: irDocument() })).rejects.toThrow(
      /Uploader|Ausgabeverzeichnis/i,
    );
  });

  it("is a no-op (empty report) for an empty document without a target", async () => {
    const document = irDocument();
    document.assets = [];
    document.styles.fonts = [];
    const result = await importAssets({ document });
    expect(result.report.downloads).toHaveLength(0);
    expect(result.report.fonts).toHaveLength(0);
    expect(result.report.failed).toBe(0);
  });

  it("writes mirror files and resolves them back (offline mode)", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "senify-mirror-"));
    const result = await importAssets({ document: irDocument(), outDir });
    const first = result.report.downloads[0];
    expect(first?.localUrl).toContain(outDir.replace(/\\/g, "/").split("/").pop() ?? "");
    const path = first?.localUrl ?? "";
    expect(readFileSync(path).length).toBeGreaterThan(0);
    rmSync(outDir, { recursive: true, force: true });
  });

  it("hashes content identically for the same bytes (dedupe anchor)", () => {
    const a = createHash("sha256").update(fakeFont(400)).digest("hex");
    const b = createHash("sha256").update(fakeFont(400)).digest("hex");
    expect(a).toBe(b);
  });

  it("keeps alt texts into the asset list", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "senify-assets-"));
    const result = await importAssets({ document: irDocument(), outDir });
    const hero = result.document.assets.find((asset) => asset.alt === "Hero");
    expect(hero?.hash).not.toBeNull();
  });

  it("resolves relative URLs against baseUrl", async () => {
    const document = irDocument();
    document.assets = [
      { url: "/images/hero.png", kind: "image", hash: null, alt: null, width: null, height: null },
    ];
    const outDir = mkdtempSync(join(tmpdir(), "senify-assets-"));
    const result = await importAssets({ document, baseUrl: origin, outDir });
    expect(result.report.downloads).toHaveLength(1);
    expect(result.report.failed).toBe(0);
  });

  it("rejects a relative URL without baseUrl", async () => {
    const document = irDocument();
    document.assets = [
      { url: "/images/hero.png", kind: "image", hash: null, alt: null, width: null, height: null },
    ];
    const outDir = mkdtempSync(join(tmpdir(), "senify-assets-"));
    await expect(importAssets({ document, outDir })).rejects.toThrow(/baseUrl/);
  });
});

describe("importAssets reports a medium it cannot load", () => {
  it("records an asset-blocked finding for an image that cannot be downloaded", async () => {
    const document = irDocument();
    document.assets = [{ url: `${origin}/images/not-there.png`, kind: "image", hash: null, alt: null, width: null, height: null }];
    const outDir = mkdtempSync(join(tmpdir(), "senify-assets-"));
    const result = await importAssets({ document, outDir });
    rmSync(outDir, { recursive: true, force: true });
    expect(result.report.failed).toBe(1);
    const finding = result.document.findings.find((entry) => entry.kind === "asset-blocked");
    expect(finding?.evidence).toBe(`${origin}/images/not-there.png`);
    expect(finding?.severity).toBe("warn");
  });
});
