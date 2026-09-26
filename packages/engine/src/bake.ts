import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SenifyError } from "@senify/core";
import {
  bakeSite,
  parseDurationMs,
  selfContainedHtml,
  type AssetDelivery,
  type BakePageInput,
  type BakeWarning,
  type BindingEntry,
  type BindingSource,
  type PageContext,
  type PayloadDelivery,
} from "@senify/renderer";
import { resolveTheme } from "@senify/tokens";
import type { NodeTree } from "@senify/section-sdk";
import { prefetchLists } from "./lists.ts";
import { toBindingEntry } from "./lists.ts";
import { collectAssetIds } from "./media.ts";
import { MAX_PAGE_PAYLOAD_BYTES, payloadRefOf } from "./guardrails.ts";
import { stampFormsForBuild, type FormSigner } from "./forms.ts";
import { resolveStoredFile } from "./storage.ts";
import {
  composePageTree,
  entryPathFor,
  findEntryTemplate,
  findFirstOutlet,
  findLayout,
} from "./templates.ts";
import type {
  CellValue,
  CodePayload,
  Collection,
  Entry,
  Page,
  Site,
} from "./types.ts";
import type { BakedPayload } from "@senify/renderer";
import type { Store } from "./store.ts";

export type BakeOutcome = {
  outDir: string;
  pageCount: number;
  warnings: BakeWarning[];
  // The payload manifest of the bake (ADR-0010): what was emitted and where it
  // sits — the release manifest and the import report read this.
  payloads: BakedPayload[];
};

type DeliveredVariant = {
  format: "avif" | "webp";
  width: number;
  storageRef: string;
  url: string;
};

type DeliveredAsset = {
  assetId: string;
  filename: string;
  source: string;
  url: string;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  variants: DeliveredVariant[];
};

// Only the assets a page actually references are delivered; the URL map
// resolves `assetRef`s in the sections (missing assets stay marked).
async function collectDeliverableAssets(input: {
  store: Store;
  site: Site;
  trees: NodeTree[];
  dataDir: string;
}): Promise<DeliveredAsset[]> {
  const referenced = collectAssetIds(input.trees.map((draft) => ({ draft })));
  if (referenced.size === 0) return [];
  const delivered: DeliveredAsset[] = [];
  const assets = await input.store.listAssets(input.site.id, { status: "ready" });
  for (const asset of assets) {
    if (!referenced.has(asset.id)) continue;
    const source = resolveStoredFile(input.dataDir, asset.storageRef);
    if (source === undefined || !existsSync(source)) continue;
    // Version query busts caches after a replace (the URL path stays stable).
    const version = Date.parse(asset.updatedAt);
    delivered.push({
      assetId: asset.id,
      filename: asset.filename,
      source,
      url: `/assets/${asset.id}/${encodeURIComponent(asset.filename)}?v=${version}`,
      width: asset.width,
      height: asset.height,
      blurhash: asset.blurhash,
      variants: asset.variants.map((variant) => ({
        format: variant.format,
        width: variant.width,
        storageRef: variant.storageRef,
        url: `/assets/${asset.id}/variants/${variant.width}.${variant.format}?v=${version}`,
      })),
    });
  }
  return delivered;
}

// Imported foreign code (ADR-0010): only the payloads the built trees point at
// are delivered, and only their bundle is read. A reference to a payload that
// does not exist (or belongs to another site) is not an error — the page keeps
// its poster and the renderer reports it; a bake must never fail because a
// carrier is empty.
async function collectDeliverablePayloads(input: {
  store: Store;
  site: Site;
  trees: NodeTree[];
}): Promise<{
  delivery: Record<string, PayloadDelivery>;
  sizes: Map<string, number>;
}> {
  const referenced = new Set<string>();
  for (const tree of input.trees) {
    for (const node of Object.values(tree.nodes)) {
      const ref = payloadRefOf(node);
      if (ref !== undefined) referenced.add(ref);
    }
  }
  const delivery: Record<string, PayloadDelivery> = {};
  const sizes = new Map<string, number>();
  for (const id of referenced) {
    let found: { payload: CodePayload; bundle: string };
    try {
      found = await input.store.getCodePayloadBundle(id);
    } catch {
      continue;
    }
    if (found.payload.siteId !== input.site.id) continue;
    delivery[id] = {
      code: found.bundle,
      integrity: found.payload.integrity,
      bytes: found.payload.bytes,
    };
    sizes.set(id, found.payload.bytes);
  }
  return { delivery, sizes };
}

