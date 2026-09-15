import {
  buildStyleBrief,
  clampAnalyzerOutput,
  mergeComponents,
  referenceGuardrails,
  type AnalyzerOutput,
} from "./references-analyze.ts";
import { mergeEvidence, weakestEvidenceLevel } from "./references-evidence.ts";
import type { ReferenceExtraction } from "./references-extract.ts";
import type { EvidenceLevel, ReferenceEvidence, ReferenceProfile } from "./types.ts";

// Assembly of the design profile: measured tokens (deterministic) + classified
// descriptions (analyzer). Nothing is invented here, and the evidence of the
// merged claims can only get weaker.

const PROTECTED_RULES: readonly string[] = [
  "Logos und Marken-Assets nie uebernehmen",
  "Originaltexte nie uebernehmen",
  "Fotos nie uebernehmen",
  "1:1-Layouts nie uebernehmen",
];

const MIN_VOCABULARY = 5;
const MAX_VOCABULARY = 8;

export function buildReferenceProfile(input: {
  url: string;
  capturedAt: string;
  extraction: ReferenceExtraction;
  analyzer: AnalyzerOutput;
}): { profile: ReferenceProfile; evidence: ReferenceEvidence[] } {
  const analyzer = clampAnalyzerOutput(input.analyzer);
  const vocabulary = normalizeVocabulary(analyzer.vocabulary, input.extraction);
  const evidence = mergeEvidence(input.extraction.evidence, analyzer.claims);
  const evidenceLevel: EvidenceLevel = weakestEvidenceLevel(
    evidence.length === 0 ? ["inferred"] : evidence.map((entry) => entry.level),
  );
  const base = {
    tokens: input.extraction.tokens,
    breakpoints: input.extraction.breakpoints,
    customProperties: input.extraction.customProperties,
    motion: input.extraction.motion,
    surfaces: input.extraction.surfaces,
    libraries: input.extraction.libraries,
    assets: input.extraction.assets,
    components: mergeComponents(input.extraction.components, analyzer.components, "observed"),
    families: analyzer.families,
    vocabulary,
    rules: {
      constants: analyzer.rules.constants,
      never: [...new Set([...analyzer.rules.never, ...PROTECTED_RULES])],
    },
    reduced: input.extraction.reduced,
  };
  const guardrails = referenceGuardrails({
    profile: base,
    fontFamilies: [
      ...input.extraction.signals.fontFamilies,
      ...input.extraction.assets.filter((asset) => asset.kind === "font").map((asset) => asset.ref),
    ],
    externalFontHosts: input.extraction.signals.externalFontHosts,
  });
  const profile: ReferenceProfile = {
    ...base,
    guardrails,
    styleBrief: buildStyleBrief({
      url: input.url,
      capturedAt: input.capturedAt,
      method: input.extraction.reduced ? "snapshot" : "playwright",
      profile: base,
      evidenceLevel,
    }),
  };
  return { profile, evidence };
}

// The vocabulary stays prompt-ready: 5-8 terms, no duplicates, padded from the
// measured extract instead of inventing new ones.
export function normalizeVocabulary(
  vocabulary: readonly string[],
  extraction: ReferenceExtraction,
): string[] {
  const terms = [
    ...new Set(
      vocabulary
        .map((term) => term.trim().toLowerCase().replace(/\s+/g, " "))
        .filter((term) => term !== "" && term.length <= 60),
    ),
  ];
  for (const filler of [
    ...extraction.components.map((component) => component.name),
    ...extraction.tokens.families.slice(0, 1).map((token) => token.value.split(",")[0] ?? ""),
    ...extraction.motion.filter((recipe) => recipe.preset !== null).slice(0, 1).map((recipe) => recipe.preset ?? ""),
    ...extraction.tokens.color.slice(0, 1).map((token) => token.value),
  ]) {
    if (terms.length >= MIN_VOCABULARY) break;
    const term = filler.trim().toLowerCase();
    if (term !== "" && !terms.includes(term)) terms.push(term);
  }
  return terms.slice(0, MAX_VOCABULARY);
}
