import type {
  ReferenceComponent,
  ReferenceEvidence,
  ReferenceMotionRecipe,
  ReferenceProfile,
  ReferenceToken,
  ReferenceTypeStep,
} from "./types.ts";
import { evidenceClaim, tokenClaim, weakestEvidenceLevel } from "./references-evidence.ts";
import { buildStyleBrief, referenceGuardrails } from "./references-analyze.ts";

// The design documents of the Framer template set (design.md,
// design-guidelines.md, design-components.md) as a reference profile.
//
// Imported references carry their numbers in tables and prose, not in a
// measured runtime: the parser reads the tables deterministically and tags
// every value with its evidence level. A row marked "(inferred)" stays
// inferred, a plain table row is observed. Nothing is invented, a missing
// family simply stays empty and the scale engine fills the gap.

export type DocumentProfileInput = {
  name: string;
  sourceUrl?: string | null;
  capturedAt?: string | null;
  design: string;
  guidelines?: string | null;
  components?: string | null;
};

export type DocumentProfile = {
  profile: ReferenceProfile;
  evidence: ReferenceEvidence[];
};

// ------------------------------------------------------------- markdown base

type Section = { title: string; lines: string[] };

// Split at the level-2 headings; the preamble before the first heading is the
// section with an empty title.
function sections(markdown: string): Section[] {
  const result: Section[] = [];
  let current: Section = { title: "", lines: [] };
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading !== null) {
      result.push(current);
      current = { title: (heading[1] ?? "").trim(), lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  result.push(current);
  return result;
}

function sectionWith(list: readonly Section[], pattern: RegExp): Section | null {
  return list.find((entry) => pattern.test(entry.title)) ?? null;
}

// Inline markdown out of the way: backticks, bold and link targets.
function inline(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

// The data rows of the first table in a section, without header and separator.
function tableRows(section: Section | null): string[][] {
  if (section === null) return [];
  const rows: string[][] = [];
  let separator = -1;
  for (const line of section.lines) {
    if (!line.trimStart().startsWith("|")) continue;
    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (separator === -1 && isSeparatorRow(cells)) {
      separator = rows.length;
    }
    rows.push(cells);
  }
  return separator === -1 ? rows : rows.slice(separator + 1);
}

function headerCells(section: Section | null): string[] {
  const rows = tableRows(section);
  if (rows.length === 0) return [];
  const all: string[][] = [];
  for (const line of (section?.lines ?? [])) {
    if (!line.trimStart().startsWith("|")) continue;
    all.push(
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
  }
  const index = all.findIndex(isSeparatorRow);
  return index <= 0 ? [] : (all[index - 1] ?? []).map((cell) => inline(cell).toLowerCase());
}

function cellIndex(header: readonly string[], pattern: RegExp, fallback: number): number {
  const index = header.findIndex((cell) => pattern.test(cell));
  return index === -1 ? fallback : index;
}

// Bullet lists of a section ("- item"), used for Do's/Don'ts.
function bullets(section: Section | null, limit: number): string[] {
  if (section === null) return [];
  const items: string[] = [];
  for (const line of section.lines) {
    const match = /^\s*(?:[-*]|\d+\.)\s+(.+)$/.exec(line);
    if (match === null) continue;
    const value = inline(match[1] ?? "");
    if (value === "" || items.includes(value)) continue;
    items.push(value);
    if (items.length >= limit) break;
  }
  return items;
}

function slug(value: string): string {
  return inline(value)
    .replace(/\([^)]*\)/g, " ")
    .split("/")[0]
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") ?? "";
}

function levelOf(raw: string): "observed" | "inferred" {
  return /inferred/i.test(raw) ? "inferred" : "observed";
}

function px(value: string): string | null {
  const match = /(\d+(?:\.\d+)?)\s*(px|rem|em)/i.exec(value);
  if (match === null) return null;
  return `${match[1]}${(match[2] ?? "").toLowerCase()}`;
}

// ------------------------------------------------------------- extraction

function colorsFrom(sections2: readonly Section[]): {
  tokens: ReferenceToken[];
  evidence: ReferenceEvidence[];
} {
  const tokens: ReferenceToken[] = [];
  const evidence: ReferenceEvidence[] = [];
  const seen = new Set<string>();
  for (const section of sections2) {
    if (!/color/i.test(section.title)) continue;
    for (const row of tableRows(section)) {
      const raw = row.join(" | ");
      const match = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(raw);
      if (match === null) continue;
      const hex = `#${(match[1] ?? "").toUpperCase()}`;
      const role = slug(row[0] ?? "") || null;
      const key = `${role ?? "value"}:${hex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const level = levelOf(raw);
      tokens.push({
        value: hex,
        uses: 1,
        where: [`design.md#${slug(section.title)}`],
        role,
        level,
      });
      evidence.push(
        evidenceClaim(tokenClaim(`color.${role ?? "value"}`, hex), level, `design.md#${slug(section.title)}`),
      );
    }
  }
  return { tokens, evidence };
}

