import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, EngineClient, type ToolContext } from "@senify/mcp";
import type { ReferenceDiffDeps } from "@senify/engine";
import { bootMcpEnv, type McpTestEnv } from "./helpers.ts";

type Json = Record<string, unknown>;

type McpSession = {
  client: Client;
  close(): Promise<void>;
};

const referencePng = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex",
);
const designDocument = [
  "# MCP Redesign Gate",
  "",
  "## Colors",
  "| Token | Value |",
  "|---|---|",
  "| brand | #7c5cff |",
  "| bg | #101018 |",
  "",
  "## Typography",
  "Font family: **Sora, Inter**",
  "",
  "| Style | Size | Weight |",
  "|---|---|---|",
  "| Body | 15px | 400 |",
].join("\n");

const referenceDiffDeps: ReferenceDiffDeps = {
  captureScreenshots: async (options) => {
    const breakpoint = options.breakpoints?.[0] ?? "desktop";
    const width = options.widths?.[breakpoint] ?? 1440;
    mkdirSync(options.outDir, { recursive: true });
    const path = join(options.outDir, `${breakpoint}.png`);
    writeFileSync(path, referencePng);
    return [{ breakpoint, path, width, height: 900, bytes: referencePng.byteLength }];
  },
  diffScreenshots: async (input) => ({
    width: 1,
    height: 1,
    changedPixels: 1,
    ratio: 1,
    bounds: { left: 0, top: 0, right: 0, bottom: 0 },
    path: input.after,
  }),
};

