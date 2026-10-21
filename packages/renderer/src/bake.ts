import { spawn } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { SenifyError } from "@senify/core";
import { bundledSections } from "@senify/registry";
import {
  cssEntryNodeIds,
  getSectionComponent,
  type AssetDelivery,
} from "@senify/registry/components";
import {
  describePrimitive,
  isCatalogPrimitive,
  type Breakpoints,
  type StyleRule,
} from "@senify/widget-engine";
import type { NodeTree, SectionDefinition } from "@senify/section-sdk";
import { webglSceneSurface } from "@senify/section-sdk";
import {
  buildLlmsTxt,
  buildRobots,
  buildSitemap,
  collectJsonLd,
  pageToMarkdown,
} from "./aeo.ts";
import { renderFormsScript, treeHasForms } from "./forms.ts";
import { islandsForTree } from "./islands.ts";
import {
  bindingError,
  expandPageTree,
  type BindingSource,
  type ListPrefetch,
  type PageContext,
} from "./bindings.ts";
import {
  motionConfigsForTree,
  motionDataFor,
  motionEntryCss,
  pageEffectsForTree,
  pageTransitionCss,
  renderIslandsScript,
  renderPageScript,
  WEBGL_VENDOR_NAME,
  type MotionTokens,
} from "./motion.ts";
import { overridesCss, styleRulesReport } from "./style-css.ts";
import { webglVendorCode } from "./webgl-vendor.ts";

// The page root carries the page language (the inspector's "Sprache" field, and
// what the Framer import takes from the source `<html lang>`). It sets `<html
// lang>` of that page; a value that is no language tag is ignored so a stray
// string cannot reach the attribute, and the site default applies instead.
const LANG_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

function pageLang(tree: NodeTree): string | undefined {
  const value = tree.nodes[tree.rootNodeId]?.props["lang"];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return LANG_TAG.test(trimmed) ? trimmed : undefined;
}

export type BakePageInput = {
  id: string;
  path: string;
  title: string;
  description?: string;
  ogImage?: string;
  tree: NodeTree;
  // Draft-id -> composed-id pairs of the layout splice (ticket 22): the
  // renderer remaps `scoped` style rules, which are bound to draft node ids,
  // through this map when it compiles `assets/style-rules.css`. A list per
  // draft id since ticket 04: a component part has one copy per instance.
  nodeIdMap?: Record<string, string[]>;
};

export type BakeInput = {
  siteName: string;
  baseUrl: string;
  // The site's own breakpoint pair (ADR-0020, `sites.breakpoints_json`). Absent:
  // the platform default (1024 / 640). It decides every media query of the
  // bake (overrides, style rules, the motion payload), so the page breaks where
  // the editor frames show it.
  breakpoints?: Breakpoints | null;
  pages: BakePageInput[];
  themeCss: string;
  motionTokens: MotionTokens;
  // The site-wide style rules of the registry (`sites.style_rules_json`).
  // One source for the release: the engine reads the store, the renderer
  // compiles. The bake never reads a page-local copy.
  styleRules?: readonly StyleRule[];
  profile?: "clean" | "standard" | "showcase";
  assets?: Record<string, AssetDelivery>;
  // Imported foreign code (ADR-0010): the payloads the build delivers, keyed by
  // payload id. The engine reads them from the store — code, integrity, bytes —
  // and the renderer writes `assets/payloads/<id>.<hash>.js` and feeds the URL
  // map into the island script. A node that names an id missing here keeps its
  // poster and says so in the warnings.
  payloads?: Record<string, PayloadDelivery>;
  fontPreloads?: { href: string }[];
  aeo?: boolean;
  // The build's own date (YYYY-MM-DD) for `sitemap.xml` (E2): a rollback
  // re-bakes with the restored release's date, so the output is reproducible.
  siteDate?: string;
  // Binding source + prefetched collection lists per page id, resolved by the
  // engine (artifacts/23 §2–3); preview and build share this path.
  contexts?: Record<string, PageContext>;
};

export type PayloadDelivery = {
  code: string;
  integrity: string;
  bytes: number;
};