const TYPE_ROLES: readonly { pattern: RegExp; role: string }[] = [
  { pattern: /display|h1|headline/i, role: "display" },
  { pattern: /h2/i, role: "h2" },
  { pattern: /h3/i, role: "h3" },
  { pattern: /body|copy|paragraph/i, role: "body" },
  { pattern: /label|button|caption|meta/i, role: "label" },
];

// Plausibility band per role. The generated design documents carry a few
// outliers (a "Body" row of 96px is a generation artefact, not a body size),
// and a 96px type base would wreck every derived theme. Such a step is dropped
// and recorded as an inferred claim instead of being silently corrected; when
// no body survives, the documented label size takes its place and says so.
const TYPE_BOUNDS: Readonly<Record<string, { min: number; max: number }>> = {
  display: { min: 16, max: 320 },
  h2: { min: 14, max: 220 },
  h3: { min: 12, max: 140 },
  body: { min: 10, max: 40 },
  label: { min: 8, max: 40 },
};

function typeFrom(section: Section | null): {
  steps: ReferenceTypeStep[];
  evidence: ReferenceEvidence[];
} {
  const steps: ReferenceTypeStep[] = [];
  const evidence: ReferenceEvidence[] = [];
  const header = headerCells(section);
  const sizeIndex = cellIndex(header, /size|scale/i, 1);
  const weightIndex = cellIndex(header, /weight/i, 2);
  const lineIndex = cellIndex(header, /line/i, 3);
  for (const row of tableRows(section)) {
    const raw = row.join(" | ");
    const sizeCell = row[sizeIndex] ?? "";
    const size = px(sizeCell);
    if (size === null) continue;
    const styleName = row[0] ?? "";
    const role = TYPE_ROLES.find((entry) => entry.pattern.test(styleName))?.role ?? slug(styleName);
    if (role === "" || steps.some((step) => step.role === role)) continue;
    const level = /inferred/i.test(sizeCell) ? "inferred" : levelOf(raw);
    const weightMatch = /\d{3}/.exec(row[weightIndex] ?? "");
    const lineMatch = /(\d+(?:\.\d+)?)/.exec(row[lineIndex] ?? "");
    steps.push({
      role,
      size,
      lineHeight: lineMatch === null ? null : (lineMatch[1] ?? null),
      weight: weightMatch === null ? null : Number.parseInt(weightMatch[0], 10),
      uses: 1,
      where: ["design.md#typography"],
      level,
    });
  }

  const kept: ReferenceTypeStep[] = [];
  for (const step of steps) {
    const bounds = TYPE_BOUNDS[step.role] ?? { min: 4, max: 400 };
    const value = Number.parseFloat(step.size);
    if (Number.isFinite(value) && value >= bounds.min && value <= bounds.max) {
      kept.push(step);
      evidence.push(
        evidenceClaim(
          tokenClaim(`type.${step.role}`, step.size),
          step.level,
          "design.md#typography",
        ),
      );
      continue;
    }
    evidence.push(
      evidenceClaim(
        tokenClaim(`type.${step.role}`, `${step.size} (verworfen, unplausibel)`),
        "inferred",
        "design.md#typography",
      ),
    );
  }

  if (!kept.some((step) => step.role === "body")) {
    const sorted = [...kept].sort(
      (a, b) => Number.parseFloat(a.size) - Number.parseFloat(b.size),
    );
    const substitute = kept.find((step) => step.role === "label") ?? sorted[0];
    if (substitute !== undefined) {
      const from = substitute.role;
      substitute.role = "body";
      evidence.push(
        evidenceClaim(
          tokenClaim("type.body", `${substitute.size} (aus ${from} uebernommen)`),
          "inferred",
          "design.md#typography",
        ),
      );
    }
  }
  return { steps: kept, evidence };
}

