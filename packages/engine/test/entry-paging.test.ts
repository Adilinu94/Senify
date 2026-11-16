import { describe, expect, it, vi } from "vitest";
import type { Store } from "../src/store.ts";
import { listEntries } from "../src/content.ts";

describe("Vollständige Ergebnismenge für Eintragsseiten", () => {
  it("holt auch Treffer jenseits der internen 500er-Abfrage vor Sortierung und Paging", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({
      id: String(index).padStart(4, "0"), collectionId: "c", updatedAt: "2026-01-01", cells: { title: `Eintrag ${index}` },
    }));
    const load = vi.fn(async ({ offset = 0, limit }: { offset?: number; limit: number }) => rows.slice(offset, offset + limit));
    const store = {
      getSite: async () => ({}),
      getCollection: async () => ({ titleField: "title" }),
      listEntries: load,
    } as unknown as Store;
    const entries = await listEntries(store, {
      siteId: "s", filters: { trashed: false, sort: "updatedAt", dir: "asc", limit: 2 }, allForPaging: true,
    });
    expect(entries).toHaveLength(501);
    expect(entries.at(-1)?.id).toBe("0500");
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1]?.[0]).toMatchObject({ limit: 500, offset: 500 });
  });
});
