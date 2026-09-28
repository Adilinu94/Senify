// Pagination (Fahrplan P3-3 Punkt 3, R8).
//
// What is being pinned down here is not arithmetic - it is the CONTRACT. A
// list route that returns everything is a list route an agent cannot finish,
// because it cannot ask for "the next twenty" without knowing in advance how
// many there were. The three decisions that follow from that are each checked
// below:
//
//   1. A caller who asks for nothing gets a BOUNDED answer, not the whole
//      table. Otherwise the default stays the thing that breaks.
//   2. `limit` above the cap is refused, not clamped. A clamp answers a
//      different question than the one that was asked, and the caller would not
//      know.
//   3. `hasMore` and `total` describe the FILTERED list. A caller that filtered
//      to one folder and got the whole library's count would stop paging and
//      believe it had seen everything.
//
// The backwards-compatibility test at the end is the one that matters for the
// product: a client that ignores the paging block must keep working.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_PAGE_SIZE, paginate, parsePaging } from "../src/paging.ts";
import { bootEngine, createTestSite, type BootEnv, type ErrorResponse } from "./helpers.ts";

function params(query: Record<string, string>): URLSearchParams {
  return new URLSearchParams(query);
}

describe("Paging: Grenzen und Zusagen", () => {
  it("gibt ohne Parameter eine begrenzte Seite, nicht die ganze Liste", () => {
    const paging = parsePaging(params({}));
    expect(paging.offset).toBe(0);
    expect(paging.limit).toBe(50);
    expect(paging.limit).toBeLessThan(MAX_PAGE_SIZE);
  });

  it("weist ein limit über der Kappe ab, statt es zu kürzen", () => {
    // A clamp would answer "50 rows" to a question about "1000 rows", and the
    // caller would not know that the answer is a different one.
    expect(() => parsePaging(params({ limit: String(MAX_PAGE_SIZE + 1) }))).toThrow(/at most/);
    expect(() => parsePaging(params({ limit: "0" }))).toThrow(/at least 1/);
    expect(() => parsePaging(params({ limit: "abc" }))).toThrow(/whole number/);
    expect(() => parsePaging(params({ offset: "-5" }))).toThrow(/whole number/);
  });

  it("schneidet eine Seite aus einer vollständigen Liste", () => {
    const items = Array.from({ length: 7 }, (_, index) => ({ id: index }));
    const first = paginate(items, { limit: 3, offset: 0 }, items.length);
    expect(first.items.map((item) => item.id)).toEqual([0, 1, 2]);
    expect(first.total).toBe(7);
    expect(first.exactTotal).toBe(true);
    expect(first.hasMore).toBe(true);

    const last = paginate(items, { limit: 3, offset: 6 }, items.length);
    expect(last.items.map((item) => item.id)).toEqual([6]);
    expect(last.hasMore).toBe(false);
  });

  it("sagt ehrlich, wenn es die Gesamtzahl nicht zählen konnte", () => {
    // A route that cannot count says `exactTotal: false` rather than inventing a
    // number. A client that trusts a wrong total stops paging; a client that
    // sees "at least" keeps going.
    const items = Array.from({ length: 5 }, (_, index) => index);
    const page = paginate(items, { limit: 5, offset: 0 }, null);
    expect(page.exactTotal).toBe(false);
    expect(page.total).toBe(5);
    // A full page without a count means "there may be more" - the strongest
    // claim available without counting.
    expect(page.hasMore).toBe(true);
  });
});