// The documented font stack, e.g. "Font family: **Sora, Inter**, fallback ...".
// The first named family leads, the second one is the body face; generic
// keywords (sans-serif, monospace) never become a family of their own.
function familiesFrom(markdown: string): {
  tokens: ReferenceToken[];
  evidence: ReferenceEvidence[];
} {
  const tokens: ReferenceToken[] = [];
  const evidence: ReferenceEvidence[] = [];
  const match =
    /Font family:\s*\*\*([^*\n]+)\*\*/.exec(markdown) ??
    /Font family:\s*([^\n]+)/.exec(markdown) ??
    /Core typeface:\s*\*\*([^*\n]+)\*\*/.exec(markdown);
  if (match === null) return { tokens, evidence };
  const generic = /^(sans-serif|serif|monospace|system-ui|cursive|math|ui-\w+)$/i;
  const names = (match[1] ?? "")
    .split(",")
    .map((entry) => inline(entry))
    .filter((entry) => entry !== "" && !generic.test(entry));
  if (names.length === 0) return { tokens, evidence };
  const slots: { role: string; value: string }[] = [
    { role: "display", value: names[0] ?? "" },
    { role: "body", value: names[1] ?? names[0] ?? "" },
  ];
  for (const slot of slots) {
    if (slot.value === "" || tokens.some((token) => token.role === slot.role)) continue;
    const level = levelOf(match[0]);
    tokens.push({
      value: slot.value,
      uses: 1,
      where: ["design.md#typography"],
      role: slot.role,
      level,
    });
    evidence.push(
      evidenceClaim(tokenClaim(`family.${slot.role}`, slot.value), level, "design.md#typography"),
    );
  }
  return { tokens, evidence };
}

function radiusFrom(section: Section | null): {
  tokens: ReferenceToken[];
  evidence: ReferenceEvidence[];
} {
  const tokens: ReferenceToken[] = [];
  const evidence: ReferenceEvidence[] = [];
  const header = headerCells(section);
  const radiusIndex = cellIndex(header, /radius/i, 1);
  for (const row of tableRows(section)) {
    const raw = row.join(" | ");
    const value = px(row[radiusIndex] ?? "") ?? (/0\b/.test(row[radiusIndex] ?? "") ? "0px" : null);
    if (value === null) continue;
    const role = slug(row[0] ?? "");
    if (role === "" || tokens.some((token) => token.role === role)) continue;
    const level = levelOf(raw);
    tokens.push({ value, uses: 1, where: ["design.md#shape"], role, level });
    evidence.push(
      evidenceClaim(tokenClaim(`radius.${role}`, value), level, "design.md#shape"),
    );
  }
  return { tokens, evidence };
}

function shadowFrom(section: Section | null): {
  tokens: ReferenceToken[];
  evidence: ReferenceEvidence[];
} {
  const tokens: ReferenceToken[] = [];
  const evidence: ReferenceEvidence[] = [];
  const header = headerCells(section);
  const valueIndex = cellIndex(header, /shadow/i, 1);
  for (const row of tableRows(section)) {
    const raw = row.join(" | ");
    const value = inline(row[valueIndex] ?? "");
    if (value === "" || /^none$/i.test(value)) continue;
    const role = slug(row[0] ?? "");
    if (role === "" || tokens.some((token) => token.role === role)) continue;
    const level = levelOf(raw);
    tokens.push({ value, uses: 1, where: ["design.md#elevation"], role, level });
    evidence.push(
      evidenceClaim(tokenClaim(`shadow.${role}`, value), level, "design.md#elevation"),
    );
  }
  return { tokens, evidence };
}

// "base spacing unit 4px" (prose) or a `space.unit 4px` line of the token block.
function spaceFrom(markdown: string): {
  tokens: ReferenceToken[];
  evidence: ReferenceEvidence[];
} {
  const match =
    /(?:base\s+)?spacing\s+unit\s*:?\s*\**\s*(\d+(?:\.\d+)?\s*(?:px|rem|em))/i.exec(markdown) ??
    /\.space\.[a-z-]+\s+(\d+(?:\.\d+)?\s*(?:px|rem|em))/i.exec(markdown);
  if (match === null) return { tokens: [], evidence: [] };
  const value = px(match[1] ?? "");
  if (value === null) return { tokens: [], evidence: [] };
  const level = levelOf(match[0]);
  return {
    tokens: [{ value, uses: 1, where: ["design.md#layout"], role: "unit", level }],
    evidence: [
      evidenceClaim(tokenClaim("space.unit", value), level, "design.md#layout"),
    ],
  };
}

function motionFrom(section: Section | null): {
  recipes: ReferenceMotionRecipe[];
  evidence: ReferenceEvidence[];
} {
  const recipes: ReferenceMotionRecipe[] = [];
  const evidence: ReferenceEvidence[] = [];
  const header = headerCells(section);
  const valueIndex = cellIndex(header, /value/i, 1);
  for (const row of tableRows(section)) {
    const name = inline(row[0] ?? "");
    const raw = row[valueIndex] ?? row[1] ?? "";
    const value = inline(raw);
    const timing = /cubic-bezier\([^)]*\)|ease(?:-in-out|-in|-out)?|linear/i.exec(value)?.[0];
    const duration = /(\d+(?:\.\d+)?)\s*(ms|s)\b/i.exec(value);
    if (timing === undefined && duration === null) continue;
    if (name === "" || recipes.some((recipe) => recipe.name === name)) continue;
    const level = levelOf(value);
    const params: Record<string, string> = {};
    if (timing !== undefined) params.timing = timing;
    if (duration !== null) params.duration = `${duration[1]}${(duration[2] ?? "").toLowerCase()}`;
    recipes.push({
      name,
      preset: null,
      trigger: "documented",
      params,
      mechanism: /framer/i.test(value) ? "Framer default" : "documented",
      uses: 1,
      where: ["design.md#motion"],
      level,
    });
    evidence.push(
      evidenceClaim(tokenClaim(`motion.${slug(name)}`, value), level, "design.md#motion"),
    );
  }
  return { recipes, evidence };
}

