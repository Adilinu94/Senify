import { describe, expect, it } from "vitest";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  type ErrorResponse,
  type PageResponse,
} from "./helpers.ts";

// E26 slice 3: the design DNA lives on the project (R9) and the score gates
// the publish (R8). The `never` rules of the contract are hard for agent
// tokens and a warning for humans; below the profile threshold the publish
// blocks with the named findings.

type ContractResponse = {
  constants: string[];
  never: string[];
  vocabulary: string[];
  source: "references" | "manual";
  updatedAt: string;
};

type MutationsResponse = {
  newDraftVersion: number;
  undoBatchId: string | null;
  warnings: { field: string; message: string; suggestion: string }[];
  results: { opIndex: number; op: string; undoPatch: string[] }[];
};

// A page with one hero section carrying a gradient background — the pattern
// the "Keine dekorativen Verlaeufe" rule of minimal-editorial blocks.
function gradientMutation(rootNodeId: string): Record<string, unknown> {
  return {
    op: "insertNode",
    parent: { nodeId: rootNodeId },
    index: 0,
    node: {
      type: "hero",
      props: { background: "linear-gradient(135deg, #111 0%, #333 100%)" },
    },
  };
}

describe("design contract (E26 slice 3)", () => {
  it("stores and clears a manual contract", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Dna");
      const put = await env.api.request<ContractResponse>({
        method: "PUT",
        path: `/api/sites/${site.id}/design-contract`,
        body: {
          constants: ["Immer 8px-Raster"],
          never: ["Nie Gradienten"],
          vocabulary: ["calm"],
        },
      });
      expect(put.status).toBe(200);
      expect(put.body.source).toBe("manual");
      expect(put.body.never).toEqual(["Nie Gradienten"]);

      const get = await env.api.request<ContractResponse>({
        method: "GET",
        path: `/api/sites/${site.id}/design-contract`,
      });
      expect(get.status).toBe(200);
      expect(get.body.never).toEqual(["Nie Gradienten"]);

      const cleared = await env.api.request<ContractResponse | null>({
        method: "PUT",
        path: `/api/sites/${site.id}/design-contract`,
        body: {},
      });
      expect(cleared.status).toBe(200);
      expect(cleared.body).toBeNull();
    } finally {
      await env.close();
    }
  }, 30000);

  it("blocks agent writes that violate a never rule, warns humans", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Fence");
      const page: PageResponse = await createTestPage(env.api, site.id);
      const put = await env.api.request<ContractResponse>({
        method: "PUT",
        path: `/api/sites/${site.id}/design-contract`,
        body: { never: ["Keine dekorativen Verlaeufe ohne Funktion"] },
      });
      expect(put.status).toBe(200);

      // Agent token: the write is blocked, nothing is persisted.
      const agentBlocked = await env.api.request<MutationsResponse & ErrorResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/mutations`,
        body: {
          baseDraftVersion: page.draftVersion,
          mutations: [gradientMutation(page.draft.rootNodeId)],
        },
      });
      expect(agentBlocked.status).toBe(422);
      expect(agentBlocked.body.error.category).toBe("guardrail");
      expect(agentBlocked.body.error.message).toContain("Design-DNA verletzt");

      // The draft is unchanged (nothing written on a violation).
      const after = await env.api.request<{ draftVersion: number }>({
        method: "GET",
        path: `/api/pages/${page.id}`,
      });
      expect(after.body.draftVersion).toBe(page.draftVersion);

      // Human token: the same write lands with a warning.
      const humanOk = await env.humanApi.request<MutationsResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/mutations`,
        body: {
          baseDraftVersion: page.draftVersion,
          mutations: [gradientMutation(page.draft.rootNodeId)],
        },
      });
      expect(humanOk.status).toBe(200);
      expect(
        humanOk.body.warnings.some((warning) =>
          warning.message.includes("Design-DNA verletzt"),
        ),
      ).toBe(true);
    } finally {
      await env.close();
    }
  }, 60000);

  it("gates the publish below the profile threshold", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Gate");
      // clean profile: the mildest gate (55) — the slop page must fall below.
      const profile = await env.api.request<ErrorResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}`,
        body: { profile: "clean" },
      });
      expect(profile.status).toBe(200);
      const page: PageResponse = await createTestPage(env.api, site.id);
      // A page of identical hero sections with literal colors and gradients
      // is the slop pattern stack (S1 monotonie, S3 farb-inflation, S7
      // spacing); the score falls below the clean threshold and the publish
      // blocks.
      const mutations = Array.from({ length: 6 }, (_, index) => ({
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        index,
        node: {
          type: "hero",
          props: {
            eyebrow: `#ff00${index}a`,
            sub: "linear-gradient(1deg, #111, #222)",
          },
        },
      }));
      const write = await env.api.request<MutationsResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/mutations`,
        body: { baseDraftVersion: page.draftVersion, mutations },
      });
      expect(write.status).toBe(200);

      const report = await env.api.request<{ score: number; verdict: string }>({
        method: "GET",
        path: `/api/sites/${site.id}/design-report`,
      });
      expect(report.status).toBe(200);
      expect(report.body.verdict).toBe("gate");

      const submit = await env.api.request<{ review?: { id: string } }>({
        method: "POST",
        path: `/api/sites/${site.id}/reviews`,
        body: {},
      });
      // Submit never blocks on the score; publish does.
      expect(submit.status).toBe(201);
      const review = submit.body.review;
      expect(review).toBeDefined();
      const approve = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/reviews/${review!.id}/approve`,
        body: {},
      });
      expect(approve.status).toBe(422);
      expect(approve.body.error.message).toContain("Design-Score");
    } finally {
      await env.close();
    }
  }, 60000);
});

