import { SenifyError } from "@senify/core";
import type { Node, NodeTree } from "@senify/section-sdk";
import type { Theme } from "@senify/tokens";
import { referenceScreenshotPath } from "./references-brief.ts";
import {
  deriveThemeDraft,
  materializeThemeDraft,
  verifyThemeRoundTrip,
  type ReferenceThemeDraft,
  type ThemeDraftVerification,
} from "./references-theme.ts";
import type { Store } from "./store.ts";
import type { ReferenceDocuments, ReferenceScale } from "./types.ts";

// The redesign package: everything an agent needs to rebuild one page in the
// style of one or two references. It is a read: it derives the theme patch out
// of the reference profiles (the same scale engine the site assignment uses),
// verifies the round trip and hands over the page's content plus the documents.
// Nothing is written, no page and no theme changes.

const REDESIGN_SCALES: readonly ReferenceScale[] = ["color", "type", "motion", "rest"];
const MAX_REFERENCES = 3;
// Text props travel in full; the package is a briefing, not a dump.
const MAX_TEXT_LENGTH = 600;

export type RedesignNodeSummary = {
  id: string;
  type: string;
  variant: string | null;
  text: Record<string, string>;
  children: RedesignNodeSummary[];
};

export type RedesignTarget = {
  reference: {
    id: string;
    name: string;
    sourceUrl: string;
    collection: string | null;
    family: string | null;
    vocabulary: string[];
    screenshotPath: string;
  };
  // The patch for update_theme: exactly the branches of the derived draft.
  themePatch: {
    scales: ReferenceThemeDraft["scales"];
    fonts: ReferenceThemeDraft["fonts"];
    motion: ReferenceThemeDraft["motion"];
  };
  // What the patch resolves to on top of the current site theme.
  themePreview: {
    scales: Theme["scales"];
    displayFont: string;
    bodyFont: string;
    ease: Theme["motion"]["ease"];
    duration: Theme["motion"]["duration"];
  };
  verification: ThemeDraftVerification;
  rationale: ReferenceThemeDraft["rationale"];
  styleBrief: string;
  rules: { constants: string[]; never: string[] };
  components: { name: string; variants: string[] }[];
  families: string[];
  documents: ReferenceDocuments;
  // The warnings that belong to this reference alone, so a Direction Card can
  // show its own risks instead of the whole package's.
  warnings: string[];
};

export type RedesignPackage = {
  source: {
    siteId: string;
    siteName: string;
    pageId: string;
    title: string;
    path: string;
    draftVersion: number;
    themeVersion: number;
    outline: RedesignNodeSummary[];
  };
  targets: RedesignTarget[];
  // The order the agent should work in; the names are MCP tool names.
  steps: string[];
  warnings: string[];
};

function textProps(node: Node): Record<string, string> {
  const text: Record<string, string> = {};
  for (const [key, value] of Object.entries(node.props ?? {})) {
    if (typeof value !== "string" || value.trim() === "") continue;
    text[key] = value.length > MAX_TEXT_LENGTH ? `${value.slice(0, MAX_TEXT_LENGTH)}...` : value;
  }
  return text;
}

// The content of the source page: sections in order, their variant and the
// readable props. Nested children (a section's own slots) come along.
function summarizeTree(
  tree: NodeTree,
  nodeId: string,
  depth = 0,
): RedesignNodeSummary | null {
  const node = tree.nodes[nodeId];
  if (node === undefined || node.hidden === true) return null;
  if (depth > 3) return null;
  const children = (node.children ?? [])
    .map((childId) => summarizeTree(tree, childId, depth + 1))
    .filter((child): child is RedesignNodeSummary => child !== null);
  return {
    id: node.id,
    type: node.type,
    variant: node.variant ?? null,
    text: textProps(node),
    children,
  };
}