export type BakeWarning = {
  code?:
    | "pin-excess"
    | "payload-missing"
    | "payload-over-budget"
    | "char-split-excess"
    | "reveal-too-long"
    | "unimplemented-preset"
    | "document-excess"
    | "scene-without-surface"
    | "invalid-jsonld"
    | "billing-silent"
    | "children-unrendered"
    | "css-value-dropped";
  page: string;
  nodeId?: string;
  message: string;
  suggestion?: string;
};

export type BakeResult = {
  outDir: string;
  pages: { path: string; file: string }[];
  warnings: BakeWarning[];
  jsBytes: number;
  // The payload manifest of this build (ADR-0010 §8): what was emitted, where
  // it sits and which hash it carries. The release manifest and the import
  // report read this; a payload that is not listed was not part of the build.
  payloads: BakedPayload[];
};

export type BakedPayload = {
  id: string;
  url: string;
  integrity: string;
  bytes: number;
};

export type BakeOptions = {
  outDir?: string;
  keepWorkDir?: boolean;
  strict?: boolean;
  // Previews are opened without a file server for the build root: the baked
  // stylesheets and island scripts are inlined into every HTML page.
  selfContained?: boolean;
};

export function jsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

// A payload id rides in a file name, so anything outside the id alphabet is
// dropped: the name can never leave the payloads directory.
function payloadFileName(id: string, integrity: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, "");
  return `${safe}.${integrity.slice(0, 8)}.js`;
}

const rendererDir = dirname(fileURLToPath(import.meta.url));

// The bundled theme webfonts: the bake copies them into every build, the local
// program serves them next to the editor frames (`/assets/<file>.woff2`).
export const FONT_ASSETS_DIR = join(rendererDir, "..", "assets", "fonts");

// Binding + list resolution is shared by build and preview and fails loudly:
// an unresolvable binding is a validation error with the prop path.
function expandOrThrow(input: {
  tree: NodeTree;
  definitions: Map<string, SectionDefinition>;
  source: BindingSource;
  lists?: Record<string, ListPrefetch>;
}): NodeTree {
  const { tree, issues } = expandPageTree({
    tree: input.tree,
    definitions: input.definitions,
    source: input.source,
    ...(input.lists === undefined ? {} : { lists: input.lists }),
  });
  if (issues.length > 0) throw bindingError(issues);
  return tree;
}

function astroBin(): string {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("astro/package.json", { paths: [rendererDir] });
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    bin?: string | Record<string, string>;
  };
  const entry =
    typeof pkg.bin === "string"
      ? pkg.bin
      : (pkg.bin?.astro ?? Object.values(pkg.bin ?? {})[0]);
  if (!entry) throw new Error("Astro package exposes no bin entry");
  return join(dirname(pkgPath), entry);
}

// Self-hosted motion runtime (ticket 19, M2): the vendored files travel with
// the release — no CDN request, no third-party origin, and the version is
// frozen in the lockfile. The bake copies them next to the other assets; the
// layout links only the files a page's presets ask for (`needs`).
export function motionVendorFiles(): { name: string; from: string }[] {
  const require = createRequire(import.meta.url);
  return [
    { name: "gsap.min.js", from: require.resolve("gsap/dist/gsap.min.js") },
    {
      name: "ScrollTrigger.min.js",
      from: require.resolve("gsap/dist/ScrollTrigger.min.js"),
    },
    { name: "SplitText.min.js", from: require.resolve("gsap/dist/SplitText.min.js") },
    { name: "lenis.min.js", from: require.resolve("lenis/dist/lenis.min.js") },
  ];
}

