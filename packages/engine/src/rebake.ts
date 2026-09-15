import { findListNodes } from "./lists.ts";
import { entryPathFor } from "./paths.ts";
import type { Store } from "./store.ts";
import type { Collection, Entry, Page } from "./types.ts";

// Re-Bake dependency index (artifacts/23 §6): derives the affected paths from
// an entry, collection, layout or template change so a publish only bakes the
// detail route and the lists that actually show it.

export type RebakeTrigger = {
  siteId: string;
  reason: string;
  queued: true;
  at: string;
  affectedPaths: string[];
};

const rebakeCounts = new Map<string, number>();

// Trigger stub for ticket 23: T09 owns the trigger, not the job. It records and
// counts the request so tests and diagnostics can observe it.
export function triggerRebake(
  siteId: string,
  reason: string,
  affectedPaths: string[] = [],
): RebakeTrigger {
  rebakeCounts.set(siteId, (rebakeCounts.get(siteId) ?? 0) + 1);
  const trigger: RebakeTrigger = {
    siteId,
    reason,
    queued: true,
    at: new Date().toISOString(),
    affectedPaths,
  };
  console.log(
    `[engine] rebake requested (site ${siteId}): ${reason} → ${affectedPaths.join(", ") || "full site"}`,
  );
  return trigger;
}

export function rebakeCount(siteId: string): number {
  return rebakeCounts.get(siteId) ?? 0;
}

export function collectionOfList(node: { props: Record<string, unknown> }): string {
  const value = node.props.collectionId;
  return typeof value === "string" ? value : "";
}

// Pages carrying a collection-list for this collection (the "affected lists").
export function listPathsForCollection(
  pages: readonly Page[],
  collectionId: string,
): string[] {
  const paths = new Set<string>();
  for (const page of pages) {
    if (page.template !== null) continue;
    for (const { node } of findListNodes(page.draft)) {
      if (collectionOfList(node as { props: Record<string, unknown> }) === collectionId) {
        paths.add(page.path);
      }
    }
  }
  return [...paths];
}

async function detailPaths(
  store: Store,
  siteId: string,
  collectionId: string,
): Promise<string[]> {
  const collection = await store.getCollection(collectionId);
  const entries = await store.listEntries({
    siteId,
    collectionId,
    status: "published",
    limit: 500,
  });
  return entries.map((entry) => entryPathFor(collection.urlPattern, entry.slug));
}

// Entry publish/unpublish/delete: its own detail route plus every list page
// that shows the collection.
export async function rebakePathsForEntry(
  store: Store,
  input: { siteId: string; entry: Entry; collection: Collection },
): Promise<string[]> {
  const pages = await store.listPageDrafts(input.siteId);
  const paths = new Set<string>([
    entryPathFor(input.collection.urlPattern, input.entry.slug),
    ...listPathsForCollection(pages, input.collection.id),
  ]);
  return [...paths];
}

// Collection schema change: the list pages of the collection and the detail
// routes that render its entries.
export async function rebakePathsForCollection(
  store: Store,
  input: { siteId: string; collectionId: string },
): Promise<string[]> {
  const pages = await store.listPageDrafts(input.siteId);
  const paths = new Set<string>([
    ...listPathsForCollection(pages, input.collectionId),
    ...(await detailPaths(store, input.siteId, input.collectionId)),
  ]);
  return [...paths];
}

// Layout or template change: every page/detail route that uses it.
export async function rebakePathsForPage(
  store: Store,
  input: { siteId: string; pageId: string },
): Promise<string[]> {
  const pages = await store.listPageDrafts(input.siteId);
  const page = pages.find((candidate) => candidate.id === input.pageId);
  if (page === undefined) return [];
  const paths = new Set<string>();
  if (page.template === null) {
    paths.add(page.path);
    return [...paths];
  }
  if (page.template.kind === "layout") {
    for (const candidate of pages) {
      if (candidate.template === null && candidate.layoutId === page.id) {
        paths.add(candidate.path);
      }
      if (candidate.template?.kind === "collection" && candidate.layoutId === page.id) {
        for (const collectionId of candidate.template.collectionIds) {
          for (const path of await detailPaths(store, input.siteId, collectionId)) {
            paths.add(path);
          }
        }
      }
    }
  }
  if (page.template.kind === "collection") {
    for (const collectionId of page.template.collectionIds) {
      for (const path of await detailPaths(store, input.siteId, collectionId)) {
        paths.add(path);
      }
    }
  }
  return [...paths];
}
