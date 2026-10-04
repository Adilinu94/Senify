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
import { captureFixture, captureHtml, type CaptureHtmlInput } from "./capture-html.ts";
import type { FramerIrDocument, IrFinding, IrNode } from "./ir.ts";
import { normalize, type NormalizeMode, type NormalizeResult } from "./normalize.ts";
import { mapDocument, type MapperResult, type ThemePatch } from "./mapper.ts";
import { buildFidelityReport, type FidelityReport } from "./fidelity.ts";
import { importAssets, type AssetReport, type AssetUploader } from "./assets.ts";
import { extractPayloads, type ExtractedPayload } from "./payloads.ts";
import { mapFramerMotion } from "./motion-mapping.ts";

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
};

export type ImportRun = {
  document: FramerIrDocument;
  normalized: NormalizeResult;
  mapped: MapperResult;
  report: FidelityReport;
  assets: AssetReport | null;
  payloads: ExtractedPayload[];
  // The idempotency fingerprint: identical sources hash identically (S2.5).
  irHash: string;
};

const PAGE_TIMEOUT_MS = 30_000;
const MAX_PAGE_BYTES = 20 * 1024 * 1024;

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

export async function runImport(input: RunImportInput): Promise<ImportRun> {
  let document: FramerIrDocument;
  let baseUrl = input.baseUrl;
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
    const css = await fetchLinkedCss(html, input.source.url);
    document = captureHtml({ html, url: input.source.url, pagePath: input.pagePath ?? "/", css });
    if (baseUrl === undefined) baseUrl = new URL(input.source.url).origin;
  } else if (input.source.kind === "mirror") {
    // Offline mode (S2.4): the local mirror is the input, no network beyond
    // the asset downloads themselves (which resolve through baseUrl when
    // given, else fall back to the mirror's file layout).
    document = captureFixture(input.source.rootDir, input.pagePath ?? input.source.pagePath ?? "/");
  } else {
    const capture: CaptureHtmlInput = { html: input.source.html, pagePath: input.pagePath ?? "/" };
    if (input.source.url !== undefined) capture.url = input.source.url;
    if (input.source.title !== undefined) capture.title = input.source.title;
    document = captureHtml(capture);
  }

  // Assets (S2.3/S2.3b) — the DSGVO font rewrite happens here.
  let assetReport: AssetReport | null = null;
  if (input.uploader !== undefined || input.outDir !== undefined) {
    const assets = await importAssets({
      document,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      ...(input.uploader !== undefined ? { uploader: input.uploader } : {}),
      ...(input.outDir !== undefined ? { outDir: input.outDir } : {}),
      ...(input.includeAssets !== undefined ? { includeAssets: input.includeAssets } : {}),
      ...(input.includeFonts !== undefined ? { includeFonts: input.includeFonts } : {}),
    });
    document = assets.document;
    assetReport = assets.report;
  }

  const payloads = input.source.kind === "mirror" ? extractPayloads({ document, rootDir: input.source.rootDir }) : [];
  const normalized = normalize(document, { mode: input.mode ?? "dna" });
  const mapped = mapDocument(document, normalized.rules);
  const motion = mapFramerMotion(document);
  for (const mapping of motion.mappings) {
    const editorNodeId = mapping.nodeKey === null ? undefined : mapped.nodeIdByIrKey[mapping.nodeKey];
    if (editorNodeId === undefined) continue;
    const editorNode = mapped.document.nodes[editorNodeId];
    if (editorNode !== undefined) editorNode.motion = mapping.spec;
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
    findings: [...mapped.findings, ...motionFindings],
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
  if (payloads.length > 0) report.steps.push(`${payloads.length} Framer-Islands gebündelt und als Payload vorgemerkt`);
  return {
    document,
    normalized,
    mapped,
    report,
    assets: assetReport,
    payloads,
    irHash: irHashOf(document),
  };
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
