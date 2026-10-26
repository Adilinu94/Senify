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
import { captureBrowser } from "./capture-browser.ts";
import type { FramerIrDocument, IrDevice, IrFinding, IrNode } from "./ir.ts";
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
  // How a URL source is read. `static` (default) fetches the SSR-HTML. `browser`
  // loads the page in Chromium first, so content a script builds at runtime is
  // part of the import: measured 22.10.2026 on a page whose rating stars only
  // exist after hydration (6 nodes / 0 SVG static against 9 nodes / 3 SVG in the
  // browser), and named as the open gap on the published Earn page. The three
  // export fixtures gain nothing structural (715/2958/2147 nodes on both paths)
  // and the browser path costs a Chromium launch per import, so the default
  // stays static. Switchable per import because the result is not the same
  // document - idempotency (S2.5) compares like with like.
  capture?: "static" | "browser";
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
  // Read the STRUCTURE from the hydrated page instead of the server HTML.
  //
  // The SSR is what Framer sends before its runtime runs: a code component
  // arrives as an empty placeholder (measured 24.10.2026 on `unifiersofjapan`:
  // `viewBox="0 0 524 676"` appears 0x in the server HTML and 49x in the
  // rendered DOM). The hydrated page also has the device variants already
  // folded (56 -> 28 `ssr-variant`), so the tree is closer to the page.
  //
  // Measured on `unifiersofjapan` (1440 px, structure bake, exact height):
  // server HTML 15,74 % - hydrated page 11,25 %. The price is real and is why
  // this is opt-in: hydration REMOVES the appear markers (52 -> 18 on
  // donutshop) and the breakpoint CSS channel, so a page that relies on the
  // derived reveals loses them. Default stays the server HTML.
  //
  // Needs Playwright; without it the import fails with a clear message instead
  // of silently falling back.
  structureSource?: "ssr" | "browser";
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
// How long the browser path waits after the settle pass before it measures.
// A Framer page reveals its sections within a few hundred ms of the scroll
// pass; 800 ms leaves room for the last transition without making an import
// feel stuck.
const INPUT_SETTLE_MS = 800;

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
// The browser sees ONE width, the SSR sees all three.
//
// At 1440 px Framer's runtime has already removed the phone and tablet copies of
// every element, so the settled DOM holds a single copy and the capture marks it
// "desktop only" — six nodes on `rare-works`, among them the phone build of the
// products section and the footer. The baked page then hid them on a phone and
// came out 2680 px too short (measured: 20648 px in the source, 17968 px in the
// tree).
//
// The static capture reads the markup, where all three copies still stand, and
// folds them through the device merge. Its `visibleOn` / `hiddenAt` are therefore
// the truth for the DEVICES; the browser stays the truth for the measured motion.
// Nodes are matched by their IR key, which both captures assign in the same
// pre-order over the same tree.
export function mergeDeviceVariants(browser: FramerIrDocument, statik: FramerIrDocument): FramerIrDocument {
  type DeviceNode = {
    key: string;
    tag: string;
    htmlId?: string | null;
    visibleOn?: IrDevice[];
    states: { device: IrDevice; hiddenAt: string[] }[];
    children: DeviceNode[];
  };
  const byKey = new Map<string, DeviceNode>();
  const walk = (node: DeviceNode): void => {
    byKey.set(node.key, node);
    for (const child of node.children) walk(child);
  };
  walk(statik.pages[0]?.root as DeviceNode);
  if (byKey.size === 0) return browser;

  let taken = 0;
  let clearedVisibility = 0;
  // The two loads number their nodes differently (`products` is `n154` at 1440 px
  // and `n202` at 390 px) — Framer builds a different tree per width. The key is
  // therefore the wrong identity across the two. The HTML id is the one both
  // read from the same source (`#products`, `#hero`, `#faq`), so a pair is the
  // same section.
  const byId = new Map<string, DeviceNode>();
  const collectIds = (node: DeviceNode): void => {
    const id = node.htmlId ?? "";
    // The LATER node wins: the phone build appends the phone variant after the
    // desktop one, and it is the one that carries both states. Collecting the
    // first match took the desktop copy and its single state.
    if (id !== "") byId.set(id, node);
    for (const child of node.children) collectIds(child);
  };
  collectIds(statik.pages[0]?.root as DeviceNode);

  const apply = (node: DeviceNode): void => {
    const id = node.htmlId ?? "";
    // The HTML id first: the two loads number their nodes differently, and the
    // phone build's node for a section is the one with both states. A key match
    // across the two documents would name a different element.
    const source = id !== "" ? (byId.get(id) ?? byKey.get(node.key)) : byKey.get(node.key);
    if (source !== undefined) {
      // A section the phone build shows is not "desktop only". Its own variant
      // says which devices see it — and the desktop capture said "mobile is
      // hidden" only because that build never contained the phone copy.
      const phoneVisible = source.states.some(
        (state) => state.device === "mobile" && state.hiddenAt.length === 0,
      );
      if (phoneVisible) {
        if (node.visibleOn !== undefined) clearedVisibility += 1;
        delete node.visibleOn;
        // AND the states: the mapper re-derives `visibleOn` from `hiddenAt` on
        // every sibling merge, so deleting the field alone is undone a moment
        // later. The desktop capture wrote the phone's breakpoint hash into its
        // ONE state; that hash says "hidden on a phone", which the phone build
        // contradicts. With the phone's own states standing in (below), the hash
        // belongs to a variant that no longer exists.
        node.states = node.states.map((state) => ({ ...state, hiddenAt: [] }));
      } else if (source.visibleOn !== undefined) {
        node.visibleOn = source.visibleOn;
      }
      // A phone build that has no `mobile` state for this section does not show
      // it there: the desktop capture's `visibleOn` stays as it is.
      // The device states carry the per-breakpoint layout (the phone's padding,
      // its font size). The browser capture has one state; the variant capture
      // has the one it built. Its `hiddenAt` hashes name the OTHER widths that
      // build does not serve — for the section that is visible here they mean
      // nothing, and the mapper would read them as "hidden on the phone" again.
      if (source.states.length > node.states.length) {
        node.states = source.states.map((state) => ({ ...state, hiddenAt: phoneVisible ? [] : state.hiddenAt }));
        taken += 1;
      }
    }
    for (const child of node.children) apply(child);
  };
  apply(browser.pages[0]?.root as DeviceNode);

  // A section that exists ONLY in the phone build is in no key of the desktop
  // tree: Framer does not render it at 1440 px at all. Measured on `rare-works`:
  // the products section and the footer are sections of their own on a phone and
  // absent from the desktop document, so the key-based merge above cannot see
  // them.
  //
  // They are inserted where the phone build puts them: after the same PREDECESSOR
  // section, in the same parent. Appending them at the root put the products
  // section INSIDE the hero (measured: hero 1171 → 1448 px on a phone).
  const known = new Set<string>();
  const collect = (node: DeviceNode): void => {
    const id = node.htmlId ?? "";
    if (id !== "") known.add(id);
    for (const child of node.children) collect(child);
  };
  collect(browser.pages[0]?.root as DeviceNode);

  // The desktop tree by id, to find the parent a phone-only section belongs to.
  const desktopById = new Map<string, DeviceNode>();
  const collectDesktop = (node: DeviceNode): void => {
    const id = node.htmlId ?? "";
    if (id !== "") desktopById.set(id, node);
    for (const child of node.children) collectDesktop(child);
  };
  collectDesktop(browser.pages[0]?.root as DeviceNode);

  const insertExtras = (phoneNode: DeviceNode, desktopParent: DeviceNode): void => {
    // The children the phone build has and this parent does not, in order.
    let previous: DeviceNode | undefined;
    for (const child of phoneNode.children) {
      const id = child.htmlId ?? "";
      const isExtra =
        id !== "" &&
        !known.has(id) &&
        child.states.some((state) => state.device === "mobile" || state.device === "desktop");
      if (isExtra) {
        child.visibleOn = ["mobile"];
        const at = previous === undefined ? 0 : desktopParent.children.indexOf(previous) + 1;
        desktopParent.children.splice(at, 0, child);
        previous = child;
        taken += 1;
        continue;
      }
      const matchDesktop = id === "" ? undefined : desktopById.get(id);
      const matchPhone = child;
      if (matchDesktop !== undefined) {
        insertExtras(matchPhone, matchDesktop);
        previous = matchDesktop;
      }
    }
  };
  // The desktop root is the parent of the top-level sections.
  const desktopRoot = browser.pages[0]?.root as DeviceNode | undefined;
  const phoneRoot = statik.pages[0]?.root as DeviceNode | undefined;
  if (desktopRoot !== undefined && phoneRoot !== undefined) {
    insertExtras(phoneRoot, desktopRoot);
  }
  if (taken > 0) {
    browser.findings.push({
      kind: "breakpoint-collapse",
      nodeKey: null,
      message: `${taken} Knoten haben ihre Gerätevarianten aus dem Telefon-Aufbau zurückbekommen (ein Ladevorgang baut nur eine Breite); ${clearedVisibility} davon waren fälschlich als „nur Desktop" markiert.`,
      evidence: `breakpoints: ${statik.breakpoints.map((entry) => entry.id).join(", ")}`,
      severity: "info",
      suggestion: "Ohne diesen Schritt fehlen der Telefon-Fassung ganze Abschnitte.",
    });
  }
  if (browser.breakpoints.length === 0 && statik.breakpoints.length > 0) {
    browser.breakpoints = statik.breakpoints;
  }
  return browser;
}

