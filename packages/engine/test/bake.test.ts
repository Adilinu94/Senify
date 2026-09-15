import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadBakedSite, type BakedSite } from "@senify/core/testing";
import type { NodeTree } from "@senify/section-sdk";
import {
  bakePages,
  newEntityId,
  publishEntry,
  updateEntry,
  type Collection,
  type Entry,
  type Page,
  type Site,
  type Store,
} from "@senify/engine";
import { bootEngine, TEST_AUTHOR, type BootEnv } from "./helpers.ts";

// End-to-end "Blog" (Prüfstelle 2): layout + collection page with
// `collection-list` + entry template, backed by real collections and entries.

function tree(spec: {
  children?: string[];
  nodes?: {
    id: string;
    type: string;
    variant?: string;
    props?: Record<string, unknown>;
    slots?: Record<string, string[]>;
  }[];
}): NodeTree {
  const nodes: Record<string, NodeTree["nodes"][string]> = {
    root: { id: "root", type: "page", props: {}, children: spec.children ?? [] },
  };
  for (const item of spec.nodes ?? []) {
    nodes[item.id] = {
      id: item.id,
      type: item.type,
      props: (item.props ?? {}) as NodeTree["nodes"][string]["props"],
      ...(item.variant === undefined ? {} : { variant: item.variant }),
      ...(item.slots === undefined ? {} : { slots: item.slots }),
    };
  }
  return { rootNodeId: "root", nodes };
}

const FILLER_BODY = "**Fett** und <script>alert(1)</script>";

let env: BootEnv;
let store: Store;
let site: Site;
let blog: Collection;
let layoutPage: Page;
let entryTemplatePage: Page;
let published: Entry;
let draft: Entry;
let outDir: string;
let baked: BakedSite;

async function createPage(
  title: string,
  path: string,
  draft: NodeTree,
): Promise<Page> {
  const created = await store.createPage(site.id, { title, path });
  await store.updatePage(created.id, created.draftVersion, {
    draft,
    title,
    path,
  });
  return store.getPage(created.id);
}

async function createPublished(
  title: string,
  slug: string,
  date: string,
): Promise<Entry> {
  const created = await store.createEntry({
    id: newEntityId(),
    siteId: site.id,
    collectionId: blog.id,
    slug,
    status: "draft",
    cells: { title, "f-date": date, "f-body": FILLER_BODY, "f-tag": "tech" },
    author: TEST_AUTHOR,
    searchText: title.toLowerCase(),
    publishedAt: null,
    scheduledAt: null,
  });
  await publishEntry(store, { entryId: created.id, author: TEST_AUTHOR });
  return store.getEntry(created.id);
}

