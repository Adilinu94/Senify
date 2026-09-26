import type {
  Reference,
  ReferenceBrief,
  ReferenceCollection,
  ReferenceDna,
  ReferenceGuardrailFinding,
  ReferencePreferences,
  ReferenceProfile,
} from "./types.ts";
import { selectCardSnapshot } from "./references-library.ts";

// Where the brief is rendered: the program serves the snapshot itself, so the
// caller (HTTP handler, MCP tool) hands in the host it was asked on. Without it
// the brief keeps the bare path — that is what the pinned fixtures expect.
export type BriefRenderOptions = {
  baseUrl?: string | null;
};

// The briefs of the reference design library, ported from the original templates
// (Taste Vault by cth9191, MIT licence → `app.js:81-85` and the collection brief
// of the "About this collection" dialog at `app.js:121`): `entrySection`,
// `buildBrief`, `preferenceBrief`, `styleBrief` and `imagePrompt`.
// The wording stays English on purpose: the coding assistants expect it. The only
// fallbacks are the ones the originals carry, and they kick in merely when a field
// is really empty; everything else (family, vocabulary, recipe) falls back to the
// collection, exactly like the reference library does.
//
// Four departures from the original, all of them added by us so a foreign coding
// assistant can work with the brief on its own (see
// `.scratch/editor-v2-rebuild/ui-audit-2026-09-24.md`):
// 1. The measured profile travels with the section (palette, type scale, spacing,
//    motion, constants, never-rules) — the original only points at the screenshot.
// 2. The guardrails of the analysis ride along as `Constraint:` lines.
// 3. The screenshot is printed as an absolute URL when the caller knows the host,
//    because `/api/...` alone is unreadable outside the program.
// 4. Empty filler is dropped instead of printed: no "Use the reference image for
//    composition." line when the analysis measured no composition at all.

const IMAGE_DIRECTION_FALLBACK = "Use type and layout to lead.";

// Status line of the brief column (app.js:70).
const DNA_OFF_HINT = "Reference-led brief · House DNA is off.";
const DNA_ON_HINT = "Includes your general preferences.";
const PROJECT_NOTES_HINT = " Project notes included.";

const BUILD_HEADER = [
  "Build [describe the website or product] for [audience].",
  "Primary action: [what the visitor should do].",
  "Required content: [sections and copy].",
].join("\n");

// styleBrief() opens with its own two lines instead of the build header.
const STYLE_HEADER = [
  "Build [project] for [audience].",
  "Primary action: [action].",
].join("\n");

// Several references are a set, not a blend: the hint is taken verbatim.
const REFERENCE_SET_HINT =
  "Use these as a reference set. If they represent different aesthetics, create one direction per reference before choosing one; do not automatically blend them.";

const PREFERENCE_TRAILER =
  "Follow the selected references and explicit project directions when they differ from general preferences.";

const WORK_INSTRUCTION =
  "Read the reference images before designing. Borrow their visual treatment and hierarchy; write for our product and use our content. Do not reuse sample claims or endorsements. Generate original image assets where useful with the available image-generation tool, using the recipes and composition notes. Build real responsive HTML text, controls, and components around those assets. Verify the result in a browser on desktop and mobile.";

const STYLE_INSTRUCTION =
  "Implement as a responsive interface and verify desktop and mobile in a browser.";

function filled(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== "";
}

// A served path becomes an address a foreign assistant can open. Relative
// fixtures and source URLs stay untouched.
function absolutePath(path: string, options: BriefRenderOptions): string {
  const base = (options.baseUrl ?? "").replace(/\/+$/, "");
  if (base === "" || !path.startsWith("/")) return path;
  return `${base}${path}`;
}

// The screenshot of the brief: the card snapshot (hero slot first), else
// the analysis URL (the reference library prints its image path the same way).
export function referenceScreenshotPath(
  reference: Reference,
  options: BriefRenderOptions = {},
): string {
  return absolutePath(
    selectCardSnapshot(reference.snapshots)?.previewPath ?? reference.sourceUrl,
    options,
  );
}

// The style guide prints the canonical sites of the family; a style brief
// carries them as references.
export function collectionReferences(collection: ReferenceCollection): string {
  return collection.examples.map((entry) => `${entry.name} ${entry.url}`).join("\n");
}