export async function buildRedesignPackage(
  store: Store,
  input: { pageId: string; referenceIds: readonly string[] },
): Promise<RedesignPackage> {
  const referenceIds = [...new Set(input.referenceIds.map((id) => id.trim()).filter((id) => id !== ""))];
  if (referenceIds.length === 0) {
    throw new SenifyError("validation", "Es wurde keine Referenz angegeben", {
      field: "referenceIds",
      suggestion: "Bis zu drei Referenz-ids mit Komma getrennt angeben.",
    });
  }
  if (referenceIds.length > MAX_REFERENCES) {
    throw new SenifyError(
      "validation",
      `Höchstens ${MAX_REFERENCES} Referenzen auf einmal`,
      {
        field: "referenceIds",
        suggestion: "Eine oder zwei Referenzen wählen, sonst wird der Entwurf beliebig.",
      },
    );
  }

  const page = await store.getPage(input.pageId);
  const site = await store.getSite(page.siteId);
  const theme = await store.getTheme(page.siteId);
  const warnings: string[] = [];
  const targets: RedesignTarget[] = [];

  for (const referenceId of referenceIds) {
    const reference = await store.getReference(referenceId);
    if (reference.profile === null) {
      throw new SenifyError(
        "conflict",
        `Referenz "${reference.name}" hat kein Profil`,
        {
          field: "referenceIds",
          suggestion:
            "Referenz per analyze_reference analysieren oder mit Design.md importieren (Skript import-referenzsites); beides erzeugt das Profil.",
        },
      );
    }
    const draft = deriveThemeDraft({
      assignments: [
        { referenceId, name: reference.name, profile: reference.profile, scales: REDESIGN_SCALES },
      ],
    });
    const verification = verifyThemeRoundTrip(draft, theme.theme);
    const merged = materializeThemeDraft(draft, theme.theme);
    const documents = reference.documents ?? { design: null, guidelines: null, components: null };
    const targetWarnings: string[] = [];
    if (documents.design === null) {
      targetWarnings.push(
        `Referenz "${reference.name}" hat kein Design.md; der Entwurf stützt sich auf Profilwerte und Sammlung.`,
      );
    }
    if (!verification.ok) {
      targetWarnings.push(
        `Theme-Entwurf für "${reference.name}" besteht die Gegenprobe nicht: ${verification.issues.join("; ")}`,
      );
    }
    if (
      Object.keys(draft.scales).length === 0 &&
      Object.keys(draft.fonts).length === 0 &&
      Object.keys(draft.motion).length === 0
    ) {
      targetWarnings.push(
        `Referenz "${reference.name}" liefert keine Skalenwerte; das Theme bliebe unverändert.`,
      );
    }
    warnings.push(...targetWarnings);
    targets.push({
      reference: {
        id: reference.id,
        name: reference.name,
        sourceUrl: reference.sourceUrl,
        collection: reference.collection?.name ?? null,
        family: reference.family ?? reference.families[0] ?? null,
        vocabulary:
          reference.vocabulary.length > 0
            ? reference.vocabulary
            : (reference.collection?.vocabulary ?? []),
        screenshotPath: referenceScreenshotPath(reference),
      },
      themePatch: { scales: draft.scales, fonts: draft.fonts, motion: draft.motion },
      themePreview: {
        scales: { ...merged.scales },
        displayFont: merged.fonts.display.family,
        bodyFont: merged.fonts.body.family,
        ease: { ...merged.motion.ease },
        duration: { ...merged.motion.duration },
      },
      verification,
      rationale: draft.rationale,
      styleBrief: draft.styleBrief,
      rules: reference.profile.rules,
      components: reference.profile.components.map((component) => ({
        name: component.name,
        variants: component.variants,
      })),
      families: reference.profile.families,
      documents,
      warnings: targetWarnings,
    });
  }

  return {
    source: {
      siteId: site.id,
      siteName: site.name,
      pageId: page.id,
      title: page.title,
      path: page.path,
      draftVersion: page.draftVersion,
      themeVersion: theme.version,
      outline: (page.draft.nodes[page.draft.rootNodeId]?.children ?? [])
        .map((childId) => summarizeTree(page.draft, childId))
        .filter((entry): entry is RedesignNodeSummary => entry !== null),
    },
    targets,
    // The canonical way out of this package. The old text still described the
    // manual duplicate/update_theme path; apply_redesign does both in one call.
    steps: [
      "create_redesign_proposal mit derselben Quellseite und den gewählten Referenz-Ids (nur pageId und referenceIds; die Karten leitet der Server ab).",
      "create_redesign_proposal: die Direction Cards einem Menschen vorlegen und auf dessen Bestätigung warten.",
      "get_redesign_proposal: Status und Decision prüfen, danach je Seite get_page, get_section und apply_mutations.",
      "create_preview und das Ergebnis ansehen; prüfen mit get_design_report und diff_reference.",
      "submit_for_review; publish_release bleibt beim Menschen.",
    ],
    warnings,
  };
}
