import { SenifyError } from "@senify/core";
import type { Node, NodeTree, Registry, SectionDefinition } from "@senify/section-sdk";
import { canonicalHash, type DirectionSectionEntry, type DirectionSectionPlan, type DirectionMediaNeed } from "./redesign-proposal-contract.ts";
import { walkAssetIds } from "./media.ts";
import { hardGuardrailsForTree } from "./guardrails.ts";
import type { Asset, DesignContract, Page, ReferenceProfile, SiteProfile } from "./types.ts";

// Sektions-Plan (ADR-0013). The offered direction says which registered
// sections of the source page it touches, with which variant, which slots and
// which media it needs. Everything here is derived from the source tree, the
// live registry and the reference profile — never from agent input — and the
// result is immutable once it is stored in a card.
//
// The plan is a handoff, not an executor: a confirm still writes only scaffold
// and theme. That boundary is what keeps this slice free of a half-applied
// state across sections, assets, guardrails and proposal status.

export const REDESIGN_MAPPING_VERSION = 1;

export type SectionFingerprint = {
  type: string;
  version: number;
  hash: string;
};

const fingerprintCache = new WeakMap<Registry, Map<string, SectionFingerprint>>();

// The part of a section definition that can change what a build produces.
// Titles, descriptions and thumbnails are documentation and are left out: a
// typo in a catalogue label must not invalidate a proposal. Variants and slots
// become ordered arrays because their declaration order is meaningful
// (the first variant is the catalogue default).
function sectionProjection(definition: SectionDefinition): unknown {
  return {
    type: definition.type,
    version: definition.version,
    category: definition.category,
    deprecated: definition.deprecated === true,
    props: definition.props.map((prop) => prop.key).sort(),
    styleProps: (definition.styleProps ?? []).map((prop) => prop.key).sort(),
    variants: Object.entries(definition.variants ?? {}).map(([name, variant]) => ({
      name,
      preset: variant.preset,
    })),
    slots: Object.entries(definition.slots ?? {}).map(([name, spec]) => ({
      name,
      allowedTypes: spec.allowedTypes ?? [],
      max: spec.max ?? null,
    })),
    allowedChildren: definition.allowedChildren ?? "none",
    motionPresets: [...(definition.motionPresets ?? [])].sort(),
    golden: definition.golden.tree,
  };
}

export function sectionFingerprint(
  registry: Registry,
  type: string,
): SectionFingerprint | null {
  let cache = fingerprintCache.get(registry);
  if (cache === undefined) {
    cache = new Map();
    fingerprintCache.set(registry, cache);
  }
  const cached = cache.get(type);
  if (cached !== undefined) return cached;
  const known = registry.list().some((definition) => definition.type === type);
  if (!known) return null;
  const definition = registry.get(type);
  const fingerprint: SectionFingerprint = {
    type: definition.type,
    version: definition.version,
    hash: canonicalHash(sectionProjection(definition)),
  };
  cache.set(type, fingerprint);
  return fingerprint;
}

export function registryFingerprint(
  registry: Registry,
  types: readonly string[],
): { fingerprint: string; sections: SectionFingerprint[] } {
  const sections = types
    .map((type) => sectionFingerprint(registry, type))
    .filter((entry): entry is SectionFingerprint => entry !== null)
    .sort((a, b) => a.type.localeCompare(b.type));
  return {
    fingerprint: canonicalHash(
      sections.map((entry) => ({ type: entry.type, version: entry.version, hash: entry.hash })),
    ),
    sections,
  };
}