// Do's/Don'ts of the guidelines. Accessibility sections count as "never" when
// they are phrased as a demand ("Never place ...", "Don't ...").
function rulesFrom(section: Section | null): { constants: string[]; never: string[] } {
  if (section === null) return { constants: [], never: [] };
  const never = bullets(section, 12).filter((item) => /^(never|don't|do not|avoid|no\b)/i.test(item));
  const constants = bullets(section, 12).filter((item) => !never.includes(item));
  return { constants, never };
}

function componentsFrom(markdown: string | null | undefined): ReferenceComponent[] {
  if (markdown === null || markdown === undefined) return [];
  const components: ReferenceComponent[] = [];
  for (const section of sections(markdown)) {
    if (section.title === "") continue;
    const name = inline(section.title);
    if (name === "" || components.some((component) => component.name === name)) continue;
    const variants: string[] = [];
    for (const line of section.lines) {
      const sub = /^###\s+(.+?)\s*$/.exec(line);
      if (sub !== null) {
        const value = inline(sub[1] ?? "");
        if (value !== "" && !variants.includes(value)) variants.push(value);
      }
    }
    components.push({ name, variants: variants.slice(0, 8), evidence: "observed" });
  }
  return components.slice(0, 40);
}

// --------------------------------------------------------------- the profile

export function buildDocumentProfile(input: DocumentProfileInput): DocumentProfile {
  const list = sections(input.design);
  const colors = colorsFrom(list);
  const type = typeFrom(sectionWith(list, /typography|type\s*scale/i));
  const families = familiesFrom(input.design);
  const radius = radiusFrom(sectionWith(list, /shape|radius/i));
  const shadow = shadowFrom(sectionWith(list, /elevation|shadow/i));
  const space = spaceFrom(input.design);
  const motion = motionFrom(sectionWith(list, /motion|animation/i));
  const guidelines = input.guidelines === null || input.guidelines === undefined
    ? null
    : sections(input.guidelines);
  const constants =
    (guidelines ?? [])
      .filter((section) => /do\b|do's|dos|best practice|accessibility/i.test(section.title))
      .flatMap((section) => rulesFrom(section).constants)
      .filter((value) => !/^(never|don't|do not|avoid)\b/i.test(value))
      .slice(0, 12);
  const never = (guidelines ?? [])
    .flatMap((section) => rulesFrom(section).never)
    .slice(0, 12);
  const components = componentsFrom(input.components);

  const evidence = [
    ...colors.evidence,
    ...type.evidence,
    ...families.evidence,
    ...radius.evidence,
    ...shadow.evidence,
    ...space.evidence,
    ...motion.evidence,
  ];
  const levels = [
    ...colors.tokens.map((token) => token.level),
    ...type.steps.map((step) => step.level),
    ...families.tokens.map((token) => token.level),
    ...radius.tokens.map((token) => token.level),
    ...motion.recipes.map((recipe) => recipe.level),
  ];
  const evidenceLevel = levels.length === 0 ? "inferred" : weakestEvidenceLevel(levels);

  const base: Omit<ReferenceProfile, "styleBrief" | "guardrails"> = {
    tokens: {
      color: colors.tokens,
      type: type.steps,
      families: families.tokens,
      space: space.tokens,
      radius: radius.tokens,
      shadow: shadow.tokens,
    },
    breakpoints: [],
    customProperties: [],
    motion: motion.recipes,
    surfaces: [],
    libraries: [],
    assets: [],
    components,
    // The aesthetic families come from the collection; a document does not
    // classify itself, so the brief falls back to the collection vocabulary.
    families: [],
    vocabulary: [],
    rules: { constants, never },
    reduced: false,
  };

  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const source = input.sourceUrl === null || input.sourceUrl === undefined || input.sourceUrl === ""
    ? `${input.name} (Design.md)`
    : input.sourceUrl;
  const styleBrief = buildStyleBrief({
    url: source,
    capturedAt,
    method: "documents",
    profile: base,
    evidenceLevel,
  });
  const profile: ReferenceProfile = {
    ...base,
    styleBrief,
    guardrails: referenceGuardrails({
      profile: base,
      fontFamilies: families.tokens.map((token) => token.value),
      externalFontHosts: [],
    }),
  };
  return { profile, evidence };
}
