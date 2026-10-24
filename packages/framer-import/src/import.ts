// The full import run (plan.md S2 acceptance): URL or offline mirror → IR →
// normalize → map → fidelity report, with the asset pipeline in the loop.
// One function so the CLI (S3.4), the MCP tool (S3.5) and the editor dialog
// (S4.1) cannot drift — they all call `runImport`.
//
// Idempotency (S2.5): the run carries the source's `contentHash`. A second
// run over an unchanged source produces the identical IR hash — `compareRuns`
// answers "nothing changed" with numbers, and the engine-side write path
// (S3.1) uses the hash as its idempotency key.

import { fetchPublic } from "@senify/core/net";
import type { EditorDocument } from "@senify/editor/state";
import type { StyleRule } from "@senify/widget-engine";
import type { Breakpoints } from "@senify/widget-engine/breakpoints";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { captureFixture, captureHtml, pageFileOf, type CaptureHtmlInput } from "./capture-html.ts";
import type { FramerIrDocument, IrFinding, IrNode } from "./ir.ts";
import { normalize, type NormalizeMode, type NormalizeResult } from "./normalize.ts";
import { mapDocument, type MapperResult, type ThemePatch } from "./mapper.ts";
import { buildFidelityReport, type FidelityReport } from "./fidelity.ts";
import { importAssets, type AssetReport, type AssetUploader } from "./assets.ts";
import { extractPayloads, type ExtractedPayload } from "./payloads.ts";
import {
  buildPageRuntimePayload,
  RUNTIME_PAYLOAD_MAX_BYTES,
  type RuntimeFileLoader,
} from "./runtime-payload.ts";
import { mapFramerMotion } from "./motion-mapping.ts";
import { discoverPagePaths } from "./link-paths.ts";
import { siteBreakpointsOf } from "./site-breakpoints.ts";

/* ------------------------------------------------------------------ types */

export type ImportSource =
  | { kind: "url"; url: string }
  | { kind: "mirror"; rootDir: string; pagePath?: string }
  | { kind: "html"; html: string; url?: string; title?: string };

export type RunImportInput = {
  source: ImportSource;
  // Asset pipeline: upload into the engine (production) or mirror files to
  // a folder (offline mode). Absent = no asset download, the report says so.
  uploader?: AssetUploader;
  outDir?: string;
  // The base URL for relative asset URLs (mirror mode: the origin).
  baseUrl?: string;
  includeAssets?: boolean;
  includeFonts?: boolean;
  // The page path the import lands on. It scopes the style rule ids and class
  // names, so two pages of one site never share a rule.
  pagePath?: string;
  // `dna` (default) rewrites what the design DNA forbids; `fidelity` keeps the
  // source's look and only consolidates.
  mode?: NormalizeMode;
  // The base duration of the theme the page lands in, in milliseconds.
  // `durationScale` is relative to it, so without it the source's absolute
  // seconds cannot become the right scale. Absent = the default theme's 300.
  baseDurationMs?: number;
};

export type ImportRun = {
  // The other pages of the site this page links to (root-relative paths, first
  // seen first). Candidates for a whole-site import; nothing is fetched here.
  discoveredPages: string[];
  document: FramerIrDocument;
  normalized: NormalizeResult;
  mapped: MapperResult;
  report: FidelityReport;
  assets: AssetReport | null;
  payloads: ExtractedPayload[];
  // The source's own breakpoint pair (ADR-0020), or null when it gives none
  // Senify can carry. The baked page only switches layouts where the original
  // does when the site uses it.
  breakpoints: Breakpoints | null;
  // The idempotency fingerprint: identical sources hash identically (S2.5).
  irHash: string;
};

const PAGE_TIMEOUT_MS = 30_000;
const MAX_PAGE_BYTES = 20 * 1024 * 1024;
// The runtime files of a Framer site (the bundle, the chunks, the page
// modules). One file may not be bigger than this; the whole payload has the
// budget of ADR-0010 §6 (3 MB).
const MAX_RUNTIME_FILE_BYTES = 4 * 1024 * 1024;
const RUNTIME_FILE_TIMEOUT_MS = 20_000;

