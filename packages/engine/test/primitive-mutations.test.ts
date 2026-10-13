import { describe, expect, it } from "vitest";
import { createRegistry } from "@senify/registry";
import { getPrimitive, primitiveTypes } from "@senify/widget-engine";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  treeOf,
  type ErrorResponse,
  type MutationsResponse,
  type PageResponse,
} from "./helpers.ts";

// Strangler E2: the widget catalog is the second node vocabulary of the tree.
// What the canvas places (`insertNode` with a catalog primitive) is saved by the
// engine's own mutation path, through the same prop boundary the editor store
// stands on. Sections keep their closed prop list.

// Every type the elements panel offers: the catalog minus the document root.
const PLACEABLE = primitiveTypes().filter((type) => type !== "root");

describe("catalog primitives in the registry", () => {
  const registry = createRegistry();

  it("knows every placeable primitive without adding it to the section catalog", () => {
    const listed = new Set(registry.list().map((definition) => definition.type));
    for (const type of PLACEABLE) {
      expect(registry.has(type), `${type} is not registered`).toBe(true);
    }
    expect(listed.has("heading")).toBe(false);
    expect(listed.has("frame")).toBe(false);
  });

  it("lets a section win over a primitive of the same name (twin bridge)", () => {
    expect(registry.isPrimitive("heading")).toBe(true);
    expect(registry.isPrimitive("divider")).toBe(false);
    expect(registry.isPrimitive("embed")).toBe(false);
    expect(registry.isPrimitive("hero")).toBe(false);
    expect(registry.has("root")).toBe(false);
  });

  it("carries the catalog's child rules", () => {
    for (const type of PLACEABLE) {
      if (registry.isPrimitive(type)) {
        expect(registry.get(type).allowedChildren).toEqual(getPrimitive(type)?.allowedChildren);
      }
    }
  });
});

