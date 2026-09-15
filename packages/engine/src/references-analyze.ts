import { SenifyError } from "@senify/core";
import type { Theme } from "@senify/tokens";
import { capEvidenceLevel, tokenClaim, weakestEvidenceLevel } from "./references-evidence.ts";
import type { ReferenceExtraction } from "./references-extract.ts";
import type {
  CheckIssue,
  EvidenceLevel,
  ReferenceComponent,
  ReferenceEvidence,
  ReferenceGuardrailFinding,
  ReferenceProfile,
  ReferenceScale,
} from "./types.ts";

// AI analysis layer (artifacts/28 §1 step 3): the analyzer classifies and
// describes — it never invents values. It is injectable, so tests run against
// a fixed fake and the platform can swap in an LLM without touching the pipeline.

// The 18-family seed taxonomy (research/27 §5.2, taste-vault styles.json).
export const REFERENCE_FAMILIES: readonly string[] = [
  "minimal-editorial",
  "swiss-grid",
  "bauhaus-geometric",
  "brutalist",
  "neo-brutalist",
  "dark-tech",
  "glassmorphism",
  "editorial-magazine",
  "luxury-serif",
  "scandinavian-calm",
  "japanese-zen",
  "organic-natural",
  "maximalist-collage",
  "neo-memphis",
  "y2k-gradient",
  "retro-terminal",
  "swiss-corporate",
  "soft-clay",
];

const FAMILY_RULES: Record<string, { constants: string[]; never: string[] }> = {
  "minimal-editorial": {
    constants: [
      "Wenige Farben, ein Akzent",
      "Grosszuegiger Weissraum um Fliesstext",
    ],
    never: ["Keine dekorativen Verlaeufe ohne Funktion"],
  },
  "swiss-grid": {
    constants: ["Strenges Spaltenraster", "Linksausrichtung statt Zentrierung"],
    never: ["Keine willkuerlichen Abstaende ausserhalb des Rasters"],
  },
  "bauhaus-geometric": {
    constants: ["Primaerfarben mit Schwarz/Weiss", "Geometrische Grundformen"],
    never: ["Keine organischen Formen"],
  },
  brutalist: {
    constants: ["Rohe Typografie, harte Kanten", "Hoher Kontrast"],
    never: ["Keine Schatten und Rundungen als Dekor"],
  },
  "neo-brutalist": {
    constants: ["Harte Kanten mit kraeftigem Akzent", "Sichtbare Konturen"],
    never: ["Keine weichen Schatten"],
  },
  "dark-tech": {
    constants: ["Dunkle Flaechen mit leuchtendem Akzent", "Technische Mono-Details"],
    never: ["Kein reines Weiss als Grundflaeche"],
  },
  glassmorphism: {
    constants: ["Transluzenz mit Blur", "Feine Lichtkanten"],
    never: ["Kein Blur auf Fliesstext"],
  },
  "editorial-magazine": {
    constants: ["Serife in Headlines", "Bild-Text-Wechsel im Raster"],
    never: ["Keine identischen Karten-Wiederholungen ohne Rhythmus"],
  },
  "luxury-serif": {
    constants: ["Serifen-Display mit viel Weissraum", "Gedeckte warme Neutrale"],
    never: ["Keine grellen Akzente"],
  },
  "scandinavian-calm": {
    constants: ["Helle Neutrale, niedriger Kontrast", "Ruhige Abstaende"],
    never: ["Keine harten Schatten"],
  },
  "japanese-zen": {
    constants: ["Asymmetrische Ruhe", "Viel Leerraum"],
    never: ["Keine laute Dekoration"],
  },
  "organic-natural": {
    constants: ["Erdige Palette", "Runde Formen"],
    never: ["Keine harten Neonakzente"],
  },
  "maximalist-collage": {
    constants: ["Viele Ebenen und Texturen", "Ueberlagerte Elemente"],
    never: ["Keine leere Standard-Karte"],
  },
  "neo-memphis": {
    constants: ["Verspielte Formen und Muster", "Kraeftige Farbkombinationen"],
    never: ["Keine Monochrom-Ruhe"],
  },
  "y2k-gradient": {
    constants: ["Verlaeufe als Leitmotiv", "Glanzkanten"],
    never: ["Keine matten Flaechen als Hauptmotiv"],
  },
  "retro-terminal": {
    constants: ["Monospace-Typografie", "Terminal-Gruen oder Amber auf Dunkel"],
    never: ["Keine bildlastigen Hero-Flaechen"],
  },
  "swiss-corporate": {
    constants: ["Klare Sans-Serif-Hierarchie", "Blauer oder neutraler Akzent"],
    never: ["Keine spielerischen Formen"],
  },
  "soft-clay": {
    constants: ["Weiche Schatten", "Pastellpalette"],
    never: ["Keine harten Kanten"],
  },
};