/* --------------------------------------------------- linked stylesheets */

const CSS_MAX_SHEETS = 12;
const CSS_MAX_BYTES = 4_000_000;
const CSS_TIMEOUT_MS = 15_000;

// Hosts a Framer site serves its stylesheets from, besides the page's own
// origin. Nothing else is fetched on behalf of a page the user pointed at.
function isFramerHost(hostname: string): boolean {
  return /(^|\.)(framerusercontent\.com|framer\.website|framer\.app|framer\.ai|framer\.media)$/i.test(hostname);
}

// The `<link rel="stylesheet">` sheets of a live page: a URL import has no
// export folder, so its class rules would otherwise never be read.
export async function fetchLinkedCss(html: string, pageUrl: string): Promise<string> {
  const origin = new URL(pageUrl).origin;
  const hrefs: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) continue;
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = href?.[1] ?? href?.[2];
    if (value !== undefined && value !== "") hrefs.push(value.replace(/&amp;/g, "&"));
  }
  const sheets: string[] = [];
  for (const href of hrefs.slice(0, CSS_MAX_SHEETS)) {
    let target: URL;
    try {
      target = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (target.protocol !== "https:" && target.protocol !== "http:") continue;
    if (target.origin !== origin && !isFramerHost(target.hostname)) continue;
    try {
      // Same rule as the page itself (ADR-0016): only public addresses, DNS pinned,
      // every redirect re-checked, size capped while reading.
      const response = await fetchPublic(target.toString(), {
        signal: AbortSignal.timeout(CSS_TIMEOUT_MS),
        maxBytes: CSS_MAX_BYTES,
      });
      if (!response.ok) continue;
      const text = await response.text();
      if (text.length <= CSS_MAX_BYTES) sheets.push(text);
    } catch {
      continue;
    }
  }
  return sheets.join("\n");
}

/* --------------------------------------------------------------- main run */

// The folder of the mirror and the folder of the imported page inside it: a
// relative asset URL points into the page's own folder first, then into the
// mirror root.
function mirrorFolders(rootDir: string, pagePath: string): { root: string; pageDir: string } {
  return { root: rootDir, pageDir: dirname(resolve(pageFileOf(rootDir, pagePath))) };
}