describe("saving catalog primitives through the editor route", () => {
  async function pageWith(env: Awaited<ReturnType<typeof bootEngine>>) {
    const site = await createTestSite(env.api, "Bausteine");
    const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
    return page;
  }

  function insert(
    env: Awaited<ReturnType<typeof bootEngine>>,
    page: { id: string; draftVersion: number },
    parent: string,
    node: Record<string, unknown>,
  ) {
    return env.api.request<MutationsResponse & ErrorResponse>({
      method: "POST",
      path: `/api/pages/${page.id}/editor-mutations`,
      body: {
        baseDraftVersion: page.draftVersion,
        author: TEST_AUTHOR,
        mutations: [{ op: "insertNode", parent: { nodeId: parent }, node }],
      },
    });
  }

  async function fresh(env: Awaited<ReturnType<typeof bootEngine>>, id: string) {
    const response = await env.api.request<PageResponse>({ method: "GET", path: `/api/pages/${id}` });
    return response.body;
  }

  it("saves every placeable primitive at the page root", async () => {
    const env = await bootEngine();
    try {
      const page = await pageWith(env);
      const rootId = page.draft.rootNodeId;
      const rejected: string[] = [];
      let version = page.draftVersion;
      for (const type of PLACEABLE) {
        const response = await insert(env, { id: page.id, draftVersion: version }, rootId, {
          primitive: type,
          props: {},
        });
        if (response.status === 200) version = response.body.newDraftVersion;
        else rejected.push(`${type}: ${response.status} ${response.body.error?.message ?? ""}`);
      }
      expect(rejected).toEqual([]);
      const tree = treeOf(await fresh(env, page.id));
      const stored = (tree.nodes[rootId]?.children ?? []).map((id) => tree.nodes[id]?.type);
      expect(stored).toEqual(PLACEABLE);
    } finally {
      await env.close();
    }
  });

  it("keeps an unknown type an error", async () => {
    const env = await bootEngine();
    try {
      const page = await pageWith(env);
      const response = await insert(env, page, page.draft.rootNodeId, {
        primitive: "gibt-es-nicht",
        props: {},
      });
      expect(response.status).toBe(404);
      expect(response.body.error?.message).toContain('Unknown section type "gibt-es-nicht"');
    } finally {
      await env.close();
    }
  });

  it("enforces the catalog's value types and the safe style grammar", async () => {
    const env = await bootEngine();
    try {
      const page = await pageWith(env);
      const rootId = page.draft.rootNodeId;
      // A control value of the wrong type is refused with its field path.
      for (const [primitive, key, value] of [
        ["grid", "columns", "zwei"],
        ["video", "autoplay", "ja"],
      ] as const) {
        const wrong = await insert(env, page, rootId, { primitive, props: { [key]: value } });
        expect(wrong.status, `${primitive}.${key}`).toBeGreaterThanOrEqual(400);
        expect(wrong.status).toBeLessThan(500);
        expect(wrong.body.error?.field).toContain(key);
      }
      // The same controls take their own value type.
      const right = await insert(env, page, rootId, {
        primitive: "grid",
        props: { columns: 3 },
      });
      expect(right.status).toBe(200);
      page.draftVersion = right.body.newDraftVersion;
      // A style breakout never reaches the stored tree (and so never the baked CSS).
      const breakout = await insert(env, page, rootId, {
        primitive: "heading",
        props: { color: "red;} </style><script>" },
      });
      expect(breakout.status).toBeGreaterThanOrEqual(400);
      expect(breakout.status).toBeLessThan(500);
      expect(breakout.body.error?.category).toBe("validation");
      // A string value must not carry a way out of the <style> element: the
      // boundary refuses it before it is stored.
      for (const value of ['"</style><script>x</script>"', "'a</STYLE>b'", '"<!--"']) {
        const closing = await insert(env, page, rootId, {
          primitive: "heading",
          props: { fontFamily: value },
        });
        expect(closing.status, value).toBeGreaterThanOrEqual(400);
        expect(closing.status).toBeLessThan(500);
        expect(closing.body.error?.category).toBe("validation");
      }
      const unsafeName = await insert(env, page, rootId, {
        primitive: "heading",
        props: { "color:red;x": "1" },
      });
      expect(unsafeName.status).toBeGreaterThanOrEqual(400);
      expect(unsafeName.status).toBeLessThan(500);
      // An open style property with a plain value is saved.
      const ok = await insert(env, page, rootId, {
        primitive: "heading",
        props: { color: "#112233", fontSize: 24 },
      });
      expect(ok.status).toBe(200);
    } finally {
      await env.close();
    }
  });

  it("holds a primitive to its child rules and still edits it afterwards", async () => {
    const env = await bootEngine();
    try {
      const page = await pageWith(env);
      const rootId = page.draft.rootNodeId;
      const frame = await insert(env, page, rootId, { primitive: "frame", props: {} });
      expect(frame.status).toBe(200);
      const afterFrame = await fresh(env, page.id);
      const frameId = treeOf(afterFrame).nodes[rootId]?.children?.[0] ?? "";
      expect(frameId).not.toBe("");
      // A frame is a container: a heading goes inside.
      const inside = await insert(
        env,
        { id: page.id, draftVersion: frame.body.newDraftVersion },
        frameId,
        { primitive: "heading", props: {} },
      );
      expect(inside.status).toBe(200);
      // A heading takes no children.
      const afterInside = treeOf(await fresh(env, page.id));
      const headingId = afterInside.nodes[frameId]?.children?.[0] ?? "";
      const nested = await insert(
        env,
        { id: page.id, draftVersion: inside.body.newDraftVersion },
        headingId,
        { primitive: "text", props: {} },
      );
      expect(nested.status).toBeGreaterThanOrEqual(400);
      expect(nested.status).toBeLessThan(500);
      // setNodeProp on a stored primitive runs through the same boundary.
      const edit = await env.api.request<MutationsResponse & ErrorResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/editor-mutations`,
        body: {
          baseDraftVersion: inside.body.newDraftVersion,
          author: TEST_AUTHOR,
          mutations: [{ op: "setNodeProp", id: headingId, key: "color", value: "#445566" }],
        },
      });
      expect(edit.status).toBe(200);
      const bad = await env.api.request<MutationsResponse & ErrorResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/editor-mutations`,
        body: {
          baseDraftVersion: edit.body.newDraftVersion,
          author: TEST_AUTHOR,
          mutations: [{ op: "setNodeProp", id: headingId, key: "color", value: "url(javascript:x)" }],
        },
      });
      expect(bad.status).toBeGreaterThanOrEqual(400);
      expect(bad.status).toBeLessThan(500);
    } finally {
      await env.close();
    }
  });

  it("publishes a page built from primitives and bakes their structure, text and style", async () => {
    const env = await bootEngine();
    try {
      const page = await pageWith(env);
      const rootId = page.draft.rootNodeId;
      const textKey = getPrimitive("heading")?.controls.find((c) => c.valueType === "string")?.key ?? "";
      expect(textKey).not.toBe("");
      const frame = await insert(env, page, rootId, { primitive: "frame", props: {} });
      expect(frame.status).toBe(200);
      const frameId =
        treeOf(await fresh(env, page.id)).nodes[rootId]?.children?.[0] ?? "";
      const heading = await insert(
        env,
        { id: page.id, draftVersion: frame.body.newDraftVersion },
        frameId,
        { primitive: "heading", props: { [textKey]: "Hallo Baustein", color: "#112233" } },
      );
      expect(heading.status).toBe(200);
      const published = await env.api.request<{ release: { id: string } }>({
        method: "POST",
        path: `/api/sites/${page.siteId}/releases`,
        body: { author: { kind: "human", id: "tester", label: "Tester" } },
      });
      expect(published.status).toBe(201);
      const html = await (
        await fetch(`${env.server.origin}/api/releases/${published.body.release.id}/files/index.html`)
      ).text();
      // The frame carries the heading as its child, both from the widget markup.
      expect(html).toMatch(
        /<div class="w-frame[^"]*"[^>]*data-widget="frame"><h2 class="w-heading[^"]*"[^>]*data-widget="heading">Hallo Baustein<\/h2><\/div>/,
      );
      // The node's own style prop rides the site's rule sheet, with no rule needed.
      const sheet = /href="([^"]*style-rules\.css)"/.exec(html)?.[1];
      expect(sheet, "the baked page links the node style sheet").toBeDefined();
      const css = await (
        await fetch(
          `${env.server.origin}/api/releases/${published.body.release.id}/files/${(sheet ?? "").replace(/^\//, "")}`,
        )
      ).text();
      expect(css).toContain("#112233");
    } finally {
      await env.close();
    }
  }, 120_000);

  it("undoes an inserted primitive like any other batch", async () => {
    const env = await bootEngine();
    try {
      const page = await pageWith(env);
      const rootId = page.draft.rootNodeId;
      const inserted = await insert(env, page, rootId, { primitive: "heading", props: {} });
      expect(inserted.status).toBe(200);
      expect(inserted.body.undoBatchId).toBeTruthy();
      expect(treeOf(await fresh(env, page.id)).nodes[rootId]?.children).toHaveLength(1);
      const undone = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/undo-batch`,
        body: { baseDraftVersion: inserted.body.newDraftVersion, steps: 1 },
      });
      expect(undone.status).toBe(200);
      expect(treeOf(await fresh(env, page.id)).nodes[rootId]?.children ?? []).toHaveLength(0);
    } finally {
      await env.close();
    }
  });
});