// A registered, non-deprecated section keeps its own type. Anything else is
// visible manual work: guessing a cross-type target from a similar title or
// category would produce layout nobody confirmed.
function resolveTarget(
  registry: Registry,
  node: Node,
): {
  type: string | null;
  typeVersion: number | null;
  variant: string | null;
  variantPreset: Record<string, unknown>;
  status: "exact" | "fallback" | "manual";
  warnings: string[];
} {
  const definition = registry.list().find((entry) => entry.type === node.type);
  if (definition === undefined) {
    return {
      type: null,
      typeVersion: null,
      variant: null,
      variantPreset: {},
      status: "manual",
      warnings: [`Section-Typ "${node.type}" ist nicht im Bausteinkatalog.`],
    };
  }
  if (definition.deprecated === true) {
    return {
      type: null,
      typeVersion: null,
      variant: null,
      variantPreset: {},
      status: "manual",
      warnings: [`Section-Typ "${node.type}" ist als veraltet markiert.`],
    };
  }

  const variantNames = Object.keys(definition.variants ?? {});
  const warnings: string[] = [];
  let variant: string | null;
  let status: "exact" | "fallback" = "exact";
  if (node.variant !== undefined && variantNames.includes(node.variant)) {
    variant = node.variant;
  } else {
    const goldenVariant = definition.golden.tree.variant;
    variant = goldenVariant !== undefined && variantNames.includes(goldenVariant)
      ? goldenVariant
      : (variantNames[0] ?? null);
    status = "fallback";
    warnings.push(
      node.variant === undefined
        ? `Ohne Variante; Vorgabe "${variant ?? "—"}" des Bausteins wird verwendet.`
        : `Variante "${node.variant}" existiert nicht; Vorgabe "${variant ?? "—"}" wird verwendet.`,
    );
  }
  return {
    type: definition.type,
    typeVersion: definition.version,
    variant,
    variantPreset:
      variant === null ? {} : (definition.variants?.[variant]?.preset ?? {}),
    status,
    warnings,
  };
}

function propKeys(definition: SectionDefinition | null): {
  content: string[];
  style: string[];
} {
  if (definition === null) return { content: [], style: [] };
  const styleKeys = new Set((definition.styleProps ?? []).map((prop) => prop.key));
  const content = definition.props
    .map((prop) => prop.key)
    .filter((key) => !styleKeys.has(key))
    .sort();
  return { content, style: [...styleKeys].sort() };
}

type Placement = {
  parentNodeId: string;
  slot: string | null;
  index: number;
};

function placements(tree: NodeTree): Map<string, Placement> {
  const found = new Map<string, Placement>();
  const root = tree.nodes[tree.rootNodeId];
  if (root === undefined) return found;
  const children = root.children ?? [];
  children.forEach((id, index) => found.set(id, { parentNodeId: root.id, slot: null, index }));
  for (const node of Object.values(tree.nodes)) {
    (node.children ?? []).forEach((id, index) =>
      found.set(id, { parentNodeId: node.id, slot: null, index }),
    );
    for (const [slot, ids] of Object.entries(node.slots ?? {})) {
      ids.forEach((id, index) =>
        found.set(id, { parentNodeId: node.id, slot, index }),
      );
    }
  }
  return found;
}

// Media treatment (ADR-0013). A source asset is only reusable when it really
// belongs to this site and is ready. A reference asset is never turned into a
// target asset: logos and identity-risky media are marked to be avoided, other
// reference media serve as style evidence only.
function mediaNeeds(input: {
  tree: NodeTree;
  siteId: string;
  assetsById: Map<string, Asset>;
  profile: ReferenceProfile;
  styleBrief: string;
}): DirectionMediaNeed[] {
  const needs = new Map<string, DirectionMediaNeed>();
  for (const node of Object.values(input.tree.nodes)) {
    walkAssetIds(node.props, "", (assetId, path) => {
      if (needs.has(path)) return;
      const targetPath = `${node.type}.${path}`;
      const asset = input.assetsById.get(assetId) ?? null;
      if (asset !== null && asset.siteId === input.siteId && asset.status === "ready") {
        needs.set(path, {
          id: `media_${needs.size + 1}`,
          // The SOURCE node id. The executor rewrites this node in place when
          // the source section is still in the tree, so the id a caller gets
          // here is the id it will find in the rebuilt draft. For a section
          // that is rebuilt from scratch the executor mints a new id, and it
          // rewrites the need's `targetNodeId` to match before returning it -
          // a need that names a node nobody can find would be worse than no
          // need at all (P2-2).
          targetNodeId: node.id,
          targetPath,
          role: "source-asset",
          treatment: "reuse",
          source: {
            siteId: asset.siteId,
            assetId: asset.id,
            hash: asset.hash,
            reference: "site-asset",
          },
          prompt: null,
          alt: asset.altText,
          decorative: asset.decorative,
          reason: "Vorhandenes Asset dieser Site wird weiterverwendet.",
        });
        return;
      }
      const reason =
        asset === null
          ? "Im Draft referenziertes Asset existiert nicht mehr."
          : asset.siteId !== input.siteId
            ? "Asset gehört zu einer anderen Site und kann nicht wiederverwendet werden."
            : "Asset ist nicht im Status „ready“.";
      needs.set(path, {
        id: `media_${needs.size + 1}`,
        targetNodeId: node.id,
        targetPath,
        role: "source-asset",
        treatment: "select",
        source: { siteId: null, assetId: null, hash: null, reference: null },
        prompt: null,
        alt: null,
        decorative: false,
        reason,
      });
    });
  }

  // Reference media never become target assets; they become explicit needs.
  input.profile.assets.forEach((asset, index) => {
    const identity = asset.identityRisk || asset.kind === "logo" || asset.kind === "font";
    const treatment: DirectionMediaNeed["treatment"] = identity ? "avoid" : "generate";
    const path = `reference.assets[${index}].${asset.kind}`;
    if (needs.has(path)) return;
    needs.set(path, {
      id: `media_${needs.size + 1}`,
      // A reference asset has no node of its own - it is style evidence, not
      // something in the draft. The empty id is honest: there is no slot to
      // write into, and the executor skips these when it maps needs onto
      // rebuilt nodes.
      targetNodeId: "",
      targetPath: path,
      role: "reference-asset",
      treatment,
      source: { siteId: null, assetId: null, hash: null, reference: "reference-profile" },
      prompt: identity
        ? null
        : `${asset.kind}: ${input.styleBrief}`.slice(0, 400),
      alt: null,
      decorative: asset.kind === "icon",
      reason: identity
        ? `Vorbild-Medium "${asset.kind}" ist geschützt oder markenbildend und wird nicht übernommen.`
        : `Vorbild-Medium "${asset.kind}" dient nur als Stilbeleg; ein eigenes Motiv ist nötig.`,
    });
  });

  return [...needs.values()];
}

