import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { SenifyError } from "@senify/core";
import type { Author, Registry } from "@senify/section-sdk";
import { collectAssetIds } from "./media.ts";
import { hardGuardrailsForTree } from "./guardrails.ts";
import type { Asset } from "./types.ts";
import { selectCardSnapshot } from "./references-library.ts";
import { buildRedesignPackage } from "./redesign-package.ts";
import { newEntityId } from "./ids.ts";
import { resolveStoredFile } from "./storage.ts";
import { storedFileName } from "./storage.ts";
import type { Store } from "./store.ts";
import {
  canonicalHash,
  directionCardContentHash,
  verifyDirectionCardContentHash,
  type DirectionCard,
  type DirectionDecision,
  type RedesignProposal,
  type RedesignProposalApplyResult,
  type RedesignProposalBasis,
  type RedesignProposalFreshness,
  type RedesignProposalView,
} from "./redesign-proposal-contract.ts";
import {
  REDESIGN_MAPPING_VERSION,
  deriveRedesignSectionPlan,
  registryFingerprint,
  sectionFingerprint,
  validateSectionPlan,
} from "./redesign-section-plan.ts";
import { commitRedesignApply, compileRedesign } from "./apply-redesign.ts";

// Redesign proposals (ADR-0012). The offered direction is derived here from the
// same redesign package `plan_redesign` reads — never from agent input — and
// the human decision is stored before the first effect. Only the human confirm
// path reaches applyRedesign() with a stored card snapshot.

export type RedesignProposalContext = {
  store: Store;
  registry: Registry;
  dataDir: string;
};

function proposalDir(dataDir: string, proposalId: string): string {
  return join(dataDir, "redesign-proposals", proposalId);
}

export async function createRedesignProposal(
  context: RedesignProposalContext,
  input: { pageId: string; referenceIds: readonly string[]; author: Author },
): Promise<RedesignProposalView> {
  const pkg = await buildRedesignPackage(context.store, {
    pageId: input.pageId,
    referenceIds: input.referenceIds,
  });
  const proposalId = newEntityId();
  const cards: DirectionCard[] = [];
  const references: RedesignProposalBasis["references"] = [];

  // The section plan is derived once per proposal: it describes the source page,
  // not a specific reference. Each card carries the same plan, so the offer
  // differs only in theme, rules and reference.
  const page = await context.store.getPage(pkg.source.pageId);
  const site = await context.store.getSite(page.siteId);
  const guardrailBaseline = hardGuardrailsForTree(page.draft, site.profile).map(
    (violation) => violation.code,
  );
  const assetIds = collectAssetIds([{ draft: page.draft }]);
  const assetsById = new Map<string, Asset>();
  for (const assetId of assetIds) {
    try {
      assetsById.set(assetId, await context.store.getAsset(assetId));
    } catch {
      // A missing asset is a media need, not a reason to fail the offer.
    }
  }

  for (const target of pkg.targets) {
    const reference = await context.store.getReference(target.reference.id);
    const revision = await context.store.getLatestReferenceProfile(reference.id);
    if (revision === null) {
      throw new SenifyError("conflict", `Referenz "${reference.name}" hat kein Profil`, {
        field: "referenceIds",
        suggestion: "Ohne Profil lässt sich keine Direction Card anbieten.",
      });
    }
    const directionId = newEntityId();
    const screenshot = await freezeCardScreenshot(context, {
      proposalId,
      directionId,
      referenceId: reference.id,
      alt: `Vorbild ${reference.name}`,
    });
    // ADR-0013: the plan is proven against a copy of the source draft before it
    // is offered. No write happens here.
    const sectionPlan = deriveRedesignSectionPlan({
      page,
      tree: structuredClone(page.draft),
      registry: context.registry,
      siteProfile: site.profile,
      designContract: site.designContract ?? null,
      siteId: page.siteId,
      assetsById,
      profile: revision.profile,
      styleBrief: target.styleBrief,
    });
    validateSectionPlan(context.registry, page.draft, sectionPlan, {
      siteProfile: site.profile,
      newGuardrailCodes: guardrailBaseline,
    });
    const card: Omit<DirectionCard, "offerHash"> = {
      id: directionId,
      referenceId: reference.id,
      reference: {
        name: target.reference.name,
        sourceUrl: target.reference.sourceUrl,
        collection: target.reference.collection,
        family: target.reference.family,
        vocabulary: target.reference.vocabulary,
      },
      screenshot,
      theme: {
        patch: target.themePatch as unknown as Record<string, unknown>,
        specimen: {
          brand: target.themePreview.scales.brand,
          neutralBase: target.themePreview.scales.neutralBase ?? null,
          displayFont: target.themePreview.displayFont,
          bodyFont: target.themePreview.bodyFont,
          typeBase: target.themePreview.scales.typeBase ?? null,
          radiusBase: target.themePreview.scales.radiusBase ?? null,
        },
      },
      rationale: target.rationale,
      rules: target.rules,
      warnings: target.warnings,
      sectionPlan,
    };
    cards.push({ ...card, offerHash: directionCardContentHash(card) });
    references.push({
      referenceId: reference.id,
      profileRevision: revision.revision,
      profileHash: canonicalHash(revision.profile),
    });
  }

  const planTypes = [
    ...new Set(
      (cards[0]?.sectionPlan.entries ?? []).map(
        (entry) => entry.target.type ?? entry.source.type,
      ),
    ),
  ];
  const pin = registryFingerprint(context.registry, planTypes);
  const basis: RedesignProposalBasis = {
    source: {
      siteId: pkg.source.siteId,
      pageId: pkg.source.pageId,
      title: pkg.source.title,
      path: pkg.source.path,
      draftVersion: pkg.source.draftVersion,
      themeVersion: pkg.source.themeVersion,
      treeHash: cards[0]?.sectionPlan.source.treeHash,
      siteProfile: site.profile,
      designContractHash: site.designContract
        ? canonicalHash(site.designContract)
        : null,
    },
    references,
    registry: pin,
    mappingVersion: REDESIGN_MAPPING_VERSION,
  };
  const proposal = await context.store.createRedesignProposal({
    id: proposalId,
    sourcePageId: pkg.source.pageId,
    cards,
    basis,
  });
  await context.store.recordSiteEvent({
    siteId: pkg.source.siteId,
    mutation: "create_redesign_proposal",
    params: {
      proposalId: proposal.id,
      pageId: pkg.source.pageId,
      referenceIds: cards.map((card) => card.referenceId),
      directions: cards.length,
    },
    author: input.author,
  });
  return { ...proposal, freshness: await proposalFreshness(context, proposal) };
}