function assertBakeable(pages: BakePageInput[]): BakeWarning[] {
  const warnings: BakeWarning[] = [];
  if (pages.length === 0) {
    throw new SenifyError("validation", "Bake needs at least one page", {
      field: "pages",
      suggestion: "Pass the site pages with their draft trees.",
    });
  }
  const seen = new Set<string>();
  for (const page of pages) {
    if (!page.path.startsWith("/")) {
      throw new SenifyError("validation", `Invalid page path "${page.path}"`, {
        field: "pages.path",
        suggestion: 'Page paths start with "/".',
      });
    }
    if (seen.has(page.path)) {
      throw new SenifyError("validation", `Duplicate page path "${page.path}"`, {
        field: "pages.path",
        suggestion: "Page paths must be unique per site.",
      });
    }
    seen.add(page.path);
    if (page.title.trim() === "") {
      throw new SenifyError("validation", `Page "${page.path}" has an empty title`, {
        field: "pages.title",
        suggestion: "Every page needs a title for <title> and navigation.",
      });
    }
    const root = page.tree.nodes[page.tree.rootNodeId];
    if (!root) {
      throw new SenifyError(
        "validation",
        `Page "${page.path}" has a missing root node`,
        { field: "pages.tree" },
      );
    }
    for (const node of Object.values(page.tree.nodes)) {
      if (node.id === page.tree.rootNodeId) continue;
      // Two vocabularies, one render path (Phase 1): a node of the running
      // section registry renders its section component, a node of the widget
      // catalog renders from the one markup description
      // (`widget-engine/src/markup.ts`). Both are bakeable; only a name neither
      // side knows is an error.
      const described = isCatalogPrimitive(node.type)
        ? describePrimitive(node.type, node.props)
        : undefined;
      if (getSectionComponent(node.type) === undefined && described === undefined) {
        throw new SenifyError(
          "validation",
          `Page "${page.path}" uses unknown section "${node.type}"`,
          {
            field: "pages.tree",
            suggestion: "Use a registered section type from the catalog.",
          },
        );
      }
      if (
        node.id !== page.tree.rootNodeId &&
        (node.children?.length ?? 0) > 0 &&
        // A catalog container renders its children through its `childrenSlot`
        // (`markup.ts`), so they are not dropped and the warning is not true.
        described?.childrenSlot === undefined
      ) {
        warnings.push({
          code: "children-unrendered",
          page: page.path,
          nodeId: node.id,
          message: `Node "${node.id}" (${node.type}) has children that no component renders`,
          suggestion: "Move the children to the page root or a slot.",
        });
      }
      if (
        node.type === "pricing" &&
        node.props.billingToggle === true &&
        !hasYearlyPrice(node)
      ) {
        warnings.push({
          code: "billing-silent",
          page: page.path,
          nodeId: node.id,
          message: `Pricing "${node.id}" enables the billing toggle without any yearly price`,
          suggestion: "Add priceYearly to at least one plan, or disable the toggle.",
        });
      }
    }
  }
  return warnings;
}

function hasYearlyPrice(node: { props: Record<string, unknown> }): boolean {
  const plans = node.props.plans;
  if (!Array.isArray(plans)) return false;
  return plans.some(
    (plan) =>
      typeof plan === "object" &&
      plan !== null &&
      typeof (plan as Record<string, unknown>).priceYearly === "string",
  );
}

function mdFileName(path: string): string {
  return path === "/" ? "index.md" : `${path.slice(1)}.md`;
}

function htmlFileName(path: string): string {
  return path === "/" ? "index.html" : `${path.slice(1)}/index.html`;
}

function readBakedFile(outDir: string, href: string): string | undefined {
  if (!href.startsWith("/")) return undefined;
  const file = join(outDir, href.slice(1));
  if (!file.startsWith(outDir) || !existsSync(file)) return undefined;
  return readFileSync(file, "utf8");
}

function htmlFilesIn(outDir: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) files.push(full);
    }
  };
  walk(outDir);
  return files;
}

