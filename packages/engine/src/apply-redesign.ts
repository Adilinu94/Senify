import { SenifyError } from "@senify/core";
import type { NodeTree, Registry } from "@senify/section-sdk";
import { applyMutations } from "./mutations/apply.ts";
import type { Mutation } from "./mutations/contract.ts";
import { newEntityId } from "./ids.ts";
import { slugify, type NewAuditEntry } from "./store.ts";
import type { DirectionSectionPlan, OpenMediaNeed } from "./redesign-proposal-contract.ts";
import { categorizePlanMediaNeeds, rebuildPageTree } from "./redesign-section-apply.ts";
import {
  deriveThemeDraft,
  verifyThemeRoundTrip,
  type ThemeDraftVerification,
} from "./references-theme.ts";
import type { Store } from "./store.ts";
import type { Reference, ReferenceScale, Site } from "./types.ts";

// apply_redesign (E25 slice 2): the mechanical half of the redesign journey.
// The package (plan_redesign) proposes, this module executes the deterministic
// steps — duplicate or reuse the target site, write the derived theme patch,
// seed the section skeleton from the registry golden trees — through the
// canonical mutation API. Never touches the active release: a duplicate is a
// new site, a rebuild runs against the draft. Fine-tuning stays with the
// agent (apply_mutations) and the human (editor); this is the shared
// scaffolding both start from.

const REDESIGN_SCALES: readonly ReferenceScale[] = ["color", "type", "motion", "rest"];
const MAX_REFERENCES = 3;

export type RedesignTargetSummary = {
  referenceId: string;
  name: string;
  screenshotPath: string;
};

export type RedesignRecord = {
  // The reference the design came from; the chosen direction is the ordered
  // reference list itself (first reference = leading direction).
  referenceIds: string[];
  references: RedesignTargetSummary[];
  // The theme fields the patch actually changed (from the round-trip check).
  themeChanges: ThemeDraftVerification["changes"];
  verificationOk: boolean;
  // What the run did, in order.
  steps: string[];
};

export type RedesignPageResult = {
  pageId: string;
  path: string;
  title: string;
  draftVersion: number;
  seeded: boolean;
  // Sections written by the run (insertNode ops), with their new ids.
  sections: { type: string; variant: string | null; nodeId: string }[];
  warnings: string[];
};