// Copies the reference's card slot into the proposal's own folder and returns
// the file name, hash and alt text the card carries.
async function freezeCardScreenshot(
  context: RedesignProposalContext,
  input: { proposalId: string; directionId: string; referenceId: string; alt: string },
): Promise<{ fileName: string; hash: string; alt: string }> {
  const reference = await context.store.getReference(input.referenceId);
  const snapshot = selectCardSnapshot(reference.snapshots);
  if (snapshot === null) {
    throw new SenifyError(
      "conflict",
      `Referenz "${reference.name}" hat kein gespeichertes Bild`,
      {
        field: "referenceIds",
        suggestion:
          "Ohne gespeichertes Bild ist die Richtung nicht zuverlässig sichtbar; erst analyze_reference oder ein Import mit Bild ausführen.",
      },
    );
  }
  const source = resolveStoredFile(context.dataDir, snapshot.storageRef);
  if (source === undefined || !existsSync(source) || !statSync(source).isFile()) {
    throw new SenifyError("conflict", `Referenz "${reference.name}" hat kein gespeichertes Bild`, {
      field: "referenceIds",
      suggestion: "Die Aufnahme neu ausführen, damit das Bild wieder auf der Platte liegt.",
    });
  }
  const extension = extname(source).toLowerCase().replace(/^\./, "") || "png";
  const fileName = `${input.directionId}.${extension}`;
  const dir = proposalDir(context.dataDir, input.proposalId);
  mkdirSync(dir, { recursive: true });
  copyFileSync(source, join(dir, fileName));
  return {
    fileName,
    hash: snapshot.hash,
    alt: input.alt,
  };
}

// Where the card image lives. Resolved only through the proposal's own folder
// and the file name the card carries, so a foreign id or a traversal never
// resolves.
export function proposalCardScreenshot(
  dataDir: string,
  proposal: RedesignProposal,
  directionId: string,
): { path: string; card: DirectionCard } | null {
  const card = proposal.cards.find((entry) => entry.id === directionId);
  if (card === undefined) return null;
  const fileName = card.screenshot.fileName;
  if (fileName === "" || fileName !== storedFileName(fileName)) return null;
  const file = resolveStoredFile(
    dataDir,
    ["redesign-proposals", proposal.id, fileName].join("/"),
  );
  if (file === undefined || !existsSync(file) || !statSync(file).isFile()) return null;
  return { path: file, card };
}