export function referenceFamily(reference: Reference): string | null {
  const family = reference.family ?? reference.families[0] ?? null;
  return family === null || family === "" ? null : family;
}

export function referenceVocabulary(reference: Reference): string[] {
  if (reference.vocabulary.length > 0) return reference.vocabulary;
  return reference.collection?.vocabulary ?? [];
}

export function referenceImageRecipe(reference: Reference): string | null {
  const recipe = reference.imageRecipe ?? reference.collection?.imageStyle ?? null;
  return recipe === null || recipe.trim() === "" ? null : recipe;
}

// entrySection of the reference library. Family and collection form the
// aesthetic, the collection stands in for family, vocabulary and recipe. A field
// that is really empty drops its line instead of printing an empty one.
export function referenceBriefSection(
  reference: Reference,
  options: BriefRenderOptions = {},
): string {
  const family = referenceFamily(reference);
  const collection = reference.collection;
  const aesthetic =
    family !== null && collection !== null
      ? `${family} (${collection.name})`
      : (family ?? collection?.name ?? null);
  const vocabulary = referenceVocabulary(reference);
  const recipe = referenceImageRecipe(reference);
  return [
    `Reference: ${reference.name}`,
    `Screenshot: ${referenceScreenshotPath(reference, options)}`,
    ...(aesthetic === null ? [] : [`Aesthetic: ${aesthetic}`]),
    ...(vocabulary.length === 0 ? [] : [`Vocabulary: ${vocabulary.join(", ")}`]),
    ...(filled(reference.note) ? [`What to borrow: ${reference.note}`] : []),
    ...(filled(reference.heroUsage)
      ? [`Composition: ${reference.heroUsage}`]
      : []),
    ...(recipe === null ? [] : [`Image recipe: ${recipe}`]),
    ...referenceProfileLines(reference),
  ].join("\n");
}

/* Profil-Block des Abschnitts (unsere Ergaenzung): die Werte, die die Analyse
   gemessen hat. Ohne sie muesste der Assistent Palette, Typo-Skala, Abstaende und
   Motion aus dem Screenshot raten; mit ihnen kann er sie pruefen. Leere Bloecke
   fallen weg, genau wie die uebrigen Zeilen des Abschnitts. */

const PROFILE_TOKEN_LIMIT = 6;
const PROFILE_MOTION_LIMIT = 4;
const PROFILE_COMPONENT_LIMIT = 12;

// Der Schutzregel-Katalog in der Sprache des Briefs; unbekannte Codes fallen auf
// den Originaltext der Analyse zurueck (Meldung plus Hinweis).
const GUARDRAIL_CONSTRAINTS: Record<string, string> = {
  "original-copy":
    "Never reuse the reference copy or its exact layout: keep the form, replace the content, generalise the design system instead of cloning it.",
  "proximity-warning":
    "Coverage of the reference is high: deviate deliberately in at least three areas (palette mood, type pairing, hero treatment, density, motion personality, surface).",
  "brand-assets":
    "Never reuse brand assets of the reference (logos, wordmarks, favicon); use our own marks.",
  "photo-assets":
    "Never reuse the photos of the reference; use our own or licensed motifs.",
  "license-font":
    "Check the font licence and self-host a metric-compatible open font pair instead of shipping the original files.",
};

function tokenValues(
  tokens: readonly { value: string; uses: number; role: string | null }[],
): string {
  return tokens
    .slice(0, PROFILE_TOKEN_LIMIT)
    .map(
      (token) =>
        `${token.role ?? "value"} ${token.value}${token.uses > 1 ? ` (x${token.uses})` : ""}`,
    )
    .join("; ");
}