// The build links its own files as `/assets/theme.css`, `/_astro/…`,
// `/assets/islands.js`. A served preview has no file server for the build root
// (the engine serves one document, the media comes from the asset store), so
// those files are inlined into the document: stylesheets as `<style>`, local
// scripts as `<script>`. Foreign URLs (CDNs, media) stay as they are, and a
// link to a missing or empty file is dropped instead of costing a 404.
// A stylesheet travels inside an HTML raw-text element here, so `</style` would
// end it early. `<\/` reads the same inside a CSS string and is a dead token
// anywhere else. The value grammar already refuses `<`; this is the second wall,
// for CSS that did not come through it.
function escapeStyleText(css: string): string {
  return css.replace(/<\//g, "<\\/");
}

export function selfContainedHtml(
  html: string,
  outDir: string,
  options: { inlineScripts: boolean } = { inlineScripts: true },
): string {
  const withoutLinks = html.replace(
    /<link\b[^>]*rel="stylesheet"[^>]*>/g,
    (tag) => {
      const href = tag.match(/href="([^"]+)"/)?.[1] ?? "";
      if (/^(https?:)?\/\//.test(href)) return tag;
      const css = readBakedFile(outDir, href);
      return css === undefined || css.trim() === "" ? "" : `<style>${escapeStyleText(css)}</style>`;
    },
  );
  return withoutLinks.replace(
    /<script\b[^>]*\bsrc="([^"]*)"[^>]*><\/script>/g,
    (tag, src: string) => {
      if (/^(https?:)?\/\//.test(src)) return tag;
      if (!options.inlineScripts) return "";
      const script = readBakedFile(outDir, src);
      return script === undefined ? "" : `<script>${script}</script>`;
    },
  );
}

// Inline the build's own files into every emitted page (preview bakes).
export function inlineBakedAssets(outDir: string): void {
  for (const file of htmlFilesIn(outDir)) {
    writeFileSync(
      file,
      selfContainedHtml(readFileSync(file, "utf8"), outDir, {
        inlineScripts: true,
      }),
    );
  }
}