const OPEN_FONTS: readonly string[] = [
  "inter",
  "sora",
  "manrope",
  "space grotesk",
  "dm sans",
  "ibm plex sans",
  "source sans 3",
  "lora",
  "playfair display",
  "merriweather",
  "roboto",
  "open sans",
  "work sans",
  "figtree",
  "jetbrains mono",
  "ibm plex mono",
  "geist",
];

export type AnalyzerInput = {
  url: string;
  name: string;
  extraction: ReferenceExtraction;
};

export type AnalyzerComponent = { name: string; variants: string[] };

export type AnalyzerOutput = {
  families: string[];
  vocabulary: string[];
  components: AnalyzerComponent[];
  rules: { constants: string[]; never: string[] };
  claims: ReferenceEvidence[];
  notes: string[];
  model: string;
};

export type ReferenceAnalyzer = (input: AnalyzerInput) => Promise<AnalyzerOutput>;

// ------------------------------------------------------------ family cues

export function classifyFamilies(extraction: ReferenceExtraction): string[] {
  const { signals, tokens } = extraction;
  const colorCount = tokens.color.length;
  const mono = signals.monoBody;
  const serif = signals.serifDisplay;
  const dark = signals.darkBackground;
  const blur = signals.hasBlur;
  const saturated = tokens.color.some((token) => isSaturatedColor(token.value));
  const zeroRadius = tokens.radius.some((token) => /^0(px|rem|em)?$/.test(token.value));
  const families: string[] = [];
  if (dark && (mono || saturated)) families.push("dark-tech");
  if (mono && dark) families.push("retro-terminal");
  if (blur) families.push("glassmorphism");
  if (serif) families.push("luxury-serif");
  if (serif && signals.images >= 3) families.push("editorial-magazine");
  if (zeroRadius && !blur) families.push("brutalist");
  if (!serif && colorCount <= 5 && !blur && !dark) families.push("minimal-editorial");
  if (!serif && zeroRadius && signals.images <= 2) families.push("swiss-grid");
  if (signals.images >= 8 && colorCount >= 8) families.push("maximalist-collage");
  if (families.length === 0) families.push(!serif && !dark ? "swiss-corporate" : "dark-tech");
  return [...new Set(families)].slice(0, 3);
}