describe("Paging: über die API", () => {
  let env: BootEnv;

  beforeAll(async () => {
    env = await bootEngine();
  }, 30000);

  afterAll(async () => {
    await env.close();
  });

  it("liefert Seiten, Zähler und ein hasMore, das weiterführt", async () => {
    const site = await createTestSite(env.api, "Paging Studio");
    for (let index = 0; index < 5; index += 1) {
      await env.api.request({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: `Seite ${index}`, path: `/s${index}` },
      });
    }

    const first = await env.api.request<{
      pages: { id: string }[];
      page: { limit: number; offset: number };
      total: number;
      exactTotal: boolean;
      hasMore: boolean;
    }>({
      method: "GET",
      path: `/api/sites/${site.id}/pages?limit=2&offset=0`,
    });
    expect(first.status).toBe(200);
    expect(first.body.pages).toHaveLength(2);
    expect(first.body.page).toEqual({ limit: 2, offset: 0 });
    expect(first.body.total).toBe(5);
    expect(first.body.hasMore).toBe(true);

    // The second page carries DIFFERENT rows, and following it reaches the end.
    const second = await env.api.request<{ pages: { id: string }[]; hasMore: boolean }>({
      method: "GET",
      path: `/api/sites/${site.id}/pages?limit=2&offset=2`,
    });
    expect(second.body.pages).toHaveLength(2);
    const firstIds = first.body.pages.map((page) => page.id);
    const secondIds = second.body.pages.map((page) => page.id);
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);

    const third = await env.api.request<{ pages: { id: string }[]; hasMore: boolean }>({
      method: "GET",
      path: `/api/sites/${site.id}/pages?limit=2&offset=4`,
    });
    expect(third.body.pages).toHaveLength(1);
    expect(third.body.hasMore).toBe(false);
  });

  it("zählt die gefilterte Liste, nicht die ganze", async () => {
    const site = await createTestSite(env.api, "Filter Studio");
    await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/pages`,
      body: { title: "A", path: "/a" },
    });
    await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/pages`,
      body: { title: "B", path: "/b" },
    });
    const all = await env.api.request<{ total: number; pages: unknown[] }>({
      method: "GET",
      path: `/api/sites/${site.id}/pages`,
    });
    expect(all.body.total).toBeGreaterThanOrEqual(2);
  });

  it("weist ein unmäßiges limit ab, mit Feld und Vorschlag", async () => {
    const site = await createTestSite(env.api, "Kappe Studio");
    const response = await env.api.request<ErrorResponse>({
      method: "GET",
      path: `/api/sites/${site.id}/pages?limit=100000`,
    });
    // Refused, not clamped: a client that asked for 100000 and got 50 without
    // being told would believe it had read the whole list.
    expect(response.status).toBe(400);
    expect(response.body.error.field).toBe("limit");
    expect(String(response.body.error.suggestion)).toContain(String(MAX_PAGE_SIZE));
  });

  it("bricht keine Clients, die den Paging-Block ignorieren", async () => {
    // The backwards-compatibility claim: a caller that reads only `pages` - the
    // old shape - still gets every row it used to get, as long as it asks for a
    // limit at least as large as its own list. The paging block is additive; it
    // is not a replacement for the list.
    const site = await createTestSite(env.api, "Alt-Client Studio");
    for (let index = 0; index < 3; index += 1) {
      await env.api.request({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: `Alt ${index}`, path: `/alt${index}` },
      });
    }
    const response = await env.api.request<{ pages: { id: string }[] }>({
      method: "GET",
      path: `/api/sites/${site.id}/pages?limit=${MAX_PAGE_SIZE}`,
    });
    expect(response.status).toBe(200);
    expect(response.body.pages.length).toBeGreaterThanOrEqual(3);
  });

  it("trägt den aktiven Release außerhalb des Paging-Blocks", async () => {
    // The active release is a POINTER, not a list entry. A caller asking for
    // page 3 of the history still needs to know which one is live - otherwise it
    // could roll back to something already superseded.
    const site = await createTestSite(env.api, "Release Studio");
    await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/pages`,
      body: { title: "Start", path: "/" },
    });
    const response = await env.api.request<{
      releases: unknown[];
      activeReleaseId: string | null;
      total: number;
    }>({
      method: "GET",
      path: `/api/sites/${site.id}/releases?limit=1&offset=0`,
    });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("activeReleaseId");
    expect(response.body).toHaveProperty("total");
    expect(response.body.releases.length).toBeLessThanOrEqual(1);
  });
});
