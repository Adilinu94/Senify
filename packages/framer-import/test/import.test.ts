import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import {
  captureFixture,
  compareRuns,
  marqueeCandidates,
  runImport,
  type FramerIrDocument,
} from "@senify/framer-import";
import { fileURLToPath } from "node:url";

// The orchestration (plan S2 acceptance): one run against a source produces
// IR + assets + report; the second run over the unchanged source is a No-Op
// with numbers (compareRuns). The offline mirror is the input for both —
// no network beyond the local asset server.

const FIXTURES = join(fileURLToPath(new URL("./fixtures", import.meta.url)));

let server: Server;
let origin: string;
let requestCount = 0;

beforeAll(async () => {
  // A tiny CDN: serves the fixture's referenced image with stable bytes, so
  // the asset pipeline runs and hashes deterministically.
  const image = Buffer.from("PNG-fake-fixture-hero-bytes", "utf8");
  server = createServer((request, response) => {
    requestCount += 1;
    const url = request.url ?? "/";
    if (url.includes(".png") || url.includes(".jpg") || url.includes(".webp")) {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(image);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      origin = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
      done();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

describe("runImport", () => {
  it("runs the full pipeline over the offline mirror (IR, rules, report)", async () => {
    const run = await runImport({
      source: { kind: "mirror", rootDir: join(FIXTURES, "framer-stupendous-football-158496") },
    });
    expect(run.document.ir).toBe(1);
    expect(run.document.pages[0]?.root.children.length).toBeGreaterThan(0);
    expect(run.normalized.stats.nodes).toBeGreaterThan(0);
    expect(run.mapped.document.nodes["root"]).toBeDefined();
    expect(run.report.score).toBeGreaterThan(0);
    expect(run.irHash).toMatch(/^ir1:/);
  }, 60_000);

  it("is a No-Op: the second run over the unchanged source changes nothing", async () => {
    const source = { kind: "mirror" as const, rootDir: join(FIXTURES, "framer-stupendous-football-158496") };
    const first = await runImport({ source });
    const second = await runImport({ source });
    const comparison = compareRuns(first, second);
    expect(comparison.identical).toBe(true);
    expect(comparison.changes).toHaveLength(0);
    expect(first.irHash).toBe(second.irHash);
    // The document shape itself matches (the part the write path compares).
    expect(first.mapped.document.nodes).toEqual(second.mapped.document.nodes);
    expect(first.mapped.document.styleRules.length).toBe(second.mapped.document.styleRules.length);
  }, 90_000);

  it("carries the source contentHash into the idempotency key", async () => {
    const direct = captureFixture(join(FIXTURES, "framer-stupendous-football-158496"));
    const run = await runImport({
      source: { kind: "mirror", rootDir: join(FIXTURES, "framer-stupendous-football-158496") },
    });
    expect(run.irHash).toContain(direct.source.contentHash);
  }, 60_000);

  it("downloads assets through the uploader and rewrites font URLs (DSGVO)", async () => {
    const uploads: { filename: string; mime: string }[] = [];
    const run = await runImport({
      source: { kind: "mirror", rootDir: join(FIXTURES, "framer-stupendous-football-158496") },
      // The fixture's image URLs are relative; the local CDN resolves them.
      // The fixture font URLs point at framerusercontent.com which no test
      // may touch — fonts fail their download and land as findings, the
      // report counts the failures instead of silently dropping them.
      baseUrl: origin,
      uploader: ({ filename, mime }) => {
        uploads.push({ filename, mime });
        return `/assets/1/${filename}`;
      },
    });
    expect(run.assets).not.toBeNull();
    // The image went through the uploader.
    expect(uploads.some((upload) => upload.mime.startsWith("image/"))).toBe(true);
    // The unreachable fonts surface as findings (DSGVO rewrite path).
    expect(
      run.document.findings.some(
        (finding) => finding.kind === "asset-blocked" && finding.evidence.includes(".woff2"),
      ),
    ).toBe(true);
  }, 90_000);

  it("fetches mirror-referenced assets from the baseUrl when given", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "senify-import-"));
    try {
      const run = await runImport({
        source: { kind: "mirror", rootDir: join(FIXTURES, "framer-stupendous-football-158496") },
        outDir,
        baseUrl: origin,
      });
      // Every image URL was fetched from the local CDN (relative resolution
      // exercised), the report counts the download.
      expect(run.assets?.downloads.length).toBeGreaterThan(0);
      expect(requestCount).toBeGreaterThan(0);
      const first = run.assets?.downloads[0];
      expect(first?.hash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 90_000);

  it("maps the measured ticker loop onto marquee candidates", () => {
    const run = runDocumentWithTickerLoop();
    const candidates = marqueeCandidates(run.document);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.preset).toBe("marquee");
    expect(candidates[0]?.params.iterations).toBe("endless");
  });
});

function runDocumentWithTickerLoop(): { document: FramerIrDocument } {
  // A minimal IR with the measured WAAPI loop shape (befund §4): the ticker
  // node, translateX, endless iterations.
  return {
    document: {
      ir: 1 as const,
      source: {
        kind: "browser" as const,
        url: "https://example.test/",
        projectId: null,
        capturedAt: "2026-09-23T00:00:00.000Z",
        contentHash: "ticker",
      },
      breakpoints: [],
      pages: [],
      styles: { colors: [], textPresets: [], fonts: [] },
      assets: [],
      motion: [
        {
          nodeKey: "Top Ticker",
          library: "waapi" as const,
          trigger: "time" as const,
          params: { duration: 139_733, iterations: "endless", name: "ticker" },
          raw: "UL Top Ticker, translateX 0→-4192px, 140s, endless",
        },
        {
          nodeKey: "Title",
          library: "waapi" as const,
          trigger: "appear" as const,
          params: { duration: 600, iterations: "1" },
          raw: "SPAN Title, blur+opacity, 600ms",
        },
      ],
      findings: [],
    },
  };
}
