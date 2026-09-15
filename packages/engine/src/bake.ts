import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  bakeSite,
  parseDurationMs,
  type AssetDelivery,
  type BakeWarning,
} from "@senify/renderer";
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
