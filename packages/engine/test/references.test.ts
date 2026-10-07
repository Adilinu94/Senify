import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultTheme } from "@senify/tokens";
import {
  analyzeReference,
  applyReference,
  buildReferenceProfile,
  capEvidenceLevel,
  deriveThemeDraft,
  detectGpu,
  evidenceClaim,
  extractReference,
  heuristicAnalyzer,
  markConflicts,
  materializeThemeDraft,
  mergeEvidence,
  ReferenceCaptureError,
  referenceBackoffMs,
  referenceThemeDraft,
  runDueReferenceJobs,
  tokenClaim,
  verifyThemeRoundTrip,
  type CaptureInput,
  type ReferenceContext,
} from "@senify/engine";
import { bootEngine, createTestPage, createTestSite, TEST_AUTHOR, type BootEnv } from "./helpers.ts";

// Fixture snapshot of a dark, violet-accented studio site: runtime samples
// (measured) plus markup (observed). No network, no browser.
const REFERENCE_HTML = `<!doctype html>
<html><head>
<title>Studio Nord</title>
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
<style>
  :root { --sn-color-bg: #0b0b0f; --sn-color-accent: #7c5cff; --sn-space-unit: 8px; --sn-radius: 12px; }
  body { background: #0b0b0f; color: #f5f5f7; font-family: 'Inter', system-ui, sans-serif; font-size: 17px; line-height: 1.6; font-weight: 400; padding: 16px; }
  h1 { font-family: 'Sora', system-ui, sans-serif; font-size: 64px; line-height: 1.05; font-weight: 700; }
  h2 { font-family: 'Sora', system-ui, sans-serif; font-size: 40px; line-height: 1.15; font-weight: 600; }
  .card { background: #15151c; border-radius: 12px; padding: 24px; box-shadow: 0 12px 32px rgb(0 0 0 / 35%); }
  .btn { background: #7c5cff; color: #0b0b0f; border-radius: 999px; padding: 12px 24px; }
  .btn:hover { background: #9078ff; }
  a { color: #7c5cff; }
  @media (min-width: 1024px) { body { font-size: 18px; } }
  @media (min-width: 640px) { .card { padding: 32px; } }
</style>
</head>
<body>
<nav class="nav"><a href="/" class="btn">Kontakt</a></nav>
<section class="hero"><h1>Studio Nord</h1><p>Design und Bewegung.</p><button class="btn">Projekt starten</button></section>
<div class="card">Karte</div>
<footer class="footer">Studio Nord</footer>
<script src="https://cdn.example.test/gsap.min.js"></script>
<script src="https://cdn.example.test/ScrollTrigger.min.js"></script>
<script src="https://cdn.example.test/three.min.js"></script>
</body></html>`;

const SNAPSHOT: Record<string, unknown> = {
  html: REFERENCE_HTML,
  breakpoints: [1440, 810, 390],
  computedSamples: [
    { breakpoint: "desktop", kind: "color", role: "icon", value: "#7c5cff", where: ".btn", source: "runtime" },
    { breakpoint: "desktop", kind: "color", role: "bg", value: "#0b0b0f", where: "body", source: "runtime" },
    { breakpoint: "desktop", kind: "color", role: "text", value: "#f5f5f7", where: "body", source: "runtime" },
    { breakpoint: "mobile", kind: "color", role: "bg", value: "#0b0b0f", where: "body", source: "runtime" },
    { breakpoint: "tablet", kind: "color", role: "bg", value: "#0b0b0f", where: "body", source: "runtime" },
    { breakpoint: "desktop", kind: "color", role: "bg", value: "#15151c", where: ".card", source: "runtime" },
    { breakpoint: "desktop", kind: "color", role: "text", value: "#f5f5f7", where: ".hero p", source: "runtime" },
    { breakpoint: "desktop", kind: "radius", role: "default", value: "12px", where: ".card", source: "runtime" },
    { breakpoint: "tablet", kind: "radius", role: "default", value: "12px", where: ".card", source: "runtime" },
    { breakpoint: "desktop", kind: "spacing", role: "padding", value: "24px", where: ".card", source: "runtime" },
    { breakpoint: "tablet", kind: "spacing", role: "padding", value: "24px", where: ".card", source: "runtime" },
    { breakpoint: "desktop", kind: "font", role: "body", value: "Inter, system-ui, sans-serif", where: "body", source: "runtime" },
    { breakpoint: "desktop", kind: "font", role: "display", value: "Sora, system-ui, sans-serif", where: "h1", source: "runtime" },
  ],
  motion: {
    libraries: ["gsap", "scrolltrigger", "three"],
    reveals: [
      { name: "split-text", mechanism: "GSAP SplitText", params: { duration: "0.8s", ease: "power3.out" }, where: ".hero h1", uses: 3 },
      { name: "grain", mechanism: "Grain-Overlay via CSS", where: ".grain" },
    ],
    scrollTriggers: [
      {
        trigger: ".hero",
        pin: true,
        scrub: true,
        start: "top top",
        end: "bottom top",
        animationTargets: [".hero h1"],
      },
    ],
    transitions: [
      { property: "box-shadow", duration: "300ms", timing: "cubic-bezier(0.4, 0, 0.2, 1)", where: ".card", uses: 4 },
    ],
  },
  surfaces: [{ kind: "video", detail: "hero background video", live: true, where: ".hero video" }],
};