// Staleness is computed, never stored: the source draft, the site theme and the
// reference profiles may all have moved on since the cards were derived. Since
// ADR-0013 the section plan adds the source tree, the site profile, the design
// contract, the mapping version and the registry sections it actually uses.
export async function proposalFreshness(
  context: RedesignProposalContext,
  proposal: RedesignProposal,
): Promise<RedesignProposalFreshness> {
  const reasons: string[] = [];
  const basis = await proposalBasis(context, proposal);
  if (basis === null) {
    return { current: false, reasons: ["Die Quellseite existiert nicht mehr."] };
  }
  if (basis.source.draftVersion !== proposal.source.draftVersion) {
    reasons.push("Die Quellseite wurde seit dem Plan geändert.");
  }
  if (basis.source.themeVersion !== proposal.source.themeVersion) {
    reasons.push("Das Theme der Quellseite wurde seit dem Plan geändert.");
  }
  if (
    proposal.source.treeHash !== undefined &&
    basis.source.treeHash !== proposal.source.treeHash
  ) {
    reasons.push("Der Inhalt der Quellseite wurde seit dem Plan geändert.");
  }
  if (
    proposal.source.siteProfile !== undefined &&
    basis.source.siteProfile !== proposal.source.siteProfile
  ) {
    reasons.push("Das Site-Profil wurde seit dem Plan geändert.");
  }
  if (
    proposal.source.designContractHash !== undefined &&
    basis.source.designContractHash !== proposal.source.designContractHash
  ) {
    reasons.push("Die Design-DNA der Site wurde seit dem Plan geändert.");
  }
  if (
    basis.mappingVersion !== undefined &&
    proposal.cards.some((card) => card.sectionPlan?.mappingVersion !== basis.mappingVersion)
  ) {
    reasons.push("Die Zuordnung des Sektions-Plans hat sich geändert.");
  }
  if (basis.registry !== undefined) {
    for (const pinned of basis.registry.sections) {
      const current = sectionFingerprint(context.registry, pinned.type);
      if (current === null) {
        reasons.push(`Section "${pinned.type}" ist nicht mehr im Bausteinkatalog.`);
        continue;
      }
      // Only a used section matters: a change elsewhere leaves this offer valid.
      if (current.hash !== pinned.hash || current.version !== pinned.version) {
        reasons.push(`Section "${pinned.type}" wurde seit dem Plan geändert.`);
      }
    }
  }
  for (const pinned of await basisReferences(context, proposal)) {
    const current = basis.references.find(
      (entry) => entry.referenceId === pinned.referenceId,
    );
    if (current === undefined) {
      reasons.push(`Referenz "${pinned.referenceId}" ist nicht mehr Teil des Plans.`);
      continue;
    }
    if (current.profileRevision !== pinned.profileRevision) {
      reasons.push(`Das Profil von Referenz "${pinned.referenceId}" wurde überarbeitet.`);
    }
    if (current.profileHash !== pinned.profileHash) {
      reasons.push(`Der Profilinhalt von Referenz "${pinned.referenceId}" hat sich geändert.`);
    }
  }
  return { current: reasons.length === 0, reasons };
}

async function proposalBasis(
  context: RedesignProposalContext,
  proposal: RedesignProposal,
): Promise<RedesignProposalBasis | null> {
  try {
    const page = await context.store.getPage(proposal.source.pageId);
    const theme = await context.store.getTheme(page.siteId);
    const site = await context.store.getSite(page.siteId);
    return {
      source: {
        siteId: page.siteId,
        pageId: page.id,
        title: page.title,
        path: page.path,
        draftVersion: page.draftVersion,
        themeVersion: theme.version,
        treeHash: canonicalHash(page.draft),
        siteProfile: site.profile,
        designContractHash: site.designContract
          ? canonicalHash(site.designContract)
          : null,
      },
      references: await basisReferences(context, proposal),
      ...(proposalStoredRegistry(proposal) === null
        ? {}
        : { registry: proposalStoredRegistry(proposal) ?? undefined }),
      ...(storedMappingVersion(proposal) === null
        ? {}
        : { mappingVersion: storedMappingVersion(proposal) ?? undefined }),
    };
  } catch {
    return null;
  }
}