// The hash of everything in the plan except the hash field itself. The field is
// dropped by key instead of set to undefined: a JSONB round trip turns an
// absent key into null, and the check must survive that without a special case.
export function sectionPlanHash(plan: Omit<DirectionSectionPlan, "planHash">): string {
  const { planHash: _ignored, ...rest } = plan as DirectionSectionPlan;
  return canonicalHash(rest);
}

export type SectionPlanInput = {
  page: Page;
  tree: NodeTree;
  registry: Registry;
  siteProfile: SiteProfile;
  designContract: DesignContract | null;
  siteId: string;
  assetsById: Map<string, Asset>;
  profile: ReferenceProfile;
  styleBrief: string;
};

export function deriveRedesignSectionPlan(input: SectionPlanInput): DirectionSectionPlan {
  const { registry, tree } = input;
  const located = placements(tree);
  const entries: DirectionSectionEntry[] = [];
  const root = tree.nodes[tree.rootNodeId];
  const visit = (node: Node): void => {
    if (node.id === tree.rootNodeId) {
      for (const child of node.children ?? []) {
        const next = tree.nodes[child];
        if (next !== undefined) visit(next);
      }
      return;
    }
    const target = resolveTarget(registry, node);
    const definition =
      target.type === null ? null : registry.list().find((entry) => entry.type === target.type) ?? null;
    const keys = propKeys(definition);
    const placement = located.get(node.id) ?? {
      parentNodeId: tree.rootNodeId,
      slot: null,
      index: 0,
    };
    entries.push({
      source: {
        nodeId: node.id,
        type: node.type,
        variant: node.variant ?? null,
        parentNodeId: placement.parentNodeId,
        slot: placement.slot,
        index: placement.index,
        hidden: node.hidden === true,
      },
      target: {
        type: target.type,
        typeVersion: target.typeVersion,
        variant: target.variant,
        variantPreset: target.variantPreset,
      },
      content: { policy: "preserve", propKeys: keys.content },
      design: { policy: "theme-inheritance", stylePropKeys: keys.style },
      children: [...(node.children ?? [])],
      slots: Object.fromEntries(
        Object.entries(node.slots ?? {}).map(([slot, ids]) => [slot, [...ids]]),
      ),
      status: target.status,
      warnings: target.warnings,
    });
    for (const child of node.children ?? []) {
      const next = tree.nodes[child];
      if (next !== undefined) visit(next);
    }
    for (const ids of Object.values(node.slots ?? {})) {
      for (const child of ids) {
        const next = tree.nodes[child];
        if (next !== undefined) visit(next);
      }
    }
  };
  if (root !== undefined) visit(root);

  const media = mediaNeeds({
    tree,
    siteId: input.siteId,
    assetsById: input.assetsById,
    profile: input.profile,
    styleBrief: input.styleBrief,
  });

  const types = [...new Set(entries.map((entry) => entry.target.type ?? entry.source.type))];
  const registryPin = registryFingerprint(registry, types);
  const treeHash = canonicalHash(tree);

  const plan: Omit<DirectionSectionPlan, "planHash"> = {
    schemaVersion: 1,
    mappingVersion: REDESIGN_MAPPING_VERSION,
    source: {
      pageId: input.page.id,
      draftVersion: input.page.draftVersion,
      treeHash,
    },
    target: {
      mode: "preserve-registered-sections",
      scope: "page",
      contentPolicy: "preserve",
      themePolicy: "confirmed-patch",
    },
    registry: registryPin,
    entries,
    media,
    summary: {
      exact: entries.filter((entry) => entry.status === "exact").length,
      fallback: entries.filter((entry) => entry.status === "fallback").length,
      manual: entries.filter((entry) => entry.status === "manual").length,
      reuse: media.filter((need) => need.treatment === "reuse").length,
      select: media.filter((need) => need.treatment === "select").length,
      generate: media.filter((need) => need.treatment === "generate").length,
      avoid: media.filter((need) => need.treatment === "avoid").length,
    },
  };
  return { ...plan, planHash: sectionPlanHash(plan) };
}

