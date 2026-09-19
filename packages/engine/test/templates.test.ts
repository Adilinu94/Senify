import { describe, expect, it } from "vitest";
import type { Node, NodeTree } from "@senify/section-sdk";
import {
  composePageTree,
  findEntryTemplate,
  findFirstOutlet,
  findLayout,
  prefetchLists,
  rebakePathsForCollection,
  rebakePathsForEntry,
  rebakePathsForPage,
  type Collection,
  type Entry,
  type FieldDef,
  type Page,
  type PageTemplate,
  type Store,
} from "@senify/engine";

const AUTHOR = { kind: "agent", id: "agent-test", label: "Test" } as const;

type NodeSpec = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
};

function tree(spec: { children?: string[]; nodes?: NodeSpec[] }): NodeTree {
  const nodes: Record<string, Node> = {
    root: { id: "root", type: "page", props: {}, children: spec.children ?? [] },
  };
  for (const spec2 of spec.nodes ?? []) {
    nodes[spec2.id] = {
      id: spec2.id,
      type: spec2.type,
      props: (spec2.props ?? {}) as Node["props"],
      ...(spec2.children === undefined ? {} : { children: spec2.children }),
    };
  }
  return { rootNodeId: "root", nodes };
}

function outletTree(children: string[]): NodeTree {
  return tree({
    children,
    nodes: children.map((id) => ({ id, type: "outlet" })),
  });
}

function field(id: string, type: FieldDef["type"]): FieldDef {
  return { id, key: id, label: id, type, description: "Testfeld" };
}