export async function runImport(input: RunImportInput): Promise<ImportRun> {
  let document: FramerIrDocument;
  let baseUrl = input.baseUrl;
  // The raw HTML of the source: the runtime detection reads it (the runtime
  // lives in the markup, not in a channel).
  let sourceHtml: string | null = null;
  if (input.source.kind === "url") {
    // Public addresses only, with a time and size limit (ADR-0016).
    const response = await fetchPublic(input.source.url, {
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      maxBytes: MAX_PAGE_BYTES,
    });
    if (!response.ok) {
      throw new Error(`Quelle nicht ladbar: ${response.status} ${input.source.url}`);
    }
    const html = await response.text();
    sourceHtml = html;
    const css = await fetchLinkedCss(html, input.source.url);
    document = captureHtml({ html, url: input.source.url, pagePath: input.pagePath ?? "/", css });
    if (baseUrl === undefined) baseUrl = new URL(input.source.url).origin;
  } else if (input.source.kind === "mirror") {
    // Offline mode (S2.4): the local mirror is the input, no network beyond
    // the asset downloads themselves (which resolve through baseUrl when
    // given, else fall back to the mirror's file layout). The same baseUrl is
    // the site's origin for the page's own absolute links.
    // Target path and source page are two things: the page read from the export
    // is `source.pagePath` (home by default), the path it lands on is `pagePath`.
    document = captureFixture(input.source.rootDir, input.pagePath ?? "/", input.source.pagePath ?? "/", baseUrl);
  } else {
    const capture: CaptureHtmlInput = { html: input.source.html, pagePath: input.pagePath ?? "/" };
    if (input.source.url !== undefined) capture.url = input.source.url;
    if (input.source.title !== undefined) capture.title = input.source.title;
    document = captureHtml(capture);
  }

  // Assets (S2.3/S2.3b) — the DSGVO font rewrite happens here.
  let assetReport: AssetReport | null = null;
  let urlRewrites: Record<string, string> = {};
  if (input.uploader !== undefined || input.outDir !== undefined) {
    // A mirror knows its own files: a relative asset URL is read from the
    // mirror folder (the page's own folder first), so the import works
    // without the address of the original site.
    const local = input.source.kind === "mirror" ? mirrorFolders(input.source.rootDir, input.source.pagePath ?? "/") : null;
    const assets = await importAssets({
      document,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      ...(local !== null ? { localRoot: local.root, localPageDir: local.pageDir } : {}),
      ...(input.uploader !== undefined ? { uploader: input.uploader } : {}),
      ...(input.outDir !== undefined ? { outDir: input.outDir } : {}),
      ...(input.includeAssets !== undefined ? { includeAssets: input.includeAssets } : {}),
      ...(input.includeFonts !== undefined ? { includeFonts: input.includeFonts } : {}),
    });
    document = assets.document;
    assetReport = assets.report;
    urlRewrites = assets.urlRewrites;
  }

  // The runtime payload (step 2 of `docs/fahrplan-framer-1zu1.md`): the
  // page's own runtime, bundled with its markup and its CSS. It is what
  // carries Lenis, three.js and the ticker — the things the structure tree
  // cannot express.
  const runtimeFindings: IrFinding[] = [];
  const runtimePayloads: ExtractedPayload[] = [];
  if (sourceHtml !== null && input.source.kind === "url") {
    const pageUrl = input.source.url;
    const loadFile: RuntimeFileLoader = async (target) => {
      // Only the hosts a Framer site serves its runtime from (ADR-0016: no
      // address outside the public ones, no local network).
      const host = new URL(target).hostname;
      if (!isFramerHost(host)) return null;
      try {
        const response = await fetchPublic(target, {
          signal: AbortSignal.timeout(RUNTIME_FILE_TIMEOUT_MS),
          maxBytes: MAX_RUNTIME_FILE_BYTES,
        });
        if (!response.ok) return null;
        return await response.text();
      } catch {
        return null;
      }
    };
    const result = await buildPageRuntimePayload({
      html: sourceHtml,
      pageUrl,
      loadFile,
      rewriteUrl: (url) => urlRewrites[url] ?? null,
      maxBytes: RUNTIME_PAYLOAD_MAX_BYTES,
    });
    if (result.ok) {
      runtimePayloads.push({
        nodeKey: "",
        name: "Framer-Runtime",
        kind: "module",
        scope: "page",
        bundle: result.payload.bundle,
        bytes: result.payload.bytes,
        integrity: result.payload.integrity,
        sourcePath: result.detection.entry,
        license: { id: "unknown", note: "Framer-Runtime der importierten Seite" },
        adapter: "mount-export",
      });
    } else if (result.hasRuntime) {
      runtimeFindings.push({
        kind: "code-component",
        nodeKey: null,
        message: `Die Framer-Runtime ließ sich nicht als Payload bündeln: ${result.reason}`,
        evidence: pageUrl,
        severity: "warn",
        suggestion:
          "Die Seite läuft ohne die Original-Runtime; Animationen, die nur sie trägt, fehlen dann.",
      });
    }
  } else if (input.source.kind === "mirror") {
    // Der Offline-Import: der Mirror trägt die Runtime-Dateien selbst. Sie
    // kommen **nur** aus dem Mirror (ADR-0016: ein Ordner liefert nur seine
    // eigenen Dateien) — ein Pfad, der ihn verlässt, wird nicht gelesen.
    const file = pageFileOf(input.source.rootDir, input.source.pagePath ?? "/");
    const html = readFileSync(file, "utf8");
    const rootReal = resolve(input.source.rootDir);
    const pageDir = dirname(resolve(file));
    const loadFile: RuntimeFileLoader = async (target) => {
      let path: string;
      try {
        path = decodeURIComponent(new URL(target).pathname);
      } catch {
        return null;
      }
      const relative = path.replace(/^\/+/, "");
      if (relative === "") return null;
      for (const candidate of [resolve(pageDir, relative), resolve(rootReal, relative)]) {
        if (!candidate.startsWith(rootReal)) continue;
        if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
        return readFileSync(candidate, "utf8");
      }
      return null;
    };
    const result = await buildPageRuntimePayload({
      html,
      // The mirror's own layout: a relative path of the page is resolved
      // against the page's folder.
      pageUrl: `https://mirror.invalid/${input.source.pagePath ?? "/"}`,
      loadFile,
      rewriteUrl: (url) => urlRewrites[url] ?? null,
      maxBytes: RUNTIME_PAYLOAD_MAX_BYTES,
    });
    if (result.ok) {
      runtimePayloads.push({
        nodeKey: "",
        name: "Framer-Runtime",
        kind: "module",
        scope: "page",
        bundle: result.payload.bundle,
        bytes: result.payload.bytes,
        integrity: result.payload.integrity,
        sourcePath: result.detection.entry,
        license: { id: "unknown", note: "Framer-Runtime der importierten Seite" },
        adapter: "mount-export",
      });
    } else if (result.hasRuntime) {
      runtimeFindings.push({
        kind: "code-component",
        nodeKey: null,
        message: `Die Framer-Runtime des Mirrors ließ sich nicht als Payload bündeln: ${result.reason}`,
        evidence: input.source.rootDir,
        severity: "warn",
        suggestion:
          "Der Mirror muss die Runtime-Dateien enthalten und relative Pfade darauf verwenden.",
      });
    }
  }

  const payloads = [
    ...(input.source.kind === "mirror" ? extractPayloads({ document, rootDir: input.source.rootDir }) : []),
    ...runtimePayloads,
  ];
  const normalized = normalize(document, { mode: input.mode ?? "dna" });
  const mapped = mapDocument(document, normalized.rules, { mode: input.mode ?? "dna" });
  const motion = mapFramerMotion(
    document,
    input.baseDurationMs === undefined ? {} : { baseDurationMs: input.baseDurationMs },
  );
  for (const mapping of motion.mappings) {
    const editorNodeId = mapping.nodeKey === null ? undefined : mapped.nodeIdByIrKey[mapping.nodeKey];
    if (editorNodeId === undefined) continue;
    const editorNode = mapped.document.nodes[editorNodeId];
    if (editorNode === undefined) continue;
    // One motion, one owner. A node that already carries a compiled appear rule
    // plays its reveal as CSS keyframes with the SOURCE's start state and the
    // SOURCE's timing. Adding a preset on top would start a second animation on
    // the same element (`gsap.from` with the preset's own offset), so the two
    // fight over opacity and transform — the one that starts last wins.
    if ((editorNode.classes ?? []).some((name) => name.includes("-appear-"))) continue;
    editorNode.motion = mapping.spec;
  }
  const motionFindings: IrFinding[] = [];
  for (const unresolved of motion.findings) {
    motionFindings.push({
      kind: "unsupported-declaration",
      nodeKey: unresolved.sample.nodeKey,
      message: "Framer-Interaktion nicht als Senify-Motion-Preset abbildbar.",
      evidence: unresolved.sample.raw,
      severity: "warn",
      suggestion: unresolved.reason,
    });
  }
  const report = buildFidelityReport(document, normalized, {
    ...mapped,
    findings: [...mapped.findings, ...motionFindings, ...runtimeFindings],
  }, motion);
  const byNodeKey = new Map(payloads.map((payload) => [payload.nodeKey, payload]));
  for (const node of Object.values(mapped.document.nodes)) {
    if (node.primitive !== "payload") continue;
    const key = node.props["framerNodeKey"];
    if (typeof key !== "string") continue;
    const payload = byNodeKey.get(key);
    if (payload === undefined) {
      node.props["label"] = "Platte · Framer-Island nicht gebündelt";
    } else {
      node.props["framerPayloadKey"] = payload.integrity;
      node.props["label"] = payload.name;
      const nodeId = Object.values(mapped.document.nodes).find((entry) =>
        entry.primitive === "payload" && entry.props["framerPayloadKey"] === payload.integrity,
      )?.id ?? null;
      report.resolutions.push({
        nodeKey: payload.nodeKey,
        nodeId,
        kind: "island",
        reason: "Framer-Code/Shader als self-contained Island-Payload gebündelt.",
        evidence: payload.sourcePath,
      });
    }
    delete node.props["framerNodeKey"];
  }
  // The runtime payload carries the whole page: a carrier of the `payload`
  // primitive stands at the root of the tree, and the release shows the
  // original page in its place (the renderer hides the structure where the
  // carrier stands — step 3 of the plan). The tree keeps the structure: it
  // stays the truth the editor works on.
  const pagePayload = payloads.find((payload) => payload.scope === "page");
  // The editable share of the page (step 7 of the 1:1 plan): what the editor
  // really edits. A page-level payload carries the whole page in the release,
  // so the honest number is 0 % editable there — the structure is a preview,
  // not what goes live. A page without a payload is edited in full.
  const pageNodes = Object.keys(mapped.document.nodes).length;
  const carrierNodes = pagePayload === undefined ? 0 : 1;
  report.editableShare = pagePayload === undefined
    ? { editable: 100, original: 0, nodes: pageNodes }
    : { editable: 0, original: 100, nodes: pageNodes - carrierNodes };
  if (pagePayload !== undefined) {
    const root = mapped.document.nodes[mapped.document.rootNodeId];
    if (root !== undefined) {
      // The poster of a page-level carrier (ADR-0010 §7, mandatory on import):
      // the social image of the source. Without a poster the editor canvas has
      // nothing to show but the plate — and the plate is the LAST fallback, not
      // the default. The image is the source's own (og:image), so it shows what
      // the page shows and is not a guess.
      const posterUrl = document.pages[0]?.meta?.ogImage;
      const poster = posterUrl === undefined ? undefined : payloadPosterOf(document, posterUrl);
      const carrierId = "framer-runtime-payload";
      mapped.document.nodes[carrierId] = {
        id: carrierId,
        primitive: "payload",
        props: {
          framerPayloadKey: pagePayload.integrity,
          // The carrier stands for the whole page: the release renders it
          // instead of the structure.
          coversPage: true,
          label: "Original · Framer-Runtime",
          alt: document.pages[0]?.title ?? "Importierte Seite",
          ...(poster === undefined ? {} : { poster: { assetId: poster } }),
        },
        children: [],
      };
      // The carrier stands at the end of the tree: the canvas shows the
      // structure and, below it, the plate that names the payload. The
      // release renders the carrier INSTEAD of the structure (the renderer
      // decides that — see `renderTreeOf`).
      root.children = [...(root.children ?? []), carrierId];
    }
    report.resolutions.push({
      nodeKey: "",
      nodeId: "framer-runtime-payload",
      kind: "island",
      reason:
        "Die Framer-Runtime ist als Payload gebündelt: der Release zeigt die Originalseite, die Struktur bleibt im Baum.",
      evidence: pagePayload.sourcePath,
    });
    report.steps.push(
      `Framer-Runtime als Payload gebündelt (${Math.round(pagePayload.bytes / 1024)} KB) — der Release zeigt die Originalseite.`,
    );
  }
  if (payloads.length > 0) report.steps.push(`${payloads.length} Framer-Islands gebündelt und als Payload vorgemerkt`);
  return {
    document,
    normalized,
    mapped,
    report,
    assets: assetReport,
    payloads,
    breakpoints: siteBreakpointsOf(document.breakpoints),
    irHash: irHashOf(document),
    discoveredPages: discoverPagePaths(
      document.pages[0]?.root ?? ({ children: [], href: null } as never),
      document.pages[0]?.path ?? "/",
    ),
  };
}

