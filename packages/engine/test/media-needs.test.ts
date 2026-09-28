// Medienbedarfe bedienbar machen (Fahrplan P2-2, R2 Nachfolger).
//
// Der Befund, den diese Suite schließt: P2-1 hat den Sektions-Plan ausgeführt,
// aber die Medien, die der Plan verlangt, waren nur Textzeilen in
// `applyResult.warnings`. Ein Agent konnte lesen, dass ein Bild fehlt, und
// nichts dagegen tun. Für Seiten mit einem Bildbedarf blieb P2-1 damit in der
// Hälfte der Fälle stecken.
//
// Die Regel, die hier festgeschrieben wird: ein Bedarf ist ein **Arbeits-
// auftrag**, kein Vorwurf. Er nennt den Knoten, den Prop-Pfad, die Behandlung
// und - bei `generate` - den Prompt, mit dem der Mensch oder die Provider-Kette
// arbeitet. Und er lässt sich schließen, ohne dass irgendetwas geraten wird:
// `manual` heißt "der Mensch entscheidet", nicht "vergessen".
//
// Die Prüfungen, die zählen:
//   1. Die Bedarfe sind strukturiert und adressierbar, nicht Prosa.
//   2. Ein `select` schreibt den genannten Asset in den Slot - über den
//      kanonischen Mutationsweg, also mit Versionsprüfung und Audit-Eintrag.
//   3. Ein Asset einer FREMDEN Site wird abgelehnt, bevor irgendetwas
//      geschrieben wird. Das ist der eigentliche Sicherheitsgewinn: ohne diese
//      Prüfung würde ein Bedarf zum Weg über fremde Medien.
//   4. `manual` schließt den Bedarf, ohne einen Slot zu füllen, und der Zustand
//      bleibt sichtbar.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categorizePlanMediaNeeds, resolveMediaNeeds } from "../src/redesign-section-apply.ts";
import type {
  DirectionMediaNeed,
  DirectionSectionPlan,
  OpenMediaNeed,
} from "../src/redesign-proposal-contract.ts";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  type BootEnv,
  type ErrorResponse,
} from "./helpers.ts";

function need(over: Partial<DirectionMediaNeed> = {}): DirectionMediaNeed {
  return {
    id: "media_1",
    targetNodeId: "node-hero",
    targetPath: "hero.image",
    role: "source-asset",
    treatment: "select",
    source: { siteId: null, assetId: null, hash: null, reference: null },
    prompt: null,
    alt: null,
    decorative: false,
    reason: "Im Draft referenziertes Asset existiert nicht mehr.",
    ...over,
  };
}

// A proposal that reached `applied` and carries the given open media needs.
// The resolution path only works on a finished apply - a proposal still waiting
// for a human has no needs to close - so the test needs one without running a
// full redesign, and this is the smallest honest way to get it.
async function storeProposalWithNeeds(
  env: BootEnv,
  input: {
    siteId: string;
    pageId: string;
    openMediaNeeds: OpenMediaNeed[];
  },
): Promise<string> {
  const id = `proposal-medien-${Math.random().toString(36).slice(2, 10)}`;
  const page = await env.engine.store.getPage(input.pageId);
  await env.engine.store.createRedesignProposal({
    id,
    sourcePageId: input.pageId,
    cards: [],
    basis: {
      source: {
        siteId: input.siteId,
        pageId: input.pageId,
        title: page.title,
        path: page.path,
        draftVersion: page.draftVersion,
        themeVersion: 1,
      },
      references: [],
    },
  });
  // The apply result is written by the apply; here it is set directly, because
  // the thing under test is the RESOLUTION path. The apply that produces such a
  // result is covered by its own suite.
  await env.db.query(
    `UPDATE redesign_proposals
        SET status = 'applied', apply_result = $2
      WHERE id = $1`,
    [
      id,
      JSON.stringify({
        status: "applied",
        scope: "scaffold-theme",
        sectionPlanApplied: false,
        planHash: null,
        openMediaNeeds: input.openMediaNeeds,
        siteId: input.siteId,
        pageId: input.pageId,
        pagePath: page.path,
        pages: [],
        verificationOk: true,
        warnings: [],
        error: null,
      }),
    ],
  );
  return id;
}