// The pinned registry is part of the stored basis; the mapper reads it from the
// row so a change is compared against what was actually offered.
function proposalStoredRegistry(
  proposal: RedesignProposal,
): RedesignProposalBasis["registry"] | null {
  const pinned = proposal.cards[0]?.sectionPlan?.registry;
  if (pinned === undefined) return null;
  return { fingerprint: pinned.fingerprint, sections: pinned.sections };
}

function storedMappingVersion(proposal: RedesignProposal): number | null {
  return proposal.cards[0]?.sectionPlan?.mappingVersion ?? null;
}

async function basisReferences(
  context: RedesignProposalContext,
  proposal: RedesignProposal,
): Promise<RedesignProposalBasis["references"]> {
  const pinned: RedesignProposalBasis["references"] = [];
  for (const card of proposal.cards) {
    const revision = await context.store.getLatestReferenceProfile(card.referenceId);
    pinned.push({
      referenceId: card.referenceId,
      profileRevision: revision?.revision ?? 0,
      profileHash: revision === null ? "" : canonicalHash(revision.profile),
    });
  }
  return pinned;
}

export async function listRedesignProposals(
  context: RedesignProposalContext,
  input: { pageId: string; status?: RedesignProposal["status"] },
): Promise<RedesignProposalView[]> {
  const proposals = await context.store.listRedesignProposals(
    input.pageId,
    input.status === undefined ? {} : { status: input.status },
  );
  const views: RedesignProposalView[] = [];
  for (const proposal of proposals) {
    views.push({ ...proposal, freshness: await proposalFreshness(context, proposal) });
  }
  return views;
}

export async function getRedesignProposalView(
  context: RedesignProposalContext,
  proposalId: string,
): Promise<RedesignProposalView> {
  const proposal = await context.store.getRedesignProposal(proposalId);
  return { ...proposal, freshness: await proposalFreshness(context, proposal) };
}

// The human command: one direction becomes a draft. The decision is stored
// before the first effect, the basis is checked immediately before the claim,
// and a finished proposal is never executed a second time.
export async function confirmRedesignProposal(
  context: RedesignProposalContext,
  input: {
    proposalId: string;
    directionId: string;
    author: { kind: "human"; id: string; label: string };
    idempotencyKey: string;
  },
): Promise<{ state: "confirmed" | "replayed"; proposal: RedesignProposalView }> {
  const proposal = await context.store.getRedesignProposal(input.proposalId);
  const card = proposal.cards.find((entry) => entry.id === input.directionId);
  if (card === undefined) {
    throw new SenifyError(
      "validation",
      `Direction "${input.directionId}" gehört nicht zu diesem Proposal`,
      {
        field: "directionId",
        suggestion: "Die Richtung aus den angebotenen Cards des Proposals wählen.",
      },
    );
  }
  if (proposal.status === "applied" || proposal.status === "failed") {
    // A decided proposal returns its stored result; a second click must never
    // duplicate the draft.
    return {
      state: "replayed",
      proposal: await getRedesignProposalView(context, proposal.id),
    };
  }
  if (proposal.status === "applying") {
    throw new SenifyError(
      "conflict",
      "Die Richtung wird gerade angewendet oder der Lauf endete unvollständig",
      {
        field: "proposalId",
        suggestion:
          "Status mit get_redesign_proposal prüfen und im Zweifel neu planen; automatisch wird nichts wiederholt.",
      },
    );
  }

  const freshness = await proposalFreshness(context, proposal);
  if (!freshness.current) {
    throw new SenifyError("conflict", "Der Redesign-Plan ist veraltet", {
      field: "proposalId",
      suggestion: `${freshness.reasons.join(" ")} Neu planen und die Richtung erneut bestätigen.`,
    });
  }

  // ADR-0013: the offered card is re-hashed before it may be confirmed. A row
  // that was changed after it was written may not decide a design.
  if (!verifyDirectionCardContentHash(card)) {
    throw new SenifyError("conflict", "Die Direction Card wurde nachträglich verändert", {
      field: "proposalId",
      suggestion:
        "Der gespeicherte Inhalt der Karte passt nicht mehr zu ihrem Fingerabdruck. Neu planen.",
    });
  }

  const decision: DirectionDecision = {
    directionId: card.id,
    referenceId: card.referenceId,
    offerHash: card.offerHash,
    author: input.author,
    at: new Date().toISOString(),
  };
  // ADR-0014: the claim and its effects share one transaction, so there is no
  // durable `applying` state any more. A crash rolls the decision back with the
  // effects and the proposal stays confirmable.
  await runConfirmedApply(context, {
    proposal,
    card,
    decision,
  });
  return {
    state: "confirmed",
    proposal: await getRedesignProposalView(context, proposal.id),
  };
}

