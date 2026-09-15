import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { bakeSite, parseDurationMs, type BakeWarning } from "@senify/renderer";
import { resolveTheme } from "@senify/tokens";
import { collectAssetIds } from "./media.ts";
import { resolveStoredFile } from "./storage.ts";
import type { Page, Site } from "./types.ts";
import type { Store } from "./store.ts";

export type BakeOutcome = {
  outDir: string;
  pageCount: number;
  warnings: BakeWarning[];
};

type DeliveredAsset = {
  assetId: string;
  filename: string;
  source: string;
  url: string;
};

// Only the assets a page actually references are delivered; the URL map
// resolves `assetRef`s in the sections (missing assets stay marked).
async function collectDeliverableAssets(input: {
  store: Store;
  site: Site;
  pages: Page[];
  dataDir: string;
}): Promise<DeliveredAsset[]> {
  const referenced = collectAssetIds(input.pages);
  if (referenced.size === 0) return [];
  const delivered: DeliveredAsset[] = [];
  const assets = await input.store.listAssets(input.site.id, { status: "ready" });
  for (const asset of assets) {
    if (!referenced.has(asset.id)) continue;
    const source = resolveStoredFile(input.dataDir, asset.storageRef);
    if (source === undefined || !existsSync(source)) continue;
    delivered.push({
      assetId: asset.id,
      filename: asset.filename,
      source,
      // Version query busts caches after a replace (the URL path stays stable).
      url: `/assets/${asset.id}/${encodeURIComponent(asset.filename)}?v=${Date.parse(asset.updatedAt)}`,
    });
  }
  return delivered;
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
  const delivered = await collectDeliverableAssets({
    store,
    site: input.site,
    pages: input.pages,
    dataDir: input.dataDir,
  });
  const assets: Record<string, string> = {};
  for (const entry of delivered) assets[entry.assetId] = entry.url;
  const result = await bakeSite(
    {
      siteName: input.site.name,
      baseUrl: `https://${input.site.slug}.senify.xyz`,
      pages: input.pages.map((page) => ({
        id: page.id,
        path: page.path,
        title: page.title,
        description: page.meta.description,
        ogImage: page.meta.ogImage,
        tree: page.draft,
      })),
      themeCss: siteTheme.css,
      motionTokens: {
        ease: resolved.motion.ease,
        baseDurationMs:
          baseDuration === undefined ? 300 : parseDurationMs(baseDuration),
        baseStaggerMs: 80,
      },
      profile: input.site.profile,
      assets,
      aeo: input.aeo,
    },
    { outDir: input.outDir },
  );
  // Astro empties the output directory during the build, so the files are
  // copied only afterwards.
  for (const entry of delivered) {
    const target = join(result.outDir, "assets", entry.assetId, entry.filename);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(entry.source, target);
  }
  return {
    outDir: result.outDir,
    pageCount: result.pages.length,
    warnings: result.warnings,
  };
}