beforeAll(async () => {
  env = await bootEngine();
  store = env.engine.store;
  site = await store.createSite({ name: "Blog Site" });
  blog = await store.createCollection({
    id: newEntityId(),
    siteId: site.id,
    name: "Blog",
    slug: "blog",
    fields: [
      {
        id: "title",
        key: "title",
        label: "Titel",
        type: "text",
        description: "Titel des Beitrags.",
        required: true,
      },
      {
        id: "f-date",
        key: "datum",
        label: "Datum",
        type: "date",
        description: "Veröffentlichungsdatum.",
        required: true,
      },
      {
        id: "f-body",
        key: "text",
        label: "Text",
        type: "richtext",
        description: "Artikeltext als Markdown.",
      },
      {
        id: "f-tag",
        key: "kategorie",
        label: "Kategorie",
        type: "select",
        description: "Kategorie des Beitrags.",
        options: [
          { value: "tech", label: "Technik" },
          { value: "life", label: "Leben" },
        ],
      },
    ],
    titleField: "title",
    dateField: "f-date",
    urlPattern: "/blog/{slug}",
    supports: ["drafts", "versions", "scheduling", "seo", "search"],
    listColumns: [],
    description: null,
    deprecatedAt: null,
  });

  // Newest first: e1 (renamed) tops the list, e2 lands on page 2.
  published = await createPublished("Erster Beitrag", "alter-slug", "2026-03-01");
  // A slug change on a published entry leaves a 301 behind.
  await updateEntry(store, {
    entryId: published.id,
    body: { author: TEST_AUTHOR, baseVersion: published.version, slug: "neuer-slug" },
  });
  const republished = await publishEntry(store, {
    entryId: published.id,
    author: TEST_AUTHOR,
  });
  expect(republished.redirect).toMatchObject({
    fromPath: "/blog/alter-slug",
    toPath: "/blog/neuer-slug",
  });
  published = await store.getEntry(published.id);

  await createPublished("Zweiter Beitrag", "zweiter-beitrag", "2026-02-01");

  draft = await store.createEntry({
    id: newEntityId(),
    siteId: site.id,
    collectionId: blog.id,
    slug: "entwurf",
    status: "draft",
    cells: { title: "Entwurf Beitrag", "f-date": "2026-04-01", "f-tag": "life" },
    author: TEST_AUTHOR,
    searchText: "entwurf beitrag",
    publishedAt: null,
    scheduledAt: null,
  });

  layoutPage = await createPage(
    "Standard",
    "/vorlagen/standard",
    tree({
      children: ["header", "out"],
      nodes: [
        { id: "header", type: "hero", props: { headline: "Blog-Kopf" } },
        { id: "out", type: "outlet" },
      ],
    }),
  );
  await store.setPageTemplate({
    pageId: layoutPage.id,
    template: { kind: "layout", label: "Standard" },
    layoutId: null,
  });

  entryTemplatePage = await createPage(
    "Blog-Artikel",
    "/vorlagen/blog",
    tree({
      children: ["intro", "out", "more"],
      nodes: [
        {
          id: "intro",
          type: "content",
          props: { body: "Artikel: {entry.title}" },
        },
        { id: "out", type: "outlet" },
        {
          id: "more",
          type: "collection-list",
          variant: "list",
          props: {
            collectionId: blog.id,
            title: "Weitere Artikel",
            limit: 2,
            excludeCurrent: true,
          },
          slots: { item: ["more-card"] },
        },
        {
          id: "more-card",
          type: "card",
          variant: "text",
          props: { title: { $entry: "title" } },
        },
      ],
    }),
  );
  await store.setPageTemplate({
    pageId: entryTemplatePage.id,
    template: { kind: "collection", collectionIds: [blog.id], priority: 1 },
    layoutId: layoutPage.id,
  });

  await createPage(
    "Blog",
    "/blog",
    tree({
      children: ["list"],
      nodes: [
        {
          id: "list",
          type: "collection-list",
          variant: "cards",
          props: {
            collectionId: blog.id,
            title: "Neues aus dem Blog",
            limit: 1,
            pagination: "pages",
          },
          slots: { item: ["list-card"] },
        },
        {
          id: "list-card",
          type: "card",
          variant: "horizontal",
          props: {
            title: { $entry: "title" },
            text: "Neues von {entry.title}",
            tag: { $entry: "kategorie" },
          },
        },
      ],
    }),
  );

  await createPage(
    "Leer",
    "/leer",
    tree({
      children: ["empty"],
      nodes: [
        {
          id: "empty",
          type: "collection-list",
          props: {
            collectionId: blog.id,
            filterField: "f-tag",
            filterOp: "is",
            filterValue: "gibt-es-nicht",
            pagination: "pages",
            emptyText: "Keine Einträge",
          },
        },
      ],
    }),
  );

  await createPage(
    "Start",
    "/",
    tree({
      children: ["hero"],
      nodes: [
        { id: "hero", type: "hero", props: { headline: "Willkommen" } },
      ],
    }),
  );

  outDir = mkdtempSync(join(env.engine.dataDir, "blog-bake-"));
  const result = await bakePages(store, {
    site,
    pages: await store.listPageDrafts(site.id),
    outDir,
    dataDir: env.engine.dataDir,
  });
  baked = loadBakedSite(result.outDir);
}, 300000);

afterAll(async () => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
  if (env) await env.close();
});