export type BakeBuild = {
  pages: BakePageInput[];
  contexts: Record<string, PageContext>;
  trees: NodeTree[];
};

// Resolves the template chain and prefetches lists for every route a site
// exposes: normal pages (layout → page) and entry detail routes (layout →
// entry template → article), plus the static `?seite=N` variants.
//
// `previewEntry` is the one exception of the published-only rule (T10): the
// live preview renders exactly this entry from its current cells, even when
// it is still a draft — every other route and list stays published-only.
export async function buildBakeInput(
  store: Store,
  input: {
    site: Site;
    pages: Page[];
    aeo?: boolean;
    previewEntry?: { entry: Entry; collection: Collection };
  },
): Promise<BakeBuild> {
  const { site, pages } = input;
  const collections = await store.listCollections(site.id);
  const defaultLayout = (await store.getEngineSettings()).defaultLayout;
  const collectionsById = new Map(
    collections.map((collection) => [collection.id, collection]),
  );
  const siteInfo: Record<string, unknown> = {
    name: site.name,
    slug: site.slug,
    profile: site.profile,
  };
  const entries: Record<string, BindingEntry> = {};
  for (const collection of collections) {
    const published = await store.listEntries({
      siteId: site.id,
      collectionId: collection.id,
      status: "published",
      limit: 500,
    });
    for (const entry of published) {
      entries[entry.id] = toBindingEntry(entry, collection);
    }
  }
  const preview = input.previewEntry;
  if (preview !== undefined && preview.collection.siteId === site.id) {
    entries[preview.entry.id] = toBindingEntry(preview.entry, preview.collection);
  }

  const out: BakeBuild = { pages: [], contexts: {}, trees: [] };

  const addRoute = async (route: {
    pageId: string;
    path: string;
    title: string;
    description?: string;
    ogImage?: string;
    tree: NodeTree;
    source: BindingSource;
    currentEntryId: string | null;
    // Draft-id -> composed-id pairs of the layout splice (ticket 22). Scoped
    // style rules are bound to draft ids; the renderer remaps them through
    // this map when it compiles `assets/style-rules.css`. The values are lists
    // since ticket 04: a component part has one composed id per instance.
    idMap?: ReadonlyMap<string, string[]>;
  }): Promise<void> => {
    const nodeIdMap =
      route.idMap === undefined || route.idMap.size === 0
        ? undefined
        : Object.fromEntries(route.idMap);
    const base = await prefetchLists({
      store,
      tree: route.tree,
      collections: collectionsById,
      currentEntryId: route.currentEntryId,
      query: {},
      basePath: route.path,
    });
    out.pages.push({
      id: route.pageId,
      path: route.path,
      title: route.title,
      ...(route.description === undefined ? {} : { description: route.description }),
      ...(route.ogImage === undefined ? {} : { ogImage: route.ogImage }),
      ...(nodeIdMap === undefined ? {} : { nodeIdMap }),
      tree: route.tree,
    });
    out.trees.push(route.tree);
    out.contexts[route.pageId] = {
      source: { ...route.source, query: {} },
      lists: base.lists,
    };
    // Static pagination: `/path/seite/N` renders the same page with the list
    // on page N, so `?seite=N` deep links work without JavaScript.
    const param = base.pageParams[0] ?? "seite";
    for (let page = 2; page <= base.maxPageCount; page += 1) {
      const query: Record<string, string> = { [param]: String(page) };
      const variant = await prefetchLists({
        store,
        tree: route.tree,
        collections: collectionsById,
        currentEntryId: route.currentEntryId,
        query,
        basePath: route.path,
      });
      const variantId = `${route.pageId}#seite${page}`;
      out.pages.push({
        id: variantId,
        path: `${route.path}/seite/${page}`,
        title: route.title,
        ...(route.description === undefined
          ? {}
          : { description: route.description }),
        ...(nodeIdMap === undefined ? {} : { nodeIdMap }),
        tree: route.tree,
      });
      out.trees.push(route.tree);
      out.contexts[variantId] = {
        source: { ...route.source, query },
        lists: variant.lists,
      };
    }
  };

  for (const page of pages) {
    // Template pages have no route of their own (no sitemap/navigation entry).
    if (page.template !== null) continue;
    const layout = findLayout(pages, page.layoutId, defaultLayout);
    const idMap = new Map<string, string[]>();
    const tree = composePageTree({
      layout: layout?.draft ?? null,
      template: null,
      page: page.draft,
      article: null,
      idMap,
    });
    await addRoute({
      pageId: page.id,
      path: page.path,
      title: page.title,
      ...(page.meta.description === undefined
        ? {}
        : { description: page.meta.description }),
      ...(page.meta.ogImage === undefined ? {} : { ogImage: page.meta.ogImage }),
      tree,
      source: { site: siteInfo, entries },
      currentEntryId: null,
      idMap,
    });
  }

  for (const collection of collections) {
    const template = findEntryTemplate(pages, collection.id);
    if (template === undefined) continue;
    // An entry template without outlet is unfinished and yields no route.
    if (findFirstOutlet(template.draft) === undefined) continue;
    const layout = findLayout(pages, template.layoutId, defaultLayout);
    const published = await store.listEntries({
      siteId: site.id,
      collectionId: collection.id,
      status: "published",
      limit: 500,
    });
    // The preview entry gets its own route even as a draft; every other
    // route stays published-only. A published entry is not duplicated.
    const routeEntries =
      preview !== undefined &&
      preview.collection.id === collection.id &&
      !published.some((entry) => entry.id === preview.entry.id)
        ? [...published, preview.entry]
        : published;
    const bodyField = collection.fields.find(
      (field) => field.type === "richtext" && field.deprecated !== true,
    );
    for (const entry of routeEntries) {
      const article =
        bodyField === undefined
          ? ""
          : typeof entry.cells[bodyField.id] === "string"
            ? String(entry.cells[bodyField.id])
            : "";
      const idMap = new Map<string, string[]>();
      const tree = composePageTree({
        layout: layout?.draft ?? null,
        template: template.draft,
        page: null,
        article,
        idMap,
      });
      const title =
        typeof entry.cells[collection.titleField] === "string"
          ? String(entry.cells[collection.titleField])
          : entry.slug;
      await addRoute({
        pageId: `entry:${entry.id}`,
        path: entryPathFor(collection.urlPattern, entry.slug),
        title,
        tree,
        source: { site: siteInfo, entries, entry: entries[entry.id] },
        currentEntryId: entry.id,
        idMap,
      });
    }
  }

  return out;
}