function plan(media: DirectionMediaNeed[]): DirectionSectionPlan {
  return {
    schemaVersion: 1,
    mappingVersion: 1,
    planHash: "hash",
    source: { pageId: "p1", draftVersion: 1, treeHash: "t" },
    target: {
      mode: "preserve-registered-sections",
      scope: "page",
      contentPolicy: "preserve",
    },
    entries: [],
    children: [],
    slots: {},
    summary: { exact: 0, fallback: 0, manual: 0, reuse: 0, select: 0, generate: 0, avoid: 0 },
    media,
  } as unknown as DirectionSectionPlan;
}

describe("Medienbedarfe strukturiert (Fahrplan P2-2)", () => {
  it("macht aus jedem offenen Bedarf ein adressierbares Arbeitspaket", () => {
    const media = categorizePlanMediaNeeds(
      plan([
        need({ id: "media_1", targetPath: "hero.image", treatment: "select" }),
        need({ id: "media_2", targetPath: "hero.logo", role: "reference-asset", treatment: "avoid" }),
        need({
          id: "media_3",
          targetPath: "features.cover",
          role: "new-visual",
          treatment: "generate",
          prompt: "eine ruhige Textur, kein Text",
        }),
      ]),
    );

    // `avoid` is not a work item: the slot stays empty on purpose and the
    // warning already says why. A "need" the caller is expected to close would
    // be a lie about what is left to do.
    expect(media.open.map((entry) => entry.needId)).toEqual(["media_1", "media_3"]);

    const generated = media.open.find((entry) => entry.needId === "media_3");
    expect(generated?.treatment).toBe("generate");
    // The prompt travels WITH the need: a `generate` the caller cannot prompt
    // from is a to-do without the information needed to do it.
    expect(generated?.prompt).toBe("eine ruhige Textur, kein Text");
    // And the slot is addressable: node plus prop path, not a sentence.
    expect(generated?.targetNodeId).toBe("node-hero");
    expect(generated?.targetPath).toBe("features.cover");
    expect(generated?.resolvedWith).toBeNull();
  });

  it("folgt der Knoten-Umleitung des Rebuilds", () => {
    // The plan names the SOURCE node. When the executor builds a section from
    // scratch it mints a new id, and a need pointing at the old one would send
    // the caller to a node that no longer exists.
    const mapped = new Map([["node-hero", "plan-page-0"]]);
    const media = categorizePlanMediaNeeds(
      plan([need({ id: "media_1", targetNodeId: "node-hero" })]),
      mapped,
    );
    expect(media.open[0]?.targetNodeId).toBe("plan-page-0");
  });

  it("macht ein `reuse` ohne Quell-Asset zu einem echten Bedarf", () => {
    // `reuse` with no asset cannot be reused. Reporting it as covered would be
    // the worst outcome: the run would claim it reused something it never had.
    const media = categorizePlanMediaNeeds(
      plan([need({ id: "media_1", treatment: "reuse" })]),
    );
    expect(media.rewrites).toEqual([]);
    expect(media.open).toHaveLength(1);
    expect(media.open[0]?.treatment).toBe("select");
    expect(media.warnings.join(" ")).toMatch(/reuse ohne Quell-Asset/);
  });
});

