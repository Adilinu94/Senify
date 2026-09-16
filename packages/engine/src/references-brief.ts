import type {
  Reference,
  ReferenceBrief,
  ReferenceCollection,
  ReferenceDna,
  ReferencePreferences,
} from "./types.ts";

// The briefs of the reference design library (`app.js:81-85`), rebuilt on the
// engine so the surface and the MCP tools emit the same text. The wording stays
// English on purpose: the coding assistants expect it. Missing entry values
// fall back to the collection, exactly like the reference library does.

const COMPOSITION_FALLBACK = "Use the reference image for composition.";
const IMAGE_COMPOSITION_FALLBACK = "Use the reference composition.";
const NOTE_FALLBACK = "A visual reference for your next project.";
const IMAGE_DIRECTION_FALLBACK = "Use type and layout to lead.";
const DNA_OFF_HINT = "Reference-led brief · House DNA is off.";
const DNA_ON_HINT = "Includes your general preferences.";
const PROJECT_NOTES_HINT = " Project notes included.";

const BUILD_HEADER = [
  "Build [describe the website or product] for [audience].",
  "Primary action: [what the visitor should do].",
  "Required content: [sections and copy].",
].join("\n");

// Mehrere Referenzen sind ein Satz, keine Mischung: der Hinweis stammt
// wortgleich aus dem Vorbild.
const REFERENCE_SET_HINT =
  "Use these as a reference set. If they represent different aesthetics, create one direction per reference before choosing one; do not automatically blend them.";

const WORK_INSTRUCTION =
  "Read the reference images before designing. Borrow their visual treatment and hierarchy; write for our product and use our content. Do not reuse sample claims or endorsements. Generate original image assets where useful with the available image-generation tool, using the recipes and composition notes. Build real responsive HTML text, controls, and components around those assets. Verify the result in a browser on desktop and mobile.";

const COLLECTION_HEADER = [
  "Build [project] for [audience].",
  "Primary action: [action].",
].join("\n");

const COLLECTION_INSTRUCTION =
  "Implement as a responsive interface and verify desktop and mobile in a browser.";

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

// entrySection of the reference library, with the collection as the fallback
// for family, vocabulary and image recipe.
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
    `What to borrow: ${reference.note ?? NOTE_FALLBACK}`,
    `Composition: ${reference.heroUsage ?? COMPOSITION_FALLBACK}`,
    ...(recipe === null ? [] : [`Image recipe: ${recipe}`]),
  ].join("\n");
}

// preferenceBrief(): House DNA as defaults, project notes with priority. The
// DNA block only appears when the switch is on and the DNA has an entry at all.
export function buildPreferenceBlock(input: {
  dna: ReferenceDna;
  preferences: ReferencePreferences;
}): string {
  const constants = input.dna.constants.filter((entry) => entry.trim() !== "");
  const never = input.dna.never.filter((entry) => entry.trim() !== "");
  const dna =
    input.preferences.includeDna && (constants.length > 0 || never.length > 0)
      ? [
          "General preferences (defaults, not absolute rules):",
          ...constants.map((entry) => `- ${entry}`),
          `Usually avoid: ${never.join("; ")}.`,
        ].join("\n")
      : "";
  const overrides = input.preferences.overrides.trim();
  return [
    dna,
    overrides === ""
      ? ""
      : `Project-specific directions (take priority):\n${overrides}`,
    "Follow the selected references and explicit project directions when they differ from general preferences.",
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
  const text = `${BUILD_HEADER}\n\n${sections}\n\n${hint}${buildPreferenceBlock({
    dna: input.dna,
    preferences: input.preferences,
  })}\n\n${WORK_INSTRUCTION}`;
  return {
    kind: "reference",
    text,
    status: preferenceStatus(input.preferences),
    referenceIds: input.references.map((reference) => reference.id),
    collectionId: input.references[0]?.collectionId ?? null,
  };
}

// styleBrief(id) for collections, including the seeded style families.
export function buildCollectionBrief(input: {
  collection: ReferenceCollection;
  dna: ReferenceDna;
  preferences: ReferencePreferences;
}): ReferenceBrief {
  const collection = input.collection;
  const references = collectionReferences(collection);
  const text = [
    COLLECTION_HEADER,
    [
      `Aesthetic: ${collection.name}`,
      ...(collection.vocabulary.length === 0
        ? []
        : [`Vocabulary: ${collection.vocabulary.join(", ")}`]),
      ...(references === "" ? [] : [`References: ${references}`]),
      ...(collection.risk.trim() === ""
        ? []
        : [`Direction to explore: ${collection.risk}`]),
      `Image direction: ${collection.imageStyle.trim() === "" ? IMAGE_DIRECTION_FALLBACK : collection.imageStyle}`,
    ].join("\n"),
    buildPreferenceBlock({ dna: input.dna, preferences: input.preferences }),
    COLLECTION_INSTRUCTION,
  ].join("\n\n");
  return {
    kind: "collection",
    text,
    status: preferenceStatus(input.preferences),
    referenceIds: [],
    collectionId: collection.id,
  };
}

// imagePrompt(entry): null when neither the entry nor the collection has a
// recipe - the surface keeps the copy button disabled then.
export function buildImagePrompt(reference: Reference): string | null {
  const recipe = referenceImageRecipe(reference);
  if (recipe === null) return null;
  const composition = reference.heroUsage ?? IMAGE_COMPOSITION_FALLBACK;
  return `${recipe}\n\nComposition: ${composition}\n\nUse ${referenceScreenshotPath(
    reference,
  )} as a style reference. Match treatment, texture, palette and balance while adapting the subject to our project. Return the artwork asset only; keep interface text and controls in code.`;
}