// Static route file of a site path (`/blog/beitrag` → `blog/beitrag/index.html`).
function htmlFileFor(path: string): string {
  return path === "/" ? "index.html" : `${path.slice(1)}/index.html`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Slug history lands as a static redirect page: a host without server rules
// still sends the old path to the new one (canonical + refresh + visible link).
function redirectHtml(toPath: string): string {
  const target = escapeHtml(toPath);
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta http-equiv="refresh" content="0; url=${target}" />
<link rel="canonical" href="${target}" />
<title>Weiterleitung</title>
</head>
<body>
<p>Diese Seite ist umgezogen: <a href="${target}">${target}</a></p>
</body>
</html>
`;
}

// Draft and release builds share one path: the renderer bakes whatever
// pages it gets, the engine owns directories and bookkeeping.
export async function bakePages(
  store: Store,
  input: {
    site: Site;
    pages: Page[];
    outDir: string;
    dataDir: string;
    aeo?: boolean;
    // Forms (T11): with a signer the bake freezes each form and stamps a
    // signed token into the page; without one the forms stay static.
    formSigner?: FormSigner;
    formBaseUrl?: string;
    // Preview bakes inline the build's own stylesheets and island scripts into
    // every page, so the served document needs no file server for the build
    // root (see servePreviewFile in http.ts).
    selfContained?: boolean;
    // The build's own date for `sitemap.xml` (E2); absent = today.
    siteDate?: string;
    // Live preview (T10): resolve exactly this entry from its current cells.
    previewEntry?: { entry: Entry; collection: Collection };
  },
): Promise<BakeOutcome> {
  const siteTheme = await store.getTheme(input.site.id);
  // The site-wide rule registry is the one source for the release: the engine
  // reads it here, the renderer compiles it into `assets/style-rules.css`.
  const styleRules = await store.listStyleRules(input.site.id);
  const resolved = resolveTheme(siteTheme.theme);
  const baseDuration = resolved.motion.duration.base;
  mkdirSync(input.outDir, { recursive: true });
  const build = await buildBakeInput(store, {
    site: input.site,
    pages: input.pages,
    ...(input.aeo === undefined ? {} : { aeo: input.aeo }),
    ...(input.previewEntry === undefined ? {} : { previewEntry: input.previewEntry }),
  });
  if (input.formSigner !== undefined) {
    await stampFormsForBuild({
      store,
      signer: input.formSigner,
      siteId: input.site.id,
      pages: build.pages,
      ...(input.formBaseUrl === undefined ? {} : { baseUrl: input.formBaseUrl }),
    });
  }
  const delivered = await collectDeliverableAssets({
    store,
    site: input.site,
    trees: build.trees,
    dataDir: input.dataDir,
  });
  const payloads = await collectDeliverablePayloads({
    store,
    site: input.site,
    trees: build.trees,
  });
  const assets: Record<string, AssetDelivery> = {};
  for (const entry of delivered) {
    assets[entry.assetId] = {
      src: entry.url,
      width: entry.width,
      height: entry.height,
      blurhash: entry.blurhash,
      variants: entry.variants.map((variant) => ({
        format: variant.format,
        width: variant.width,
        url: variant.url,
      })),
    };
  }
  const result = await bakeSite(
    {
      siteName: input.site.name,
      baseUrl: `https://${input.site.slug}.senify.xyz`,
      pages: build.pages,
      contexts: build.contexts,
      themeCss: siteTheme.css,
      styleRules,
      motionTokens: {
        ease: resolved.motion.ease,
        baseDurationMs:
          baseDuration === undefined ? 300 : parseDurationMs(baseDuration),
        baseStaggerMs: 80,
      },
      profile: input.site.profile,
      assets,
      payloads: payloads.delivery,
      ...(input.aeo === undefined ? {} : { aeo: input.aeo }),
      ...(input.siteDate === undefined ? {} : { siteDate: input.siteDate }),
    },
    { outDir: input.outDir, selfContained: input.selfContained === true },
  );
  // The page byte budget (ADR-0010 §6): the renderer writes the files, the
  // budget lives in the engine's guardrails — checked here, where the sizes are
  // known (the count budget is checked on every write, `hardGuardrailsForTree`).
  for (const page of build.pages) {
    let bytes = 0;
    for (const node of Object.values(page.tree.nodes)) {
      const ref = payloadRefOf(node);
      if (ref === undefined) continue;
      bytes += payloads.sizes.get(ref) ?? 0;
    }
    if (bytes > MAX_PAGE_PAYLOAD_BYTES) {
      result.warnings.push({
        code: "payload-over-budget",
        page: page.path,
        message: `Page loads ${bytes} bytes of imported code (max ${MAX_PAGE_PAYLOAD_BYTES})`,
        suggestion:
          "Move a payload to its own page or rebuild one of them with primitives.",
      });
    }
  }
  // Astro empties the output directory during the build, so the files are
  // copied only afterwards (original and, when present, the encoded ladder).
  for (const entry of delivered) {
    const target = join(result.outDir, "assets", entry.assetId, entry.filename);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(entry.source, target);
    for (const variant of entry.variants) {
      const from = resolveStoredFile(input.dataDir, variant.storageRef);
      if (from === undefined || !existsSync(from)) continue;
      const variantTarget = join(
        result.outDir,
        "assets",
        entry.assetId,
        "variants",
        `${variant.width}.${variant.format}`,
      );
      mkdirSync(dirname(variantTarget), { recursive: true });
      cpSync(from, variantTarget);
    }
  }
  // Slug history: an old detail path gets a static redirect page, unless a live
  // route already occupies it (a published entry always wins over its history).
  for (const redirect of await store.listEntryRedirects(input.site.id)) {
    const target = join(result.outDir, htmlFileFor(redirect.fromPath));
    if (existsSync(target)) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, redirectHtml(redirect.toPath));
  }
  return {
    outDir: result.outDir,
    pageCount: result.pages.length,
    warnings: result.warnings,
    payloads: result.payloads,
  };
}