describe("Medienbedarfe schließen (Fahrplan P2-2)", () => {
  const owned = new Set(["asset-a"]);
  const check = async (assetId: string): Promise<boolean> => owned.has(assetId);

  it("schließt einen Bedarf mit einem Asset der Zielsite", async () => {
    const open = categorizePlanMediaNeeds(
      plan([need({ id: "media_1", targetPath: "hero.image" })]),
    ).open;
    const result = await resolveMediaNeeds({
      open,
      resolutions: [{ needId: "media_1", resolution: { treatment: "select", assetId: "asset-a" } }],
      targetSiteId: "site-1",
      assetBelongsToSite: check,
    });
    expect(result.stillOpen).toEqual([]);
    expect(result.closed[0]?.resolvedWith).toEqual({ treatment: "select", assetId: "asset-a" });
    // The rewrite is what lands in the draft - without it the need would be
    // "closed" while the slot stayed empty.
    expect(result.rewrites).toEqual([{ targetPath: "hero.image", assetId: "asset-a" }]);
  });

  it("lehnt ein Asset einer fremden Site ab, ohne etwas zu schließen", async () => {
    const open = categorizePlanMediaNeeds(
      plan([need({ id: "media_1", targetPath: "hero.image" })]),
    ).open;
    await expect(
      resolveMediaNeeds({
        open,
        resolutions: [
          { needId: "media_1", resolution: { treatment: "select", assetId: "asset-fremd" } },
        ],
        targetSiteId: "site-1",
        assetBelongsToSite: check,
      }),
    ).rejects.toThrow(/gehört nicht zur Zielsite/);
  });

  it("meldet eine unbekannte Bedarf-Id als Fehler statt als Stillhalten", async () => {
    const open = categorizePlanMediaNeeds(
      plan([need({ id: "media_1" })]),
    ).open;
    // A typo would otherwise read as "that one is still open" and send the
    // caller hunting for a need that does not exist.
    await expect(
      resolveMediaNeeds({
        open,
        resolutions: [
          { needId: "media_9", resolution: { treatment: "select", assetId: "asset-a" } },
        ],
        targetSiteId: "site-1",
        assetBelongsToSite: check,
      }),
    ).rejects.toThrow(/gehört nicht zu diesem Plan/);
  });

  it("schließt `manual` ohne Slot und ohne Rewrite", async () => {
    const open = categorizePlanMediaNeeds(
      plan([need({ id: "media_1", targetPath: "hero.image" })]),
    ).open;
    const result = await resolveMediaNeeds({
      open,
      resolutions: [{ needId: "media_1", resolution: { treatment: "manual" } }],
      targetSiteId: "site-1",
      assetBelongsToSite: check,
    });
    expect(result.stillOpen).toEqual([]);
    // The human decided the slot stays empty. No rewrite - and the emptiness
    // stays visible through `resolvedWith`, so it is not read as a bug later.
    expect(result.rewrites).toEqual([]);
    expect(result.closed[0]?.resolvedWith).toEqual({ treatment: "manual", assetId: null });
  });

  it("lässt unbeantwortete Bedarfe offen", async () => {
    const open = categorizePlanMediaNeeds(
      plan([
        need({ id: "media_1", targetPath: "hero.image" }),
        need({ id: "media_2", targetPath: "hero.logo" }),
      ]),
    ).open;
    const result = await resolveMediaNeeds({
      open,
      resolutions: [{ needId: "media_1", resolution: { treatment: "select", assetId: "asset-a" } }],
      targetSiteId: "site-1",
      assetBelongsToSite: check,
    });
    expect(result.closed.map((entry) => entry.needId)).toEqual(["media_1"]);
    expect(result.stillOpen.map((entry) => entry.needId)).toEqual(["media_2"]);
  });
});