function profileLines(profile: ReferenceProfile): string[] {
  const colors = tokenValues(profile.tokens.color);
  const fonts = profile.tokens.families
    .slice(0, 2)
    .map((token) => token.value)
    .join(", ");
  const steps = profile.tokens.type
    .slice(0, PROFILE_TOKEN_LIMIT)
    .map(
      (step) =>
        `${step.role} ${step.size}${step.weight === null ? "" : `/${step.weight}`}`,
    )
    .join(", ");
  const type = [fonts, steps].filter((part) => part !== "").join(" - ");
  const space = profile.tokens.space[0]?.value;
  const radius = profile.tokens.radius[0]?.value;
  // A recipe without a preset of our catalog keeps its measured name: "custom
  // recipes" alone would tell the assistant nothing.
  const motion = profile.motion
    .slice(0, PROFILE_MOTION_LIMIT)
    .map((entry) =>
      entry.preset === null ? entry.name : `${entry.preset}(${entry.trigger})`,
    )
    .join(", ");
  const components = profile.components
    .slice(0, PROFILE_COMPONENT_LIMIT)
    .map((entry) => entry.name)
    .join(", ");
  return [
    colors === "" ? null : `Palette: ${colors}`,
    type === "" ? null : `Type: ${type}`,
    space === undefined && radius === undefined
      ? null
      : `Spacing/Radius: ${space ?? "not measured"} / ${radius ?? "not measured"}`,
    profile.motion.length === 0 ? null : `Motion: ${motion}`,
    components === "" ? null : `Components: ${components}`,
    profile.rules.constants.length === 0
      ? null
      : `Constants: ${profile.rules.constants.join("; ")}`,
    profile.rules.never.length === 0
      ? null
      : `Never: ${profile.rules.never.join("; ")}`,
    ...constraintLines(profile.guardrails),
    profile.reduced
      ? "Note: reduced profile (snapshot fallback) - runtime values are not measured."
      : null,
  ].filter((line): line is string => line !== null);
}

function constraintLines(findings: readonly ReferenceGuardrailFinding[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const finding of findings) {
    if (seen.has(finding.code)) continue;
    seen.add(finding.code);
    const known = GUARDRAIL_CONSTRAINTS[finding.code];
    lines.push(
      `Constraint: ${
        known ?? `${finding.message} — ${finding.suggestion}`
      }`,
    );
  }
  return lines;
}

// Der Profil-Block eines Abschnitts. Ohne Profil bleibt der Abschnitt wie im
// Vorbild: nur die Zeilen, die die Referenz selbst mitbringt.
export function referenceProfileLines(reference: Reference): string[] {
  const profile = reference.profile;
  return profile === null ? [] : profileLines(profile);
}

// preferenceBrief(): House DNA as defaults, project notes with priority. The
// block appears whenever the switch is on, exactly like the original.
export function buildPreferenceBlock(input: {
  dna: ReferenceDna;
  preferences: ReferencePreferences;
}): string {
  const dna = input.preferences.includeDna
    ? [
        "General preferences (defaults, not absolute rules):",
        ...input.dna.constants.map((entry) => `- ${entry}`),
        `Usually avoid: ${input.dna.never.join("; ")}.`,
      ].join("\n")
    : "";
  const overrides = input.preferences.overrides.trim();
  return [
    dna,
    overrides === "" ? "" : `Project-specific directions (take priority):\n${overrides}`,
    PREFERENCE_TRAILER,
  ]
    .filter((part) => part !== "")
    .join("\n\n");
}

// Status line of the brief column (app.js:70).
export function preferenceStatus(preferences: ReferencePreferences): string {
  const dna = preferences.includeDna ? DNA_ON_HINT : DNA_OFF_HINT;
  return `${dna}${preferences.overrides.trim() === "" ? "" : PROJECT_NOTES_HINT}`;
}

// buildBrief(entries): one brief for one or several references.
export function buildReferenceBrief(input: {
  references: Reference[];
  dna: ReferenceDna;
  preferences: ReferencePreferences;
  baseUrl?: string | null;
}): ReferenceBrief {
  const options: BriefRenderOptions = { baseUrl: input.baseUrl ?? null };
  const sections = input.references
    .map((reference) => referenceBriefSection(reference, options))
    .join("\n\n---\n\n");
  const hint = input.references.length > 1 ? `${REFERENCE_SET_HINT}\n\n` : "";
  return {
    kind: "reference",
    text: briefText({
      sections,
      hint,
      dna: input.dna,
      preferences: input.preferences,
    }),
    status: preferenceStatus(input.preferences),
    referenceIds: input.references.map((reference) => reference.id),
    collectionId: input.references[0]?.collectionId ?? null,
  };
}