function isSaturatedColor(input: string): boolean {
  const match = input.match(/^#([0-9a-f]{6})$/i);
  if (!match) return false;
  const value = Number.parseInt(match[1] ?? "000000", 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min > 60;
}

// ------------------------------------------------------------ analyzers

export function heuristicAnalyzer(): ReferenceAnalyzer {
  return async (input) => {
    const families = classifyFamilies(input.extraction);
    const vocabulary = vocabularyFromExtraction(input.extraction, families);
    const components = input.extraction.components;
    const rules = rulesForFamilies(families);
    const claims: ReferenceEvidence[] = [
      {
        claim: tokenClaim("ai.families", families.join("+")),
        level: "inferred",
        source: "heuristic-analyzer",
      },
      {
        claim: tokenClaim("ai.vocabulary", vocabulary.slice(0, 3).join("+")),
        level: "inferred",
        source: "heuristic-analyzer",
      },
      {
        claim: tokenClaim("ai.components", components.length === 0 ? "none" : String(components.length)),
        level: "inferred",
        source: "heuristic-analyzer",
      },
    ];
    return {
      families,
      vocabulary,
      components,
      rules,
      claims,
      notes: [
        "Heuristische Klassifikation (kein LLM konfiguriert): Familien aus gemessenen Cues abgeleitet.",
      ],
      model: "heuristic",
    };
  };
}

// Deterministic fallback vocabulary: prompt-ready, 5-8 terms, English nouns.
function vocabularyFromExtraction(
  extraction: ReferenceExtraction,
  families: string[],
): string[] {
  const vocabulary: string[] = [];
  for (const family of families) vocabulary.push(family);
  const colorRole = extraction.tokens.color[0];
  if (colorRole) vocabulary.push(describeColor(colorRole.value));
  const familyToken = extraction.tokens.families[0];
  if (familyToken) vocabulary.push(describeFont(familyToken.value));
  const space = extraction.tokens.space[0];
  if (space) vocabulary.push(/^[0-9.]+(px|rem)$/.test(space.value) ? "tight spacing" : "spacious rhythm");
  const radius = extraction.tokens.radius[0];
  if (radius) vocabulary.push(/^0(px|rem)?$/.test(radius.value) ? "hard edges" : "soft corners");
  const motion = extraction.motion[0];
  if (motion) vocabulary.push(motion.preset ?? motion.name);
  for (const surface of extraction.surfaces) {
    if (surface.kind === "canvas" || surface.kind === "webgl" || surface.kind === "webgpu") {
      vocabulary.push("canvas surface");
      break;
    }
  }
  return vocabulary.slice(0, 8);
}

function describeColor(value: string): string {
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) return "brand color";
  const parsed = Number.parseInt(match[1] ?? "000000", 16);
  const r = (parsed >> 16) & 0xff;
  const g = (parsed >> 8) & 0xff;
  const b = parsed & 0xff;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 60) return "deep neutral";
  if (min > 200) return "airy light";
  if (max - min < 25) return "calm neutral";
  if (b >= r && b >= g) return "cool accent";
  if (r >= g && r >= b) return "warm accent";
  return "fresh accent";
}

function describeFont(value: string): string {
  const key = value.toLowerCase();
  if (/mono/.test(key)) return "monospace voice";
  if (/serif|georgia|times/.test(key)) return "serif voice";
  if (/grotesk|helvetica|arial|inter/.test(key)) return "neutral sans";
  return "sans voice";
}

export function rulesForFamilies(families: readonly string[]): {
  constants: string[];
  never: string[];
} {
  const constants: string[] = [];
  const never: string[] = [];
  for (const family of families) {
    const rules = FAMILY_RULES[family];
    if (!rules) continue;
    constants.push(...rules.constants);
    never.push(...rules.never);
  }
  return {
    constants: [...new Set(constants)].slice(0, 8),
    never: [...new Set(never)].slice(0, 8),
  };
}

export type ReferenceLlmConfig = {
  endpoint: string;
  model: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

// OpenAI-compatible endpoint (same shape as the docs-portal "Ask AI" BYOK
// config): the model picks families/vocabulary from the measured extract.
export function createLlmReferenceAnalyzer(config: ReferenceLlmConfig): ReferenceAnalyzer {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  return async (input) => {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey === undefined || config.apiKey === ""
          ? {}
          : { authorization: `Bearer ${config.apiKey}` }),
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Du klassifizierst Design-Referenzen fuer ein Designsystem. Antworte NUR mit JSON: {\"families\":[..],\"vocabulary\":[5-8 prompt-faehige englische Begriffe],\"components\":[{\"name\",\"variants\":[]}],\"rules\":{\"constants\":[],\"never\":[]},\"notes\":[]}. Erfinde keine Werte - nutze nur die gemessenen Daten. Deutsch mit englischen Fachbegriffen.",
          },
          {
            role: "user",
            content: JSON.stringify({
              url: input.url,
              familiesHit: input.extraction.tokens.families.map((token) => token.value).slice(0, 3),
              colors: input.extraction.tokens.color.slice(0, 8),
              typeScale: input.extraction.tokens.type.slice(0, 8),
              customProperties: input.extraction.customProperties.slice(0, 20),
              motion: input.extraction.motion.slice(0, 10),
              surfaces: input.extraction.surfaces,
              components: input.extraction.components.map((component) => component.name),
              signals: input.extraction.signals,
            }),
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new SenifyError(
        "validation",
        `LLM analysis failed with status ${response.status}`,
        {
          field: "reference",
          suggestion:
            "Check the LLM endpoint/model configuration, or run without an analyzer (heuristic fallback).",
        },
      );
    }
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content ?? "";
    const parsed = parseAnalyzerJson(text);
    return clampAnalyzerOutput({
      families: parsed.families,
      vocabulary: parsed.vocabulary,
      components: parsed.components,
      rules: parsed.rules,
      claims: [
        ...parsed.families.map((family) => ({
          claim: tokenClaim("ai.families", family),
          level: "inferred" as EvidenceLevel,
          source: `llm:${config.model}`,
        })),
      ],
      notes: parsed.notes,
      model: config.model,
    });
  };
}

