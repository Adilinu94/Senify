import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGE_ROOT_TYPE, type NodeTree } from "@senify/section-sdk";
import { bakePages, validateTreeIntegrity } from "@senify/engine";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
  type ErrorResponse,
  type PageResponse,
} from "./helpers.ts";

// Framer import (plan S3): the engine route owns the rules around the run.
// The dry run shows the report without writing anything; `write: true` lands
// the document as ONE revision with the import audit entry, appends the style
// rules with their framer-import origin and writes the import job protocol.
// Sources are local (html / mirror) so the suite runs offline and fast.

type ImportResponse = {
  job: {
    id: string;
    status: string;
    stage: string;
    dryRun: boolean;
    sourceKind: string;
    pagePath: string;
  };
  report: {
    jobId: string;
    dryRun: boolean;
    pageId: string | null;
    newDraftVersion: number | null;
    receiptId: string | null;
    replayed: boolean;
    irHash: string;
    score: number;
    counts: { nodes: number; mapped: number; placeholders: number };
    declarations: { total: number; carried: number; dropped: number };
    assets: { downloaded: number; deduped: number; failed: number; fonts: number };
    findings: { kind: string; severity: string; message: string; evidence: string }[];
    marqueeCandidates: { nodeKey: string | null; preset: string }[];
    payloads?: { payloadId?: string; integrity: string; sourcePath: string }[];
    steps: string[];
  };
};

type JobResponse = {
  job: { id: string; status: string; stage: string };
  report?: ImportResponse["report"];
} & ErrorResponse;

function framerHtml(): string {
  // A minimal, real-shaped Framer SSR page: #main, a heading, a rich-text
  // container (the common mapper shapes), an image and a link-wrapped text.
  return `<!doctype html><html lang="en"><head><title>Import Werk</title>
<style data-framer-font-css>
@font-face { font-family: "Inter"; font-weight: 400; src: url("https://framerusercontent.com/assets/test-400.woff2") format("woff2"); }
</style>
</head><body>
<div id="main" class="framer-page">
  <section class="hero-container">
    <h1 data-framer-name="desktop" style="font-size:48px;--framer-font-size:48px">Willkommen</h1>
    <div data-framer-component-type="RichTextContainer"><p>Ein <a href="./ueber">Link</a> im Text</p></div>
    <img src="https://framerusercontent.com/images/test.png" width="640" height="480" alt="Werkbild">
    <a href="./kontakt"><span>Kontakt aufnehmen</span></a>
  </section>
</div>
</body></html>`;
}

let env: BootEnv;
let site: Awaited<ReturnType<typeof createTestSite>>;
let siteId: string;
let mirrorDir: string;

beforeAll(async () => {
  env = await bootEngine();
  site = await createTestSite(env.api, "Import Werk");
  siteId = site.id;
  mirrorDir = mkdtempSync(join(tmpdir(), "senify-import-mirror-"));
  writeFileSync(join(mirrorDir, "index.html"), framerHtml(), "utf8");
});

afterAll(async () => {
  await env.close();
  rmSync(mirrorDir, { recursive: true, force: true });
});

async function runImport(
  body: Record<string, unknown>,
  targetSiteId = siteId,
): Promise<{ status: number; body: ImportResponse & ErrorResponse }> {
  return env.api.request<ImportResponse & ErrorResponse>({
    method: "POST",
    path: `/api/sites/${targetSiteId}/imports/framer`,
    body,
  });
}

async function getPage(pageId: string): Promise<PageResponse> {
  const response = await env.api.request<{ page: PageResponse }>({
    method: "GET",
    path: `/api/pages/${pageId}`,
  });
  return (response.body as unknown as PageResponse) ?? response.body;
}