describe("Medienbedarf über die API schließen (Fahrplan P2-2)", () => {
  let env: BootEnv;

  beforeAll(async () => {
    env = await bootEngine();
  }, 30000);

  afterAll(async () => {
    await env.close();
  });

  it("schreibt den gewählten Asset über den kanonischen Weg in den Ziel-Draft", async () => {
    // The full loop, and the only one that proves the write lands: a need with a
    // real node id, closed with `select` and an asset that really belongs to the
    // target site, ends up in the draft - through `applyMutations` and
    // `persistBatch`, so it carries a version bump and an audit entry.
    const site = await createTestSite(env.api, "Medienbedarf");
    const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });

    // An asset of THIS site. The ownership check is only meaningful against a
    // real asset row, and the hash has to be the shape the store expects.
    const asset = await env.engine.store.createAsset({
      id: "asset-medienbedarf",
      siteId: site.id,
      filename: "bedarf.png",
      mime: "image/png",
      kind: "image",
      byteSize: 8,
      width: 1,
      height: 1,
      hash: "sha256:bedarf",
      altText: "Ein Bild für den Slot",
      decorative: false,
      folderId: null,
      tags: [],
      // The file itself is irrelevant here: the resolution writes the asset
      // REFERENCE, it never reads the bytes. The row is what the ownership
      // check looks at.
      storageRef: "assets/asset-medienbedarf/bedarf.png",
    });

    const before = await env.engine.store.getPage(page.id);
    // A fresh page carries only the root, and a mutation needs a real node to
    // land on. `media` is chosen deliberately: it has a single `asset` prop, so
    // the need addresses one unambiguous slot. A section without an asset prop
    // would be refused by the registry - and rightly so.
    const withSection = await applyMutationsRequest(env.api, before, [
      {
        op: "insertNode",
        parent: { nodeId: before.draft.rootNodeId },
        node: { id: "media-bedarf", type: "media", props: { caption: "Ein Bild fehlt noch" } },
      },
    ]);
    expect(withSection.status, JSON.stringify(withSection.body)).toBe(200);
    const seeded = await env.engine.store.getPage(page.id);
    expect(seeded.draft.nodes["media-bedarf"]).toBeDefined();
    const heroId = "media-bedarf";

    const proposal = await storeProposalWithNeeds(env, {
      siteId: site.id,
      pageId: page.id,
      openMediaNeeds: [
        {
          needId: "media_1",
          targetNodeId: heroId,
          targetPath: "asset",
          role: "source-asset" as const,
          treatment: "select" as const,
          reason: "Im Draft referenziertes Asset existiert nicht mehr.",
          prompt: null,
          alt: null,
          decorative: false,
          resolvedWith: null,
        },
      ],
    });

    const closed = await env.humanApi.request<{
      closed: { needId: string; resolvedWith: { assetId: string } | null }[];
      stillOpen: unknown[];
      draftVersion: number;
    }>({
      method: "POST",
      path: `/api/redesign-proposals/${proposal}/media-needs`,
      body: {
        resolutions: [{ needId: "media_1", treatment: "select", assetId: asset.id }],
        idempotencyKey: "media-select-1",
      },
    });
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    expect(closed.body.closed[0]?.resolvedWith?.assetId).toBe(asset.id);
    expect(closed.body.stillOpen).toEqual([]);
    // The write moved the draft, and the caller got the new version so it can
    // chain another edit without re-reading.
    expect(closed.body.draftVersion).toBeGreaterThan(seeded.draftVersion);

    // And the slot actually carries the asset now.
    const after = await env.engine.store.getPage(page.id);
    const node = after.draft.nodes[heroId] as { props: { asset?: { assetId?: string } } };
    expect(node.props.asset?.assetId).toBe(asset.id);

    // And the change is in the ledger, with the undo patch that
    // `applyMutations` computed. A media need closed outside the audit would be
    // a change nobody can take back.
    const audit = await env.api.request<{
      entries: { mutation: string; undoPatch: unknown }[];
    }>({ method: "GET", path: `/api/sites/${site.id}/audit?limit=20` });
    const entry = audit.body.entries.find((row) => row.mutation === "updateNodeProps");
    expect(entry).toBeDefined();
    expect(entry?.undoPatch).toBeTruthy();
  });

  it("lehnt einen unbekannten Vorschlag ab, ohne einen Draft zu bewegen", async () => {
    const site = await createTestSite(env.api, "Unbekannt");
    const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
    // The body carries no `author`: the route takes the author from the token,
    // exactly like every other write. A caller that supplies one is refused by
    // the schema before the handler runs.
    const missing = await env.humanApi.request<ErrorResponse>({
      method: "POST",
      path: `/api/redesign-proposals/gibt-es-nicht/media-needs`,
      body: {
        resolutions: [{ needId: "media_1", treatment: "manual" }],
        idempotencyKey: "media-unknown-1",
      },
    });
    expect(missing.status).toBe(404);

    // Nothing moved: a request that could not even name its target wrote
    // nothing. That is the assertion worth making - not the status code alone.
    const after = await env.engine.store.getPage(page.id);
    expect(after.draftVersion).toBe(page.draftVersion);
  });

  it("weist ein `manual` mit Asset ab, weil die Union genau eine Form kennt", async () => {
    // The schema is exhaustive on purpose: `manual` has no `assetId`, so a
    // client cannot send one and wonder which of the two won. The refusal is
    // visible at the boundary, before the engine sees it.
    const response = await env.humanApi.request<ErrorResponse>({
      method: "POST",
      path: `/api/redesign-proposals/gibt-es-nicht/media-needs`,
      body: {
        resolutions: [{ needId: "media_1", treatment: "manual", assetId: "asset-a" }],
        idempotencyKey: "media-union-1",
      },
    });
    expect(response.status).toBe(400);
  });
});