const FIXTURE_INPUT: CaptureInput = {
  url: "https://studio-nord.test",
  method: "playwright",
  markup: REFERENCE_HTML,
  computedSamples: SNAPSHOT.computedSamples as CaptureInput["computedSamples"],
  breakpoints: SNAPSHOT.breakpoints as number[],
  motion: SNAPSHOT.motion as CaptureInput["motion"],
  surfaces: SNAPSHOT.surfaces as CaptureInput["surfaces"],
};

async function fixtureProfile(input: CaptureInput = FIXTURE_INPUT) {
  const extraction = extractReference(input);
  const analyzer = heuristicAnalyzer();
  const output = await analyzer({ url: input.url, name: "Studio Nord", extraction });
  return buildReferenceProfile({
    url: input.url,
    capturedAt: "2026-09-15T10:00:00.000Z",
    extraction,
    analyzer: output,
  });
}

describe("reference extraction (T14)", () => {
  it("ranks tokens by frequency with Belegstellen per breakpoint", () => {
    const extraction = extractReference({
      url: "https://example.test",
      method: "playwright",
      markup: `<style>:root { --brand: #7c5cff }</style>`,
      computedSamples: [
        { breakpoint: "desktop", kind: "color", role: "bg", value: "#0b0b0f", where: ".hero" },
        { breakpoint: "mobile", kind: "color", role: "bg", value: "#0b0b0f", where: ".hero" },
        { breakpoint: "desktop", kind: "color", role: "bg", value: "#123456", where: ".one-off" },
        { breakpoint: "desktop", kind: "radius", role: "default", value: "12px", where: ".card" },
        { breakpoint: "mobile", kind: "radius", role: "default", value: "12px", where: ".card" },
      ],
    });
    const background = extraction.tokens.color.find((token) => token.value === "#0b0b0f");
    expect(background?.uses).toBe(2);
    expect(background?.where).toEqual(["desktop:.hero", "mobile:.hero"]);
    expect(background?.level).toBe("confirmed");
    // One-off values (a single occurrence) are not part of the system.
    expect(extraction.tokens.color.some((token) => token.value === "#123456")).toBe(false);
    expect(extraction.tokens.radius[0]?.value).toBe("12px");
    expect(extraction.customProperties).toEqual([
      { name: "--brand", value: "#7c5cff", role: "color" },
    ]);
  });

  it("keeps anchors, breakpoints and observed levels from the markup fallback", () => {
    const extraction = extractReference({
      url: "https://example.test",
      method: "snapshot",
      markup: `<style>
        body { background: #ffffff; color: #111111; font-size: 16px; }
        h1 { font-size: 48px; line-height: 1.1; font-weight: 700 }
        @media (min-width: 1024px) { h1 { font-size: 64px; line-height: 1.05; font-weight: 700 } }
        @media (min-width: 640px) { .card { padding: 32px } }
      </style>`,
    });
    expect(extraction.reduced).toBe(true);
    expect(extraction.breakpoints).toEqual([640, 1024]);
    // Body anchors survive even though they paint a single time.
    expect(extraction.tokens.color.some((token) => token.value === "#ffffff")).toBe(true);
    // The snapshot path observes, it never measures.
    expect(extraction.tokens.color.every((token) => token.level === "observed")).toBe(true);
    const desktopHeading = extraction.tokens.type.find((step) => step.size === "64px");
    expect(desktopHeading?.where[0]).toBe("desktop:h1@1024");
    expect(desktopHeading?.level).toBe("observed");
  });

  it("maps motion reveals to the preset catalog and flags lazy GPU", () => {
    const recipes = extractReference(FIXTURE_INPUT).motion;
    const split = recipes.find((recipe) => recipe.name === "split-text");
    expect(split?.preset).toBe("char-split");
    expect(split?.params).toEqual({ duration: "0.8s", ease: "power3.out" });
    const grain = recipes.find((recipe) => recipe.name === "grain");
    expect(grain?.preset).toBeNull();
    expect(grain?.mechanism).toContain("v1-Katalogs");
    const pin = recipes.find((recipe) => recipe.name === "pinned-section");
    expect(pin?.preset).toBe("scrub-pin");
    expect(pin?.params).toEqual({ start: "top top", end: "bottom top", scrub: "true", pin: "true" });

    const gpu = detectGpu(false, [], ["three", "gsap", "spline"]);
    expect(gpu.platforms).toEqual(["three", "spline"]);
    expect(gpu.lazyWarning).toContain("lazy/interaction-gated");
    const live = detectGpu(false, [{ kind: "canvas", detail: "canvas", level: "confirmed", note: "live" }], ["three"]);
    expect(live.lazyWarning).toBeNull();
  });

  it("reads breakpoints (px and em) and the :root vocabulary roles", () => {
    const extraction = extractReference({
      url: "https://example.test",
      method: "snapshot",
      markup: `<style>
        :root { --sn-color-brand: #7c5cff; --sn-space-unit: 8px; --sn-radius: 12px; --unmapped: 1px }
        @media (min-width: 40em) { .a { padding: 24px } }
        @media (min-width: 1280px) { .b { padding: 24px } }
      </style>`,
      breakpoints: [390],
    });
    // 40em folds to 640px; the explicit capture breakpoint stays in the set.
    expect(extraction.breakpoints).toEqual([390, 640, 1280]);
    expect(extraction.customProperties).toEqual([
      { name: "--sn-color-brand", value: "#7c5cff", role: "color" },
      { name: "--sn-space-unit", value: "8px", role: "space" },
      { name: "--sn-radius", value: "12px", role: "radius" },
      { name: "--unmapped", value: "1px", role: null },
    ]);
  });

  it("keeps a snapshot-only profile observed, never confirmed", () => {
    const extraction = extractReference({
      url: "https://example.test",
      method: "snapshot",
      markup: `<style>
        body { background: #ffffff; color: #111111 }
        .card { background: #15151c; border-radius: 8px }
        .panel { background: #15151c; border-radius: 8px }
      </style>`,
    });
    expect(extraction.reduced).toBe(true);
    // The frequency survivor is a markup value, so it can only be observed.
    const surface = extraction.tokens.color.find((token) => token.value === "#15151c");
    expect(surface?.uses).toBe(2);
    expect(surface?.level).toBe("observed");
    expect(extraction.tokens.color.every((token) => token.level === "observed")).toBe(true);
    expect(extraction.evidence.every((entry) => entry.level !== "confirmed")).toBe(true);
  });

  it("detects a markup canvas as live surface and drops one-off transitions", () => {
    const extraction = extractReference({
      url: "https://example.test",
      method: "playwright",
      markup: `<canvas></canvas><script src="/three.min.js"></script>`,
      motion: {
        transitions: [
          { property: "transform", duration: "200ms", timing: "ease", where: ".one-off", uses: 1 },
        ],
      },
    });
    expect(extraction.gpu.platforms).toEqual(["three"]);
    expect(extraction.gpu.hasLiveCanvas).toBe(true);
    expect(extraction.gpu.lazyWarning).toBeNull();
    expect(extraction.surfaces.some((surface) => surface.kind === "canvas")).toBe(true);
    // A transition with a single occurrence is a one-off, not a motion recipe.
    expect(extraction.motion.some((recipe) => recipe.name === "transition:transform")).toBe(false);
  });

  it("never upgrades evidence and marks contradictions", () => {
    expect(capEvidenceLevel("confirmed", "inferred")).toBe("inferred");
    expect(capEvidenceLevel("inferred", "confirmed")).toBe("inferred");
    const merged = mergeEvidence(
      [evidenceClaim(tokenClaim("color.bg", "#0b0b0f"), "confirmed", "runtime: body")],
      [evidenceClaim(tokenClaim("color.bg", "#0b0b0f"), "inferred", "llm:model-x")],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.level).toBe("confirmed");
    const conflicts = markConflicts([
      evidenceClaim(tokenClaim("color.bg", "#0b0b0f"), "confirmed", "runtime: body"),
      evidenceClaim(tokenClaim("color.bg", "#ffffff"), "observed", "markup: html"),
    ]);
    expect(conflicts.every((entry) => entry.conflictWith !== undefined)).toBe(true);
  });

  it("profiles the fixture with style brief, guardrails and evidence", async () => {
    const { profile, evidence } = await fixtureProfile();
    // Frequenz-Prinzip (research/29 §2.3, Ticket-Teil-2 Punkt 1): the palette is
    // ordered by how often a value actually paints, so the most-used neutral
    // (the body background, sampled on three breakpoints) leads and the accent
    // follows right behind. Deriving the brand is the theme layer's job and is
    // checked below (draft.scales.brand === "#7c5cff").
    const uses = profile.tokens.color.map((token) => token.uses);
    expect(uses).toEqual([...uses].sort((a, b) => b - a));
    expect(profile.tokens.color.map((token) => token.value)).toContain("#7c5cff");
    expect(profile.families.length).toBeGreaterThan(0);
    expect(profile.vocabulary.length).toBeGreaterThanOrEqual(5);
    expect(profile.vocabulary.length).toBeLessThanOrEqual(8);
    expect(profile.rules.never).toContain("Logos und Marken-Assets nie uebernehmen");
    expect(profile.guardrails.some((finding) => finding.code === "brand-assets")).toBe(true);
    expect(profile.guardrails.some((finding) => finding.code === "license-font")).toBe(true);
    expect(profile.styleBrief).toContain("Reference https://studio-nord.test");
    expect(profile.components.map((component) => component.name)).toContain("hero");
    expect(evidence.some((entry) => entry.level === "confirmed")).toBe(true);
    expect(evidence.some((entry) => entry.level === "observed")).toBe(true);
  });

  it("derives a theme draft that survives the round trip", async () => {
    const { profile } = await fixtureProfile();
    const draft = deriveThemeDraft({
      assignments: [
        { referenceId: "ref-1", name: "Studio Nord", profile, scales: ["color", "type", "motion", "rest"] },
      ],
    });
    expect(draft.scales.brand).toBe("#7c5cff");
    expect(draft.scales.typeBase).toBe(17);
    expect(draft.fonts.body?.family).toBe("Inter");
    expect(draft.motion.duration?.base).toBe("300ms");
    const verification = verifyThemeRoundTrip(draft, defaultTheme());
    expect(verification.issues).toEqual([]);
    expect(verification.ok).toBe(true);
    const materialized = materializeThemeDraft(draft, defaultTheme());
    expect(materialized.scales.brand).toBe("#7c5cff");
    expect(materialized.scales.typeBase).toBe(17);
  });

  it("backs off retries exponentially", () => {
    expect(referenceBackoffMs(1)).toBe(1000);
    expect(referenceBackoffMs(3)).toBe(4000);
    expect(referenceBackoffMs(40)).toBe(60_000);
  });
});