export async function bakeSite(
  input: BakeInput,
  options: BakeOptions = {},
): Promise<BakeResult> {
  const warnings: BakeWarning[] = [...assertBakeable(input.pages)];
  // One warning per payload id, not one per referencing node.
  const missingPayloads = new Set<string>();
  const pagePaths: Record<string, string> = {};
  for (const page of input.pages) pagePaths[page.id] = page.path;
  const ctx = { pagePaths, assets: input.assets ?? {} };

  const definitions = new Map(
    bundledSections.map((section) => [section.type, section]),
  );

  const manifestPages = [];
  let anyMotion = false;
  // True when some page has only a CSS entry and still loads Lenis (see below).
  let anyLenisOnly = false;
  let anyForm = false;
  const islandKinds = new Set<string>();
  // Every payload id a page points at, whether or not this build delivers it.
  const usedPayloadIds = new Set<string>();
  const expandedPages: BakePageInput[] = input.pages.map((page) => {
    const context = input.contexts?.[page.id];
    return {
      ...page,
      tree: expandOrThrow({
        tree: page.tree,
        definitions,
        source: context?.source ?? {},
        ...(context?.lists === undefined ? {} : { lists: context.lists }),
      }),
    };
  });
  for (const page of expandedPages) {
    // Reveals above the fold play as CSS (no wait for the page script): the
    // registry decides which nodes, the markup is stamped from the same call.
    const cssEntry = cssEntryNodeIds(
      page.tree.nodes[page.tree.rootNodeId]?.children ?? [],
      page.tree.nodes,
    );
    const {
      configs,
      warnings: motionWarnings,
      entries: motionEntries,
    } = motionConfigsForTree(page.tree, input.motionTokens, { cssEntry });
    for (const warning of motionWarnings) {
      warnings.push({
        code: warning.code,
        page: page.path,
        nodeId: warning.nodeId,
        message: warning.message,
        suggestion: warning.suggestion,
      });
    }
    const {
      transition,
      css: effectsCss,
      preloader,
      warnings: effectWarnings,
    } = pageEffectsForTree(page.tree);
    const effectCss = [effectsCss, motionEntryCss(motionEntries)]
      .filter((block) => block !== "")
      .join("\n");
    for (const warning of effectWarnings) {
      warnings.push({
        code: warning.code,
        page: page.path,
        nodeId: warning.nodeId,
        message: warning.message,
        suggestion: warning.suggestion,
      });
    }
    const islands = islandsForTree(page.tree);
    for (const kind of islands) islandKinds.add(kind);
    // A `webgl-scene` spec without a surface is a silent no-op: the island
    // hangs on the surface (media `3d-scene`, hero `showcase-3d`), the spec
    // only tunes intensity and the switch. Say so instead of dropping it.
    for (const node of Object.values(page.tree.nodes)) {
      if (node.motion?.preset !== "webgl-scene" || node.motion.enabled === false) continue;
      if (!webglSceneSurface(node)) {
        warnings.push({
          code: "scene-without-surface",
          page: page.path,
          nodeId: node.id,
          message: `Node "${node.id}" carries the webgl-scene preset but renders no 3D surface`,
          suggestion:
            'Use the media variant "3d-scene" or the hero variant "showcase-3d" for the scene.',
        });
      }
    }
    // A carrier whose payload this build does not deliver keeps its poster (or
    // its plate) — say so instead of loading nothing quietly (ADR-0010 §7).
    for (const node of Object.values(page.tree.nodes)) {
      if (node.type !== "payload") continue;
      const payloadId = node.props.payloadId;
      if (typeof payloadId !== "string" || payloadId === "") continue;
      usedPayloadIds.add(payloadId);
      if (input.payloads?.[payloadId] === undefined && !missingPayloads.has(payloadId)) {
        missingPayloads.add(payloadId);
        warnings.push({
          code: "payload-missing",
          page: page.path,
          nodeId: node.id,
          message: `Node "${node.id}" references payload "${payloadId}", which this build does not deliver`,
          suggestion:
            "Add the payload to the site (POST /api/sites/:siteId/code-payloads) or rebuild the area with primitives.",
        });
      }
    }
    if (configs.length > 0) anyMotion = true;
    // A page whose only motion is a CSS entry has no payload, no pending marker
    // and no failsafe, but smooth scroll is a site decision (profile): without
    // this, one page of a site would scroll differently from the rest. It gets
    // Lenis and the page script, nothing of GSAP.
    const lenisOnly =
      configs.length === 0 && motionEntries.length > 0 && input.profile !== "clean";
    if (lenisOnly) anyLenisOnly = true;
    const hasForm = treeHasForms(page.tree);
    if (hasForm) anyForm = true;
    const { entities, warnings: jsonLdWarnings } = collectJsonLd(page.tree);
    for (const message of jsonLdWarnings) {
      warnings.push({ code: "invalid-jsonld", page: page.path, message });
    }
    const needsPlugin = (plugin: string): boolean =>
      configs.some((config) => config.needs?.includes(plugin) ?? false);
    manifestPages.push({
      path: page.path,
      title: page.title,
      description: page.description ?? "",
      ogImage: page.ogImage ?? "",
      lang: pageLang(page.tree),
      tree: page.tree,
      motion: jsonForHtml(motionDataFor(configs, input.breakpoints)),
      // The page-level View Transition block (M6): null unless a node carries
      // a `document` preset; the template inlines it into the head.
      pageTransition: transition === null ? null : pageTransitionCss(transition),
      // The pure-CSS effect blocks (hover-lift, ambient-float, grain) of this
      // page, or null; the template inlines them after the transition.
      motionCss: effectCss === "" ? null : effectCss,
      // preloader-light: the template renders the loading curtain.
      hasPreloader: preloader,
      jsonLd:
        entities.length > 0
          ? jsonForHtml(entities.length === 1 ? entities[0] : { "@context": "https://schema.org", "@graph": entities })
          : null,
      flags: {
        hasMotion: configs.length > 0,
        needsScrollTrigger: needsPlugin("scrolltrigger"),
        needsSplitText: needsPlugin("splittext"),
        // Lenis is a site decision (profile): `clean` stays without smooth
        // scroll; the runtime is never initialized in reduced-motion mode.
        hasLenis: (configs.length > 0 || lenisOnly) && input.profile !== "clean",
        hasPending: configs.some((config) => config.hides === true),
        islands: [...islands],
        hasForm,
      },
    });
  }

  if (options.strict === true) {
    const hard = warnings.find(
      (warning) => warning.code === "pin-excess" || warning.code === "invalid-jsonld",
    );
    if (hard) {
      throw new SenifyError(
        "guardrail",
        `Strict bake blocked: ${hard.message}`,
        {
          field: hard.nodeId ? `pages.${hard.page}.${hard.nodeId}` : `pages.${hard.page}`,
          suggestion: hard.suggestion,
        },
      );
    }
  }

  // The payload files of this build. The integrity prefix is part of the file
  // name, so a changed payload is a changed URL and a changed build (ADR-0010
  // §2) — no cache can serve the previous code.
  const payloadUrls: Record<string, string> = {};
  const bakedPayloads: BakedPayload[] = [];
  for (const id of usedPayloadIds) {
    const delivery = input.payloads?.[id];
    if (delivery === undefined) continue;
    const url = `/assets/payloads/${payloadFileName(id, delivery.integrity)}`;
    payloadUrls[id] = url;
    bakedPayloads.push({
      id,
      url,
      integrity: delivery.integrity,
      bytes: delivery.bytes,
    });
  }

  const sectionsCss = overridesCss(input.pages, input.breakpoints);
  const siteRules = styleRulesReport(input.pages, input.styleRules ?? [], input.breakpoints);
  const siteRulesCss = siteRules.css;
  for (const drop of siteRules.diagnostics) {
    const nodeId = /\[data-node-id="([^"]+)"\]/.exec(drop.selector)?.[1];
    warnings.push({
      code: "css-value-dropped",
      // Style rules are site-wide, so the warning belongs to no single page.
      page: "*",
      ...(nodeId === undefined ? {} : { nodeId }),
      message:
        drop.reason === "unsafe-property"
          ? `Style rule ${drop.selector}: "${drop.property}" is not a valid CSS property name and was dropped`
          : drop.reason === "unsupported-shape"
            ? `Style rule ${drop.selector}: "${drop.property}" holds an object, which CSS cannot take, and was dropped`
            : `Style rule ${drop.selector}: the value of "${drop.property}" is not valid CSS and was dropped`,
      suggestion: "Fix the value in the style panel; the browser would ignore it as well.",
    });
  }
  const stageDir = await stageTemplate(
    {
      site: { name: input.siteName, baseUrl: input.baseUrl, lang: "de" },
      ctx,
      pages: manifestPages,
      fontPreloads: input.fontPreloads ?? [],
      // Only a non-empty file is written, so the page only links it when it
      // exists (an empty <link> would just cost a request).
      sectionsCss: sectionsCss !== "",
      styleRulesCss: siteRulesCss !== "",
      vendor: {
        gsap: "/assets/vendor/gsap.min.js",
        scrollTrigger: "/assets/vendor/ScrollTrigger.min.js",
        splitText: "/assets/vendor/SplitText.min.js",
        lenis: "/assets/vendor/lenis.min.js",
      },
    },
    input.themeCss,
  );
  try {
    // The output folder is absolute from here on. A relative path would make
    // the volume comparison of `buildInto` wrong (a relative path has no
    // root), the build would land in a second folder and be copied instead
    // of written - and the copy put the pages where the caller did not look
    // for them: the build returned without an error and without a page.
    // The build itself does not block the event loop (see `runAstroBuild`).
    const outDir = resolve(options.outDir ?? join(tmpdir(), `senify-bake-${Date.now()}`));
    await buildInto(stageDir, outDir);
    mkdirSync(join(outDir, "assets"), { recursive: true });
    // The theme's webfonts (Sora, Inter): copied into every build so the
    // release renders the very faces the editor previews. The theme CSS
    // references them as root files (`/assets/sora-400.woff2`), the engine
    // serves those from the build root (ticket 17 parity finding).
    const fontDir = FONT_ASSETS_DIR;
    if (existsSync(fontDir)) {
      for (const entry of readdirSync(fontDir)) {
        if (!entry.endsWith(".woff2")) continue;
        copyFileSync(join(fontDir, entry), join(outDir, "assets", entry));
      }
    }
    writeFileSync(join(outDir, "assets", "theme.css"), input.themeCss);
    writeFileSync(
      join(outDir, "assets", "components.css"),
      readFileSync(join(stageDir, "src", "styles", "components.css"), "utf8"),
    );
    if (sectionsCss !== "") writeFileSync(join(outDir, "assets", "sections.css"), sectionsCss);
    if (siteRulesCss !== "") {
      writeFileSync(join(outDir, "assets", "style-rules.css"), siteRulesCss);
    }
    const vendorDir = join(outDir, "assets", "vendor");
    if (anyMotion || anyLenisOnly || islandKinds.has("webgl-scene")) {
      mkdirSync(vendorDir, { recursive: true });
    }
    if (anyMotion || anyLenisOnly) {
      writeFileSync(
        join(outDir, "assets", "page.js"),
        renderPageScript({ lenis: input.profile !== "clean" }),
      );
      // Only CSS-entry pages: Lenis is the one vendor file anything links.
      for (const file of motionVendorFiles()) {
        if (!anyMotion && file.name !== "lenis.min.js") continue;
        copyFileSync(file.from, join(vendorDir, file.name));
      }
    }
    // The 3D island asset (M6): only pages that carry a `webgl-scene` island
    // pay for it — the island script lazy-loads the file when it scrolls in.
    if (islandKinds.has("webgl-scene")) {
      writeFileSync(join(vendorDir, WEBGL_VENDOR_NAME), webglVendorCode());
    }
    // The payloads (ADR-0010): written next to the other runtime files, only
    // the ones a page actually points at. They are part of the build, never a
    // foreign URL fetched at runtime.
    if (bakedPayloads.length > 0) {
      const payloadDir = join(outDir, "assets", "payloads");
      mkdirSync(payloadDir, { recursive: true });
      for (const entry of bakedPayloads) {
        const delivery = input.payloads?.[entry.id];
        if (delivery === undefined) continue;
        writeFileSync(
          join(payloadDir, payloadFileName(entry.id, delivery.integrity)),
          delivery.code,
        );
      }
    }
    if (islandKinds.size > 0) {
      writeFileSync(
        join(outDir, "assets", "islands.js"),
        renderIslandsScript(islandKinds, { payloads: payloadUrls }),
      );
    }
    // Progressive form submit (no logic drift): only pages with a form load it.
    if (anyForm) {
      writeFileSync(join(outDir, "assets", "forms.js"), renderFormsScript());
    }
    // Previews have no file server for the build root: inline the build's own
    // stylesheets and scripts after all of them are written.
    if (options.selfContained === true) inlineBakedAssets(outDir);
    if (input.aeo !== false) {
      writeAeoFiles(outDir, input, expandedPages, definitions);
    }
    return {
      outDir,
      pages: expandedPages.map((page) => ({ path: page.path, file: htmlFileName(page.path) })),
      warnings,
      jsBytes: jsBytesIn(outDir),
      payloads: bakedPayloads,
    };
  } finally {
    if (!options.keepWorkDir) rmSync(stageDir, { recursive: true, force: true });
  }
}

