import type { Node, NodeTree, PropValue, Registry } from "@senify/section-sdk";
import type {
  DirectionMediaNeed,
  DirectionSectionPlan,
  MediaNeedResolution,
  OpenMediaNeed,
} from "./redesign-proposal-contract.ts";

// The media needs of a plan, sorted by what this run can actually do with them
// (Fahrplan P2-1 Punkt 3, ausgeführt in P2-2). `reuse` needs no write: the
// rebuild copies the source tree, so the source asset id travels into the copy
// untouched. `avoid` is covered in the other direction - the reference asset
// never becomes a target asset, so the slot simply stays empty. Everything in
// between (`select`, `upload`, `generate`, `manual`) becomes an `OpenMediaNeed`:
// a work item the caller can close, not a warning line it can only read.
//
// The four treatments differ in who supplies what, and the split is the point:
//   - `select`: the caller names an existing asset of the TARGET site. The
//     server checks the ownership, because a foreign id would either fail the
//     bake or, worse, render an asset from another site.
//   - `upload` / `generate`: the caller has already produced a new asset of the
//     target site (uploaded or generated through the existing routes) and names
//     it. By this point both are the same thing: "this asset fills this slot".
//   - `manual`: the human takes the slot. Recorded, not guessed.
export function categorizePlanMediaNeeds(
  plan: DirectionSectionPlan,
  // Where the rebuild put each source node. Optional, because the function is
  // also called on a plan that was never executed (the executor maps needs only
  // for a page it actually rebuilt). Without it the need carries the plan's
  // source id, which is still an address - just not the one the rebuilt draft
  // uses.
  nodeIdMap?: ReadonlyMap<string, string>,
): {
  summary: DirectionSectionPlan["summary"];
  warnings: string[];
  rewrites: { targetPath: string; assetId: string }[];
  open: OpenMediaNeed[];
} {
  const warnings: string[] = [];
  const rewrites: { targetPath: string; assetId: string }[] = [];
  const open: OpenMediaNeed[] = [];
  for (const need of plan.media) {
    if (need.treatment === "reuse" && need.source.assetId !== null) {
      rewrites.push({ targetPath: need.targetPath, assetId: need.source.assetId });
      continue;
    }
    if (need.treatment === "avoid") {
      warnings.push(`Referenz-Asset ${need.targetPath} wird nicht uebernommen (Vermieden: ${need.reason}).`);
      continue;
    }
    if (need.treatment === "reuse") {
      // A `reuse` without a source asset cannot be reused. It stays a work
      // item with the treatment the plan asked for, and the reason says why -
      // the caller's next step is the same as for a `select`.
      open.push(toOpenNeed(need, "select", nodeIdMap));
      warnings.push(
        `Medienbedarf ${need.targetPath} bleibt offen (reuse ohne Quell-Asset: ${need.reason}).`,
      );
      continue;
    }
    open.push(toOpenNeed(need, need.treatment, nodeIdMap));
    warnings.push(`Medienbedarf ${need.targetPath} bleibt offen (${need.treatment}: ${need.reason}).`);
  }
  return { summary: plan.summary, warnings, rewrites, open };
}

function toOpenNeed(
  need: DirectionMediaNeed,
  treatment: OpenMediaNeed["treatment"],
  nodeIdMap?: ReadonlyMap<string, string>,
): OpenMediaNeed {
  return {
    needId: need.id,
    // The id the caller will find in the rebuilt draft, not the one the plan was
    // derived from. A need pointing at a node the rebuild replaced would send
    // the caller to a node that is no longer there.
    targetNodeId:
      need.targetNodeId === ""
        ? ""
        : (nodeIdMap?.get(need.targetNodeId) ?? need.targetNodeId),
    targetPath: need.targetPath,
    role: need.role,
    treatment,
    reason: need.reason,
    prompt: need.prompt,
    alt: need.alt,
    decorative: need.decorative,
    resolvedWith: null,
  };
}