describe("reference pipeline over the API (T14)", () => {
  let env: BootEnv;

  beforeAll(async () => {
    env = await bootEngine();
  });

  afterAll(async () => {
    await env.close();
  });

  async function analyzeViaApi(url: string, name: string): Promise<string> {
    const response = await env.api.request<{ reference: { id: string; status: string } }>({
      method: "POST",
      path: "/api/references",
      body: { url, name, author: TEST_AUTHOR, snapshot: SNAPSHOT },
    });
    expect(response.status).toBe(201);
    expect(response.body.reference.status).toBe("ready");
    return response.body.reference.id;
  }

  it("analyses a reference from a snapshot and makes it usable right away", async () => {
    const response = await env.api.request<{
      reference: {
        id: string;
        status: string;
        progress: number;
        revision: number;
        styleBrief: string;
        families: string[];
        vocabulary: string[];
        snapshots: unknown[];
        provenance: { hash: string; method: string };
        profile: {
          tokens: { color: { value: string; uses: number; where: string[] }[] };
          motion: { name: string; preset: string | null }[];
          reduced: boolean;
        };
      };
      job: { status: string; progress: number; attempts: number };
    }>({
      method: "POST",
      path: "/api/references",
      body: { url: "https://studio-nord.test", name: "Studio Nord", author: TEST_AUTHOR, snapshot: SNAPSHOT },
    });
    expect(response.status).toBe(201);
    const { reference, job } = response.body;
    expect(reference.status).toBe("ready");
    expect(reference.progress).toBe(100);
    expect(reference.revision).toBe(1);
    expect(job.status).toBe("done");
    expect(job.progress).toBe(100);
    expect(job.attempts).toBe(1);
    expect(reference.provenance.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(reference.provenance.method).toBe("snapshot");
    expect(reference.profile.reduced).toBe(true);
    expect(reference.profile.tokens.color.some((token) => token.uses >= 2)).toBe(true);
    expect(reference.profile.motion.some((recipe) => recipe.preset === "char-split")).toBe(true);
    expect(reference.styleBrief).toContain("Families:");
    expect(reference.families.length).toBeGreaterThan(0);
    expect(reference.vocabulary.length).toBeGreaterThanOrEqual(5);

    const list = await env.api.request<{
      references: { id: string; usedInProjects: string[]; status: string }[];
    }>({ method: "GET", path: "/api/references?q=studio&status=ready" });
    expect(list.status).toBe(200);
    expect(list.body.references.map((entry) => entry.id)).toContain(reference.id);
    expect(list.body.references[0]?.usedInProjects).toEqual([]);
  });

  it("never hands a private address to a capture driver", async () => {
    vi.stubEnv("SENIFY_ALLOW_PRIVATE_URLS", "");
    try {
      let started = 0;
      const context: ReferenceContext = {
        store: env.engine.store,
        dataDir: env.engine.dataDir,
        deps: {
          capture: async () => {
            started += 1;
            return { markup: "<h1>nie</h1>" };
          },
        },
      };
      for (const url of ["http://127.0.0.1:4322/api/sites", "http://169.254.169.254/latest/"]) {
        const result = await analyzeReference(context, { url, author: TEST_AUTHOR });
        expect(result.reference.status, url).toBe("failed");
        expect(result.reference.failureReason, url).toContain("blocked");
        expect(result.job.lastError, url).toContain("SENIFY_ALLOW_PRIVATE_URLS");
      }
      expect(started).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("fails a blocked site with a clear cause and accepts the snapshot fallback", async () => {
    const blocked: ReferenceContext = {
      store: env.engine.store,
      dataDir: env.engine.dataDir,
      deps: {
        capture: async () => {
          throw new ReferenceCaptureError({
            reason: "blocked",
            message: "Die Seite hat die Analyse blockiert (HTTP 403)",
            suggestion: "Screenshot-/HTML-Snapshot hochladen (pageHtml)",
            retryable: false,
          });
        },
      },
    };
    const failed = await analyzeReference(blocked, {
      url: "https://blocked.test",
      author: TEST_AUTHOR,
    });
    expect(failed.reference.status).toBe("failed");
    expect(failed.reference.failureReason).toContain("blocked");
    expect(failed.job.status).toBe("failed");
    expect(failed.job.lastError).toContain("Snapshot");
    expect(failed.reference.progress).toBeLessThan(100);

    const fallback = await analyzeReference(blocked, {
      url: "https://blocked.test",
      author: TEST_AUTHOR,
      snapshot: { html: REFERENCE_HTML },
    });
    expect(fallback.reference.status).toBe("ready");
    expect(fallback.reference.method).toBe("snapshot");
    expect(fallback.reference.profile?.reduced).toBe(true);
  });

  it("retries a transient capture failure with progress and backoff", async () => {
    let calls = 0;
    const deps = {
      maxAttempts: 3,
      retryDelayMs: () => 0,
      capture: async () => {
        calls += 1;
        if (calls === 1) {
          throw new ReferenceCaptureError({
            reason: "timeout",
            message: "Navigation timeout of 45000 ms exceeded",
            suggestion: "Erneut versuchen",
            retryable: true,
          });
        }
        return { markup: REFERENCE_HTML };
      },
    };
    const context: ReferenceContext = { store: env.engine.store, dataDir: env.engine.dataDir, deps };
    const first = await analyzeReference(context, {
      url: "https://flaky.test",
      author: TEST_AUTHOR,
    });
    expect(first.job.status).toBe("queued");
    expect(first.job.attempts).toBe(1);
    expect(first.reference.status).toBe("analyzing");
    expect(first.reference.stage).toBe("retry-scheduled");
    expect(first.reference.progress).toBeGreaterThan(0);
    expect(Date.parse(first.job.nextAttemptAt)).toBeLessThanOrEqual(Date.now());
    expect(first.job.lastError).toContain("timeout");

    const tick = await runDueReferenceJobs(context, {});
    expect(tick.processed).toBe(1);
    expect(tick.done).toBe(1);
    const reference = await env.engine.store.getReference(first.reference.id);
    expect(reference.status).toBe("ready");
    expect(reference.revision).toBe(1);
    const job = await env.engine.store.getReferenceJob(first.job.id);
    expect(job.attempts).toBe(2);
    expect(job.status).toBe("done");
  });

  it("edits the profile as a new revision and deletes with a usage warning", async () => {
    const referenceId = await analyzeViaApi("https://studio-nord.test", "Studio Nord");
    const edited = await env.api.request<{ revision: number; profile: { vocabulary: string[] } }>({
      method: "POST",
      path: `/api/references/${referenceId}/revisions`,
      body: {
        author: TEST_AUTHOR,
        vocabulary: ["dark studio", "violet accent", "soft corners", "measured scale", "quiet motion"],
        families: ["dark-tech"],
        rules: { constants: ["violet accent only"], never: ["keine Neon-Verlaeufe"] },
        note: "Kuration",
      },
    });
    expect(edited.status).toBe(201);
    expect(edited.body.revision).toBe(2);
    expect(edited.body.profile.vocabulary).toHaveLength(5);

    const revisions = await env.api.request<{ revisions: { revision: number }[] }>({
      method: "GET",
      path: `/api/references/${referenceId}/revisions`,
    });
    expect(revisions.body.revisions.map((entry) => entry.revision)).toEqual([2, 1]);

    const updated = await env.api.request<{ families: string[]; styleBrief: string }>({
      method: "GET",
      path: `/api/references/${referenceId}`,
    });
    expect(updated.body.families).toEqual(["dark-tech"]);
    expect(updated.body.styleBrief).toContain("dark studio");

    const site = await createTestSite(env.api, "Nutzungs-Hinweis");
    const applied = await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/references`,
      body: { referenceId, author: TEST_AUTHOR },
    });
    expect(applied.status).toBe(201);

    const blocked = await env.api.request<{ error: { category: string; suggestion: string } }>({
      method: "DELETE",
      path: `/api/references/${referenceId}`,
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.suggestion).toContain("force");

    const forced = await env.api.request<{ deleted: string; usedInProjects: string[] }>({
      method: "DELETE",
      path: `/api/references/${referenceId}?force=true`,
    });
    expect(forced.status).toBe(200);
    expect(forced.body.usedInProjects).toEqual([site.id]);
    const gone = await env.api.request({ method: "GET", path: `/api/references/${referenceId}` });
    expect(gone.status).toBe(404);
  });

  it("serves stored snapshots and refuses traversal or foreign ids", async () => {
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
      "hex",
    );
    const context: ReferenceContext = {
      store: env.engine.store,
      dataDir: env.engine.dataDir,
      deps: {
        capture: async () => ({
          markup: REFERENCE_HTML,
          screenshots: [
            { breakpoint: "1440", kind: "fullpage", bytes: png, width: 1440, height: 900 },
            { breakpoint: "390", kind: "fullpage", bytes: png, width: 390, height: 780 },
          ],
        }),
      },
    };
    const { reference } = await analyzeReference(context, {
      url: "https://shots.test",
      author: TEST_AUTHOR,
    });
    const desktop = reference.snapshots[0];
    expect(reference.snapshots).toHaveLength(2);
    expect(desktop?.storageRef).toBe(`references/${reference.id}/snapshots/1440-fullpage-1.png`);
    expect(desktop?.previewPath).toBe(
      `/api/references/${reference.id}/snapshots/1440-fullpage-1.png`,
    );

    const served = await fetch(`${env.server.origin}${desktop?.previewPath}`, {
      headers: { authorization: `Bearer ${env.token}` },
    });
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toContain("must-revalidate");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(png);

    // The snapshot stays internal: without a token the route refuses.
    const anonymous = await fetch(`${env.server.origin}${desktop?.previewPath}`);
    expect(anonymous.status).toBe(401);

    // Traversal, absolute paths, unknown files and foreign ids stay 404.
    for (const path of [
      `/api/references/${reference.id}/snapshots/..%2F..%2Fsecret.png`,
      `/api/references/${reference.id}/snapshots/%2Fetc%2Fpasswd`,
      `/api/references/${reference.id}/snapshots/unbekannt.png`,
      `/api/references/fremd/snapshots/1440-fullpage-1.png`,
    ]) {
      const response = await fetch(`${env.server.origin}${path}`, {
        headers: { authorization: `Bearer ${env.token}` },
      });
      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: { category: string } };
      expect(body.error.category).toBe("not_found");
    }

    // Snapshot fallback: an uploaded PNG data URL lands on disk and is served.
    const uploaded = await analyzeReference(context, {
      url: "https://shots-upload.test",
      author: TEST_AUTHOR,
      snapshot: {
        html: REFERENCE_HTML,
        screenshots: [
          {
            breakpoint: "810",
            kind: "fullpage",
            width: 810,
            height: 1080,
            storageRef: "upload",
            hash: "upload",
            dataUrl: `data:image/png;base64,${png.toString("base64")}`,
          },
        ],
      },
    });
    expect(uploaded.reference.snapshots[0]?.previewPath).toBeDefined();
    const servedUpload = await fetch(
      `${env.server.origin}${uploaded.reference.snapshots[0]?.previewPath}`,
      { headers: { authorization: `Bearer ${env.token}` } },
    );
    expect(servedUpload.status).toBe(200);
    expect(Buffer.from(await servedUpload.arrayBuffer())).toEqual(png);

    // Metadata without bytes has no preview path and answers 404.
    const metadata = await analyzeReference(context, {
      url: "https://shots-meta.test",
      author: TEST_AUTHOR,
      snapshot: {
        html: REFERENCE_HTML,
        screenshots: [
          { breakpoint: "810", kind: "fullpage", width: 810, height: 1080, storageRef: "meta", hash: "meta" },
        ],
      },
    });
    expect(metadata.reference.snapshots[0]?.previewPath).toBeUndefined();
    const missing = await fetch(
      `${env.server.origin}/api/references/${metadata.reference.id}/snapshots/810-fullpage-1.png`,
      { headers: { authorization: `Bearer ${env.token}` } },
    );
    expect(missing.status).toBe(404);
  });

  it("stores the motion recording as a snapshot and serves it as webm", async () => {
    const webm = Buffer.from("1a45dfa3a3", "hex");
    const context: ReferenceContext = {
      store: env.engine.store,
      dataDir: env.engine.dataDir,
      deps: {
        capture: async () => ({
          markup: REFERENCE_HTML,
          video: { bytes: webm, durationMs: 3840 },
        }),
      },
    };
    const { reference } = await analyzeReference(context, {
      url: "https://motion.test",
      author: TEST_AUTHOR,
    });
    const motion = reference.snapshots.find((shot) => shot.kind === "motion");
    expect(motion).toBeDefined();
    expect(motion?.durationMs).toBe(3840);
    expect(motion?.storageRef).toBe(
      `references/${reference.id}/snapshots/motion-1.webm`,
    );
    const served = await fetch(`${env.server.origin}${motion?.previewPath}`, {
      headers: { authorization: `Bearer ${env.token}` },
    });
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("video/webm");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(webm);
  });

  it("applies a reference as theme draft, keeps the bake and bakes its tokens", async () => {
    const referenceId = await analyzeViaApi("https://studio-nord.test", "Studio Nord");
    const site = await createTestSite(env.api, "Referenz-Projekt");
    const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });

    const applied = await env.api.request<{
      assignment: { scales: string[]; priority: number };
      draft: {
        scales: { brand?: string; typeBase?: number; spacingBase?: number; radiusBase?: string };
        fonts: { body?: { family: string } };
        motion: { duration?: Record<string, string> };
      };
      verification: { ok: boolean };
      unchanged: { unchanged: boolean; checks: { name: string; ok: boolean }[] };
    }>({
      method: "POST",
      path: `/api/sites/${site.id}/references`,
      body: { referenceId, author: TEST_AUTHOR },
    });
    expect(applied.status).toBe(201);
    expect(applied.body.assignment.scales).toEqual(["color", "type", "motion", "rest"]);
    expect(applied.body.draft.scales.brand).toBe("#7c5cff");
    expect(applied.body.draft.scales.typeBase).toBe(17);
    expect(applied.body.draft.fonts.body?.family).toBe("Inter");
    expect(applied.body.verification.ok).toBe(true);
    // "Anwenden aendert den bestehenden Bake nicht": nothing is persisted.
    expect(applied.body.unchanged.unchanged).toBe(true);
    expect(applied.body.unchanged.checks.every((check) => check.ok)).toBe(true);

    const mirror = await env.api.request<{
      assignments: { referenceId: string }[];
      draft: { scales: { brand?: string } };
      unchanged: { unchanged: boolean };
    }>({ method: "GET", path: `/api/sites/${site.id}/references` });
    expect(mirror.body.assignments.map((entry) => entry.referenceId)).toEqual([referenceId]);
    expect(mirror.body.draft.scales.brand).toBe("#7c5cff");
    expect(mirror.body.unchanged.unchanged).toBe(true);

    // Only an explicit theme write changes the bake (Prüfstelle 3).
    const themeWrite = await env.api.request({
      method: "PUT",
      path: `/api/sites/${site.id}/theme`,
      body: {
        author: TEST_AUTHOR,
        theme: {
          scales: applied.body.draft.scales,
          fonts: applied.body.draft.fonts,
          motion: applied.body.draft.motion,
        },
      },
    });
    expect(themeWrite.status).toBe(200);
    const preview = await env.api.request<{ preview: { buildRef: string } }>({
      method: "POST",
      path: `/api/sites/${site.id}/previews`,
      body: { author: TEST_AUTHOR },
    });
    const html = readFileSync(join(preview.body.preview.buildRef, "index.html"), "utf8");
    // The bake carries the written theme embedded in the emitted document
    // itself, so the preview never depends on a linked stylesheet.
    expect(html).toContain("7c5cff");
    expect(html).toContain("Inter");

    // Soft adherence hint in the review: a divergent theme is flagged.
    await env.api.request({
      method: "PUT",
      path: `/api/sites/${site.id}/theme`,
      body: { author: TEST_AUTHOR, theme: { scales: { typeBase: 11, brand: "#ff0000" } } },
    });
    const review = await env.api.request<{ checks: { soft: { code: string }[] } }>({
      method: "POST",
      path: `/api/sites/${site.id}/reviews`,
      body: { author: TEST_AUTHOR, pageIds: [page.id] },
    });
    expect(review.status).toBe(201);
    expect(review.body.checks.soft.some((issue) => issue.code === "reference-adherence")).toBe(true);

    const themeDraft = await referenceThemeDraft(
      { store: env.engine.store, dataDir: env.engine.dataDir },
      site.id,
    );
    expect(themeDraft.draft.scales.brand).toBe("#7c5cff");

    const removed = await env.api.request<{ removed: boolean }>({
      method: "DELETE",
      path: `/api/sites/${site.id}/references/${referenceId}`,
    });
    expect(removed.body.removed).toBe(true);
    const kept = await applyReference(
      { store: env.engine.store, dataDir: env.engine.dataDir },
      { siteId: site.id, referenceId, author: TEST_AUTHOR, scales: ["color"] },
    );
    expect(kept.assignment.scales).toEqual(["color"]);
    // The bake in here is heavy: under a fully loaded suite 30 s is too tight.
  }, 120_000);
});