async function connect(origin: string, token: string): Promise<McpSession> {
  const context: ToolContext = {
    client: new EngineClient({ apiUrl: origin, token }),
  };
  const server = createMcpServer({ context, onError: () => {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "redesign-workflow-tests", version: "0.0.0" });
  await client.connect(clientTransport);
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

async function call(
  session: McpSession,
  name: string,
  args: Json = {},
): Promise<{ ok: boolean; data: Json }> {
  const result = await session.client.callTool({ name, arguments: args });
  const first = (result.content as { type: string; text?: string }[])[0];
  return {
    ok: result.isError !== true,
    data: JSON.parse(first?.text ?? "{}") as Json,
  };
}

describe("reference redesign composite workflow", () => {
  let env: McpTestEnv;
  let session: McpSession;

  beforeAll(async () => {
    env = await bootMcpEnv({ referenceDiffs: referenceDiffDeps });
    session = await connect(env.origin, env.token);
  });

  afterAll(async () => {
    await session.close();
    await env.close();
  });

  it("hands the direction to a human and exposes no confirm tool", async () => {
    const sourceSite = await call(session, "create_site", { name: "MCP Vorschlag Quelle" });
    const sourceSiteId = sourceSite.data.id as string;
    const sourcePage = await call(session, "create_page", {
      siteId: sourceSiteId,
      title: "Start",
      path: "/",
    });
    const sourcePageId = sourcePage.data.id as string;
    const reference = await call(session, "create_manual_reference", {
      name: "MCP Vorschlag",
      image: referencePng.toString("base64"),
      documents: { design: designDocument, guidelines: null, components: null },
    });
    const referenceId = (reference.data.reference as { id: string }).id;

    const created = await call(session, "create_redesign_proposal", {
      pageId: sourcePageId,
      referenceIds: [referenceId],
      idempotencyKey: "mcp-proposal-1",
    });
    expect(created.ok, JSON.stringify(created.data)).toBe(true);
    const proposal = created.data.proposal as {
      id: string;
      status: string;
      cards: {
        id: string;
        theme: { specimen: { brand: string } };
        sectionPlan: {
          planHash: string;
          mappingVersion: number;
          summary: { exact: number };
          media: { role: string; treatment: string }[];
        };
      }[];
      decision: unknown;
      applyResult: unknown;
      freshness: { current: boolean };
    };
    expect(proposal.status).toBe("proposed");
    expect(proposal.cards).toHaveLength(1);
    expect(proposal.cards[0]?.theme.specimen.brand).toBeTruthy();
    // ADR-0013: the offer also states the build scope of the source page.
    expect(proposal.cards[0]?.sectionPlan.planHash).toBeTruthy();
    expect(proposal.cards[0]?.sectionPlan.mappingVersion).toBe(1);
    expect(
      proposal.cards[0]?.sectionPlan.summary.exact ?? -1,
    ).toBeGreaterThanOrEqual(0);
    // Reference media are never handed over as target assets.
    for (const need of proposal.cards[0]?.sectionPlan.media ?? []) {
      expect(["avoid", "generate", "manual", "select", "reuse"]).toContain(need.treatment);
      if (need.role === "reference-asset") expect(need.treatment).not.toBe("reuse");
    }
    // Nothing is decided and nothing is applied until a human confirms.
    expect(proposal.decision).toBeNull();
    expect(proposal.applyResult).toBeNull();
    expect(proposal.freshness.current).toBe(true);

    const replay = await call(session, "create_redesign_proposal", {
      pageId: sourcePageId,
      referenceIds: [referenceId],
      idempotencyKey: "mcp-proposal-1",
    });
    expect(replay.ok).toBe(true);
    expect((replay.data.proposal as { id: string }).id).toBe(proposal.id);

    const read = await call(session, "get_redesign_proposal", {
      proposalId: proposal.id,
    });
    expect(read.ok).toBe(true);
    expect((read.data.proposal as { status: string }).status).toBe("proposed");

    // The agent may not decide the direction: there is no confirm tool at all.
    const tools = await session.client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    expect(names).toContain("create_redesign_proposal");
    expect(names).toContain("get_redesign_proposal");
    expect(names.some((name) => name.includes("confirm"))).toBe(false);

    // The engine is addressed here with the agent token, so the human-only
    // route is refused before any state changes.
    const forbidden = await env.api.request({
      method: "POST",
      path: `/api/redesign-proposals/${proposal.id}/confirm`,
      body: {
        directionId: proposal.cards[0]?.id,
        idempotencyKey: "mcp-proposal-agent-attempt",
      },
    });
    expect(forbidden.status).toBe(403);
  }, 120000);

  it("plans, applies, rebuilds, verifies, previews and reviews without publishing", async () => {
    const sourceSite = await call(session, "create_site", { name: "MCP Redesign Quelle" });
    expect(sourceSite.ok).toBe(true);
    const sourceSiteId = sourceSite.data.id as string;
    const sourcePage = await call(session, "create_page", {
      siteId: sourceSiteId,
      title: "Start",
      path: "/",
    });
    expect(sourcePage.ok).toBe(true);
    const sourcePageId = sourcePage.data.id as string;

    const reference = await call(session, "create_manual_reference", {
      name: "MCP Redesign Referenz",
      image: referencePng.toString("base64"),
      documents: {
        design: designDocument,
        guidelines: null,
        components: null,
      },
    });
    expect(reference.ok).toBe(true);
    const referenceId = (reference.data.reference as { id: string }).id;

    const plan = await call(session, "plan_redesign", {
      pageId: sourcePageId,
      referenceIds: [referenceId],
    });
    expect(plan.ok).toBe(true);
    expect(plan.data.targets).toHaveLength(1);

    const idempotencyKey = "mcp-redesign-composite-1";
    const applied = await call(session, "apply_redesign", {
      siteId: sourceSiteId,
      referenceIds: [referenceId],
      idempotencyKey,
    });
    expect(applied.ok, JSON.stringify(applied.data)).toBe(true);
    const result = applied.data as unknown as {
      siteId: string;
      pages: {
        pageId: string;
        draftVersion: number;
        seeded: boolean;
        sections: { type: string; nodeId: string }[];
      }[];
      record: { referenceIds: string[] };
    };
    const target = result.pages.find((page) => page.seeded);
    expect(target).toBeDefined();
    expect(result.record.referenceIds).toEqual([referenceId]);
    const hero = target?.sections.find((section) => section.type === "hero");
    const cta = target?.sections.find((section) => section.type === "cta");
    expect(hero?.nodeId).toBeTruthy();
    expect(cta?.nodeId).toBeTruthy();

    const replay = await call(session, "apply_redesign", {
      siteId: sourceSiteId,
      referenceIds: [referenceId],
      idempotencyKey,
    });
    expect(replay.ok).toBe(true);
    expect(replay.data.siteId).toBe(result.siteId);

    const section = await call(session, "get_section", { type: "hero" });
    expect(section.ok).toBe(true);
    expect(section.data.goldenVariant).toBe("centered");

    const page = await call(session, "get_page", { pageId: target?.pageId });
    expect(page.ok).toBe(true);
    const updated = await call(session, "apply_mutations", {
      pageId: target?.pageId,
      baseDraftVersion: page.data.draftVersion as number,
      mutations: [
        {
          op: "updateNodeProps",
          id: hero?.nodeId,
          patch: { headline: "Aus der Referenz neu gebaut" },
        },
        {
          op: "updateNodeProps",
          id: cta?.nodeId,
          patch: {
            buttons: [
              { label: "Startseite", link: { url: "/" } },
              { label: "Zum Projekt", link: { url: "/" } },
            ],
          },
        },
      ],
    });
    expect(updated.ok, JSON.stringify(updated.data)).toBe(true);

    const designReport = await call(session, "get_design_report", { siteId: result.siteId });
    expect(designReport.ok).toBe(true);
    expect(typeof designReport.data.score).toBe("number");

    const diff = await call(session, "diff_reference", {
      referenceId,
      siteId: result.siteId,
      pageId: target?.pageId,
    });
    expect(diff.ok, JSON.stringify(diff.data)).toBe(true);
    expect(diff.data.diffs).toHaveLength(1);

    const preview = await call(session, "create_preview", { siteId: result.siteId });
    expect(preview.ok, JSON.stringify(preview.data)).toBe(true);
    expect((preview.data.preview as { token: string }).token.length).toBeGreaterThan(10);

    const submitted = await call(session, "submit_for_review", {
      siteId: result.siteId,
      pageIds: [target?.pageId],
      note: "MCP-Redesign zur Prüfung",
    });
    expect(submitted.ok, JSON.stringify(submitted.data)).toBe(true);
    const reviewId = (submitted.data.review as { id: string }).id;
    const feedback = await call(session, "get_review_feedback", { reviewId });
    expect(feedback.ok).toBe(true);
    expect(feedback.data.status).toBe("submitted");

    const releases = await call(session, "list_releases", { siteId: result.siteId });
    expect(releases.ok).toBe(true);
    expect(releases.data.releases).toEqual([]);
  }, 120000);
});
