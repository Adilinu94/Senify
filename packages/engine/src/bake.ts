import { mkdirSync } from "node:fs";
import { bakeSite, parseDurationMs, type BakeWarning } from "@senify/renderer";
import { resolveTheme } from "@senify/tokens";
import type { Page, Site } from "./types.ts";
import type { Store } from "./store.ts";

export type BakeOutcome = {
  outDir: string;
  pageCount: number;
  warnings: BakeWarning[];
};

// Draft and release builds share one path: the renderer bakes whatever
// pages it gets, the engine owns directories and bookkeeping.
export async function bakePages(
  store: Store,
  input: {
    site: Site;
    pages: Page[];
    outDir: string;
    aeo?: boolean;
  },
): Promise<BakeOutcome> {
  const siteTheme = await store.getTheme(input.site.id);
  const resolved = resolveTheme(siteTheme.theme);
  const baseDuration = resolved.motion.duration.base;
  mkdirSync(input.outDir, { recursive: true });
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
      aeo: input.aeo,
    },
    { outDir: input.outDir },
  );
  return {
    outDir: result.outDir,
    pageCount: result.pages.length,
    warnings: result.warnings,
  };
}