// Closes the needs a caller could close, and reports exactly which ones stayed
// open. A resolution names the need it answers for, so a typo cannot read as
// "that one is still open" and send the caller hunting for a need that does not
// exist - an unknown need id is an error, not a silent no-op.
//
// A resolution whose asset does not belong to the target site is refused here,
// at the point where the caller can act on it, rather than at bake time where
// the draft would already reference a foreign asset.
export async function resolveMediaNeeds(input: {
  open: readonly OpenMediaNeed[];
  // `needId` first: the caller answers FOR a need, not with a free-standing
  // instruction. Keeping the pairing in the type means the server never has to
  // guess which resolution belongs to which slot.
  resolutions: readonly { needId: string; resolution: MediaNeedResolution }[];
  targetSiteId: string;
  assetBelongsToSite: (assetId: string) => Promise<boolean>;
}): Promise<{
  closed: OpenMediaNeed[];
  stillOpen: OpenMediaNeed[];
  rewrites: { targetPath: string; assetId: string }[];
}> {
  const byId = new Map(input.open.map((need) => [need.needId, need]));
  const answers = new Map<string, MediaNeedResolution>();
  for (const entry of input.resolutions) {
    if (!byId.has(entry.needId)) {
      throw new Error(
        `Medienbedarf "${entry.needId}" gehört nicht zu diesem Plan. Offen sind: ` +
          input.open.map((need) => need.needId).join(", "),
      );
    }
    if (answers.has(entry.needId)) {
      throw new Error(`Medienbedarf "${entry.needId}" wurde zweimal beantwortet.`);
    }
    answers.set(entry.needId, entry.resolution);
  }

  const closed: OpenMediaNeed[] = [];
  const stillOpen: OpenMediaNeed[] = [];
  const rewrites: { targetPath: string; assetId: string }[] = [];
  for (const need of input.open) {
    const answer = answers.get(need.needId);
    if (answer === undefined) {
      stillOpen.push(need);
      continue;
    }
    if (answer.treatment === "manual") {
      // Closed on purpose: the slot stays empty, and `resolvedWith` records that
      // this was a decision rather than an oversight.
      closed.push({
        ...need,
        resolvedWith: { treatment: "manual", assetId: null },
      });
      continue;
    }
    if (!(await input.assetBelongsToSite(answer.assetId))) {
      throw new Error(
        `Asset "${answer.assetId}" für Medienbedarf "${need.needId}" gehört nicht zur ` +
          `Zielsite ${input.targetSiteId}.`,
      );
    }
    closed.push({
      ...need,
      resolvedWith: { treatment: answer.treatment, assetId: answer.assetId },
    });
    // The rewrite is what actually lands in the draft. `manual` produces none,
    // which is why the emptiness stays visible instead of becoming a hole.
    rewrites.push({ targetPath: need.targetPath, assetId: answer.assetId });
  }
  return { closed, stillOpen, rewrites };
}

// Rebuild-plan execution (Fahrplan P2-1, R3): the confirmed section plan is
// translated into the canonical mutation stream the commit then runs in one
// transaction. No I/O and no branchy read-back inside the commit; every id
// and every prop value is decided here where the source tree is still known.
//
// The result is pure data: a copy of the source tree with its sections
// replaced by the planned target sections, ready for the copied page row.
// Mutation() never runs here — the plan is complete enough that the commit's
// `applyMutations` handles the actual insertion; the executor only decides
// the seed values.

export type RebuiltPage = {
  pageId: string;
  path: string;
  title: string;
  draftVersion: number;
  // The draft against which the commit writes, plus the seed ids we inserted.
  draft: NodeTree;
  seeded: boolean;
  sections: { type: string; variant: string | null; nodeId: string }[];
  warnings: string[];
  // source node id -> the id this rebuild gave it. A node rewritten in place maps
  // to itself; one built from the plan alone maps to the minted id. The executor
  // points every media need through this map, so a need always names a node that
  // exists in the draft the caller receives (P2-2).
  nodeIdMap: Map<string, string>;
};