async function stageTemplate(manifest: unknown, themeCss: string): Promise<string> {
  // Staged inside the workspace (not tmpdir) so Astro resolves workspace
  // packages and root node_modules by walking up the directory tree.
  const stageDir = join(
    rendererDir,
    "..",
    ".bake",
    `stage-${Date.now()}-${Math.floor(Math.random() * 0xffff)}`,
  );
  cpSync(join(rendererDir, "..", "astro-template"), stageDir, { recursive: true });
  rewriteTailwindSource(stageDir);
  mkdirSync(join(stageDir, "src", "generated"), { recursive: true });
  writeFileSync(
    join(stageDir, "src", "generated", "manifest.json"),
    JSON.stringify(manifest),
  );
  writeFileSync(join(stageDir, "src", "generated", "theme.css"), themeCss);
  return stageDir;
}

// The template's global.css points `@source` at the section components, which
// live in packages/registry — outside the copied template. The copy sits one
// directory deeper, so the relative path is recomputed for the staged file.
function rewriteTailwindSource(stageDir: string): void {
  const globalCss = join(stageDir, "src", "styles", "global.css");
  if (!existsSync(globalCss)) return;
  const registry = join(rendererDir, "..", "..", "registry", "src");
  const sourcePath = relative(dirname(globalCss), registry).split(sep).join("/");
  writeFileSync(
    globalCss,
    readFileSync(globalCss, "utf8").replace(
      /^@source\s+"[^"]*registry[^"]*";/m,
      `@source "${sourcePath}";`,
    ),
  );
}

