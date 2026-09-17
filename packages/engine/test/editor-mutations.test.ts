import { describe, expect, it } from "vitest";
import { editorMutationsToSection } from "@senify/engine";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  treeOf,
  type MutationsResponse,
  type PageResponse,
} from "./helpers.ts";

// The canvas persistence path (rebuild Phase 0, fifth slice): the v2 editor
// vocabulary is translated onto the section ops and written through the same
// store, so the canvas needs no storage of its own.

describe("editor mutation bridge", () => {
  it("maps the canvas vocabulary onto the section ops", () => {
    expect(
      editorMutationsToSection([
        { op: "setNodeProp", id: "n1", key: "headline", value: "Hallo" },
        { op: "setNodeProp", id: "n1", key: "headline", value: "Tablet", device: "tablet" },
        { op: "clearNodeProp", id: "n1", key: "headline", device: "mobile" },
        {
          op: "insertNode",
          parent: { nodeId: "root" },
          index: 1,
          node: { primitive: "divider", props: {} },
        },
        { op: "deleteNode", id: "n1" },
        { op: "moveNode", id: "n1", target: { nodeId: "root" }, index: 0 },
        { op: "duplicateNode", id: "n1" },
      ]),
    ).toEqual([
      { op: "updateNodeProps", id: "n1", patch: { headline: "Hallo" } },
      {
        op: "setBreakpointOverride",
        id: "n1",
        breakpoint: "tablet",
        override: { props: { headline: "Tablet" } },
      },
      { op: "clearBreakpointOverride", id: "n1", breakpoint: "mobile" },
      {
        op: "insertNode",
        parent: { nodeId: "root" },
        index: 1,
        node: { type: "divider" },
      },
      { op: "deleteNode", id: "n1" },
      { op: "moveNode", id: "n1", target: { nodeId: "root" }, index: 0 },
      { op: "duplicateNode", id: "n1" },
    ]);
  });

  it("keeps a fresh insert's props and folds device keys onto the base value", () => {
    expect(
      editorMutationsToSection([
        {
          op: "insertNode",
          parent: { nodeId: "root" },
          node: {
            primitive: "hero",
            props: { headline: "Hallo", padding_tablet: 16 },
          },
        },
      ]),
    ).toEqual([
      {
        op: "insertNode",
        parent: { nodeId: "root" },
        node: { type: "hero", props: { headline: "Hallo", padding: 16 } },
      },
    ]);
  });

  it("refuses ops without a section equivalent", () => {
    expect(() =>
      editorMutationsToSection([{ op: "createStyleRule", name: "accent", props: {} }]),
    ).toThrow(/noch nicht gespeichert/);
  });
});

describe("POST /api/pages/:pageId/editor-mutations", () => {
  it("writes canvas ops through the section store", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Canvas-Persistenz");
      const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
      const rootId = page.draft.rootNodeId;

      const response = await env.api.request<MutationsResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/editor-mutations`,
        body: {
          baseDraftVersion: page.draftVersion,
          author: TEST_AUTHOR,
          mutations: [
            {
              op: "insertNode",
              parent: { nodeId: rootId },
              index: 0,
              node: { primitive: "divider", props: {} },
            },
          ],
        },
      });
      expect(response.status).toBe(200);
      expect(response.body.newDraftVersion).toBe(page.draftVersion + 1);

      const fresh = await env.api.request<PageResponse>({
        method: "GET",
        path: `/api/pages/${page.id}`,
      });
      const tree = treeOf(fresh.body);
      const children = tree.nodes[rootId]?.children ?? [];
      expect(children).toHaveLength(1);
      expect(tree.nodes[children[0] ?? ""]?.type).toBe("divider");
    } finally {
      await env.close();
    }
  });

  it("updates a base prop and a device override through the same route", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Canvas-Props");
      const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
      const rootId = page.draft.rootNodeId;
      const inserted = await env.api.request<MutationsResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/mutations`,
        body: {
          baseDraftVersion: page.draftVersion,
          author: TEST_AUTHOR,
          mutations: [
            { op: "insertNode", parent: { nodeId: rootId }, node: { type: "hero", props: {} } },
          ],
        },
      });
      expect(inserted.status).toBe(200);
      const withHero = await env.api.request<PageResponse>({
        method: "GET",
        path: `/api/pages/${page.id}`,
      });
      const heroId = treeOf(withHero.body).nodes[rootId]?.children?.[0] ?? "";
      expect(heroId).not.toBe("");

      const written = await env.api.request<MutationsResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/editor-mutations`,
        body: {
          baseDraftVersion: withHero.body.draftVersion,
          author: TEST_AUTHOR,
          mutations: [
            { op: "setNodeProp", id: heroId, key: "headline", value: "Aus dem Canvas" },
            { op: "setNodeProp", id: heroId, key: "headline", value: "Tablet", device: "tablet" },
          ],
        },
      });
      expect(written.status).toBe(200);

      const final = await env.api.request<PageResponse>({
        method: "GET",
        path: `/api/pages/${page.id}`,
      });
      const node = treeOf(final.body).nodes[heroId];
      expect(node?.props["headline"]).toBe("Aus dem Canvas");
      expect(node?.overrides?.tablet?.props?.["headline"]).toBe("Tablet");
    } finally {
      await env.close();
    }
  });

  it("rejects a stale base version with 409", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Canvas-Konflikt");
      const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
      const response = await env.api.request({
        method: "POST",
        path: `/api/pages/${page.id}/editor-mutations`,
        body: {
          baseDraftVersion: page.draftVersion + 5,
          author: TEST_AUTHOR,
          mutations: [{ op: "deleteNode", id: page.draft.rootNodeId }],
        },
      });
      expect(response.status).toBe(409);
    } finally {
      await env.close();
    }
  });
});