describe("reference search and dedupe (E24, L42)", () => {
  it("searches over documents with weight ranking", async () => {
    const env = await bootEngine();
    try {
      const stored = await env.api.request<{ reference: { id: string } }>({
        method: "POST",
        path: "/api/references/manual",
        body: {
          name: "Schweizer Raster Studio",
          documents: {
            design: "# Swiss Grid\nStrenges Spaltenraster, Linksausrichtung.",
            guidelines: null,
            components: null,
          },
          image:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        },
      });
      expect(stored.status).toBe(201);
      const search = await env.api.request<{
        count: number;
        hits: { reference: { id: string }; weight: number }[];
      }>({
        method: "GET",
        path: "/api/references/search?q=raster",
      });
      expect(search.status).toBe(200);
      expect(search.body.count).toBe(1);
      expect(search.body.hits[0]?.reference.id).toBe(stored.body.reference.id);
      // The document hit (weight 1) beats nothing: the token only lives in
      // design.md, not in the name.
      expect(search.body.hits[0]?.weight).toBeGreaterThan(0);

      const empty = await env.api.request<ErrorResponse>({
        method: "GET",
        path: "/api/references/search",
      });
      expect(empty.status).toBe(400);
    } finally {
      await env.close();
    }
  }, 30000);

  it("finds duplicates by url and name", async () => {
    const env = await bootEngine();
    try {
      const image =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
      const first = await env.api.request<{ reference: { id: string } }>({
        method: "POST",
        path: "/api/references/manual",
        body: { name: "Studio Alpha", image },
      });
      expect(first.status).toBe(201);
      // Same normalised name, different case and spacing.
      const second = await env.api.request<{ reference: { id: string } }>({
        method: "POST",
        path: "/api/references/manual",
        body: { name: "studio  alpha", image },
      });
      expect(second.status).toBe(201);
      const found = await env.api.request<{
        count: number;
        duplicates: { reference: { id: string }; reason: string }[];
      }>({
        method: "GET",
        path: "/api/references/duplicates",
      });
      expect(found.status).toBe(200);
      expect(found.body.count).toBeGreaterThanOrEqual(1);
      expect(
        found.body.duplicates.some(
          (entry) =>
            entry.reference.id === second.body.reference.id &&
            entry.reason === "name",
        ),
      ).toBe(true);
    } finally {
      await env.close();
    }
  }, 30000);
});