// The entry preview is a single HTML document inside the editor's sandboxed
// iframe: the bake's own stylesheets are inlined and script tags with a src are
// dropped, so the document needs no file server for its own build output.
// Media keeps its served /assets URLs.
function selfContainedPreviewHtml(html: string, outDir: string): string {
  return selfContainedHtml(html, outDir, { inlineScripts: false });
}

// Live preview of one entry (artifacts/23 §5): it renders through the same
// bake path as the build, into a throw-away directory that is removed again.
// The entry may be a draft, and `cells`/`slug` overlay its stored row — the
// entry editor previews unsaved typing without writing anything (T10).
export async function renderEntryPreview(input: {
  store: Store;
  dataDir: string;
  entryId: string;
  formSigner?: FormSigner;
  cells?: Record<string, CellValue>;
  slug?: string;
}): Promise<{ path: string; html: string; status: number }> {
  const stored = await input.store.getEntry(input.entryId);
  if (stored.deletedAt !== null) {
    throw new SenifyError(
      "not_found",
      `Entry "${stored.id}" is in the trash`,
      { field: "entryId", suggestion: "Restore the entry before previewing it." },
    );
  }
  const entry: Entry = {
    ...stored,
    ...(input.cells === undefined ? {} : { cells: input.cells }),
    ...(input.slug === undefined ? {} : { slug: input.slug }),
  };
  const site = await input.store.getSite(entry.siteId);
  const collection = await input.store.getCollection(entry.collectionId);
  const path = entryPathFor(collection.urlPattern, entry.slug);
  const pages = await input.store.listPageDrafts(site.id);
  const outDir = mkdtempSync(join(tmpdir(), "senify-entry-preview-"));
  try {
    const baked = await bakePages(input.store, {
      site,
      pages,
      outDir,
      dataDir: input.dataDir,
      ...(input.formSigner === undefined ? {} : { formSigner: input.formSigner }),
      previewEntry: { entry, collection },
    });
    const file = join(baked.outDir, htmlFileFor(path));
    if (!existsSync(file)) {
      throw new SenifyError(
        "not_found",
        `Entry "${entry.id}" has no baked route at "${path}"`,
        {
          field: "entryId",
          suggestion:
            "Give the collection an entry template with an outlet (the entry may stay a draft).",
        },
      );
    }
    return {
      path,
      html: selfContainedPreviewHtml(readFileSync(file, "utf8"), baked.outDir),
      status: 200,
    };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}