// The asset id the imported poster image got. The asset pipeline rewrites the
// IR's asset list (`localUrl`/`assetId`); a poster that is not in that list was
// not downloaded (a skipped asset run) — then the carrier stays without one and
// the plate says so.
function payloadPosterOf(
  document: { assets: { url: string; assetId?: string | null }[] },
  url: string,
): string | undefined {
  const asset = document.assets.find((entry) => entry.url === url);
  const assetId = asset?.assetId;
  return typeof assetId === "string" && assetId !== "" ? assetId : undefined;
}

/* ----------------------------------------------------------- idempotency */
// The stable fingerprint of an import result: source hash + mapped stats +
// finding kinds. `capturedAt` and asset storage ids are excluded on purpose —
// a second run over an unchanged source must land on the same fingerprint
// even though timestamps differ (plan S2.5, test compares two runs).
export function irHashOf(document: FramerIrDocument): string {
  const findingKinds = document.findings.map((finding) => finding.kind).join(",");
  const modules = document.pages.flatMap((page) => {
    const found: string[] = [];
    const visit = (node: typeof page.root): void => {
      if (node.codeModule !== undefined && node.codeModule !== null) found.push(`${node.key}:${node.codeModule.path}`);
      for (const child of node.children) visit(child);
    };
    visit(page.root);
    return found;
  }).join(",");
  const motion = document.motion
    .map((sample) => `${sample.library}:${sample.trigger}:${sample.nodeKey ?? ""}`)
    .join(",");
  return `ir1:${document.source.contentHash}:${document.pages.length}:${findingKinds}:${modules}:${motion}`;
}