// The Astro build moves its prerendered assets with a rename from the stage
// directory into the output directory. A rename across volumes fails on
// Windows (`EXDEV: cross-device link not permitted`), and the stage has to
// live inside the workspace (so Astro resolves the workspace packages) while
// the output may live on another drive - a temp directory, a data directory.
//
// So the build writes next to the stage and the result is copied to the
// target. On one volume the copy is skipped and the build writes straight to
// the target, as before.
async function buildInto(stageDir: string, outDir: string): Promise<void> {
  const stageRoot = parse(stageDir).root.toLowerCase();
  const outRoot = parse(outDir).root.toLowerCase();
  if (stageRoot === outRoot) {
    await runAstroBuild(stageDir, outDir);
    return;
  }
  const buildDir = join(dirname(stageDir), `out-${Date.now()}-${Math.floor(Math.random() * 0xffff)}`);
  try {
    await runAstroBuild(stageDir, buildDir);
    cpSync(buildDir, outDir, { recursive: true });
  } finally {
    rmSync(buildDir, { recursive: true, force: true });
  }
}

// The Astro build runs as a child process. It must not block the event loop:
// a bake happens while the dashboard serves requests, and with `spawnSync`
// the dashboard, the editor and the MCP tools were all silent for the whole
// build (up to three minutes). `spawn` keeps the process responsive and
// lets the same timeout kill a build that hangs.
// The build gets a hard deadline: a hanging Astro build is killed instead of
// holding the process. The constant is named and exported because the queue
// needs it: the lease of a claimed bake job has to outlive the build, or a
// second worker may take over a job that is still running (Fachanalyse 3, B3).
export const BAKE_BUILD_TIMEOUT_MS = 180_000;

