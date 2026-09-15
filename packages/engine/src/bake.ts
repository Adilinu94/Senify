import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  bakeSite,
  parseDurationMs,
  type AssetDelivery,
  type BakePageInput,
  type BakeWarning,
  type BindingEntry,
  type BindingSource,
  type PageContext,
} from "@senify/renderer";
import { resolveTheme } from "@senify/tokens";
import type { NodeTree } from "@senify/section-sdk";
import { prefetchLists } from "./lists.ts";
import { toBindingEntry } from "./lists.ts";
import { collectAssetIds } from "./media.ts";
import { resolveStoredFile } from "./storage.ts";
import {
  composePageTree,
  entryPathFor,
  findEntryTemplate,
  findFirstOutlet,
  findLayout,
} from "./templates.ts";
import type { Page, Site } from "./types.ts";
import type { Store } from "./store.ts";

export type BakeOutcome = {
  outDir: string;
  pageCount: number;
  warnings: BakeWarning[];
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

export type BakeBuild = {
  pages: BakePageInput[];
  contexts: Record<string, PageContext>;
  trees: NodeTree[];
};

// Resolves the template chain and prefetches lists for every route a site
// exposes: normal pages (layout → page) and entry detail routes (layout →
// entry template → article), plus the static `?seite=N` variants.
export async function buildBakeInput(
  store: Store,
  input: { site: Site; pages: Page[]; aeo?: boolean },
): Promise<BakeBuild> {
  const { site, pages } = input;
  const collections = await store.listCollections(site.id);
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
  }): Promise<void> => {
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
    const layout = findLayout(pages, page.layoutId);
    const tree = composePageTree({
      layout: layout?.draft ?? null,
      template: null,
      page: page.draft,
      article: null,
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
    });
  }

  for (const collection of collections) {
    const template = findEntryTemplate(pages, collection.id);
    if (template === undefined) continue;
    // An entry template without outlet is unfinished and yields no route.
    if (findFirstOutlet(template.draft) === undefined) continue;
    const layout = findLayout(pages, template.layoutId);
    const published = await store.listEntries({
      siteId: site.id,
      collectionId: collection.id,
      status: "published",
      limit: 500,
    });
    const bodyField = collection.fields.find(
      (field) => field.type === "richtext" && field.deprecated !== true,
    );
    for (const entry of published) {
      const article =
        bodyField === undefined
          ? ""
          : typeof entry.cells[bodyField.id] === "string"
            ? String(entry.cells[bodyField.id])
            : "";
      const tree = composePageTree({
        layout: layout?.draft ?? null,
        template: template.draft,
        page: null,
        article,
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
      });
    }
  }

  return out;
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
  },
): Promise<BakeOutcome> {
  const siteTheme = await store.getTheme(input.site.id);
  const resolved = resolveTheme(siteTheme.theme);
  const baseDuration = resolved.motion.duration.base;
  mkdirSync(input.outDir, { recursive: true });
  const build = await buildBakeInput(store, {
    site: input.site,
    pages: input.pages,
    ...(input.aeo === undefined ? {} : { aeo: input.aeo }),
  });
  const delivered = await collectDeliverableAssets({
    store,
    site: input.site,
    trees: build.trees,
    dataDir: input.dataDir,
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
      motionTokens: {
        ease: resolved.motion.ease,
        baseDurationMs:
          baseDuration === undefined ? 300 : parseDurationMs(baseDuration),
        baseStaggerMs: 80,
      },
      profile: input.site.profile,
      assets,
      ...(input.aeo === undefined ? {} : { aeo: input.aeo }),
    },
    { outDir: input.outDir },
  );
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
  return {
    outDir: result.outDir,
    pageCount: result.pages.length,
    warnings: result.warnings,
  };
}