// A source section the plan rebuilds: the planned target type, the planned
// variant (falling back to the catalogue default when the plan named none),
// and the source subtree's content projected onto the target's prop set.
//
// There is no asset-rewrite step here, and that is deliberate: the rebuild
// copies the source tree, so a `reuse` need's asset id is already the id the
// copy carries. An `avoid` need lands in no prop because the reference asset
// was never in the source tree. Anything else is an open need and belongs in
// the warnings, not in a silent guess.
export function rebuildPageTree(input: {
  page: { id: string; path: string; title: string; draft: NodeTree; draftVersion: number };
  plan: DirectionSectionPlan;
  registry: Registry;
  // The prop KEYS that hold a media reference the plan named as a need. A key
  // is dropped from the rebuilt node instead of carrying a reference to an asset
  // that is gone, so the slot is empty and the human can fill it (P2-2).
  //
  // A set of top-level keys, not full paths: the rebuild works on one node's
  // props, and `media.asset` in the plan names the same slot as the `asset` key
  // on the node. A deeper path would have to be resolved per node, and the plan
  // already groups its needs by path prefix.
  missingAssetPaths?: ReadonlySet<string>;
}): RebuiltPage | null {
  const missingAssetPaths = input.missingAssetPaths ?? new Set<string>();
  const { page, plan, registry } = input;
  // Only the page the plan was built against qualifies. A stale plan (the
  // source tree moved on since the cards were derived) is refused by
  // validateSectionPlan before the proposal is ever confirmed, so the executor
  // does not re-check staleness here: it reads the plan it was handed.
  if (plan.source.pageId !== page.id) return null;
  const root = page.draft.nodes[page.draft.rootNodeId];
  if (root === undefined) return null;

  // The plan is the target list, in the plan's own order. Two cases, and the
  // difference matters:
  //
  //  - The source section is still in the tree: rewrite it in place. The node
  //    id survives, so every draft reference, undo patch and audit row that
  //    points at it stays valid. The source content is projected onto the
  //    target's prop set.
  //  - The source section is NOT in the tree (an empty page, or a section that
  //    was deleted since the cards were derived): build the target node from
  //    the plan alone, taking the variant preset the plan recorded. This is the
  //    case that makes a plan useful on a fresh site, and the case a
  //  content-only rewrite would silently skip.
  //
  // Nested children (containers, slot children) travel with their parent: the
  // plan records them as entries, but only the top-level rows are materialised
  // here, because a child is reached through its parent's subtree.
  const rebuild = plan.entries
    .filter((entry) => entry.source.parentNodeId === page.draft.rootNodeId)
    .sort((a, b) => a.source.index - b.source.index);

  const warnings: string[] = [];
  // Copy the source tree so ids stay stable and nested slots keep their
  // subtrees; only the top-level children get replaced by the rebuilt seeds.
  const nextDraft: NodeTree = JSON.parse(JSON.stringify(page.draft)) as NodeTree;
  const nextNodes = nextDraft.nodes;
  const nextRoot = nextNodes[nextDraft.rootNodeId];
  if (nextRoot === undefined) return null;

  const newChildren: string[] = [];
  const sections: RebuiltPage["sections"] = [];
  // source node id -> the id the rebuilt tree carries for it. Filled in the
  // loop below; the media needs are pointed through it afterwards.
  const nodeIdMap = new Map<string, string>();
  let nextId = 0;
  for (const entry of rebuild) {
    const definition = entry.target.type === null ? undefined : registry.get(entry.target.type);
    // A section with no registered target, or one whose target type has since
    // disappeared from the registry, is a human decision. It is NOT dropped:
    // the source node stays in the tree and the warning names it.
    if (entry.target.type === null) {
      const source = page.draft.nodes[entry.source.nodeId];
      warnings.push(
        `Section "${entry.source.type}" hat kein registriertes Ziel und bleibt manuell.`,
      );
      if (source !== undefined) {
        nodeIdMap.set(entry.source.nodeId, entry.source.nodeId);
        newChildren.push(entry.source.nodeId);
        sections.push({
          type: entry.source.type,
          variant: entry.source.variant,
          nodeId: entry.source.nodeId,
        });
      }
      continue;
    }
    if (definition === undefined) {
      const source = page.draft.nodes[entry.source.nodeId];
      warnings.push(
        `Zieltyp "${entry.target.type}" ist nicht im Katalog; Sektion bleibt unveraendert.`,
      );
      if (source !== undefined) {
        nodeIdMap.set(entry.source.nodeId, entry.source.nodeId);
        newChildren.push(entry.source.nodeId);
        sections.push({
          type: entry.source.type,
          variant: entry.source.variant,
          nodeId: entry.source.nodeId,
        });
      }
      continue;
    }

    const chosenVariant = entry.target.variant ?? definition.golden.tree.variant ?? null;
    const variantPreset =
      chosenVariant === null ? {} : (definition.variants?.[chosenVariant]?.preset ?? {});
    const source = page.draft.nodes[entry.source.nodeId];
    // The preserved content: only the prop keys the plan listed, and only the
    // ones the source node actually has. A key the plan names but the source
    // lacks is not invented - the variant preset is the floor.
    const kept: Record<string, PropValue> = {};
    if (source !== undefined) {
      for (const key of entry.content.propKeys) {
        if (key in source.props) kept[key] = structuredClone(source.props[key]) as PropValue;
      }
    }
    // A media slot whose asset does not exist must NOT be carried over (P2-2).
    //
    // "Preserve the content" means preserve the CONTENT, and a reference to a
    // deleted asset is not content - it is a hole the plan already named. Kept,
    // the draft would point at nothing, the publish guard would refuse the
    // release hours later, and the media need the human was just asked to close
    // would have been closed against a slot that still cannot render.
    //
    // Dropped here, the slot is empty, the human fills it, and the guard has
    // nothing to complain about. The need carries the reason, so the emptiness
    // is never silent.
    for (const key of Object.keys(kept)) {
      if (missingAssetPaths.has(key)) delete kept[key];
    }
    const nodeId = source?.id ?? `plan-${page.id}-${nextId}`;
    nextId += 1;
    const rebuilt: Node = {
      id: nodeId,
      type: definition.type,
      ...(chosenVariant === null ? {} : { variant: chosenVariant }),
      // Precedence, lowest to highest: the catalogue's variant preset is the
      // floor; the plan's own record of the chosen variant overrides it; and
      // the preserved source content wins over both, because "contentPolicy:
      // preserve" is the one rule the human confirmed on.
      props: {
        ...(structuredClone(variantPreset) as Record<string, PropValue>),
        ...(entry.target.variantPreset as Record<string, PropValue>),
        ...kept,
      },
    };
    nextNodes[nodeId] = rebuilt;
    nodeIdMap.set(entry.source.nodeId, nodeId);
    newChildren.push(nodeId);
    sections.push({
      type: definition.type,
      variant: chosenVariant,
      nodeId,
    });
  }

  if (newChildren.length === 0 && (root.children ?? []).length > 0) {
    // The plan matched nothing on this page and the page was not empty: leave
    // it alone rather than emptying it.
    return null;
  }
  nextRoot.children = newChildren;

  return {
    pageId: page.id,
    path: page.path,
    title: page.title,
    draftVersion: page.draftVersion + 1,
    draft: nextDraft,
    seeded: true,
    sections,
    warnings,
    // Where each source node ended up. A node that was rewritten in place maps
    // to itself; one that was built from scratch maps source -> minted id. The
    // executor uses this to point every media need at the node the caller will
    // actually find - a need that names a node the rebuild deleted or renamed
    // would be an address the caller cannot use (P2-2).
    nodeIdMap,
  };
}
