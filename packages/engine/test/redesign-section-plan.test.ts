import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NodeTree } from "@senify/section-sdk";
import { getRedesignProposalView } from "../src/redesign-proposals.ts";
import {
  REDESIGN_MAPPING_VERSION,
  deriveRedesignSectionPlan,
  validateSectionPlan,
} from "../src/redesign-section-plan.ts";
import {
  directionCardContentHash,
  verifyDirectionCardContentHash,
  type DirectionSectionPlan,
} from "../src/redesign-proposal-contract.ts";
import { collectAssetIds } from "../src/media.ts";
import type { Asset, Reference, SiteProfile } from "../src/types.ts";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  type BootEnv,
  type PageResponse,
  type SiteResponse,
} from "./helpers.ts";

// Sektions-Plan (ADR-0013): the offered direction says which registered
// sections it touches, which variant applies, which slots exist and which media
// are needed. Everything is derived, immutable, and proven before it is stored.

let env: BootEnv;
let siteId: string;
let page: PageResponse;
let referenceId: string;

function pngImage(width: number, height: number): string {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function designDocument(brand: string): string {
  return [
    "# Richtung",
    "",
    "## Colors",
    "| Token | Value |",
    "|---|---|",
    `| brand | ${brand} |`,
    "",
    "## Typography",
    "Font family: **Sora, Inter**",
    "",
    "| Style | Size | Weight |",
    "|---|---|---|",
    "| Body | 15px | 400 |",
  ].join("\n");
}

function profileFor() {
  return {
    assets: [
      { kind: "image" as const, ref: "https://example.test/hero.jpg", where: ["hero"], identityRisk: false },
      { kind: "logo" as const, ref: "https://example.test/logo.svg", where: ["navbar"], identityRisk: true },
    ],
  } as never;
}

beforeAll(async () => {
  env = await bootEngine();
  const site = await createTestSite(env.api, "Sektionsplan");
  siteId = site.id;
  page = await createTestPage(env.api, siteId, { title: "Start", path: "/" });
  const reference = await env.api.request<{ reference: { id: string } }>({
    method: "POST",
    path: "/api/references/manual",
    body: {
      name: "Planreferenz",
      image: pngImage(1920, 1080),
      documents: { design: designDocument("#2f6f4e"), guidelines: null, components: null },
    },
  });
  expect(reference.status, JSON.stringify(reference.body)).toBe(201);
  referenceId = reference.body.reference.id;
}, 30000);

afterAll(async () => {
  await env.close();
});

async function buildPlan(): Promise<DirectionSectionPlan> {
  const current = await env.api.request<PageResponse>({
    method: "GET",
    path: `/api/pages/${page.id}`,
  });
  const currentSite = (await env.api.request<SiteResponse>({
    method: "GET",
    path: `/api/sites/${siteId}`,
  })).body;
  const tree = current.body.draft as unknown as NodeTree;
  const assetIds = collectAssetIds([{ draft: tree }]);
  const assetsById = new Map<string, Asset>();
  for (const assetId of assetIds) {
    try {
      assetsById.set(assetId, await env.engine.store.getAsset(assetId));
    } catch {
      // Missing assets are a media need, not a failure.
    }
  }
  const reference = (await env.api.request<Reference>({
    method: "GET",
    path: `/api/references/${referenceId}`,
  })).body;
  if (reference.profile === null) throw new Error("Referenz ohne Profil");
  return deriveRedesignSectionPlan({
    page: {
      id: current.body.id,
      siteId,
      path: current.body.path,
      title: current.body.title,
      meta: current.body.meta,
      draft: tree,
      draftVersion: current.body.draftVersion,
      template: null,
      layoutId: null,
      createdAt: current.body.createdAt,
      updatedAt: current.body.updatedAt,
    },
    tree: structuredClone(tree),
    registry: env.registry,
    siteProfile: currentSite.profile as SiteProfile,
    designContract: null,
    siteId,
    assetsById,
    profile: reference.profile,
    styleBrief: reference.profile.styleBrief,
  });
}

async function seedSections(): Promise<void> {
  const current = await env.api.request<PageResponse>({
    method: "GET",
    path: `/api/pages/${page.id}`,
  });
  const root = current.body.draft.rootNodeId;
  const hero = await env.api.request<{ id: string }>({
    method: "POST",
    path: `/api/pages/${page.id}/mutations`,
    body: {
      baseDraftVersion: current.body.draftVersion,
      mutations: [
        {
          op: "insertNode",
          parent: { nodeId: root },
          node: { type: "hero", variant: "split", props: { headline: "Werkstatt" } },
        },
      ],
    },
  });
  expect(hero.status, JSON.stringify(hero.body)).toBe(200);
}

describe("Sektions-Plan (ADR-0013)", () => {
  it("plants the registered sections with variant, children and slots", async () => {
    await seedSections();
    const plan = await buildPlan();
    const hero = plan.entries.find((entry) => entry.source.type === "hero");

    expect(hero).toBeDefined();
    expect(hero?.target.type).toBe("hero");
    expect(hero?.status).toBe("exact");
    expect(hero?.source.parentNodeId).toBeDefined();
    expect(hero?.content.policy).toBe("preserve");
    expect(hero?.design.policy).toBe("theme-inheritance");
    expect(hero?.content.propKeys).toContain("headline");
    // The registry's own section-slot for hero is planned explicitly.
    expect(hero?.slots).toBeDefined();
    // The source node id stays the stable plan anchor.
    expect(hero?.source.nodeId).toBeTruthy();
    expect(plan.source.pageId).toBe(page.id);
    expect(plan.mappingVersion).toBe(REDESIGN_MAPPING_VERSION);
    expect(plan.registry.sections.some((entry) => entry.type === "hero")).toBe(true);
  }, 60000);

  it("is stable, hash-backed and survives a re-read unchanged", async () => {
    const first = await buildPlan();
    const second = await buildPlan();
    expect(second.planHash).toBe(first.planHash);
    expect(second).toEqual(first);
    const current = await env.api.request<PageResponse>({
      method: "GET",
      path: `/api/pages/${page.id}`,
    });
    expect(
      validateSectionPlan(
        env.registry,
        current.body.draft as unknown as NodeTree,
        first,
      ),
    ).toEqual([]);
  }, 60000);

  it("marks an unknown source type as manual and never guesses a cross-type target", async () => {
    const tree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "layout", props: {}, children: ["weird"] },
        weird: { id: "weird", type: "custom-widget", props: {} },
      },
    };
    const plan = deriveRedesignSectionPlan({
      page: {
        id: "p",
        siteId,
        path: "/",
        title: "t",
        meta: {},
        draft: tree as never,
        draftVersion: 1,
        template: null,
        layoutId: null,
        createdAt: "",
        updatedAt: "",
      },
      tree: tree as never,
      registry: env.registry,
      siteProfile: "clean" as never,
      designContract: null,
      siteId,
      assetsById: new Map(),
      profile: profileFor(),
      styleBrief: "ruhig",
    });
    const unknown = plan.entries.find((entry) => entry.source.type === "custom-widget");
    expect(unknown?.status).toBe("manual");
    expect(unknown?.target.type).toBeNull();
    expect(unknown?.warnings.join(" ")).toContain("custom-widget");
    expect(plan.summary.manual).toBeGreaterThan(0);
  }, 30000);

  it("falls back to the golden variant and materialises the whole preset", async () => {
    const tree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "layout", props: {}, children: ["div"] },
        div: { id: "div", type: "divider", variant: "gibt-es-nicht", props: {} },
      },
    };
    const plan = deriveRedesignSectionPlan({
      page: {
        id: "p",
        siteId,
        path: "/",
        title: "t",
        meta: {},
        draft: tree as never,
        draftVersion: 1,
        template: null,
        layoutId: null,
        createdAt: "",
        updatedAt: "",
      },
      tree: tree as never,
      registry: env.registry,
      siteProfile: "clean" as never,
      designContract: null,
      siteId,
      assetsById: new Map(),
      profile: profileFor(),
      styleBrief: "ruhig",
    });
    const entry = plan.entries.find((candidate) => candidate.source.type === "divider");
    expect(entry?.status).toBe("fallback");
    expect(entry?.target.variant).toBeTruthy();
    const preset = env.registry.get("divider").variants?.[entry?.target.variant ?? ""]?.preset ?? {};
    expect(entry?.target.variantPreset).toEqual(preset);
  }, 30000);

  it("reuses a ready source-site asset and marks a missing one for selection", async () => {
    const tree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "layout", props: {}, children: ["med"] },
        med: {
          id: "med",
          type: "media",
          props: { asset: { assetId: "gibt-es-nicht" }, caption: "Bild" },
        },
      },
    };
    const plan = deriveRedesignSectionPlan({
      page: {
        id: "p",
        siteId,
        path: "/",
        title: "t",
        meta: {},
        draft: tree as never,
        draftVersion: 1,
        template: null,
        layoutId: null,
        createdAt: "",
        updatedAt: "",
      },
      tree: tree as never,
      registry: env.registry,
      siteProfile: "clean" as never,
      designContract: null,
      siteId,
      assetsById: new Map(),
      profile: profileFor(),
      styleBrief: "ruhig",
    });
    const need = plan.media.find((entry) => entry.targetPath.includes("media"));
    expect(need?.treatment).toBe("select");
    expect(need?.role).toBe("source-asset");
    expect(need?.reason).toContain("existiert nicht");
    expect(plan.summary.select).toBeGreaterThan(0);
  }, 30000);

  it("marks logos and identity-risky reference media to be avoided, never to copy", async () => {
    const tree = {
      rootNodeId: "root",
      nodes: { root: { id: "root", type: "layout", props: {} } },
    };
    const plan = deriveRedesignSectionPlan({
      page: {
        id: "p",
        siteId,
        path: "/",
        title: "t",
        meta: {},
        draft: tree as never,
        draftVersion: 1,
        template: null,
        layoutId: null,
        createdAt: "",
        updatedAt: "",
      },
      tree: tree as never,
      registry: env.registry,
      siteProfile: "clean" as never,
      designContract: null,
      siteId,
      assetsById: new Map(),
      profile: profileFor(),
      styleBrief: "ruhig, offen",
    });
    const logo = plan.media.find((entry) => entry.reason.includes("logo"));
    expect(logo).toBeDefined();
    expect(logo?.treatment).toBe("avoid");
    expect(logo?.prompt).toBeNull();
    // The non-identity reference image is a style hint, not a target asset.
    const image = plan.media.find((entry) => entry.treatment === "generate");
    expect(image?.source.assetId).toBeNull();
    expect(image?.prompt).toContain("ruhig, offen");
    expect(plan.summary.avoid).toBeGreaterThan(0);
  }, 30000);

  it("refuses a plan whose source tree changed after derivation", async () => {
    const plan = await buildPlan();
    const current = await env.api.request<PageResponse>({
      method: "GET",
      path: `/api/pages/${page.id}`,
    });
    const moved = structuredClone(current.body.draft) as unknown as NodeTree;
    const firstEntry = plan.entries[0];
    if (firstEntry !== undefined) delete moved.nodes[firstEntry.source.nodeId];
    expect(() => validateSectionPlan(env.registry, moved, plan)).toThrowError();
  }, 60000);

  it("refuses a plan when a used section is no longer in the registry", () => {
    const tree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "layout", props: {}, children: ["h"] },
        h: { id: "h", type: "hero", props: { headline: "x" } },
      },
    };
    const plan = deriveRedesignSectionPlan({
      page: {
        id: "p",
        siteId: "s",
        path: "/",
        title: "t",
        meta: {},
        draft: tree as never,
        draftVersion: 1,
        template: null,
        layoutId: null,
        createdAt: "",
        updatedAt: "",
      },
      tree: tree as never,
      registry: env.registry,
      siteProfile: "clean" as never,
      designContract: null,
      siteId: "s",
      assetsById: new Map(),
      profile: profileFor(),
      styleBrief: "ruhig",
    });
    // A registry that lost the used type must fail the proof.
    const emptyRegistry = {
      list: () => [],
      get: () => {
        throw new Error("Unknown section type");
      },
    } as never;
    expect(() => validateSectionPlan(emptyRegistry, tree as never, plan)).toThrowError();
  }, 30000);

  it("hashes only the card content, so two proposals of one direction agree", async () => {
    const a = await env.api.request<{ proposal: { id: string } }>({
      method: "POST",
      path: `/api/pages/${page.id}/redesign-proposals`,
      body: { referenceIds: [referenceId], idempotencyKey: "plan-hash-a" },
    });
    const b = await env.api.request<{ proposal: { id: string } }>({
      method: "POST",
      path: `/api/pages/${page.id}/redesign-proposals`,
      body: { referenceIds: [referenceId], idempotencyKey: "plan-hash-b" },
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const first = (await getRedesignProposalView(
      { store: env.engine.store, registry: env.registry, dataDir: env.engine.dataDir },
      a.body.proposal.id,
    )).cards[0];
    const second = (await getRedesignProposalView(
      { store: env.engine.store, registry: env.registry, dataDir: env.engine.dataDir },
      b.body.proposal.id,
    )).cards[0];
    expect(first?.id).not.toBe(second?.id);
    expect(first?.offerHash).toBe(second?.offerHash);
    if (first === undefined) throw new Error("erste Card fehlt");
    // The round trip through JSONB is the real subject here: a mismatch means
    // the stored card no longer hashes to its own fingerprint.
    expect(directionCardContentHash(first)).toBe(first.offerHash);
    expect(verifyDirectionCardContentHash(first)).toBe(true);
    if (second === undefined) throw new Error("zweite Card fehlt");
    expect(verifyDirectionCardContentHash(second)).toBe(true);
  }, 120000);
});
