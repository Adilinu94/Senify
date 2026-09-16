import type {
  Reference,
  ReferenceBrief,
  ReferenceCollection,
  ReferenceDna,
  ReferencePreferences,
} from "./types.ts";

// The briefs of the reference design library, ported verbatim from the original
// templates (Taste Vault by cth9191, MIT licence → `app.js:81-85` and the
// collection brief of the "About this collection" dialog at `app.js:121`):
// `entrySection`, `buildBrief`, `preferenceBrief`, `styleBrief` and `imagePrompt`.
// The wording stays English on purpose: the coding assistants expect it. The only
// fallbacks are the ones the originals carry, and they kick in merely when a field
// is really empty; everything else (family, vocabulary, recipe) falls back to the
// collection, exactly like the reference library does.

const COMPOSITION_FALLBACK = "Use the reference image for composition.";
const IMAGE_COMPOSITION_FALLBACK = "Use the reference composition.";
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

// The screenshot of the brief: the stored snapshot preview, else the analysis
// URL (the reference library prints its image path the same way).
export function referenceScreenshotPath(reference: Reference): string {
  const snapshot = reference.snapshots.find(
    (entry) => entry.previewPath !== undefined,
  );
  return snapshot?.previewPath ?? reference.sourceUrl;
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
export function referenceBriefSection(reference: Reference): string {
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
    `Screenshot: ${referenceScreenshotPath(reference)}`,
    ...(aesthetic === null ? [] : [`Aesthetic: ${aesthetic}`]),
    ...(vocabulary.length === 0 ? [] : [`Vocabulary: ${vocabulary.join(", ")}`]),
    ...(filled(reference.note) ? [`What to borrow: ${reference.note}`] : []),
    `Composition: ${
      filled(reference.heroUsage) ? reference.heroUsage : COMPOSITION_FALLBACK
    }`,
    ...(recipe === null ? [] : [`Image recipe: ${recipe}`]),
  ].join("\n");
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
}): ReferenceBrief {
  const sections = input.references
    .map(referenceBriefSection)
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
}): ReferenceBrief {
  const collection = input.collection;
  if (collection.kind === "style") {
    return buildStyleFamilyBrief({
      collection,
      dna: input.dna,
      preferences: input.preferences,
    });
  }
  const head = [
    `Collection: ${collection.name}`,
    ...(filled(collection.description) ? [collection.description] : []),
    ...(collection.vocabulary.length === 0
      ? []
      : [`Vocabulary: ${collection.vocabulary.join(", ")}`]),
    ...(filled(collection.risk) ? [`Direction to explore: ${collection.risk}`] : []),
  ].join("\n");
  const sections = input.references
    .map(referenceBriefSection)
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
// recipe - the surface keeps the copy button disabled then.
export function buildImagePrompt(reference: Reference): string | null {
  const recipe = referenceImageRecipe(reference);
  if (recipe === null) return null;
  const composition = filled(reference.heroUsage)
    ? reference.heroUsage
    : IMAGE_COMPOSITION_FALLBACK;
  return `${recipe}\n\nComposition: ${composition}\n\nUse ${referenceScreenshotPath(
    reference,
  )} as a style reference. Match treatment, texture, palette and balance while adapting the subject to our project. Return the artwork asset only; keep interface text and controls in code.`;
}