type ParsedAnalyzer = {
  families: string[];
  vocabulary: string[];
  components: AnalyzerComponent[];
  rules: { constants: string[]; never: string[] };
  notes: string[];
};

export function parseAnalyzerJson(text: string): ParsedAnalyzer {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new SenifyError("validation", "Analyzer response is not JSON", {
      field: "reference",
      suggestion: "The model must answer with a JSON object.",
    });
  }
  const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  const components = Array.isArray(parsed.components)
    ? parsed.components
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
        .map((entry) => ({
          name: typeof entry.name === "string" ? entry.name : "unknown",
          variants: strings(entry.variants),
        }))
    : [];
  const rules =
    parsed.rules && typeof parsed.rules === "object"
      ? (parsed.rules as Record<string, unknown>)
      : {};
  return {
    families: strings(parsed.families),
    vocabulary: strings(parsed.vocabulary),
    components,
    rules: { constants: strings(rules.constants), never: strings(rules.never) },
    notes: strings(parsed.notes),
  };
}

// Model output is capped at "inferred": it is an interpretation of the measured
// extract, never a measurement (never upgrade a tag).
export function clampAnalyzerOutput(output: AnalyzerOutput): AnalyzerOutput {
  const families = [...new Set(output.families.filter((family) => REFERENCE_FAMILIES.includes(family)))].slice(0, 4);
  const vocabulary = [...new Set(output.vocabulary.map((term) => term.trim().toLowerCase()))]
    .filter((term) => term !== "")
    .slice(0, 8);
  return {
    ...output,
    families: families.length > 0 ? families : output.families.slice(0, 1),
    vocabulary: vocabulary.length >= 5 ? vocabulary : padVocabulary(vocabulary),
    components: output.components.slice(0, 40),
    rules: {
      constants: output.rules.constants.slice(0, 8),
      never: output.rules.never.slice(0, 8),
    },
    claims: output.claims.map((claim) => ({
      ...claim,
      level: capEvidenceLevel(claim.level, "inferred"),
    })),
  };
}

function padVocabulary(vocabulary: string[]): string[] {
  const filler = ["measured palette", "measured type scale", "measured spacing", "reduced profile", "inspiration only"];
  const padded = [...vocabulary];
  for (const term of filler) {
    if (padded.length >= 5) break;
    if (!padded.includes(term)) padded.push(term);
  }
  return padded;
}

// ------------------------------------------------------------ style brief