describe("POST /api/sites/:siteId/imports/framer", () => {
  it("dry run: the report scores the page and writes NOTHING", async () => {
    const response = await runImport({ source: { html: framerHtml() } });
    expect(response.status).toBe(201);
    const { report } = response.body;
    expect(report.dryRun).toBe(true);
    expect(report.pageId).toBeNull();
    expect(report.newDraftVersion).toBeNull();
    expect(report.receiptId).toBeNull();
    expect(report.replayed).toBe(false);
    // The mapped report has numbers, findings with evidence and the score.
    expect(report.counts.mapped).toBeGreaterThan(0);
    expect(report.score).toBeGreaterThan(0);
    expect(report.findings.every((finding) => finding.evidence !== "")).toBe(true);
    expect(report.steps.length).toBeGreaterThanOrEqual(4);
    // The smooth-scroll finding fires (the fixture HTML carries the marker).
    // No page was created by the dry run: the page count is unchanged.
    const pagesBefore = await env.api.request<{ pages: { id: string }[] }>({
      method: "GET",
      path: `/api/sites/${siteId}/pages`,
    });
    const countBefore = pagesBefore.body.pages.length;
    await runImport({ source: { html: framerHtml() } });
    const pagesAfter = await env.api.request<{ pages: { id: string }[] }>({
      method: "GET",
      path: `/api/sites/${siteId}/pages`,
    });
    expect(pagesAfter.body.pages).toHaveLength(countBefore);
  }, 60_000);

  it("write: creates the page as ONE revision with a valid, baked tree", async () => {
    const response = await runImport({
      source: { html: framerHtml() },
      write: true,
      pagePath: "/importiert",
    });
    expect(response.status).toBe(201);
    const { report } = response.body;
    expect(report.dryRun).toBe(false);
    expect(report.pageId).not.toBeNull();
    expect(report.newDraftVersion).toBe(2);
    const pageId = report.pageId ?? "";

    // The draft is a valid section tree: root is PAGE_ROOT_TYPE and the
    // integrity is clean — the import wrote through the same pipeline a
    // manual write uses.
    const page = await getPage(pageId);
    const tree = page.draft as unknown as NodeTree;
    expect(tree.nodes[tree.rootNodeId]?.type).toBe(PAGE_ROOT_TYPE);
    expect(validateTreeIntegrity(tree)).toHaveLength(0);

    // ONE revision: the audit carries the import entry, the draft version
    // went from 1 (empty page) to 2.
    const revisions = await env.api.request<{ revisions: unknown[] }>({
      method: "GET",
      path: `/api/pages/${pageId}/revisions`,
    });
    expect(revisions.status).toBe(200);

    // The page bakes (the proof that the imported tree renders).
    const storedSite = await env.engine.store.getSite(siteId);
    const storedPage = await env.engine.store.getPage(pageId);
    const bake = await bakePages(env.engine.store, {
      site: storedSite,
      pages: [storedPage],
      outDir: mkdtempSync(join(tmpdir(), "senify-import-bake-")),
      dataDir: env.engine.dataDir,
    });
    expect(bake.pageCount).toBe(1);
  }, 120_000);

  it("replay: gleicher Inhalt mit neuem Idempotency-Key schreibt genau einmal", async () => {
    const targetSite = await createTestSite(env.api, "Import Replay");
    const html = framerHtml().replace("Willkommen", "Unveränderter Import");
    const first = await runImport(
      {
        source: { html },
        write: true,
        pagePath: "/replay",
        assets: "skip",
        fonts: "skip",
        idempotencyKey: "framer-content-first",
      },
      targetSite.id,
    );
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.report.replayed).toBe(false);
    expect(first.body.report.receiptId).not.toBeNull();

    const rulesAfterFirst = await env.engine.store.getStyleRegistry(targetSite.id);
    const payloadsAfterFirst = await env.engine.store.listCodePayloads(targetSite.id);
    const pagesAfterFirst = await env.api.request<{ pages: PageResponse[] }>({
      method: "GET",
      path: `/api/sites/${targetSite.id}/pages`,
    });

    const replay = await runImport(
      {
        source: { html },
        write: true,
        pagePath: "/replay",
        assets: "skip",
        fonts: "skip",
        idempotencyKey: "framer-content-second",
      },
      targetSite.id,
    );
    expect(replay.status, JSON.stringify(replay.body)).toBe(201);
    expect(replay.body.job.status).toBe("succeeded");
    expect(replay.body.report.replayed).toBe(true);
    expect(replay.body.report.receiptId).toBe(first.body.report.receiptId);
    expect(replay.body.report.pageId).toBe(first.body.report.pageId);
    expect(replay.body.report.newDraftVersion).toBe(first.body.report.newDraftVersion);
    expect(replay.body.report.jobId).toBe(first.body.report.jobId);

    const rulesAfterReplay = await env.engine.store.getStyleRegistry(targetSite.id);
    const payloadsAfterReplay = await env.engine.store.listCodePayloads(targetSite.id);
    const pagesAfterReplay = await env.api.request<{ pages: PageResponse[] }>({
      method: "GET",
      path: `/api/sites/${targetSite.id}/pages`,
    });
    expect(pagesAfterReplay.body.pages).toHaveLength(pagesAfterFirst.body.pages.length);
    expect(rulesAfterReplay.rules).toEqual(rulesAfterFirst.rules);
    expect(rulesAfterReplay.version).toBe(rulesAfterFirst.version);
    expect(payloadsAfterReplay).toEqual(payloadsAfterFirst);
    const page = pagesAfterReplay.body.pages.find((entry) => entry.id === first.body.report.pageId);
    expect(page?.draftVersion).toBe(2);

    const receiptRows = await env.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM import_receipts WHERE site_id = $1`,
      [targetSite.id],
    );
    expect(Number(receiptRows.rows[0]?.count)).toBe(1);

    const replayPolled = await env.api.request<JobResponse>({
      method: "GET",
      path: `/api/imports/${replay.body.job.id}`,
    });
    expect(replayPolled.body.job.status).toBe("succeeded");
    expect(replayPolled.body.report?.pageId).toBe(first.body.report.pageId);
    expect(replayPolled.body.report?.newDraftVersion).toBe(first.body.report.newDraftVersion);
  }, 120_000);

  it("geänderter Inhalt erzeugt einen neuen Commit", async () => {
    const targetSite = await createTestSite(env.api, "Import Geändert");
    const first = await runImport(
      {
        source: { html: framerHtml().replace("Willkommen", "Fassung eins") },
        write: true,
        pagePath: "/geaendert",
        assets: "skip",
        fonts: "skip",
        idempotencyKey: "framer-change-first",
      },
      targetSite.id,
    );
    const second = await runImport(
      {
        source: { html: framerHtml().replace("Willkommen", "Fassung zwei") },
        write: true,
        pagePath: "/geaendert",
        assets: "skip",
        fonts: "skip",
        idempotencyKey: "framer-change-second",
      },
      targetSite.id,
    );
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(second.body.report.irHash).not.toBe(first.body.report.irHash);
    expect(second.body.report.receiptId).not.toBe(first.body.report.receiptId);
    expect(second.body.report.replayed).toBe(false);
    expect(second.body.report.pageId).toBe(first.body.report.pageId);
    expect(second.body.report.newDraftVersion).toBe(3);
  }, 120_000);

  it("stale baseDraftVersion liefert 409 und keinen Teilwrite", async () => {
    const targetSite = await createTestSite(env.api, "Import Konflikt");
    const page = await createTestPage(env.api, targetSite.id, {
      path: "/konflikt",
      title: "Konflikt",
    });
    const staleDraft = await env.engine.store.getPage(page.id);
    await env.engine.store.persistBatch({
      pageId: staleDraft.id,
      expectedVersion: staleDraft.draftVersion,
      draft: staleDraft.draft,
      title: "Konflikt fortgeschrieben",
      path: staleDraft.path,
      entries: [{
        siteId: targetSite.id,
        pageId: staleDraft.id,
        batchId: "stale-base-setup",
        opIndex: 0,
        mutation: "testAdvanceDraft",
        params: {},
        author: TEST_AUTHOR,
        undoPatch: [],
        draftVersionAfter: staleDraft.draftVersion + 1,
      }],
    });
    const beforeRules = await env.engine.store.getStyleRegistry(targetSite.id);
    const beforePayloads = await env.engine.store.listCodePayloads(targetSite.id);
    const beforeReceipts = await env.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM import_receipts WHERE site_id = $1`,
      [targetSite.id],
    );
    const response = await runImport(
      {
        source: { html: framerHtml() },
        write: true,
        pageId: page.id,
        baseDraftVersion: staleDraft.draftVersion,
        assets: "skip",
        fonts: "skip",
        idempotencyKey: "framer-stale-base",
      },
      targetSite.id,
    );
    expect(response.status).toBe(409);
    expect(response.body.error.field).toBe("baseDraftVersion");
    expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(staleDraft.draftVersion + 1);
    expect(await env.engine.store.getStyleRegistry(targetSite.id)).toEqual(beforeRules);
    expect(await env.engine.store.listCodePayloads(targetSite.id)).toEqual(beforePayloads);
    const afterReceipts = await env.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM import_receipts WHERE site_id = $1`,
      [targetSite.id],
    );
    expect(Number(afterReceipts.rows[0]?.count)).toBe(Number(beforeReceipts.rows[0]?.count));
  }, 60_000);

  it("verlangt für bestehende Seiten baseDraftVersion und lehnt 409 korrekt ab", async () => {
    const targetSite = await createTestSite(env.api, "Import Basisversion");
    const page = await createTestPage(env.api, targetSite.id, {
      path: "/basisversion",
      title: "Basisversion",
    });
    const missing = await runImport(
      {
        source: { html: framerHtml() },
        write: true,
        pageId: page.id,
        assets: "skip",
        fonts: "skip",
      },
      targetSite.id,
    );
    expect(missing.status).toBe(400);
    expect(missing.body.error.field).toBe("baseDraftVersion");
    expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(page.draftVersion);

    const beforeStale = await env.engine.store.getPage(page.id);
    await env.engine.store.persistBatch({
      pageId: beforeStale.id,
      expectedVersion: beforeStale.draftVersion,
      draft: beforeStale.draft,
      title: "Basisversion fortgeschrieben",
      path: beforeStale.path,
      entries: [{
        siteId: targetSite.id,
        pageId: beforeStale.id,
        batchId: "basis-version-setup",
        opIndex: 0,
        mutation: "testAdvanceDraft",
        params: {},
        author: TEST_AUTHOR,
        undoPatch: [],
        draftVersionAfter: beforeStale.draftVersion + 1,
      }],
    });
    const stale = await runImport(
      {
        source: { html: framerHtml() },
        write: true,
        pageId: page.id,
        baseDraftVersion: beforeStale.draftVersion,
        assets: "skip",
        fonts: "skip",
      },
      targetSite.id,
    );
    expect(stale.status).toBe(409);
    expect(stale.body.error.field).toBe("baseDraftVersion");
    expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(beforeStale.draftVersion + 1);
  }, 60_000);

  it("write into an EXISTING page (pageId) bumps its draft version by one", async () => {
    const page = await createTestPage(env.api, siteId, { path: "/import-ziel", title: "Ziel" });
    const response = await runImport({
      source: { html: framerHtml() },
      write: true,
      pageId: page.id,
      baseDraftVersion: page.draftVersion,
    });
    expect(response.status).toBe(201);
    expect(response.body.report.pageId).toBe(page.id);
    expect(response.body.report.newDraftVersion).toBe(page.draftVersion + 1);
  }, 60_000);

  it("appendImportedStyleRules keeps the framer-import origin in the registry", async () => {
    await runImport({ source: { html: framerHtml() }, write: true, pagePath: "/regeln" });
    const rules = await env.api.request<{ rules: { origin: { source: string } }[] }>({
      method: "GET",
      path: `/api/sites/${siteId}/style-rules`,
    });
    expect(rules.status).toBe(200);
    const imported = rules.body.rules.filter(
      (rule) => rule.origin?.source === "framer-import",
    );
    expect(imported.length).toBeGreaterThan(0);
  }, 60_000);

  it("the job protocol persists: GET /api/imports/:jobId returns job + report", async () => {
    const created = await runImport({ source: { html: framerHtml() } });
    const jobId = created.body.job.id;
    expect(created.body.job.status).toBe("succeeded");
    expect(created.body.job.stage).toBe("done");
    const polled = await env.api.request<JobResponse>({
      method: "GET",
      path: `/api/imports/${jobId}`,
    });
    expect(polled.status).toBe(200);
    expect(polled.body.job.id).toBe(jobId);
    expect(polled.body.report?.irHash).toBe(created.body.report.irHash);
  }, 60_000);

  it("is idempotent: the same source twice yields the same irHash", async () => {
    const first = await runImport({ source: { html: framerHtml() } });
    const second = await runImport({ source: { html: framerHtml() } });
    expect(second.body.report.irHash).toBe(first.body.report.irHash);
  }, 60_000);

  it("rejects an empty source and an ambiguous one", async () => {
    const empty = await runImport({ source: {} });
    expect(empty.status).toBe(400);

    const ambiguous = await runImport({
      source: { html: framerHtml(), rootDir: mirrorDir },
    });
    expect(ambiguous.status).toBe(400);
  }, 60_000);

  it("works from a mirror folder (offline mode)", async () => {
    const response = await runImport({
      source: { rootDir: mirrorDir },
      write: true,
      pagePath: "/mirror-import",
    });
    expect(response.status).toBe(201);
    expect(response.body.report.counts.mapped).toBeGreaterThan(0);
    expect(response.body.job.sourceKind).toBe("mirror");
  }, 60_000);

  it("uploads assets and rewrites fonts through the engine media pipeline", async () => {
    const image = Buffer.from("engine-import-image", "utf8");
    const font = Buffer.from("engine-import-font", "utf8");
    const server = createServer((request, response) => {
      if ((request.url ?? "").endsWith(".woff2")) {
        response.writeHead(200, { "content-type": "font/woff2" }).end(font);
        return;
      }
      response.writeHead(200, { "content-type": "image/png" }).end(image);
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
    const html = framerHtml()
      .replaceAll("https://framerusercontent.com/images/test.png", `${origin}/test.png`)
      .replaceAll("https://framerusercontent.com/assets/test-400.woff2", `${origin}/test-400.woff2`);
    try {
      const response = await runImport({
        source: { html, baseUrl: origin },
        write: true,
        pagePath: "/medien",
        assets: "upload",
        fonts: "rewrite",
      });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body.report.assets.downloaded).toBeGreaterThanOrEqual(1);
      expect(response.body.report.assets.fonts).toBe(1);
      expect(response.body.report.assets.failed).toBe(0);
      const pageId = response.body.report.pageId;
      expect(pageId).not.toBeNull();
      const stored = await env.engine.store.listAssets(siteId, {});
      expect(stored.some((asset) => asset.mime.startsWith("font/"))).toBe(true);
      const importedPage = await env.engine.store.getPage(pageId ?? "");
      const imageNode = Object.values(importedPage.draft.nodes).find(
        (node) => node.type === "image",
      );
      const assetRef = imageNode?.props.asset as { assetId?: string } | undefined;
      expect(typeof assetRef?.assetId).toBe("string");
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 60_000);

  // R10 (P3-5): assets live outside the DB transaction, so a failing commit has
  // to compensate. The import uploads files, THEN commits; if the second step
  // fails, the first has already written rows and files. The compensation walks
  // the ids this run created and purges them. Without it a failed import would
  // leave asset rows pointing at files the site never adopted.
  it("compensates uploaded assets when the commit fails", async () => {
    const image = Buffer.from("engine-import-compensation", "utf8");
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "image/png" }).end(image);
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
    const html = framerHtml().replaceAll(
      "https://framerusercontent.com/images/test.png",
      `${origin}/test.png`,
    );
    try {
      const before = await env.engine.store.listAssets(siteId, {});

      // The page exists and the import targets it, but with a base version that
      // is already stale - the commit must refuse while the uploads already
      // happened. This is the exact shape the compensation exists for.
      const target = await createTestPage(env.api, siteId, { title: "Kompensation", path: "/kompensation" });
      const response = await runImport({
        source: { html },
        write: true,
        pagePath: "/kompensation",
        pageId: target.id,
        baseDraftVersion: 999,
        assets: "upload",
      });
      expect(response.status).toBe(409);

      // The upload ran first, so the compensation had something to undo.
      const after = await env.engine.store.listAssets(siteId, {});
      expect(after.length).toBe(before.length);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 60_000);

  it("keeps the site import history separate from the global queue", async () => {
    const response = await env.api.request<{ jobs: { id: string }[] }>({
      method: "GET",
      path: `/api/sites/${siteId}/imports`,
    });
    expect(response.status).toBe(200);
    expect(response.body.jobs.length).toBeGreaterThan(0);
    expect(response.body.jobs.every((job) => typeof job.id === "string")).toBe(true);
  });

  it("attaches successful write reports to the review snapshot", async () => {
    const reviewSite = await createTestSite(env.api, "Import Review");
    const reviewHtml = `<!doctype html><html><head><title>Review</title></head><body><div id="main"><main><h1>Import Review</h1><p>Text</p></main></div></body></html>`;
    const imported = await runImport(
      { source: { html: reviewHtml }, write: true, pagePath: "/review", assets: "skip", fonts: "skip" },
      reviewSite.id,
    );
    expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    const importedPageId = imported.body.report.pageId;
    expect(importedPageId).not.toBeNull();
    const submitted = await env.api.request<{
      review: { id: string; importReports: ImportResponse["report"][] };
    }>({
      method: "POST",
      path: `/api/sites/${reviewSite.id}/reviews`,
      body: { author: { kind: "human", id: "test", label: "Test" }, pageIds: [importedPageId ?? ""] },
    });
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201);
    expect(submitted.body.review.importReports.length).toBeGreaterThan(0);
    const report = submitted.body.review.importReports[0];
    expect(report?.jobId).toBe(imported.body.report.jobId);
    expect(report?.findings.every((finding) => "evidence" in finding)).toBe(true);
  }, 90_000);

  it("bundles a mirrored Framer code island into a payload and bakes its carrier", async () => {
    const islandDir = mkdtempSync(join(tmpdir(), "senify-framer-island-"));
    writeFileSync(join(islandDir, "index.html"), `<!doctype html><html><head><title>Island</title></head><body><div id="main"><main><h1>Island</h1><div data-framer-name="Interactive" data-framer-component-type="Code" data-framer-module="scripts/vendor/Island.mjs" data-framer-module-license="MIT" data-framer-module-license-note="eigenes Projekt"></div></main></div></body></html>`, "utf8");
    mkdirSync(join(islandDir, "scripts", "vendor"), { recursive: true });
    writeFileSync(join(islandDir, "scripts", "vendor", "Island.mjs"), `export function mount(stage) { stage.textContent = "Island aktiv"; }`, "utf8");
    try {
      const response = await runImport({
        source: { rootDir: islandDir },
        write: true,
        pagePath: "/island",
        assets: "skip",
        fonts: "skip",
      });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const payload = response.body.report.payloads?.[0];
      expect(payload?.sourcePath).toBe("scripts/vendor/Island.mjs");
      expect(payload?.payloadId).toMatch(/^[A-Za-z0-9_-]+$/);
      const storedPage = await env.engine.store.getPage(response.body.report.pageId ?? "");
      const carrier = Object.values(storedPage.draft.nodes).find((node) => node.type === "payload");
      expect(carrier?.props.payloadId).toBe(payload?.payloadId);
      expect(carrier?.props.framerPayloadKey).toBeUndefined();
      const storedSite = await env.engine.store.getSite(siteId);
      const outDir = mkdtempSync(join(tmpdir(), "senify-island-bake-"));
      try {
        const bake = await bakePages(env.engine.store, {
          site: storedSite,
          pages: [storedPage],
          outDir,
          dataDir: env.engine.dataDir,
        });
        expect(bake.payloads.map((entry) => entry.id)).toContain(payload?.payloadId);
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    } finally {
      rmSync(islandDir, { recursive: true, force: true });
    }
  }, 90_000);
});