function mirrorFolders(rootDir: string, pagePath: string): { root: string; pageDir: string } {  return { root: rootDir, pageDir: dirname(resolve(pageFileOf(rootDir, pagePath))) };
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
    if (input.capture === "browser") {
      // A Chromium load of the same address: the page's own runtime runs, so
      // content built by a script is in the DOM `captureBrowser` reads. The
      // request to the page itself went through `fetchPublic` above (public
      // addresses only, ADR-0016); the browser repeats that check for every
      // sub-resource through its own route guard (ADR-0022).
      //
      // The device variants come from the EARLY browser markup, not from the
      // settled one: at 1440 px the runtime has already thrown the phone and
      // tablet copies away, so the settled DOM holds one copy of each element and
      // every other becomes "desktop only". Measured on `rare-works`: the phone
      // build of five sections (products, footer, …) was marked `hidden: mobile`,
      // and the baked page was 2680 px too short on a phone (20648 → 17968).
      //
      // `captureBrowser` returns that early markup beside the document; it is
      // read once the page is built and before the runtime has rewritten it, so
      // all three copies still stand there.
      const fromBrowser = await captureBrowser({
        url: input.source.url,
        pagePath: input.pagePath ?? "/",
        settleMs: INPUT_SETTLE_MS,
      });
      document = fromBrowser.document;
      // The phone build tells which elements exist at all on a phone; the
      // desktop one carries the measured motion. Both are needed.
      const variantsMarkup = fromBrowser.narrowMarkup ?? fromBrowser.earlyMarkup;
      if (variantsMarkup !== undefined && variantsMarkup !== "") {
        const variantsDocument = captureHtml({
          html: variantsMarkup,
          url: input.source.url,
          pagePath: input.pagePath ?? "/",
        });
        document = mergeDeviceVariants(document, variantsDocument);
      }
    } else {
      const css = await fetchLinkedCss(html, input.source.url);
      document = captureHtml({ html, url: input.source.url, pagePath: input.pagePath ?? "/", css });
    }
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
      // The table, not just the callback: the runtime carries the page as JSON
      // and builds its images from that data, so a rewrite of the markup alone
      // misses them. Measured on `rare-works`: 43 CDN addresses stayed in the
      // bundle, the CSP blocked every one, and 13 pictures were broken.
      addressRewrites: urlRewrites,
      // The runtime calls `new URL(address)` and needs an absolute base; the
      // release's own origin is what a root-relative asset path means.
      ...(baseUrl !== undefined ? { assetOrigin: baseUrl } : {}),
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
      addressRewrites: urlRewrites,
      ...(baseUrl !== undefined ? { assetOrigin: baseUrl } : {}),
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