export function compareRuns(
  first: ImportRun,
  second: ImportRun,
): { identical: boolean; irHash: string; changes: string[] } {
  const changes: string[] = [];
  if (first.irHash !== second.irHash) changes.push("irHash unterscheidet sich");
  if (first.normalized.stats.rules !== second.normalized.stats.rules) {
    changes.push(
      `Regelzahl ${first.normalized.stats.rules} → ${second.normalized.stats.rules}`,
    );
  }
  if (first.mapped.stats.nodes !== second.mapped.stats.nodes) {
    changes.push(`Knotenzahl ${first.mapped.stats.nodes} → ${second.mapped.stats.nodes}`);
  }
  if (first.report.score !== second.report.score) {
    changes.push(`Score ${first.report.score} → ${second.report.score}`);
  }
  return {
    identical:
      first.irHash === second.irHash &&
      first.normalized.stats.rules === second.normalized.stats.rules &&
      first.mapped.stats.nodes === second.mapped.stats.nodes &&
      first.report.score === second.report.score,
    irHash: second.irHash,
    changes,
  };
}

/* --------------------------------------------------- loop → marquee hint */

// The one measured loop form (S0/befund §4: ticker marquee, translateX,
// `iterations: null`) maps onto the `marquee` motion preset where the shape
// fits: a frame/list whose WAAPI sample is an endless horizontal translate.
// The mapping lands as a motion spec suggestion on the mapped node — the
// editor shows it, the human confirms it.
export function marqueeCandidates(document: FramerIrDocument): {
  nodeKey: string | null;
  preset: "marquee";
  params: Record<string, string | number | boolean>;
  reason: string;
}[] {
  const candidates: {
    nodeKey: string | null;
    preset: "marquee";
    params: Record<string, string | number | boolean>;
    reason: string;
  }[] = [];
  for (const sample of document.motion) {
    if (sample.library !== "waapi" || sample.trigger !== "time") continue;
    const name = typeof sample.params.name === "string" ? sample.params.name : "";
    const horizontal = /translate/i.test(name) || /ticker|marquee|slide/i.test(sample.nodeKey ?? name);
    if (!horizontal) continue;
    candidates.push({
      nodeKey: sample.nodeKey,
      preset: "marquee",
      params: { ...sample.params },
      reason: `Endlos-Loop (${sample.raw}) — das marquee-Preset bildet die Form ab`,
    });
  }
  return candidates;
}

/* ------------------------------------------------------------- re-exports */

export type { EditorDocument, StyleRule, ThemePatch, IrFinding, IrNode };