async function runAstroBuild(stageDir: string, outDir: string): Promise<void> {
  const result = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    error?: Error;
  }>((resolve) => {
    const child = spawn(
      process.execPath,
      [astroBin(), "build", "--root", stageDir, "--outDir", outDir],
      {
        cwd: stageDir,
        env: {
          ...process.env,
          ASTRO_TELEMETRY_DISABLED: "1",
          FORCE_COLOR: "0",
        },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, BAKE_BUILD_TIMEOUT_MS);
    child.on("error", (error: Error) => {
      clearTimeout(timer);
      resolve({ code: null, signal: null, stdout, stderr, error });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
  if (result.code !== 0) {
    const output = `${result.stdout}\n${result.stderr}`.slice(-2000);
    const cause = result.error ? ` (${result.error.message})` : "";
    throw new Error(
      `Astro build failed (exit ${result.code ?? result.signal ?? "signal"}${cause}):\n${output}`,
    );
  }
}

function writeAeoFiles(
  outDir: string,
  input: BakeInput,
  pages: BakePageInput[],
  definitions: Map<string, SectionDefinition>,
): void {
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  for (const page of pages) {
    const file = join(outDir, mdFileName(page.path));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      pageToMarkdown(
        {
          path: page.path,
          title: page.title,
          description: page.description,
          tree: page.tree,
        },
        definitions,
      ),
    );
  }
  writeFileSync(
    join(outDir, "llms.txt"),
    buildLlmsTxt(
      input.siteName,
      baseUrl,
      pages.map((page) => ({
        path: page.path,
        title: page.title,
        description: page.description,
      })),
    ),
  );
  writeFileSync(
    join(outDir, "sitemap.xml"),
    buildSitemap(
      baseUrl,
      pages.map((page) => page.path),
      input.siteDate,
    ),
  );
  writeFileSync(join(outDir, "robots.txt"), buildRobots(baseUrl));
}

function jsBytesIn(outDir: string): number {
  let total = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) total += statSync(full).size;
    }
  };
  walk(outDir);
  return total;
}
