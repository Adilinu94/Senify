import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { EditorStore, createSavePipeline, type SaveRequest } from "@senify/editor/state";
import type { EditorDocument } from "@senify/editor/state";
import { memoryDb } from "./support.ts";

// The save pipeline against the real engine (ticket 13): autosave-bundled,
// conflict on a stale draft version, style rules through the site routes.
// No browser: the transport is plain `fetch` against the running program.

const AUTHOR = { kind: "human", id: "pipeline-test", label: "Pipeline-Test" } as const;

describe("save pipeline against the engine", () => {
  it("saves a page mutation, a style rule and recovers from a conflict", async () => {
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-save-pipeline-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    try {
      const post = async (path: string, body: unknown) => {
        const response = await fetch(`${running.dashboardUrl}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: response.status, body: (await response.json()) as unknown };
      };
      const get = async (path: string) => {
        const response = await fetch(`${running.dashboardUrl}${path}`);
        return { status: response.status, body: (await response.json()) as unknown };
      };

      const siteResponse = await post("/api/sites", { name: "Save-Pipeline" });
      expect(siteResponse.status, JSON.stringify(siteResponse.body)).toBe(201);
      const site = siteResponse.body as { id: string };
      const pageResponse = await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" });
      expect(pageResponse.status, JSON.stringify(pageResponse.body)).toBe(201);
      const page = pageResponse.body as {
        id: string;
        draftVersion: number;
        draft: { rootNodeId: string };
      };

      // One real section node, so there is something to style.
      const seeded = await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        author: AUTHOR,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: { type: "hero", props: { headline: "Vorher" } },
          },
        ],
      });
      expect(seeded.status, JSON.stringify(seeded.body)).toBe(200);
      const draft = (await get(`/api/pages/${page.id}`)).body as {
        draftVersion: number;
        draft: { rootNodeId: string; nodes: Record<string, { children?: string[] }> };
      };
      const headingId = (draft.draft.nodes[draft.draft.rootNodeId]?.children ?? [])[0] ?? "";
      expect(headingId).not.toBe("");

      // The editor document mirrors the section tree by id.
      const document: EditorDocument = {
        version: 2,
        rootNodeId: draft.draft.rootNodeId,
        nodes: {
          [draft.draft.rootNodeId]: {
            id: draft.draft.rootNodeId,
            primitive: "root",
            props: {},
            children: [headingId],
          },
          [headingId]: { id: headingId, primitive: "hero", props: { headline: "Vorher" } },
        },
        styleRules: [],
      };
      const store = new EditorStore({ document });
      const requests: SaveRequest[] = [];
      const transport = async (request: SaveRequest) => {
        requests.push(request);
        const response = await fetch(`${running.dashboardUrl}${request.path}`, {
          method: request.method,
          headers: { "content-type": "application/json" },
          ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        });
        const body = await response.json().catch(() => undefined);
        return { status: response.status, body };
      };
      const pipeline = createSavePipeline({
        store,
        pageId: page.id,
        siteId: site.id,
        author: AUTHOR,
        request: transport,
        debounceMs: 5,
      });
      pipeline.acceptVersion(draft.draftVersion);

      // 1 — a page mutation lands in the section draft.
      store.apply({ op: "setNodeProp", id: headingId, key: "headline", value: "Nachher" });
      await pipeline.flush();
      expect(pipeline.state().status).toBe("saved");
      const afterProps = (await get(`/api/pages/${page.id}`)).body as {
        draftVersion: number;
        draft: { nodes: Record<string, { props?: Record<string, unknown> }> };
      };
      expect(afterProps.draft.nodes[headingId]?.props?.["headline"]).toBe("Nachher");
      expect(pipeline.state().version).toBe(afterProps.draftVersion);

      // 2 — a style rule lands in the site registry, states included.
      store.apply({
        op: "upsertStyleRule",
        rule: {
          id: "r-cta",
          name: "cta",
          kind: "class",
          selector: ".cta",
          order: 0,
          styles: { color: "#ff0000" },
          states: { hover: { color: "#00ff00" } },
          contextStyles: {},
          authoredBy: "agent",
        },
      });
      await pipeline.flush();
      expect(pipeline.state().status).toBe("saved");
      const rules = (await get(`/api/sites/${site.id}/style-rules`)).body as {
        rules: { id: string; states?: unknown; authoredBy?: string }[];
      };
      const saved = rules.rules.find((rule) => rule.id === "r-cta");
      expect(saved).toBeDefined();
      expect(saved?.states).toEqual({ hover: { color: "#00ff00" } });
      // Provenance comes from the token (the program's operator token is
      // "human"), never from the body: the rule is a user rule even though the
      // document field claims "agent" (ticket 18, slice 3).
      expect(saved?.authoredBy).toBe("user");

      // 3 — a stale version conflicts, keeps the batch and recovers on retry.
      pipeline.acceptVersion(1);
      store.apply({ op: "setNodeProp", id: headingId, key: "headline", value: "Konflikt" });
      await pipeline.flush();
      expect(pipeline.state().status).toBe("conflict");
      expect(pipeline.state().pending).toBe(1);

      const current = (await get(`/api/pages/${page.id}`)).body as { draftVersion: number };
      await pipeline.retry(current.draftVersion);
      expect(pipeline.state().status).toBe("saved");
      const afterRetry = (await get(`/api/pages/${page.id}`)).body as {
        draft: { nodes: Record<string, { props?: Record<string, unknown> }> };
      };
      expect(afterRetry.draft.nodes[headingId]?.props?.["headline"]).toBe("Konflikt");

      // 4 — a class assignment reaches the section draft (setNodeMeta).
      store.apply({ op: "assignClass", id: headingId, classId: "cta" });
      await pipeline.flush();
      expect(pipeline.state().status).toBe("saved");
      expect(pipeline.state().unsupported).toEqual([]);
      const afterClass = (await get(`/api/pages/${page.id}`)).body as {
        draft: { nodes: Record<string, { classes?: string[] }> };
      };
      expect(afterClass.draft.nodes[headingId]?.classes).toEqual(["cta"]);

      // Undo removes the assignment again.
      store.undo();
      await pipeline.flush();
      expect(pipeline.state().status).toBe("saved");
      const afterUndo = (await get(`/api/pages/${page.id}`)).body as {
        draft: { nodes: Record<string, { classes?: string[] }> };
      };
      expect(afterUndo.draft.nodes[headingId]?.classes).toBeUndefined();
      pipeline.dispose();
    } finally {
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 60000);
});
