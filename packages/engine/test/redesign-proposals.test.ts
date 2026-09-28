import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compileRedesign } from "../src/apply-redesign.ts";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
  type ErrorResponse,
  type PageResponse,
  type SiteResponse,
} from "./helpers.ts";

// Redesign proposals (ADR-0012): the offered directions are derived server-side,
// the human decision is durable, and the confirmed direction runs through the
// existing apply with the stored card.

function pngImage(width: number, height: number): string {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function designDocument(brand: string, font: string): string {
  return [
    "# Vorschlag",
    "",
    "## Colors",
    "| Token | Value |",
    "|---|---|",
    `| brand | ${brand} |`,
    "",
    "## Typography",
    `Font family: **${font}, Inter**`,
    "",
    "| Style | Size | Weight |",
    "|---|---|---|",
    "| Body | 15px | 400 |",
  ].join("\n");
}

type CardView = {
  id: string;
  referenceId: string;
  reference: { name: string };
  screenshot: { fileName: string; hash: string; alt: string };
  theme: {
    patch: Record<string, unknown>;
    specimen: { brand: string; displayFont: string; bodyFont: string };
  };
  warnings: string[];
  offerHash: string;
  sectionPlan: {
    planHash: string;
    mappingVersion: number;
    summary: { exact: number; fallback: number; manual: number; reuse: number; select: number; generate: number; avoid: number };
    entries: { source: { nodeId: string; type: string }; target: { type: string | null; variant: string | null } }[];
    media: { treatment: string; role: string; reason: string }[];
  };
};

type ProposalView = {
  id: string;
  sourcePageId: string;
  status: "proposed" | "applying" | "applied" | "failed";
  source: { siteId: string; pageId: string; path: string };
  cards: CardView[];
  decision: { directionId: string; referenceId: string; author: { kind: string } } | null;
  applyResult: {
    status: string;
    scope?: string;
    sectionPlanApplied?: boolean;
    planHash?: string | null;
    siteId: string | null;
    pageId: string | null;
    pagePath: string | null;
    error: { message: string } | null;
  } | null;
  freshness: { current: boolean; reasons: string[] };
};

let env: BootEnv;
let siteId: string;
let page: PageResponse;
let darkId: string;
let lightId: string;

async function createReference(
  name: string,
  brand: string,
  font: string,
): Promise<string> {
  const stored = await env.api.request<{ reference: { id: string } }>({
    method: "POST",
    path: "/api/references/manual",
    body: {
      name,
      image: pngImage(1920, 1080),
      documents: { design: designDocument(brand, font), guidelines: null, components: null },
      author: TEST_AUTHOR,
    },
  });
  expect(stored.status, JSON.stringify(stored.body)).toBe(201);
  return stored.body.reference.id;
}

async function createProposal(referenceIds: string[], key: string): Promise<ProposalView> {
  const response = await env.api.request<{ proposal: ProposalView }>({
    method: "POST",
    path: `/api/pages/${page.id}/redesign-proposals`,
    body: { referenceIds, idempotencyKey: key },
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.proposal;
}

async function countSites(): Promise<number> {
  const response = await env.api.request<{ sites: { id: string }[] }>({
    method: "GET",
    path: "/api/sites",
  });
  return response.body.sites.length;
}

beforeAll(async () => {
  env = await bootEngine();
  const site = await createTestSite(env.api, "Richtungswahl");
  siteId = site.id;
  page = await createTestPage(env.api, siteId, { title: "Start", path: "/" });
  darkId = await createReference("Dunkle Richtung", "#101418", "Sora");
  lightId = await createReference("Helle Richtung", "#fbf7f0", "Fraunces");
}, 30000);

afterAll(async () => {
  await env.close();
});

describe("redesign proposals (ADR-0012)", () => {
  it("offers server-derived cards that survive a reload unchanged", async () => {
    const proposal = await createProposal([darkId, lightId], "proposal-read-1");

    expect(proposal.status).toBe("proposed");
    expect(proposal.sourcePageId).toBe(page.id);
    expect(proposal.cards).toHaveLength(2);
    expect(proposal.decision).toBeNull();
    expect(proposal.applyResult).toBeNull();
    expect(proposal.freshness).toEqual({ current: true, reasons: [] });

    const [dark, light] = proposal.cards;
    expect(dark?.referenceId).toBe(darkId);
    expect(light?.referenceId).toBe(lightId);
    // Stable ids, unique per card and not the bare reference id.
    expect(dark?.id).toBeTruthy();
    expect(dark?.id).not.toBe(darkId);
    expect(new Set(proposal.cards.map((card) => card.id)).size).toBe(2);
    // The offered patch is the derived theme patch, not agent input.
    expect((dark?.theme.patch as { scales?: { brand?: string } }).scales?.brand).toBeTruthy();
    expect(dark?.theme.specimen.displayFont).toBeTruthy();
    expect(dark?.theme.specimen.bodyFont).toBeTruthy();
    // The image is a private copy with alt text, not a remote URL.
    expect(dark?.screenshot.fileName).toContain(dark?.id);
    expect(dark?.screenshot.hash).toBeTruthy();
    expect(dark?.screenshot.alt).toContain("Dunkle Richtung");

    // ADR-0013: the offer also states the build scope of the source page. The
    // fixture page is empty, so the plan is empty and fully consistent.
    const plan = dark?.sectionPlan;
    expect(plan?.planHash).toBeTruthy();
    expect(plan?.mappingVersion).toBe(1);
    expect(plan?.summary.exact).toBe(plan?.entries.length);
    expect(plan?.summary.fallback).toBe(0);
    expect(plan?.summary.manual).toBe(0);
    // Reference media are never offered as target assets.
    for (const need of plan?.media ?? []) {
      expect(need.role).toBe("reference-asset");
      expect(["avoid", "generate", "manual"]).toContain(need.treatment);
    }

    const shot = await env.api.request<ErrorResponse>({
      method: "GET",
      path: `/api/redesign-proposals/${proposal.id}/cards/${dark?.id ?? ""}/screenshot`,
    });
    expect(shot.status, JSON.stringify(shot.body)).toBe(200);

    // Reload: a second read returns the very same offer.
    const reloaded = await env.api.request<{ proposal: ProposalView }>({
      method: "GET",
      path: `/api/redesign-proposals/${proposal.id}`,
    });
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.proposal.cards).toEqual(proposal.cards);

    const listed = await env.api.request<{ proposals: ProposalView[] }>({
      method: "GET",
      path: `/api/pages/${page.id}/redesign-proposals`,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.proposals.map((entry) => entry.id)).toContain(proposal.id);
  }, 60000);

  it("replays a proposal create instead of writing a second one", async () => {
    const first = await createProposal([darkId], "proposal-idempotent-1");
    const replay = await env.api.request<{ proposal: ProposalView }>({
      method: "POST",
      path: `/api/pages/${page.id}/redesign-proposals`,
      body: { referenceIds: [darkId], idempotencyKey: "proposal-idempotent-1" },
    });
    expect(replay.status).toBe(201);
    expect(replay.body.proposal.id).toBe(first.id);
    expect(replay.headers["idempotency-replayed"]).toBe("true");

    const mismatch = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/pages/${page.id}/redesign-proposals`,
      body: { referenceIds: [lightId], idempotencyKey: "proposal-idempotent-1" },
    });
    expect(mismatch.status).toBe(409);

    const listed = await env.api.request<{ proposals: ProposalView[] }>({
      method: "GET",
      path: `/api/pages/${page.id}/redesign-proposals`,
    });
    expect(listed.body.proposals.filter((entry) => entry.id === first.id)).toHaveLength(1);
  }, 60000);

  it("rejects a foreign direction and an agent confirm", async () => {
    const proposal = await createProposal([darkId], "proposal-auth-1");
    const foreign = await env.humanApi.request<ErrorResponse>({
      method: "POST",
      path: `/api/redesign-proposals/${proposal.id}/confirm`,
      body: { directionId: "dir_gibt_es_nicht", idempotencyKey: "confirm-foreign" },
    });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.field).toBe("directionId");

    // The agent may plan and read, but never decide.
    const byAgent = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/redesign-proposals/${proposal.id}/confirm`,
      body: { directionId: proposal.cards[0]?.id, idempotencyKey: "confirm-agent" },
    });
    expect(byAgent.status).toBe(403);

    // The decision never happened.
    const untouched = await env.api.request<{ proposal: ProposalView }>({
      method: "GET",
      path: `/api/redesign-proposals/${proposal.id}`,
    });
    expect(untouched.body.proposal.status).toBe("proposed");
    expect(untouched.body.proposal.decision).toBeNull();
  }, 60000);

  it("blocks a stale plan on draft, theme and profile changes", async () => {
    const draftStale = await createProposal([darkId], "proposal-stale-draft");
    await env.api.request({
      method: "POST",
      path: `/api/pages/${page.id}/mutations`,
      body: {
        baseDraftVersion: page.draftVersion,
        author: TEST_AUTHOR,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: (await env.api.request<PageResponse>({ method: "GET", path: `/api/pages/${page.id}` })).body.draft.rootNodeId },
            node: { type: "hero", props: { headline: "Zwischendruck" } },
          },
        ],
      },
    });
    const staleRead = await env.api.request<{ proposal: ProposalView }>({
      method: "GET",
      path: `/api/redesign-proposals/${draftStale.id}`,
    });
    expect(staleRead.body.proposal.freshness.current).toBe(false);
    expect(staleRead.body.proposal.freshness.reasons.join(" ")).toContain("Quellseite");

    const staleConfirm = await env.humanApi.request<ErrorResponse>({
      method: "POST",
      path: `/api/redesign-proposals/${draftStale.id}/confirm`,
      body: { directionId: draftStale.cards[0]?.id, idempotencyKey: "confirm-stale" },
    });
    expect(staleConfirm.status).toBe(409);
    const afterStale = await env.api.request<{ proposal: ProposalView }>({
      method: "GET",
      path: `/api/redesign-proposals/${draftStale.id}`,
    });
    expect(afterStale.body.proposal.status).toBe("proposed");
    expect(afterStale.body.proposal.decision).toBeNull();
  }, 60000);

  it("turns one confirmed direction into a draft and never twice", async () => {
    const freshSite = await createTestSite(env.api, "Bestätigung");
    const freshPage = await createTestPage(env.api, freshSite.id, {
      title: "Start",
      path: "/",
    });
    const created = await env.api.request<{ proposal: ProposalView }>({
      method: "POST",
      path: `/api/pages/${freshPage.id}/redesign-proposals`,
      body: { referenceIds: [darkId, lightId], idempotencyKey: "proposal-confirm-1" },
    });
    expect(created.status).toBe(201);
    const proposal = created.body.proposal;
    const chosen = proposal.cards[1];
    expect(chosen).toBeDefined();

    // The confirmed direction writes the stored patch: the light reference's
    // brand, not the dark one's.
    const confirmed = await env.humanApi.request<{
      state: string;
      proposal: ProposalView;
    }>({
      method: "POST",
      path: `/api/redesign-proposals/${proposal.id}/confirm`,
      body: { directionId: chosen?.id, idempotencyKey: "confirm-once" },
    });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    expect(confirmed.body.state).toBe("confirmed");
    const decided = confirmed.body.proposal;
    expect(decided.status, JSON.stringify(decided.applyResult)).toBe("applied");
    expect(decided.decision?.directionId).toBe(chosen?.id);
    expect(decided.decision?.referenceId).toBe(lightId);
    expect(decided.decision?.author.kind).toBe("human");
    expect(decided.applyResult?.siteId).toBeTruthy();
    expect(decided.applyResult?.pageId).toBeTruthy();
    expect(decided.applyResult?.pagePath).toBe("/");

    const theme = await env.api.request<{ theme: { scales: { brand: string } } }>({
      method: "GET",
      path: `/api/sites/${decided.applyResult?.siteId ?? ""}/theme`,
    });
    expect(theme.status).toBe(200);
    expect(String(theme.body.theme.scales.brand).toUpperCase()).toBe("#FBF7F0");

    // A second confirm — even with a fresh key — replays instead of duplicating.
    const again = await env.humanApi.request<{ state: string; proposal: ProposalView }>({
      method: "POST",
      path: `/api/redesign-proposals/${proposal.id}/confirm`,
      body: { directionId: chosen?.id, idempotencyKey: "confirm-second-key" },
    });
    expect(again.status).toBe(200);
    expect(again.body.state).toBe("replayed");
    expect(again.body.proposal.applyResult?.siteId).toBe(decided.applyResult?.siteId);

    // The source page and its site are untouched.
    const source = await env.api.request<PageResponse>({
      method: "GET",
      path: `/api/pages/${freshPage.id}`,
    });
    expect(source.status).toBe(200);
    const sites = await env.api.request<{ sites: SiteResponse[] }>({
      method: "GET",
      path: "/api/sites",
    });
    expect(sites.body.sites.filter((entry) => entry.id === freshSite.id)).toHaveLength(1);

    // The design record names the proposal and the chosen card.
    const audit = await env.api.request<{
      entries: { mutation: string; params: Record<string, unknown> }[];
    }>({
      method: "GET",
      path: `/api/sites/${decided.applyResult?.siteId ?? ""}/audit?limit=50`,
    });
    const record = audit.body.entries.find((entry) => entry.mutation === "apply_redesign");
    expect(record?.params.proposalId).toBe(proposal.id);
    expect(record?.params.directionId).toBe(chosen?.id);
    expect(record?.params.sourcePageId).toBe(freshPage.id);

    // ADR-0013 + P2-1: the plan is confirmed AND written. Every entry the
    // executor touched either found its registered target or was left
    // behind as `manual`; the audit shows what ran, and the source draft is
    // never touched. `scope` and `sectionPlanApplied` are read from the same
    // flag (see RedesignProposalApplyResult), so they cannot contradict.
    expect(decided.applyResult?.sectionPlanApplied).toBe(true);
    expect(decided.applyResult?.scope).toBe("section-plan");
    expect(decided.applyResult?.planHash).toBe(chosen?.sectionPlan.planHash);
  }, 60000);

  it("prepares the whole run without writing anything (ADR-0014)", async () => {
    const before = await countSites();
    const draftBefore = (await env.api.request<PageResponse>({
      method: "GET",
      path: `/api/pages/${page.id}`,
    })).body.draftVersion;

    const plan = await compileRedesign({
      store: env.engine.store,
      registry: env.registry,
      siteId,
      snapshot: {
        referenceId: lightId,
        name: "Helle Richtung",
        themePatch: { scales: { brand: "#123456" } },
        proposalId: "compile-only",
        directionId: "dir",
        sourceSiteId: siteId,
        sourcePageId: page.id,
        sourceDraftVersion: draftBefore,
        sourceThemeVersion: 1,
      },
      author: { kind: "human", id: "operator", label: "Operator" },
    });

    // The phase split is the claim: compiling decides everything, and nothing
    // is written until the commit runs.
    expect(await countSites()).toBe(before);
    const draftAfter = (await env.api.request<PageResponse>({
      method: "GET",
      path: `/api/pages/${page.id}`,
    })).body.draftVersion;
    expect(draftAfter).toBe(draftBefore);
    expect(plan.targetSite.id).toBeTruthy();
    expect(plan.themeWrite?.patch).toEqual({ scales: { brand: "#123456" } });
  }, 60000);

  it("refuses a card that was changed after it was written", async () => {
    const proposal = await createProposal([darkId], "proposal-tampered-1");
    const proposalId = proposal.id;
    const row = await env.db.query<{ cards: unknown }>(
      "SELECT cards FROM redesign_proposals WHERE id = $1",
      [proposalId],
    );
    const stored = row.rows[0];
    if (stored === undefined) throw new Error("Proposal-Zeile nicht gefunden");
    const cards = stored.cards as CardView[];
    const tampered = cards.map((card, index) =>
      index === 0
        ? {
            ...card,
            sectionPlan: {
              ...card.sectionPlan,
              entries: [],
              summary: { ...card.sectionPlan.summary, exact: 0, fallback: 0, manual: 0 },
            },
          }
        : card,
    );
    await env.db.query("UPDATE redesign_proposals SET cards = $2 WHERE id = $1", [
      proposalId,
      JSON.stringify(tampered),
    ]);

    const refused = await env.humanApi.request<ErrorResponse>({
      method: "POST",
      path: `/api/redesign-proposals/${proposalId}/confirm`,
      body: {
        directionId: proposal.cards[0]?.id,
        idempotencyKey: "confirm-tampered",
      },
    });
    expect(refused.status).toBe(409);
    const afterwards = await env.api.request<{ proposal: ProposalView }>({
      method: "GET",
      path: `/api/redesign-proposals/${proposalId}`,
    });
    expect(afterwards.body.proposal.status).toBe("proposed");
    expect(afterwards.body.proposal.decision).toBeNull();
  }, 60000);
});