// The proof (ADR-0013): a plan may only be stored when it holds up against a
// copy of the source tree. Every check reads the live registry, so a plan that
// no longer matches the catalogue is refused instead of being offered.
export function validateSectionPlan(
  registry: Registry,
  tree: NodeTree,
  plan: DirectionSectionPlan,
  options: { siteProfile?: SiteProfile; newGuardrailCodes?: readonly string[] } = {},
): string[] {
  const problems: string[] = [];
  if (sectionPlanHash(plan) !== plan.planHash) {
    problems.push("Der Sektions-Plan ist nicht konsistent (Plan-Hash stimmt nicht).");
  }
  if (plan.mappingVersion !== REDESIGN_MAPPING_VERSION) {
    problems.push(
      `Der Sektions-Plan stammt aus Mapping-Version ${plan.mappingVersion}; erwartet wird ${REDESIGN_MAPPING_VERSION}.`,
    );
  }
  if (plan.source.treeHash !== canonicalHash(tree)) {
    problems.push("Der Quellbaum hat sich seit der Planableitung geändert.");
  }
  const seen = new Set<string>();
  for (const entry of plan.entries) {
    if (seen.has(entry.source.nodeId)) {
      problems.push(`Node ${entry.source.nodeId} steht mehrfach im Sektions-Plan.`);
    }
    seen.add(entry.source.nodeId);
    if (tree.nodes[entry.source.nodeId] === undefined) {
      problems.push(`Node ${entry.source.nodeId} existiert im Quellbaum nicht mehr.`);
      continue;
    }
    if (entry.target.type === null) continue;
    const definition = registry.get(entry.target.type);
    if (entry.target.typeVersion !== definition.version) {
      problems.push(
        `Section "${entry.target.type}" ist inzwischen auf Version ${definition.version}.`,
      );
    }
    if (entry.target.variant !== null && definition.variants?.[entry.target.variant] === undefined) {
      problems.push(
        `Variante "${entry.target.variant}" der Section "${entry.target.type}" existiert nicht mehr.`,
      );
    }
    for (const childId of [...entry.children, ...Object.values(entry.slots).flat()]) {
      if (tree.nodes[childId] === undefined) {
        problems.push(`Node ${childId} (Kind von ${entry.source.nodeId}) fehlt im Quellbaum.`);
      }
    }
  }

  // The plan must not introduce a new hard violation. Existing violations stay
  // the operator's business; the plan only refuses to make them worse.
  const produced = hardGuardrailsForTree(tree, options.siteProfile).map((entry) => entry.code);
  const known = new Set(options.newGuardrailCodes ?? produced);
  const introduced = produced.filter((code) => !known.has(code));
  if (introduced.length > 0) {
    problems.push(
      `Der Sektions-Plan erzeugt neue Guardrail-Verstöße: ${[...new Set(introduced)].join(", ")}.`,
    );
  }

  if (problems.length > 0) {
    throw new SenifyError("conflict", "Der Sektions-Plan ist nicht mehr gültig", {
      field: "sectionPlan",
      suggestion: `${problems.slice(0, 3).join(" ")} Neu planen und die Richtung erneut anbieten.`,
    });
  }
  return problems;
}