// styleBrief(id) for the style families of the style guide.
export function buildStyleFamilyBrief(input: {
  collection: ReferenceCollection;
  dna: ReferenceDna;
  preferences: ReferencePreferences;
  baseUrl?: string | null;
}): ReferenceBrief {
  const collection = input.collection;
  const references = collectionReferences(collection);
  const text = [
    STYLE_HEADER,
    [
      `Aesthetic: ${collection.name}`,
      ...(collection.vocabulary.length === 0
        ? []
        : [`Vocabulary: ${collection.vocabulary.join(", ")}`]),
      ...(references === "" ? [] : [`References: ${references}`]),
      ...(filled(collection.risk)
        ? [`Direction to explore: ${collection.risk}`]
        : []),
      `Image direction: ${
        filled(collection.imageStyle) ? collection.imageStyle : IMAGE_DIRECTION_FALLBACK
      }`,
    ].join("\n"),
    buildPreferenceBlock({ dna: input.dna, preferences: input.preferences }),
    STYLE_INSTRUCTION,
  ].join("\n\n");
  return {
    kind: "collection",
    text,
    status: preferenceStatus(input.preferences),
    referenceIds: [],
    collectionId: collection.id,
  };
}

// The collection brief ("About this collection"): the head carries name,
// description, vocabulary and the direction to explore, then the briefs of all
// its references follow. A style family is a collection of kind "style" and
// briefs like one (app.js:121 and app.js:84).
export function buildCollectionBrief(input: {
  collection: ReferenceCollection;
  references: Reference[];
  dna: ReferenceDna;
  preferences: ReferencePreferences;
  baseUrl?: string | null;
}): ReferenceBrief {
  const collection = input.collection;
  if (collection.kind === "style") {
    return buildStyleFamilyBrief({
      collection,
      dna: input.dna,
      preferences: input.preferences,
    });
  }
  const options: BriefRenderOptions = { baseUrl: input.baseUrl ?? null };
  const head = [
    `Collection: ${collection.name}`,
    ...(filled(collection.description) ? [collection.description] : []),
    ...(collection.vocabulary.length === 0
      ? []
      : [`Vocabulary: ${collection.vocabulary.join(", ")}`]),
    ...(filled(collection.risk) ? [`Direction to explore: ${collection.risk}`] : []),
  ].join("\n");
  const sections = input.references
    .map((reference) => referenceBriefSection(reference, options))
    .join("\n\n---\n\n");
  return {
    kind: "collection",
    text: [
      head,
      briefText({
        sections,
        hint: "",
        dna: input.dna,
        preferences: input.preferences,
      }),
    ].join("\n\n"),
    status: preferenceStatus(input.preferences),
    referenceIds: input.references.map((reference) => reference.id),
    collectionId: collection.id,
  };
}

// The shared skeleton of buildBrief: header, entry sections, the optional
// reference-set hint with the preference block, then the closing instruction.
function briefText(input: {
  sections: string;
  hint: string;
  dna: ReferenceDna;
  preferences: ReferencePreferences;
}): string {
  return [
    BUILD_HEADER,
    input.sections,
    `${input.hint}${buildPreferenceBlock({
      dna: input.dna,
      preferences: input.preferences,
    })}`,
    WORK_INSTRUCTION,
  ]
    .filter((part) => part !== "")
    .join("\n\n");
}

// imagePrompt(entry): null when neither the entry nor the collection has a
// recipe - the surface keeps the copy button disabled then. Without a measured
// composition the prompt drops that line instead of printing the fallback,
// which only repeats what a style reference is.
export function buildImagePrompt(
  reference: Reference,
  options: BriefRenderOptions = {},
): string | null {
  const recipe = referenceImageRecipe(reference);
  if (recipe === null) return null;
  const composition = filled(reference.heroUsage)
    ? [`Composition: ${reference.heroUsage}`]
    : [];
  return [
    recipe,
    ...composition,
    `Use ${referenceScreenshotPath(
      reference,
      options,
    )} as a style reference. Match treatment, texture, palette and balance while adapting the subject to our project. Return the artwork asset only; keep interface text and controls in code.`,
  ].join("\n\n");
}