// The prop keys the plan named as an open media need on a SOURCE asset.
//
// Only `role: "source-asset"` counts. A reference asset never reaches a node
// prop in the first place - the plan marks it `avoid` or `generate` and the
// rebuild writes nothing for it - so including those would drop a prop that
// holds something else entirely.
//
// The path is `type.key` (`media.asset`), and the key after the first dot is
// what the rebuild looks for on the node's own props. A deeper path
// (`hero.items[0].cover`) is reduced to its FIRST step for the same reason the
// rebuild works per node: a nested slot is reached through its parent, and the
// parent is the node that carries the list.
function sourceAssetPropKeys(plan: DirectionSectionPlan): Set<string> {
  const keys = new Set<string>();
  for (const need of plan.media) {
    if (need.role !== "source-asset") continue;
    // `avoid` and `reuse` are settled: the first never entered a prop, the
    // second travels with the copied tree. Only an OPEN need means the slot
    // has to be emptied.
    if (need.treatment === "avoid" || need.treatment === "reuse") continue;
    const dot = need.targetPath.indexOf(".");
    if (dot < 0) continue;
    keys.add(need.targetPath.slice(dot + 1).split(/[.[]/)[0]!);
  }
  return keys;
}

export type ApplyRedesignResult = {
  // The site the design landed on (the duplicate when no pageId was given).
  siteId: string;
  siteName: string;
  duplicated: boolean;
  themeVersion: number;
  pages: RedesignPageResult[];
  // Whether the run actually wrote the plan its card was carrying. `false` is
  // the old ADR-0013 state ("scaffold + theme, sections are human work"); a
  // rebuild only earns `true` when every plan entry it tried either found its
  // registered target or was deliberately left as `manual` (Fahrplan P2-1,
  // R3 - the field is a honesty statement, not a progress indicator).
  sectionPlanApplied: boolean;
  // The open media needs, as actionable work items (P2-2).
  openMediaNeeds: OpenMediaNeed[];
  record: RedesignRecord;
  warnings: string[];
};

// The prepared write sequence of a redesign (ADR-0014). `compileRedesign` only
// reads and computes: every branch is decided and every id is minted here, so
// the commit is a loop over prepared statements with no `if` and no data
// dependent `continue`. That is what makes one transaction possible.
export type RedesignCommitPlan = {
  // The duplicate: its own id, so a retry can never produce a second copy.
  targetSite: {
    id: string;
    name: string;
    slug: string;
    profile: string;
    withContent: boolean;
  };
  // The duplicate's own theme row, created from the source definition and
  // then patched by `themeWrite`.
  themeId: string;
  // The start page of a contentless copy, with its path already resolved.
  startPage: { id: string; title: string; path: string } | null;
  // The page rows the duplicate creates; the seed writes target their copies.
  copiedPages: {
    sourcePageId: string;
    targetPageId: string;
    path: string;
    title: string;
    meta: unknown;
    draft: NodeTree;
    draftVersion: number;
  }[];
  // The theme write, with the version it expects to replace.
  themeWrite: { themeId: string; expectedVersion: number; patch: Record<string, unknown> } | null;
  themeVersion: number;
  // Per page: the new draft and the version it expects to replace.
  pageWrites: {
    pageId: string;
    expectedVersion: number;
    draft: NodeTree;
    title: string;
    path: string;
  }[];
  pages: RedesignPageResult[];
  // Whether the run actually wrote the plan its card was carrying. `false` is
  // the old ADR-0013 state ("scaffold + theme, sections are human work"); a
  // rebuild only earns `true` when every plan entry it tried either found its
  // registered target or was deliberately left as `manual` (Fahrplan P2-1,
  // R3 - the field is a honesty statement, not a progress indicator).
  sectionPlanApplied: boolean;
  // The open media needs, as actionable work items (P2-2). A caller closes them
  // with `resolveMediaNeeds`, which checks the asset ownership before anything
  // is written.
  openMediaNeeds: OpenMediaNeed[];
  // The design record and the seed batches, ready for the audit table.
  auditEntries: NewAuditEntry[];
  record: RedesignRecord;
  warnings: string[];
  steps: string[];
  duplicated: boolean;
};

type ResolvedReference = {
  id: string;
  name: string;
  profile: NonNullable<Reference["profile"]>;
  screenshotPath: string;
};

async function resolveReferences(
  store: Store,
  referenceIds: readonly string[],
): Promise<ResolvedReference[]> {
  const ids = [
    ...new Set(
      referenceIds.map((id) => id.trim()).filter((id) => id !== ""),
    ),
  ];
  if (ids.length === 0) {
    throw new SenifyError("validation", "Es wurde keine Referenz angegeben", {
      field: "referenceIds",
      suggestion: "Eine bis drei Referenz-ids angeben (plan_redesign liefert sie).",
    });
  }
  if (ids.length > MAX_REFERENCES) {
    throw new SenifyError(
      "validation",
      `Höchstens ${MAX_REFERENCES} Referenzen auf einmal`,
      { field: "referenceIds" },
    );
  }
  const resolved: ResolvedReference[] = [];
  for (const referenceId of ids) {
    const reference = await store.getReference(referenceId);
    if (reference.profile === null) {
      throw new SenifyError(
        "conflict",
        `Referenz "${reference.name}" hat kein Profil`,
        {
          field: "referenceIds",
          suggestion:
            "analyze_reference oder ein Design.md-Import erzeugt das Profil (plan_redesign prüft das vorab).",
        },
      );
    }
    resolved.push({
      id: reference.id,
      name: reference.name,
      profile: reference.profile,
      screenshotPath:
        reference.cardSnapshot?.previewPath ?? reference.sourceUrl,
    });
  }
  return resolved;
}

// The first reference leads: its draft patch is written, the others appear
// in the record and the warnings (a blend is never automatic). `deriveThemeDraft`
// already merges multiple assignments deterministically; the leading one wins
// only on scale conflicts.

export type RedesignApplySnapshot = {
  // The confirmed direction (ADR-0012): one reference and the theme patch the
  // human actually saw. Nothing is re-derived from the profile here, so a
  // profile edited after the decision cannot silently change the draft.
  referenceId: string;
  name: string;
  themePatch: Record<string, unknown>;
  proposalId: string;
  directionId: string;
  sourceSiteId: string;
  sourcePageId: string;
  sourceDraftVersion: number;
  sourceThemeVersion: number;
};

export type ApplyRedesignInput = {
  store: Store;
  registry: Registry;
  siteId: string;
  // Explicit reference ids (1-3) — or a collectionId whose ready references
  // form the set (R13: "ganze Richtung anwenden"). Both together is an error.
  referenceIds?: readonly string[];
  collectionId?: string;
  // Rebuild this page's draft instead of duplicating the site.
  pageId?: string;
  // Copy content (pages, collections, entries) into the duplicate. Default true.
  withContent?: boolean;
  // The confirmed direction of a redesign proposal: the run then writes the
  // stored patch instead of deriving one (ADR-0012).
  snapshot?: RedesignApplySnapshot;
  // The section plan the card carries (ADR-0013). When present, the duplicate
  // is seeded not with the generic hero/content/cta skeleton but with a
  // rebuild of the source page's sections — target type, target variant and
  // the source's preserved content keys. Sections without a ready target stay
  // behind as `manual` and land in the warnings. Applying the plan here is
  // what flips `sectionPlanApplied` to `true` (Fahrplan P2-1, R3).
  sectionPlan?: DirectionSectionPlan;
  author: { kind: "human" | "agent"; id: string; label: string };
};

export async function applyRedesign(
  input: ApplyRedesignInput,
): Promise<ApplyRedesignResult> {
  // Set semantics (R13): a collectionId resolves to the ready references of
  // the collection (oldest first, capped at MAX_REFERENCES — the set leads
  // with its oldest entry). Explicit ids win nothing over a collection: the
  // two are mutually exclusive. A confirmed proposal direction (ADR-0012) skips
  // both: its reference and patch are already the human decision.
  let referenceIds: readonly string[];
  if (input.snapshot !== undefined) {
    referenceIds = [input.snapshot.referenceId];
  } else if (input.collectionId !== undefined && input.collectionId !== "") {
    if (
      input.referenceIds !== undefined &&
      input.referenceIds.some((id) => id.trim() !== "")
    ) {
      throw new SenifyError(
        "validation",
        "referenceIds und collectionId schließen sich aus",
        { field: "collectionId", suggestion: "Entweder ids angeben oder eine Sammlung." },
      );
    }
    const collection = await input.store.getReferenceCollection(input.collectionId);
    const ids = await input.store.listReferenceIdsByCollection(collection.id);
    if (ids.length === 0) {
      throw new SenifyError(
        "conflict",
        `Sammlung "${collection.name}" enthält keine fertigen Referenzen`,
        {
          field: "collectionId",
          suggestion: "Eine Sammlung mit analysierten Referenzen wählen.",
        },
      );
    }
    referenceIds = ids.slice(0, MAX_REFERENCES);
  } else {
    referenceIds = input.referenceIds ?? [];
  }
  const references = await resolveReferences(input.store, referenceIds);
  const warnings: string[] = [];
  const steps: string[] = [];

  // 1. Target: duplicate the site (draft work never happens on the original)
  //    or rebuild one page's draft in place.
  let target: Site;
  let duplicated = false;
  if (input.pageId === undefined) {
    target = await input.store.duplicateSite(input.siteId, {
      withContent: input.withContent ?? true,
      author: input.author,
    });
    duplicated = true;
    steps.push(`duplicate_site → ${target.id}`);
    if (input.withContent === false) {
      // A contentless copy has no pages; create the start page for the skeleton.
      const page = await input.store.createPage(target.id, { title: "Start" });
      steps.push(`create_page → ${page.id}`);
    }
  } else {
    const page = await input.store.getPage(input.pageId);
    target = await input.store.getSite(page.siteId);
    if (page.siteId !== input.siteId) {
      throw new SenifyError("validation", "The page does not belong to this site", {
        field: "pageId",
        suggestion: "Pass the pageId of a page on this site.",
      });
    }
    steps.push(`rebuild page ${page.id} in place (draft only)`);
  }

  // 2. Theme delta as a draft write (the release snapshot restores on rollback).
  const currentThemeRow = await input.store.getTheme(target.id);
  const currentTheme = currentThemeRow.theme;
  const draft = deriveThemeDraft({
    assignments: references.map((reference) => ({
      referenceId: reference.id,
      name: reference.name,
      profile: reference.profile,
      scales: REDESIGN_SCALES,
    })),
  });
  const verification = verifyThemeRoundTrip(draft, currentTheme);
  if (!verification.ok) {
    warnings.push(
      `Theme-Entwurf besteht die Gegenprobe nicht: ${verification.issues.join("; ")}`,
    );
  }
  // A confirmed direction (ADR-0012) writes the patch the human approved. It is
  // still round-tripped against the current theme, so an unusable patch becomes
  // a warning instead of a silent drift.
  const confirmedPatch = input.snapshot?.themePatch;
  const patch: Record<string, unknown> =
    confirmedPatch === undefined
      ? {
          ...(Object.keys(draft.scales).length > 0 ? { scales: draft.scales } : {}),
          ...(Object.keys(draft.fonts).length > 0 ? { fonts: draft.fonts } : {}),
          ...(Object.keys(draft.motion).length > 0 ? { motion: draft.motion } : {}),
        }
      : confirmedPatch;
  let themeVersion = currentThemeRow.version;
  if (Object.keys(patch).length > 0) {
    const updated = await input.store.updateTheme(target.id, patch, input.author);
    themeVersion = updated.version;
    steps.push(
      confirmedPatch === undefined
        ? "update_theme (abgeleiteter Patch)"
        : "update_theme (bestätigter Direction-Card-Patch)",
    );
  } else {
    warnings.push(
      "Die Referenzen liefern keine Skalenwerte; das Theme blieb unverändert.",
    );
  }

  // 3. Section skeleton: seed every page of the target with the golden
  //    sections of the source outline (same types, same variants, content
  //    text carried over). Pages of the duplicate already carry the source
  //    content — the skeleton only fills pages that are still empty.
  //
  //    The confirmed section plan is NOT executed here. This is the direct,
  //    pre-ADR-0014 path that writes page by page; the plan runs in
  //    `compileRedesign`, which prepares the writes for the one transaction
  //    (P2-1, R3). Keeping the two apart is what stops a second, non-atomic
  //    write path from existing beside the atomic one.
  const pages: RedesignPageResult[] = [];
  const drafts = await input.store.listPageDrafts(target.id);
  for (const page of drafts) {
    if (page.template !== null) continue;
    const rootNode = page.draft.nodes[page.draft.rootNodeId];
    const existing = rootNode?.children ?? [];
    if (existing.length > 0) {
      pages.push({
        pageId: page.id,
        path: page.path,
        title: page.title,
        draftVersion: page.draftVersion,
        seeded: false,
        sections: [],
        warnings: [],
      });
      continue;
    }
    // An empty page gets the standard skeleton: hero → content → cta, in the
    // leading reference's spirit. The golden trees come from the registry.
    const sections: RedesignPageResult["sections"] = [];
    const mutations: Mutation[] = [];
    let cursor = 0;
    for (const type of ["hero", "content", "cta"] as const) {
      const definition = input.registry.get(type);
      if (definition === undefined) continue;
      const variant = Object.keys(definition.variants ?? {})[0];
      mutations.push({
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        index: cursor,
        node: {
          type,
          ...(variant === undefined ? {} : { variant }),
          props: { ...definition.golden.tree.props },
        },
      });
      sections.push({ type, variant: variant ?? null, nodeId: "" });
      cursor += 1;
    }
    if (mutations.length === 0) continue;
    const outcome = applyMutations({
      registry: input.registry,
      tree: page.draft,
      mutations,
      previousTitle: page.title,
      previousPath: page.path,
    });
    const saved = await input.store.persistBatch({
      pageId: page.id,
      expectedVersion: page.draftVersion,
      draft: outcome.tree,
      title: outcome.page.title,
      path: outcome.page.path,
      entries: outcome.results.map((result) => {
        const source = mutations[result.opIndex];
        if (!source) throw new Error("Internal error: result without source mutation");
        return {
          siteId: target.id,
          pageId: page.id,
          batchId: "redesign-batch",
          opIndex: result.opIndex,
          mutation: result.op,
          params: { ...source } as Record<string, unknown>,
          author: input.author,
          undoPatch: result.undoPatch,
          draftVersionAfter: 0,
        };
      }),
    });
    // The persisted node ids: read the fresh draft back.
    const fresh = await input.store.getPage(page.id);
    const freshRoot = fresh.draft.nodes[fresh.draft.rootNodeId];
    const freshChildren = freshRoot?.children ?? [];
    for (const [index, section] of sections.entries()) {
      section.nodeId = freshChildren[index] ?? "";
    }
    pages.push({
      pageId: page.id,
      path: outcome.page.path,
      title: outcome.page.title,
      draftVersion: saved,
      seeded: true,
      sections,
      warnings: outcome.warnings.map((warning) => warning.message),
    });
    steps.push(`seed ${page.path} (hero/content/cta golden)`);
  }

  // 4. Design record: the audit trail of the run (R14) — brief pointers,
  //    chosen references, theme changes, steps. It rides on the site event
  //    the audit log already carries. A confirmed proposal direction (ADR-0012)
  //    additionally names the proposal, the chosen card and the source it came
  //    from, so the draft knows its own origin.
  const decisionParams: Record<string, unknown> =
    input.snapshot === undefined
      ? {}
      : {
          proposalId: input.snapshot.proposalId,
          directionId: input.snapshot.directionId,
          sourceSiteId: input.snapshot.sourceSiteId,
          sourcePageId: input.snapshot.sourcePageId,
          sourceDraftVersion: input.snapshot.sourceDraftVersion,
          sourceThemeVersion: input.snapshot.sourceThemeVersion,
        };
  await input.store.recordSiteEvent({
    siteId: target.id,
    mutation: "apply_redesign",
    params: {
      references: references.map((reference) => ({
        referenceId: reference.id,
        name: reference.name,
        screenshotPath: reference.screenshotPath,
      })),
      themeChanges: verification.changes,
      verificationOk: verification.ok,
      steps,
      pages: pages.map((page) => page.pageId),
      ...decisionParams,
    },
    author: input.author,
  });
  steps.push("design record (audit)");

  return {
    siteId: target.id,
    siteName: target.name,
    duplicated,
    themeVersion,
    pages,
    // The legacy path (no card, no plan) never claims the section rewrite it
    // did not run: `false` is the honest marker (Fahrplan P2-1, R3).
    sectionPlanApplied: input.sectionPlan !== undefined,
    // A legacy run derives no section plan, so there is nothing to hand back as
    // an open need. Saying so explicitly beats leaving it undefined: a client
    // asking "what is left to do" gets an answer in both paths.
    openMediaNeeds: [],
    record: {
      referenceIds: references.map((reference) => reference.id),
      references: references.map((reference) => ({
        referenceId: reference.id,
        name: reference.name,
        screenshotPath: reference.screenshotPath,
      })),
      themeChanges: verification.changes,
      verificationOk: verification.ok,
      steps,
    },
    warnings,
  };
}

// --------------------------------------------------- compile and commit (ADR-0014)

// `compileRedesign` reads and computes; it writes nothing. Every branch is
// decided and every id is minted here, so `commitRedesignApply` is a loop over
// prepared statements. That split is what lets the whole run land in one
// transaction: there is no decision left to take while the transaction is open.
export async function compileRedesign(
  input: ApplyRedesignInput,
): Promise<RedesignCommitPlan> {
  if (input.pageId !== undefined) {
    throw new SenifyError("validation", "Der atomare Apply kennt nur das Duplikat", {
      field: "pageId",
      suggestion: "apply_redesign mit pageId nutzt weiter den direkten Weg.",
    });
  }
  const referenceIds = await redesignReferenceIds(input);
  const references = await resolveReferences(input.store, referenceIds);
  const warnings: string[] = [];
  const steps: string[] = [];
  const source = await input.store.getSite(input.siteId);
  const withContent = input.withContent ?? true;

  // 1. The target site. Its id is minted here, so a retry of the commit can
  // never produce a second copy.
  const targetSiteId = newEntityId();
  const targetName = `${source.name} (Kopie)`;
  const targetSlug = await freeSiteSlug(input.store, slugify(targetName));

  // 2. A contentless copy has no pages; its start page is part of the plan.
  const startPage = withContent
    ? null
    : { id: newEntityId(), title: "Start", path: await freePagePath(input.store, targetSiteId, "/") };

  // 3. The theme patch. The confirmed direction writes the patch the human
  //    approved; the legacy way derives one from the references.
  const currentThemeRow = await input.store.getTheme(source.id);
  const currentTheme = currentThemeRow.theme;
  const draft = deriveThemeDraft({
    assignments: references.map((reference) => ({
      referenceId: reference.id,
      name: reference.name,
      profile: reference.profile,
      scales: REDESIGN_SCALES,
    })),
  });
  const verification = verifyThemeRoundTrip(draft, currentTheme);
  if (!verification.ok) {
    warnings.push(
      `Theme-Entwurf besteht die Gegenprobe nicht: ${verification.issues.join("; ")}`,
    );
  }
  const confirmedPatch = input.snapshot?.themePatch;
  const patch: Record<string, unknown> =
    confirmedPatch === undefined
      ? {
          ...(Object.keys(draft.scales).length > 0 ? { scales: draft.scales } : {}),
          ...(Object.keys(draft.fonts).length > 0 ? { fonts: draft.fonts } : {}),
          ...(Object.keys(draft.motion).length > 0 ? { motion: draft.motion } : {}),
        }
      : confirmedPatch;
  if (Object.keys(patch).length === 0) {
    warnings.push(
      "Die Referenzen liefern keine Skalenwerte; das Theme blieb unverändert.",
    );
  }
  // The theme write. The duplicate's own theme row is created from the source
  // definition, so the write targets the NEW row — not the source site's theme.
  const targetThemeId = newEntityId();
  const themeWrite =
    Object.keys(patch).length > 0
      ? {
          themeId: targetThemeId,
          // The fresh copy starts at version 1, so the first write expects 1.
          expectedVersion: 1,
          patch,
        }
      : null;
  const themeVersion = themeWrite === null ? 1 : 2;
  steps.push(
    themeWrite === null
      ? "theme unchanged"
      : confirmedPatch === undefined
        ? "update_theme (abgeleiteter Patch)"
        : "update_theme (bestätigter Direction-Card-Patch)",
  );

  // 4. The section skeleton. `applyMutations` is pure, so the new node ids are
  //    already known here — the commit never has to read a draft back.
  //
  //    The plan carries the SOURCE page ids, because that is what the compile
  //    read. The commit copies those pages into the duplicate first, so the
  //    write always targets the target site's own page rows.
  const pages: RedesignPageResult[] = [];
  const pageWrites: RedesignCommitPlan["pageWrites"] = [];
  const copiedPages: RedesignCommitPlan["copiedPages"] = [];
  const auditEntries: NewAuditEntry[] = [];
  // The rebuild writes the plan produces, kept apart from the skeleton writes
  // so the commit can tell "the plan ran" from "the skeleton ran".
  const sectionPlanWrites: RedesignCommitPlan["pageWrites"] = [];
  const sectionPlanWarnings: string[] = [];
  // The open media needs, as work items (P2-2). Collected across the pages
  // because a plan names the page once but its media may sit on any of them, and
  // the caller closing a need does not care which page it landed on.
  const openMediaNeeds: OpenMediaNeed[] = [];
  const sourcePages = await input.store.listPageDrafts(input.siteId);
  for (const page of sourcePages) {
    if (page.template !== null) continue;
    // The copy gets its own page row, so the seed writes into the copy and the
    // source draft is never touched.
    const copy: RedesignCommitPlan["copiedPages"][number] = {
      sourcePageId: page.id,
      targetPageId: newEntityId(),
      path: page.path,
      title: page.title,
      meta: page.meta,
      draft: page.draft,
      draftVersion: page.draftVersion,
    };
    copiedPages.push(copy);
    const rootNode = page.draft.nodes[page.draft.rootNodeId];
    const existing = rootNode?.children ?? [];

    // P2-1 (R3): the plan is executed here, BEFORE the "does this page already
    // have content?" question, because a plan that only ran on pages with
    // content would never run at all on a fresh site - and the plan's own
    // purpose is to decide what the page should contain. The rebuild is
    // computed in the compile phase, where the source tree is still in hand, and
    // handed to the commit as prepared data; the commit itself stays
    // control-flow free (ADR-0014). A rebuild must never become a second write
    // path running beside the transaction.
    const plan = sectionPlanFor(input.sectionPlan, page.id);
    if (plan !== null) {
      const rebuilt = rebuildPageTree({
        page: {
          id: page.id,
          path: page.path,
          title: page.title,
          draft: page.draft,
          draftVersion: page.draftVersion,
        },
        plan,
        registry: input.registry,
        // Which prop keys hold a reference the plan already named as a need.
        // The rebuild drops them so the slot is empty instead of pointing at an
        // asset that is gone (P2-2). Derived from the plan, not from the tree:
        // the plan is the record of what is missing, and the tree is what the
        // source happened to have.
        missingAssetPaths: sourceAssetPropKeys(plan),
      });
      if (rebuilt !== null) {
        // The copy row is written with the source draft, so the rebuild must
        // be a separate write against the copy's own id and version.
        copy.draft = rebuilt.draft;
        pages.push({
          pageId: copy.targetPageId,
          path: page.path,
          title: page.title,
          draftVersion: page.draftVersion,
          seeded: true,
          sections: rebuilt.sections,
          warnings: rebuilt.warnings,
        });
        sectionPlanWrites.push({
          pageId: copy.targetPageId,
          expectedVersion: page.draftVersion,
          draft: rebuilt.draft,
          title: page.title,
          path: page.path,
        });
        sectionPlanWarnings.push(...rebuilt.warnings);
        // The media needs: `reuse` travels with the copied tree, `avoid`
        // lands in no prop, everything else stays an open work item the caller
        // can close (P2-2).
        const media = categorizePlanMediaNeeds(plan, rebuilt.nodeIdMap);
        sectionPlanWarnings.push(...media.warnings);
        openMediaNeeds.push(...media.open);
        steps.push(`rebuild ${page.path} (${rebuilt.sections.length} Sektionen aus dem Plan)`);
        continue;
      }
    }

    if (existing.length > 0) {
      pages.push({
        pageId: copy.targetPageId,
        path: page.path,
        title: page.title,
        draftVersion: page.draftVersion,
        seeded: false,
        sections: [],
        warnings: [],
      });
      continue;
    }
    const sections: RedesignPageResult["sections"] = [];
    const mutations: Mutation[] = [];
    let cursor = 0;
    for (const type of ["hero", "content", "cta"] as const) {
      const definition = input.registry.get(type);
      if (definition === undefined) continue;
      const variant = Object.keys(definition.variants ?? {})[0];
      mutations.push({
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        index: cursor,
        node: {
          type,
          ...(variant === undefined ? {} : { variant }),
          props: { ...definition.golden.tree.props },
        },
      });
      sections.push({ type, variant: variant ?? null, nodeId: "" });
      cursor += 1;
    }
    if (mutations.length === 0) continue;
    const outcome = applyMutations({
      registry: input.registry,
      tree: page.draft,
      mutations,
      previousTitle: page.title,
      previousPath: page.path,
    });
    // The ids come from the prepared tree, not from a read-back.
    const freshRoot = outcome.tree.nodes[outcome.tree.rootNodeId];
    const freshChildren = freshRoot?.children ?? [];
    for (const [index, section] of sections.entries()) {
      section.nodeId = freshChildren[index] ?? "";
    }
    pages.push({
      pageId: page.id,
      path: outcome.page.path,
      title: outcome.page.title,
      draftVersion: page.draftVersion + 1,
      seeded: true,
      sections,
      warnings: outcome.warnings.map((warning) => warning.message),
    });
    // The result names the copied page, not the source: that is where the
    // operator continues.
    const targetPageId = copiedPages[copiedPages.length - 1]?.targetPageId ?? page.id;
    pages[pages.length - 1] = { ...pages[pages.length - 1]!, pageId: targetPageId };
    pageWrites.push({
      pageId: targetPageId,
      expectedVersion: page.draftVersion,
      draft: outcome.tree,
      title: outcome.page.title,
      path: outcome.page.path,
    });
    // The audit of the seed rides along with the write, so a rollback removes
    // the record as well instead of leaving a trail for pages that do not exist.
    const batchId = newEntityId();
    for (const result of outcome.results) {
      const source = mutations[result.opIndex];
      if (source === undefined) continue;
      auditEntries.push({
        siteId: targetSiteId,
        pageId: page.id,
        batchId,
        opIndex: result.opIndex,
        mutation: result.op,
        params: { ...source } as Record<string, unknown>,
        author: input.author,
        undoPatch: result.undoPatch,
        draftVersionAfter: page.draftVersion + 1,
      });
    }
    steps.push(`seed ${page.path} (hero/content/cta golden)`);
  }

  const record: RedesignRecord = {
    referenceIds: references.map((reference) => reference.id),
    references: references.map((reference) => ({
      referenceId: reference.id,
      name: reference.name,
      screenshotPath: reference.screenshotPath,
    })),
    themeChanges: verification.changes,
    verificationOk: verification.ok,
    steps,
  };
  // The design record rides along with the write, so a rollback removes it too
  // and the audit never names a site that does not exist.
  const decisionParams: Record<string, unknown> =
    input.snapshot === undefined
      ? {}
      : {
          proposalId: input.snapshot.proposalId,
          directionId: input.snapshot.directionId,
          sourceSiteId: input.snapshot.sourceSiteId,
          sourcePageId: input.snapshot.sourcePageId,
          sourceDraftVersion: input.snapshot.sourceDraftVersion,
          sourceThemeVersion: input.snapshot.sourceThemeVersion,
        };
  auditEntries.push({
    siteId: targetSiteId,
    pageId: null,
    batchId: newEntityId(),
    opIndex: 0,
    mutation: "apply_redesign",
    params: {
      references: record.references,
      themeChanges: verification.changes,
      verificationOk: verification.ok,
      steps,
      pages: pages.map((page) => page.pageId),
      ...decisionParams,
    },
    author: input.author,
    undoPatch: [],
    draftVersionAfter: 0,
  });
  steps.push("design record (audit)");
  // The plan's writes join the skeleton's: both are prepared data for the one
  // transaction, not two write paths. `sectionPlanApplied` is then an honesty
  // statement - it is true only if the run actually produced a rebuild write
  // and no media need is left open (Fahrplan P2-1 Punkt 5).
  pageWrites.push(...sectionPlanWrites);
  warnings.push(...sectionPlanWarnings);
  return {
    targetSite: { id: targetSiteId, name: targetName, slug: targetSlug, profile: source.profile, withContent },
    themeId: targetThemeId,
    startPage,
    copiedPages,
    themeWrite,
    themeVersion,
    pageWrites,
    pages,
    // R3: the flag says what this run wrote, not what it could have written.
    // A plan that was passed but never matched a page, or that leaves a media
    // need open, stays `false` - the human then knows the handoff is still
    // unfinished instead of trusting a green field.
    sectionPlanApplied: sectionPlanWrites.length > 0 && openMediaNeeds.length === 0,
    // The work items a caller can act on (P2-2). They travel with the plan
    // rather than only through `warnings`, so a client does not have to parse
    // German prose to learn that one image is still missing.
    openMediaNeeds,
    auditEntries,
    record,
    warnings,
    steps,
    duplicated: true,
  };
}

// The reference set of a run, shared by the direct and the atomic path.
async function redesignReferenceIds(input: ApplyRedesignInput): Promise<readonly string[]> {
  if (input.snapshot !== undefined) return [input.snapshot.referenceId];
  if (input.collectionId !== undefined && input.collectionId !== "") {
    if (
      input.referenceIds !== undefined &&
      input.referenceIds.some((id) => id.trim() !== "")
    ) {
      throw new SenifyError(
        "validation",
        "referenceIds und collectionId schließen sich aus",
        { field: "collectionId", suggestion: "Entweder ids angeben oder eine Sammlung." },
      );
    }
    const collection = await input.store.getReferenceCollection(input.collectionId);
    const ids = await input.store.listReferenceIdsByCollection(collection.id);
    if (ids.length === 0) {
      throw new SenifyError(
        "conflict",
        `Sammlung "${collection.name}" enthält keine fertigen Referenzen`,
        {
          field: "collectionId",
          suggestion: "Eine Sammlung mit analysierten Referenzen wählen.",
        },
      );
    }
    return ids.slice(0, MAX_REFERENCES);
  }
  return input.referenceIds ?? [];
}

// The first free slug of the `base`, `base-2`, `base-3` series. Resolved in the
// compile phase because a transaction cannot retry a unique violation: in
// PostgreSQL the first constraint error aborts it (ADR-0014).
async function freeSiteSlug(store: Store, base: string): Promise<string> {
  const taken = new Set(await store.listSiteSlugs());
  let slug = base;
  for (let attempt = 2; taken.has(slug) && attempt < 100; attempt += 1) {
    slug = `${base}-${attempt}`;
  }
  if (taken.has(slug)) {
    throw new SenifyError("conflict", `Site slug "${base}" is already in use`, {
      field: "slug",
      suggestion: "Rename the source site or free the slug.",
    });
  }
  return slug;
}

// The first free path of the `base`, `base-2`, … series inside the target site.
async function freePagePath(
  store: Store,
  siteId: string,
  base: string,
): Promise<string> {
  const taken = new Set(await store.listPagePaths(siteId));
  let path = base;
  for (let attempt = 2; taken.has(path) && attempt < 100; attempt += 1) {
    path = `${base}-${attempt}`;
  }
  return path;
}

// `commitRedesignApply` writes a prepared plan and nothing else: no branch, no
// read-back, no file. The caller runs it inside the one transaction that also
// carries the proposal decision, so a crash leaves neither a half-written site
// nor a proposal stuck in `applying` (ADR-0014).
export async function commitRedesignApply(
  store: Store,
  plan: RedesignCommitPlan,
  input: {
    author: ApplyRedesignInput["author"];
    sourceSite: Site;
    themeDefinition: unknown;
    proposalClaim: { proposalId: string; directionId: string; decision: unknown } | null;
    proposalFinalize: { proposalId: string; applyResult: unknown } | null;
  },
): Promise<void> {
  await store.applyRedesignPlan(plan, {
    now: new Date().toISOString(),
    author: input.author,
    sourceSite: input.sourceSite,
    themeDefinition: input.themeDefinition,
    proposalClaim: input.proposalClaim,
    proposalFinalize: input.proposalFinalize,
  });
}

// --------------------------------------------------- section plan executor (P2-1, R3)

// The plan names exactly one source page, so "does this page have a plan?" is a
// single comparison. A run without a plan (the legacy apply_redesign path) has
// none, and every page then falls through to the skeleton.
function sectionPlanFor(
  plan: DirectionSectionPlan | undefined,
  pageId: string,
): DirectionSectionPlan | null {
  if (plan === undefined) return null;
  return plan.source.pageId === pageId ? plan : null;
}