function collection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: "col-blog",
    siteId: "site-1",
    name: "Blog",
    slug: "blog",
    fields: [
      field("title", "text"),
      field("f-date", "date"),
      field("f-body", "richtext"),
      field("f-featured", "boolean"),
      field("f-tag", "select"),
    ],
    titleField: "title",
    dateField: "f-date",
    urlPattern: "/blog/{slug}",
    supports: [],
    listColumns: [],
    description: null,
    deprecatedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return {
    siteId: "site-1",
    collectionId: "col-blog",
    slug: overrides.id,
    status: "published",
    cells: {},
    activeVersionId: null,
    version: 1,
    author: AUTHOR,
    publishedAt: "2026-01-01T00:00:00.000Z",
    scheduledAt: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function page(input: {
  id: string;
  path: string;
  draft: NodeTree;
  template?: PageTemplate | null;
  layoutId?: string | null;
}): Page {
  return {
    id: input.id,
    siteId: "site-1",
    path: input.path,
    title: input.id,
    meta: {},
    draft: input.draft,
    draftVersion: 1,
    template: input.template ?? null,
    layoutId: input.layoutId ?? null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function listPage(input: { id: string; path: string; collectionId: string }): Page {
  return page({
    id: input.id,
    path: input.path,
    draft: tree({
      children: ["list"],
      nodes: [
        { id: "list", type: "collection-list", props: { collectionId: input.collectionId } },
      ],
    }),
  });
}

// ---------------------------------------------------------------- templates

describe("composePageTree (resolve chain)", () => {
  it("splices the page into the layout outlet and drops the outlet node", () => {
    let counter = 0;
    const layout = tree({
      children: ["header", "out"],
      nodes: [
        { id: "header", type: "hero" },
        { id: "out", type: "outlet" },
      ],
    });
    const contentTree = tree({
      children: ["content"],
      nodes: [{ id: "content", type: "content" }],
    });

    const composed = composePageTree({
      layout,
      template: null,
      page: contentTree,
      article: null,
      createId: () => `n${counter++}`,
    });

    const types = Object.values(composed.nodes).map((node) => node.type);
    expect(types).toContain("hero");
    expect(types).toContain("content");
    expect(types).not.toContain("outlet");
    const ids = Object.keys(composed.nodes);
    expect(new Set(ids).size).toBe(ids.length);
    expect(composed.nodes[composed.rootNodeId]?.children).toHaveLength(2);
  });

  it("rekeys spliced nodes so ids stay unique across layout and content", () => {
    let counter = 0;
    // The layout already owns a node with the id the page content also uses.
    const layout = tree({
      children: ["shared", "out"],
      nodes: [
        { id: "shared", type: "hero" },
        { id: "out", type: "outlet" },
      ],
    });
    const contentTree = tree({
      children: ["shared"],
      nodes: [{ id: "shared", type: "content" }],
    });

    const composed = composePageTree({
      layout,
      template: null,
      page: contentTree,
      article: null,
      createId: () => `n${counter++}`,
    });

    const ids = Object.keys(composed.nodes);
    expect(new Set(ids).size).toBe(ids.length);
    const kept = Object.values(composed.nodes).filter(
      (node) => node.type === "hero" || node.type === "content",
    );
    expect(kept).toHaveLength(2);
    expect(composed.nodes[composed.rootNodeId]?.children).toEqual(["shared", "n0"]);
  });

  it("reports the draft-to-composed id map of the splice", () => {
    let counter = 0;
    const layout = tree({
      children: ["header", "out"],
      nodes: [
        { id: "header", type: "hero" },
        { id: "out", type: "outlet" },
      ],
    });
    const contentTree = tree({
      children: ["content"],
      nodes: [{ id: "content", type: "content" }],
    });
    const idMap = new Map<string, string>();
    const composed = composePageTree({
      layout,
      template: null,
      page: contentTree,
      article: null,
      createId: () => `n${counter++}`,
      idMap,
    });

    // The inserted page subtree is rekeyed; the map names the composed node
    // (ticket 22: scoped style rules are remapped through it).
    const mapped = idMap.get("content");
    expect(mapped).toBe("n0");
    expect(composed.nodes[mapped ?? ""]?.type).toBe("content");
    // The layout is the container: its own nodes keep their draft ids.
    expect(idMap.has("header")).toBe(false);
  });

  it("maps template nodes through both splice steps", () => {
    let counter = 0;
    const layout = tree({ children: ["out"], nodes: [{ id: "out", type: "outlet" }] });
    const template = tree({
      children: ["intro", "out"],
      nodes: [
        { id: "intro", type: "content" },
        { id: "out", type: "outlet" },
      ],
    });
    const idMap = new Map<string, string>();
    const composed = composePageTree({
      layout,
      template,
      page: null,
      article: "Text",
      createId: () => `n${counter++}`,
      idMap,
    });

    const intro = idMap.get("intro");
    expect(intro).toBeDefined();
    expect(composed.nodes[intro ?? ""]?.type).toBe("content");
  });

  it("leaves the id map empty without a layout splice", () => {
    const contentTree = tree({
      children: ["content"],
      nodes: [{ id: "content", type: "content" }],
    });
    const idMap = new Map<string, string>();
    composePageTree({
      layout: null,
      template: null,
      page: contentTree,
      article: null,
      idMap,
    });
    expect(idMap.size).toBe(0);
  });

  it("fills only the first outlet; further outlets stay empty", () => {
    const template = outletTree(["out-1", "out-2"]);
    const composed = composePageTree({
      layout: null,
      template,
      page: null,
      article: "Artikeltext",
      createId: () => `n${Math.random().toString(36).slice(2)}`,
    });

    const outlets = Object.values(composed.nodes).filter(
      (node) => node.type === "outlet",
    );
    const contents = Object.values(composed.nodes).filter(
      (node) => node.type === "content",
    );
    expect(outlets).toHaveLength(1);
    expect(contents).toHaveLength(1);
    expect(contents[0]?.props.body).toBe("Artikeltext");
  });

  it("ignores a template without an outlet (unfinished)", () => {
    const template = tree({
      children: ["card"],
      nodes: [{ id: "card", type: "card" }],
    });
    expect(findFirstOutlet(template)).toBeUndefined();

    const contentTree = tree({
      children: ["content"],
      nodes: [{ id: "content", type: "content" }],
    });
    const composed = composePageTree({
      layout: null,
      template,
      page: contentTree,
      article: "Body",
    });

    expect(composed.nodes[composed.rootNodeId]?.children).toBeUndefined();
    expect(Object.values(composed.nodes)).toHaveLength(1);
  });
});

describe("template selection", () => {
  const layoutStandard = page({
    id: "L-standard",
    path: "/vorlagen/standard",
    draft: outletTree(["out"]),
    template: { kind: "layout", label: "Standard" },
  });
  const layoutAlt = page({
    id: "L-alt",
    path: "/vorlagen/alt",
    draft: outletTree(["out"]),
    template: { kind: "layout", label: "Alt" },
  });
  const templateLow = page({
    id: "T-low",
    path: "/vorlagen/blog",
    draft: outletTree(["out"]),
    template: { kind: "collection", collectionIds: ["col-blog"], priority: 5 },
  });
  const templateHigh = page({
    id: "T-high",
    path: "/vorlagen/blog-neu",
    draft: outletTree(["out"]),
    template: { kind: "collection", collectionIds: ["col-blog"], priority: 9 },
  });
  const pages = [layoutStandard, layoutAlt, templateLow, templateHigh];

  it("defaults to the Standard layout and honours an explicit choice", () => {
    expect(findLayout(pages, null)?.id).toBe("L-standard");
    expect(findLayout(pages, "L-alt")?.id).toBe("L-alt");
  });

  it("picks the entry template with the highest priority", () => {
    expect(findEntryTemplate(pages, "col-blog")?.id).toBe("T-high");
    expect(findEntryTemplate(pages, "col-unknown")).toBeUndefined();
  });
});

// -------------------------------------------------------------------- lists

function listStore(entries: readonly Entry[]): Store {
  return {
    listEntries: async (filter: {
      collectionId?: string;
      status?: string;
      limit?: number;
    }) => {
      let rows = [...entries];
      if (filter.collectionId !== undefined) {
        rows = rows.filter((row) => row.collectionId === filter.collectionId);
      }
      if (filter.status !== undefined) {
        rows = rows.filter((row) => row.status === filter.status);
      }
      return rows.slice(0, filter.limit ?? rows.length);
    },
  } as unknown as Store;
}

function listTree(props: Record<string, unknown>): NodeTree {
  return tree({
    children: ["list"],
    nodes: [{ id: "list", type: "collection-list", props }],
  });
}

async function runList(input: {
  entries: readonly Entry[];
  props?: Record<string, unknown>;
  currentEntryId?: string | null;
  query?: Record<string, string>;
}): Promise<{
  ids: string[];
  page: number;
  pageCount: number;
  paramName: string;
  pageParams: string[];
}> {
  const result = await prefetchLists({
    store: listStore(input.entries),
    tree: listTree(input.props ?? {}),
    collections: new Map([["col-blog", collection()]]),
    currentEntryId: input.currentEntryId ?? null,
    query: input.query ?? {},
    basePath: "/blog",
  });
  const list = result.lists.list;
  if (list === undefined) throw new Error("list was not prefetched");
  return {
    ids: list.entries.map((item) => item.id),
    page: list.page,
    pageCount: list.pageCount,
    paramName: list.paramName,
    pageParams: result.pageParams,
  };
}

const FILTER_ENTRIES: Entry[] = [
  entry({
    id: "e-featured-tech",
    slug: "a",
    cells: { title: "A", "f-featured": true, "f-tag": "tech" },
  }),
  entry({
    id: "e-featured-life",
    slug: "b",
    cells: { title: "B", "f-featured": false, "f-tag": "life" },
  }),
  entry({ id: "e-empty", slug: "c", cells: { title: "C" } }),
];

function sorted(ids: readonly string[]): string[] {
  return [...ids].sort();
}

describe("prefetchLists (filter, sort, limit, pagination)", () => {
  it("applies every operator of the closed filter set", async () => {
    const is = await runList({
      entries: FILTER_ENTRIES,
      props: {
        collectionId: "col-blog",
        filterField: "f-tag",
        filterOp: "is",
        filterValue: "tech",
      },
    });
    expect(is.ids).toEqual(["e-featured-tech"]);

    const isNot = await runList({
      entries: FILTER_ENTRIES,
      props: {
        collectionId: "col-blog",
        filterField: "f-tag",
        filterOp: "isNot",
        filterValue: "tech",
      },
    });
    expect(sorted(isNot.ids)).toEqual(["e-empty", "e-featured-life"]);

    const isTrue = await runList({
      entries: FILTER_ENTRIES,
      props: { collectionId: "col-blog", filterField: "f-featured", filterOp: "isTrue" },
    });
    expect(isTrue.ids).toEqual(["e-featured-tech"]);

    const isFalse = await runList({
      entries: FILTER_ENTRIES,
      props: { collectionId: "col-blog", filterField: "f-featured", filterOp: "isFalse" },
    });
    expect(sorted(isFalse.ids)).toEqual(["e-empty", "e-featured-life"]);

    const isSet = await runList({
      entries: FILTER_ENTRIES,
      props: { collectionId: "col-blog", filterField: "f-featured", filterOp: "isSet" },
    });
    expect(sorted(isSet.ids)).toEqual(["e-featured-life", "e-featured-tech"]);

    const isEmpty = await runList({
      entries: FILTER_ENTRIES,
      props: { collectionId: "col-blog", filterField: "f-featured", filterOp: "isEmpty" },
    });
    expect(isEmpty.ids).toEqual(["e-empty"]);
  });

  it("rejects unknown filter fields and operators", async () => {
    await expect(
      runList({
        entries: FILTER_ENTRIES,
        props: { collectionId: "col-blog", filterField: "gibt-es-nicht", filterOp: "is" },
      }),
    ).rejects.toThrow(/not a field/);
    await expect(
      runList({
        entries: FILTER_ENTRIES,
        props: { collectionId: "col-blog", filterField: "f-tag", filterOp: "equals" },
      }),
    ).rejects.toThrow(/Unknown filter operator/);
  });

  it("defaults to the date field descending and sorts explicitly on request", async () => {
    const dated = [
      entry({ id: "e-old", slug: "old", cells: { title: "Alt", "f-date": "2026-01-01" } }),
      entry({ id: "e-new", slug: "new", cells: { title: "Neu", "f-date": "2026-03-01" } }),
      entry({ id: "e-mid", slug: "mid", cells: { title: "Mitte", "f-date": "2026-02-01" } }),
    ];
    const byDate = await runList({ entries: dated, props: { collectionId: "col-blog" } });
    expect(byDate.ids).toEqual(["e-new", "e-mid", "e-old"]);

    const byTitle = await runList({
      entries: dated,
      props: {
        collectionId: "col-blog",
        orderByField: "title",
        orderByDirection: "asc",
      },
    });
    expect(byTitle.ids).toEqual(["e-old", "e-mid", "e-new"]);
  });

  it("caps the list per limit, defaulting to six", async () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      entry({
        id: `e-${index}`,
        slug: `e-${index}`,
        cells: {
          title: `T${index}`,
          "f-date": `2026-01-${String(index + 1).padStart(2, "0")}`,
        },
      }),
    );
    const limited = await runList({ entries: many, props: { collectionId: "col-blog" } });
    expect(limited.ids).toHaveLength(6);

    const two = await runList({
      entries: many,
      props: { collectionId: "col-blog", limit: 2 },
    });
    expect(two.ids).toHaveLength(2);
  });

  it("excludes the current entry and returns an empty list without entries", async () => {
    const excluded = await runList({
      entries: FILTER_ENTRIES,
      props: { collectionId: "col-blog", excludeCurrent: true },
      currentEntryId: "e-featured-tech",
    });
    expect(excluded.ids).not.toContain("e-featured-tech");

    const empty = await runList({ entries: [], props: { collectionId: "col-blog" } });
    expect(empty.ids).toEqual([]);
    expect(empty.pageCount).toBe(1);
  });

  it("slices pages and lands out-of-range requests on an empty list", async () => {
    const entries = [
      entry({ id: "e-1", slug: "1", cells: { title: "1", "f-date": "2026-03-03" } }),
      entry({ id: "e-2", slug: "2", cells: { title: "2", "f-date": "2026-03-02" } }),
      entry({ id: "e-3", slug: "3", cells: { title: "3", "f-date": "2026-03-01" } }),
    ];
    const props = { collectionId: "col-blog", limit: 1, pagination: "pages" };

    const first = await runList({ entries, props });
    expect(first.ids).toEqual(["e-1"]);
    expect(first.pageCount).toBe(3);
    expect(first.paramName).toBe("seite");
    expect(first.pageParams).toEqual(["seite"]);

    const second = await runList({ entries, props, query: { seite: "2" } });
    expect(second.ids).toEqual(["e-2"]);
    expect(second.page).toBe(2);

    const outOfRange = await runList({ entries, props, query: { seite: "99" } });
    expect(outOfRange.ids).toEqual([]);
    expect(outOfRange.page).toBe(99);

    const zero = await runList({ entries, props, query: { seite: "0" } });
    expect(zero.ids).toEqual([]);
    expect(zero.page).toBe(1);
  });
});

// ------------------------------------------------------------------- rebake

function rebakeStore(input: {
  pages: readonly Page[];
  collections: readonly Collection[];
  entries: readonly Entry[];
}): Store {
  return {
    listPageDrafts: async () => [...input.pages],
    getCollection: async (id: string) => {
      const found = input.collections.find((candidate) => candidate.id === id);
      if (found === undefined) throw new Error(`missing collection ${id}`);
      return found;
    },
    listEntries: async (filter: {
      collectionId?: string;
      status?: string;
      limit?: number;
    }) => {
      let rows = [...input.entries];
      if (filter.collectionId !== undefined) {
        rows = rows.filter((row) => row.collectionId === filter.collectionId);
      }
      if (filter.status !== undefined) {
        rows = rows.filter((row) => row.status === filter.status);
      }
      return rows.slice(0, filter.limit ?? rows.length);
    },
  } as unknown as Store;
}

describe("rebake dependency index (affectedPaths)", () => {
  const blog = collection();
  const published = entry({ id: "e-pub", slug: "beitrag" });
  const draftEntry = entry({ id: "e-draft", slug: "entwurf", status: "draft" });
  const listPageBlog = listPage({ id: "P-blog", path: "/blog", collectionId: blog.id });
  const homePage = page({ id: "P-home", path: "/", draft: tree({}) });
  const layoutPage = page({
    id: "L",
    path: "/vorlagen/standard",
    draft: outletTree(["out"]),
    template: { kind: "layout", label: "Standard" },
  });
  const pageOnLayout = page({ id: "P-about", path: "/ueber", draft: tree({}), layoutId: "L" });
  const pageOnOtherLayout = page({
    id: "P-legal",
    path: "/impressum",
    draft: tree({}),
    layoutId: "L2",
  });
  const entryTemplate = page({
    id: "T-blog",
    path: "/vorlagen/blog",
    draft: outletTree(["out"]),
    template: { kind: "collection", collectionIds: [blog.id], priority: 1 },
    layoutId: "L",
  });

  it("entry publish maps to the detail route and its list pages", async () => {
    const store = rebakeStore({
      pages: [listPageBlog, homePage],
      collections: [blog],
      entries: [published, draftEntry],
    });
    const paths = await rebakePathsForEntry(store, {
      siteId: "site-1",
      entry: published,
      collection: blog,
    });
    expect(sorted(paths)).toEqual(["/blog", "/blog/beitrag"]);
  });

  it("entry delete uses the same dependent paths", async () => {
    const store = rebakeStore({
      pages: [listPageBlog, homePage],
      collections: [blog],
      entries: [published],
    });
    const paths = await rebakePathsForEntry(store, {
      siteId: "site-1",
      entry: entry({ id: "e-gone", slug: "geloescht", status: "unpublished" }),
      collection: blog,
    });
    expect(paths).toContain("/blog/geloescht");
    expect(paths).toContain("/blog");
  });

  it("collection change maps to its list pages and published detail routes", async () => {
    const store = rebakeStore({
      pages: [listPageBlog, homePage],
      collections: [blog],
      entries: [published, draftEntry],
    });
    const paths = await rebakePathsForCollection(store, {
      siteId: "site-1",
      collectionId: blog.id,
    });
    // The draft route is not live, so it never enters the index.
    expect(sorted(paths)).toEqual(["/blog", "/blog/beitrag"]);
  });

  it("layout change maps to every page and entry template that uses it", async () => {
    const store = rebakeStore({
      pages: [layoutPage, pageOnLayout, pageOnOtherLayout, entryTemplate],
      collections: [blog],
      entries: [published, draftEntry],
    });
    const paths = await rebakePathsForPage(store, { siteId: "site-1", pageId: "L" });
    expect(sorted(paths)).toEqual(["/blog/beitrag", "/ueber"]);
  });

  it("entry template change maps to the detail routes of its collections", async () => {
    const store = rebakeStore({
      pages: [layoutPage, entryTemplate],
      collections: [blog],
      entries: [published],
    });
    const paths = await rebakePathsForPage(store, { siteId: "site-1", pageId: "T-blog" });
    expect(paths).toEqual(["/blog/beitrag"]);
  });
});