describe("blog bake (Prüfstelle 2)", () => {
  it("bakes the collection page with pagination and no JS", async () => {
    expect(await baked.exists("blog/index.html")).toBe(true);
    expect(await baked.exists("blog/seite/2/index.html")).toBe(true);
    // The list is complete, so there is no third page to pre-bake.
    expect(await baked.exists("blog/seite/3/index.html")).toBe(false);

    const html = await baked.read("blog/index.html");
    expect(html).toContain("Neues aus dem Blog");
    // Layout header wrapped the page (resolve chain layout → page).
    expect(html).toContain("Blog-Kopf");
    // Whole-prop and text-mix bindings landed in the card.
    expect(html).toContain("Neues von Erster Beitrag");
    expect(html).toContain(">Erster Beitrag<");
    // The pagination nav is baked in as plain links.
    expect(html).toContain('href="/blog/seite/2"');
    expect(html).toContain('aria-label="Seiten"');

    const page2 = await baked.read("blog/seite/2/index.html");
    expect(page2).toContain("Neues von Zweiter Beitrag");
  });

  it("renders an empty list state without a second page", async () => {
    const html = await baked.read("leer/index.html");
    expect(html).toContain("Keine Einträge");
    expect(html).toContain("data-list-empty");
    expect(await baked.exists("leer/seite/2/index.html")).toBe(false);
  });

  it("bakes the detail route through layout + entry template + article", async () => {
    expect(await baked.exists("blog/neuer-slug/index.html")).toBe(true);
    const html = await baked.read("blog/neuer-slug/index.html");
    expect(html).toContain("<title>Erster Beitrag | Blog Site</title>");
    // Layout header, template intro (text-mix) and the sanitized article body.
    expect(html).toContain("Blog-Kopf");
    expect(html).toContain("Artikel: Erster Beitrag");
    expect(html).toContain("<strong>Fett</strong>");
    expect(html).not.toContain("<script>alert(1)</script>");
    // „Weitere Artikel" excludes the current entry: exactly one card.
    expect(html.match(/data-list-item/g)).toHaveLength(1);
    expect(html).toContain("Zweiter Beitrag");
  });

  it("leaves no draft leaks and no draft route", async () => {
    expect(await baked.exists("blog/entwurf/index.html")).toBe(false);
    expect(await baked.exists("blog/entwurf.md")).toBe(false);
    for (const file of [
      "index.html",
      "blog/index.html",
      "blog/seite/2/index.html",
      "blog/neuer-slug/index.html",
    ]) {
      expect(await baked.read(file)).not.toContain("Entwurf Beitrag");
    }
  });

  it("serves a 404 file and a static 301 for the old slug", async () => {
    expect(await baked.exists("404.html")).toBe(true);
    expect(await baked.exists("blog/alter-slug/index.html")).toBe(true);
    const redirect = await baked.read("blog/alter-slug/index.html");
    expect(redirect).toContain('http-equiv="refresh"');
    expect(redirect).toContain("/blog/neuer-slug");
    // The live route itself is the real page, not a redirect.
    const live = await baked.read("blog/neuer-slug/index.html");
    expect(live).not.toContain('http-equiv="refresh"');
  });

  it("lists detail routes in sitemap, llms.txt and the .md twin", async () => {
    expect(await baked.exists("blog/neuer-slug.md")).toBe(true);
    const sitemap = await baked.read("sitemap.xml");
    expect(sitemap).toContain("/blog/neuer-slug");
    expect(sitemap).not.toContain("/vorlagen/blog");
    expect(sitemap).not.toContain("/vorlagen/standard");
    const llms = await baked.read("llms.txt");
    expect(llms).toContain("/blog/neuer-slug.md");
    const md = await baked.read("blog/neuer-slug.md");
    expect(md.startsWith("# Erster Beitrag\n")).toBe(true);
  });
});

describe("entry preview endpoint", () => {
  it("renders a published entry through the same bake path", async () => {
    const response = await env.api.request<{
      path: string;
      html: string;
      status: number;
    }>({ method: "GET", path: `/api/entries/${published.id}/preview` });
    expect(response.status).toBe(200);
    expect(response.body.path).toBe("/blog/neuer-slug");
    expect(response.body.status).toBe(200);
    expect(response.body.html).toContain("Artikel: Erster Beitrag");
    expect(response.body.html).toContain("Blog-Kopf");
  }, 180000);

  it("answers not_found for a draft entry without a route", async () => {
    const response = await env.api.request<{ error: { category: string } }>({
      method: "GET",
      path: `/api/entries/${draft.id}/preview`,
    });
    expect(response.status).toBe(404);
    expect(response.body.error.category).toBe("not_found");
  }, 180000);

  it("answers not_found for an unknown entry (no site leak)", async () => {
    const response = await env.api.request<{ error: { category: string } }>({
      method: "GET",
      path: `/api/entries/${newEntityId()}/preview`,
    });
    expect(response.status).toBe(404);
    expect(response.body.error.category).toBe("not_found");
  }, 30000);
});
