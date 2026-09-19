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

  it("maps class assignment and structural meta onto updateNodeMeta", () => {
    expect(
      editorMutationsToSection([
        { op: "assignClass", id: "n1", classId: "cta" },
        { op: "removeClass", id: "n1", classId: "old" },
        {
          op: "setNodeMeta",
          id: "n1",
          meta: { classes: ["a", "b"], hidden: true, locked: null },
        },
        {
          op: "insertNode",
          parent: { nodeId: "root" },
          node: { primitive: "heading", classes: ["cta"], hidden: true },
        },
      ]),
    ).toEqual([
      { op: "updateNodeMeta", id: "n1", meta: { addClasses: ["cta"] } },
      { op: "updateNodeMeta", id: "n1", meta: { removeClasses: ["old"] } },
      {
        op: "updateNodeMeta",
        id: "n1",
        meta: { classes: ["a", "b"], hidden: true, locked: null },
      },
      {
        op: "insertNode",
        parent: { nodeId: "root" },
        node: { type: "heading", classes: ["cta"], hidden: true },
      },
    ]);
  });

  it("maps motion onto the section ops and carries it on a fresh node", () => {
    expect(
      editorMutationsToSection([
        { op: "setMotion", id: "n1", spec: { preset: "fade-up", intensity: 6 } },
        { op: "clearMotion", id: "n1" },
        {
          op: "insertNode",
          parent: { nodeId: "root" },
          node: { primitive: "hero", motion: { preset: "scroll-reveal" } },
        },
      ]),
    ).toEqual([
      { op: "setMotion", id: "n1", spec: { preset: "fade-up", intensity: 6 } },
      { op: "clearMotion", id: "n1" },
      {
        op: "insertNode",
        parent: { nodeId: "root" },
        node: { type: "hero", motion: { preset: "scroll-reveal" } },
      },
    ]);
  });

  it("maps slot and collection ops onto their section forms", () => {
    expect(
      editorMutationsToSection([
        {
          op: "setSlotContent",
          id: "coll",
          slot: "item",
          nodes: [{ primitive: "card", props: { title: "Eins" } }],
        },
        {
          op: "createCollectionEntry",
          id: "coll",
          node: { primitive: "card", id: "card-1", props: { title: "Zwei" } },
          index: 0,
        },
        {
          op: "updateCollectionEntry",
          id: "coll",
          index: 0,
          patch: { title: "Drei" },
        },
      ]),
    ).toEqual([
      {
        op: "setSlotContent",
        id: "coll",
        slot: "item",
        nodes: [{ type: "card", props: { title: "Eins" } }],
      },
      {
        op: "createCollectionEntry",
        id: "coll",
        node: { type: "card", id: "card-1", props: { title: "Zwei" } },
        index: 0,
      },
      {
        op: "updateCollectionEntry",
        id: "coll",
        index: 0,
        patch: { title: "Drei" },
      },
    ]);
  });

  it("points a style rule op at the site-wide route", () => {
    const rule = {
      id: "r-accent",
      name: "accent",
      kind: "class" as const,
      selector: ".accent",
      order: 0,
      styles: {},
      contextStyles: {},
    };
    for (const mutation of [
      { op: "upsertStyleRule" as const, rule },
      { op: "renameStyleRule" as const, id: "r-accent", name: "accent-2" },
      { op: "deleteStyleRule" as const, id: "r-accent" },
      { op: "reorderStyleRule" as const, id: "r-accent", index: 0 },
    ]) {
      let caught: unknown;
      try {
        editorMutationsToSection([mutation]);
      } catch (error) {
        caught = error;
      }
      expect((caught as { suggestion?: string }).suggestion).toMatch(/style-rules/);
    }
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

  it("writes class assignment and hidden through the same route", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Canvas-Klassen");
      const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
      const rootId = page.draft.rootNodeId;
      const inserted = await env.api.request<MutationsResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/editor-mutations`,
        body: {
          baseDraftVersion: page.draftVersion,
          author: TEST_AUTHOR,
          mutations: [
            {
              op: "insertNode",
              parent: { nodeId: rootId },
              node: { primitive: "divider", props: {} },
            },
          ],
        },
      });
      expect(inserted.status).toBe(200);
      const withHeading = await env.api.request<PageResponse>({
        method: "GET",
        path: `/api/pages/${page.id}`,
      });
      const headingId = treeOf(withHeading.body).nodes[rootId]?.children?.[0] ?? "";
      expect(headingId).not.toBe("");

      const written = await env.api.request<MutationsResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/editor-mutations`,
        body: {
          baseDraftVersion: withHeading.body.draftVersion,
          author: TEST_AUTHOR,
          mutations: [
            { op: "assignClass", id: headingId, classId: "accent" },
            { op: "setNodeMeta", id: headingId, meta: { hidden: true } },
          ],
        },
      });
      expect(written.status).toBe(200);

      const final = await env.api.request<PageResponse>({
        method: "GET",
        path: `/api/pages/${page.id}`,
      });
      const node = treeOf(final.body).nodes[headingId];
      expect(node?.classes).toEqual(["accent"]);
      expect(node?.hidden).toBe(true);

      // Undo direction: the whole list travels back as a setNodeMeta op.
      const removed = await env.api.request<MutationsResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/editor-mutations`,
        body: {
          baseDraftVersion: final.body.draftVersion,
          author: TEST_AUTHOR,
          mutations: [
            { op: "removeClass", id: headingId, classId: "accent" },
            { op: "setNodeMeta", id: headingId, meta: { hidden: null } },
          ],
        },
      });
      expect(removed.status).toBe(200);
      const cleared = await env.api.request<PageResponse>({
        method: "GET",
        path: `/api/pages/${page.id}`,
      });
      const clearedNode = treeOf(cleared.body).nodes[headingId];
      expect(clearedNode?.classes).toBeUndefined();
      expect(clearedNode?.hidden).toBeUndefined();
    } finally {
      await env.close();
    }
  });

  it("writes motion through the same route and clears it", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Canvas-Motion");
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
            { op: "setMotion", id: heroId, spec: { preset: "fade-up", intensity: 6 } },
          ],
        },
      });
      expect(written.status).toBe(200);
      const withMotion = await env.api.request<PageResponse>({
        method: "GET",
        path: `/api/pages/${page.id}`,
      });
      expect(treeOf(withMotion.body).nodes[heroId]?.motion).toEqual({
        preset: "fade-up",
        intensity: 6,
      });

      const cleared = await env.api.request<MutationsResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/editor-mutations`,
        body: {
          baseDraftVersion: withMotion.body.draftVersion,
          author: TEST_AUTHOR,
          mutations: [{ op: "clearMotion", id: heroId }],
        },
      });
      expect(cleared.status).toBe(200);
      const final = await env.api.request<PageResponse>({
        method: "GET",
        path: `/api/pages/${page.id}`,
      });
      expect(treeOf(final.body).nodes[heroId]?.motion).toBeUndefined();
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