// The confirmed direction is prepared and then written in one transaction
// (ADR-0014), so the human gets exactly what the cards showed — not a
// re-derivation from a profile that changed in the meantime — and a failure
// leaves neither a half-written site nor a proposal stuck in `applying`.
async function runConfirmedApply(
  context: RedesignProposalContext,
  input: { proposal: RedesignProposal; card: DirectionCard; decision: DirectionDecision },
): Promise<RedesignProposalApplyResult> {
  const empty: RedesignProposalApplyResult = {
    status: "failed",
    scope: "scaffold-theme",
    sectionPlanApplied: false,
    planHash: null,
    siteId: null,
    pageId: null,
    pagePath: null,
    pages: [],
    verificationOk: false,
    warnings: [],
    error: null,
  };
  const applyInput = {
    store: context.store,
    registry: context.registry,
    siteId: input.proposal.source.siteId,
    // The stored card is the decision: its reference and its derived patch,
    // not a fresh look at the reference profile.
    snapshot: {
      referenceId: input.card.referenceId,
      name: input.card.reference.name,
      themePatch: input.card.theme.patch,
      proposalId: input.proposal.id,
      directionId: input.card.id,
      sourceSiteId: input.proposal.source.siteId,
      sourcePageId: input.proposal.source.pageId,
      sourceDraftVersion: input.proposal.source.draftVersion,
      sourceThemeVersion: input.proposal.source.themeVersion,
    },
    author: input.decision.author,
  };
  try {
    const plan = await compileRedesign(applyInput);
    const sourceSite = await context.store.getSite(input.proposal.source.siteId);
    const sourceTheme = await context.store.getTheme(input.proposal.source.siteId);
    const handoff = pickHandoffPage(plan.pages, input.proposal.source.path);
    const applyResult: RedesignProposalApplyResult = {
      status: "applied",
      // ADR-0013: this run wrote the draft scaffold and the confirmed theme.
      // The section plan is confirmed but not executed here.
      scope: "scaffold-theme",
      sectionPlanApplied: false,
      planHash: input.card.sectionPlan.planHash,
      siteId: plan.targetSite.id,
      pageId: handoff?.pageId ?? null,
      pagePath: handoff?.path ?? null,
      pages: plan.pages.map((page) => ({
        pageId: page.pageId,
        path: page.path,
        seeded: page.seeded,
      })),
      verificationOk: plan.record.verificationOk,
      warnings: plan.warnings,
      error: null,
    };
    await commitRedesignApply(context.store, plan, {
      author: input.decision.author,
      sourceSite,
      themeDefinition: sourceTheme.theme,
      proposalClaim: {
        proposalId: input.proposal.id,
        directionId: input.card.id,
        decision: input.decision,
      },
      proposalFinalize: { proposalId: input.proposal.id, applyResult },
    });
    return applyResult;
  } catch (error) {
    // A failed run still records why, in its own small transaction. No effect
    // was written: the plan's transaction rolled back completely.
    const category =
      error instanceof SenifyError ? error.category : "unknown";
    const message = error instanceof Error ? error.message : String(error);
    const failed: RedesignProposalApplyResult = { ...empty, error: { category, message } };
    await context.store.finalizeRedesignProposal({
      proposalId: input.proposal.id,
      status: "failed",
      applyResult: failed,
    }).catch(() => undefined);
    return failed;
  }
}

// The page the operator continues in: the same path as the source when the copy
// still has it, otherwise the first routable page.
function pickHandoffPage(
  pages: { pageId: string; path: string; seeded: boolean }[],
  sourcePath: string,
): { pageId: string; path: string } | null {
  const routable = pages.filter((page) => page.path.trim() !== "");
  const same = routable.find((page) => page.path === sourcePath);
  if (same !== undefined) return same;
  return routable.find((page) => page.seeded) ?? routable[0] ?? null;
}