export function buildStyleBrief(input: {
  url: string;
  capturedAt: string;
  method: string;
  profile: Omit<ReferenceProfile, "styleBrief" | "guardrails">;
  evidenceLevel: EvidenceLevel;
}): string {
  const { profile } = input;
  const colors = profile.tokens.color
    .slice(0, 3)
    .map((token) => `${token.role ?? "value"} ${token.value} (x${token.uses})`);
  const type = profile.tokens.type
    .slice(0, 3)
    .map((step) => `${step.role} ${step.size}`);
  const fonts = profile.tokens.families.slice(0, 2).map((token) => token.value);
  const motion = profile.motion
    .filter((recipe) => recipe.preset !== null)
    .slice(0, 3)
    .map((recipe) => `${recipe.preset}(${recipe.trigger})`);
  return [
    `Reference ${input.url} (${input.method}, captured ${input.capturedAt}, evidence ${input.evidenceLevel}).`,
    `Families: ${profile.families.join(", ") || "unclassified"}.`,
    `Vocabulary: ${profile.vocabulary.join(", ") || "none"}.`,
    `Palette: ${colors.join("; ") || "not measured"}.`,
    `Type: ${fonts.join(", ") || "not measured"}${type.length > 0 ? ` - ${type.join(", ")}` : ""}.`,
    `Spacing/Radius: ${profile.tokens.space[0]?.value ?? "n/a"} / ${profile.tokens.radius[0]?.value ?? "n/a"}.`,
    `Motion: ${motion.join(", ") || (profile.motion.length === 0 ? "none measured" : "custom recipes")}.`,
    `Components: ${profile.components.map((component) => component.name).join(", ") || "none detected"}.`,
    `Constants: ${profile.rules.constants.join("; ") || "none"}.`,
    `Never: ${profile.rules.never.join("; ") || "none"}.`,
    `Constraints: Designsystem-Inspiration, no logos/brand assets/photos/original copy/1:1 layouts.`,
    profile.reduced ? `Note: reduced profile (snapshot fallback) - runtime values are not measured.` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

// ------------------------------------------------------------ Schutzregeln

export function referenceGuardrails(input: {
  profile: Omit<ReferenceProfile, "styleBrief" | "guardrails">;
  fontFamilies: string[];
  externalFontHosts: string[];
}): ReferenceGuardrailFinding[] {
  const findings: ReferenceGuardrailFinding[] = [];
  const identity = input.profile.assets.filter(
    (asset) => asset.identityRisk || asset.kind === "logo" || asset.kind === "icon",
  );
  if (identity.length > 0) {
    findings.push({
      code: "brand-assets",
      severity: "hard",
      message: `${identity.length} potenzielle Marken-/Identitaets-Assets erkannt (Logos, Favicon, Wordmarks)`,
      suggestion:
        "Niemals uebernehmen: eigene Marken-Assets verwenden (Beispiel-Assets sind Platzhalter).",
    });
  }
  const photos = input.profile.assets.filter((asset) => asset.kind === "image");
  if (photos.length > 0) {
    findings.push({
      code: "photo-assets",
      severity: "soft",
      message: `${photos.length} Bild-Assets in der Referenz`,
      suggestion: "Fotos nie 1:1 uebernehmen - eigene/lizenzierte Motive einsetzen.",
    });
  }
  const licensed = input.fontFamilies.filter(
    (family) => !OPEN_FONTS.some((font) => family.toLowerCase().includes(font)),
  );
  if (licensed.length > 0 || input.externalFontHosts.length > 0) {
    findings.push({
      code: "license-font",
      severity: "soft",
      message:
        licensed.length > 0
          ? `Schrift nicht als Open Font gefuehrt: ${licensed.slice(0, 3).join(", ")}`
          : `Schriften von externen Hosts geladen: ${input.externalFontHosts.join(", ")}`,
      suggestion:
        "Lizenz pruefen und metrik-kompatibles Open-Font-Paar self-hosten (nie die Originaldateien ausliefern).",
    });
  }
  findings.push({
    code: "original-copy",
    severity: "soft",
    message: "Originaltexte und identische Layouts der Referenz werden nie uebernommen",
    suggestion:
      "Copy-Form behalten (+/-20% Headline-Laenge), Inhalt ersetzen; Designsystem generalisieren statt Klon.",
  });
  const sectionCount = input.profile.tokens.color.length + input.profile.components.length;
  if (sectionCount >= 6) {
    findings.push({
      code: "proximity-warning",
      severity: "soft",
      message: `Hoher Abdeckungsgrad (${sectionCount} Signale): Naehe zur Referenz pruefen`,
      suggestion:
        "Too-close-Repair: mindestens drei Faecher bewusst abweichen lassen (Palette-Mood, Type-Pairing, Hero-Treatment, Density, Motion-Personality, Surface).",
    });
  }
  return findings;
}

// Soft QA hint for the review: how far the site theme drifted from the profile.
export function referenceAdherenceIssues(input: {
  referenceId: string;
  referenceName: string;
  profile: ReferenceProfile;
  theme: Theme;
  scales: readonly ReferenceScale[];
}): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const base = {
    code: "reference-adherence",
    severity: "soft" as const,
    field: "theme",
  };
  if (input.scales.includes("type")) {
    const body = input.profile.tokens.type.find((step) => step.role === "body") ?? input.profile.tokens.type[0];
    const size = body ? Number.parseFloat(body.size) : Number.NaN;
    const themeBase = input.theme.scales.typeBase;
    if (Number.isFinite(size) && size > 0 && themeBase !== undefined) {
      const ratio = themeBase / size;
      if (ratio < 0.75 || ratio > 1.25) {
        issues.push({
          ...base,
          message: `Theme-Typobasis ${themeBase}px weicht vom Referenz-Body (${body?.size}) ab`,
          suggestion: `Referenz "${input.referenceName}" zugeordnet (scale type): Typobasis angleichen oder Zuordnung bewusst entfernen.`,
        });
      }
    }
  }
  if (input.scales.includes("color")) {
    const accent = pickAccent(input.profile);
    if (accent !== null && colorDistance(accent, input.theme.scales.brand) > 90) {
      issues.push({
        ...base,
        message: `Theme-Brand ${input.theme.scales.brand} entfernt sich vom Referenz-Akzent ${accent}`,
        suggestion: `Referenz "${input.referenceName}" zugeordnet (scale color): bewusste Abweichung dokumentieren oder Brand angleichen.`,
      });
    }
  }
  if (input.scales.includes("motion")) {
    const durations = input.profile.motion
      .map((recipe) => recipe.params.duration ?? "")
      .filter((duration) => /ms$/.test(duration))
      .map((duration) => Number.parseFloat(duration));
    const shortest = durations.length > 0 ? Math.min(...durations) : Number.NaN;
    const themeBase = Number.parseFloat(input.theme.motion.duration.base ?? "");
    if (Number.isFinite(shortest) && Number.isFinite(themeBase)) {
      const ratio = themeBase / shortest;
      if (ratio < 0.5 || ratio > 2) {
        issues.push({
          ...base,
          message: `Motion-Dauer ${input.theme.motion.duration.base} weicht von der Referenz (${shortest}ms) ab`,
          suggestion: `Referenz "${input.referenceName}" zugeordnet (scale motion): Dauer-Kategorie angleichen oder Zuordnung entfernen.`,
        });
      }
    }
  }
  return issues;
}

function pickAccent(profile: ReferenceProfile): string | null {
  const accent = profile.tokens.color.find(
    (token) => token.role !== "bg" && token.role !== "text" && /^#[0-9a-f]{6}$/i.test(token.value),
  );
  const fallback = profile.tokens.color.find((token) => /^#[0-9a-f]{6}$/i.test(token.value));
  return (accent ?? fallback)?.value ?? null;
}

function colorDistance(a: string, b: string): number {
  const parse = (value: string): [number, number, number] | null => {
    const match = value.match(/^#([0-9a-f]{6})$/i);
    if (!match) return null;
    const parsed = Number.parseInt(match[1] ?? "000000", 16);
    return [(parsed >> 16) & 0xff, (parsed >> 8) & 0xff, parsed & 0xff];
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return 0;
  return Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2]);
}

// Components may also be merged from the analyzer: the extract's own inventory
// stays authoritative for evidence, the analyzer only adds names.
export function mergeComponents(
  fromExtraction: ReferenceComponent[],
  fromAnalyzer: AnalyzerComponent[],
  level: EvidenceLevel,
): ReferenceComponent[] {
  const merged = new Map<string, ReferenceComponent>();
  for (const component of fromExtraction) merged.set(component.name, component);
  for (const component of fromAnalyzer) {
    const existing = merged.get(component.name);
    if (existing) {
      merged.set(component.name, {
        name: existing.name,
        variants: [...new Set([...existing.variants, ...component.variants])],
        evidence: existing.evidence,
      });
      continue;
    }
    merged.set(component.name, {
      name: component.name,
      variants: component.variants,
      evidence: weakestEvidenceLevel([level, "inferred"]),
    });
  }
  return [...merged.values()].slice(0, 40);
}
