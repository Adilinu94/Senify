import { primitiveTypes } from "./catalog.ts";

// Mapping of the 28 existing section building blocks to the primitives that
// make them up. This is the bridge between the old section registry and the
// new primitive catalog: nothing here renders, it only records which
// foundation stones each block needs.

export type SectionComposition = {
  section: string;
  primitives: string[];
};

export const SECTION_COMPOSITION: readonly SectionComposition[] = [
  { section: "navbar", primitives: ["frame", "image", "link", "list", "button"] },
  { section: "footer", primitives: ["frame", "grid", "column", "heading", "link", "list", "text"] },
  { section: "hero", primitives: ["frame", "heading", "text", "button", "image"] },
  { section: "content", primitives: ["section", "heading", "text", "body"] },
  { section: "media", primitives: ["image", "video", "text"] },
  { section: "cta", primitives: ["frame", "heading", "text", "button"] },
  { section: "features", primitives: ["frame", "grid", "column", "icon", "heading", "text", "link"] },
  { section: "services-process", primitives: ["frame", "grid", "column", "heading", "text"] },
  { section: "stats", primitives: ["frame", "grid", "column", "heading", "text"] },
  { section: "logo-cloud", primitives: ["frame", "grid", "image", "heading"] },
  { section: "projects", primitives: ["frame", "grid", "image", "heading", "text", "link"] },
  { section: "testimonials", primitives: ["frame", "grid", "image", "text", "heading"] },
  { section: "pricing", primitives: ["frame", "grid", "column", "heading", "text", "list", "button", "link"] },
  { section: "faq", primitives: ["frame", "accordion", "heading"] },
  { section: "team", primitives: ["frame", "grid", "image", "heading", "text"] },
  { section: "contact", primitives: ["frame", "heading", "text", "input", "select", "checkbox", "submit", "link"] },
  { section: "gallery", primitives: ["frame", "grid", "image", "text", "heading"] },
  { section: "banner", primitives: ["frame", "text", "link"] },
  { section: "newsletter", primitives: ["frame", "heading", "text", "input", "checkbox", "submit", "link"] },
  { section: "divider", primitives: ["divider"] },
  { section: "embed", primitives: ["embed"] },
  { section: "timeline", primitives: ["frame", "grid", "column", "heading", "text"] },
  { section: "comparison", primitives: ["frame", "grid", "table", "heading", "text"] },
  { section: "cookie-note", primitives: ["frame", "text", "button", "link"] },
  { section: "marquee", primitives: ["frame", "text", "image"] },
  { section: "outlet", primitives: ["frame"] },
  { section: "collection-list", primitives: ["collection", "frame", "grid", "column", "heading", "text"] },
  { section: "card", primitives: ["frame", "image", "heading", "text", "link"] },
];

export function primitivesFor(section: string): string[] | undefined {
  return SECTION_COMPOSITION.find((entry) => entry.section === section)?.primitives;
}

// The cutover bridge for the twin names (see `SECTION_PRIMITIVE_TWINS`): turns a
// section-shaped node into the primitive shape of the same name. The running
// section renders until the parity gate, so nothing calls this in the editor —
// the cutover migration reads it, and the test pins every value so the swap
// cannot lose content. `undefined` for every other section (their migration is
// the "Sections as VCs" step, ticket 04).
const DIVIDER_SPACING_PX: Record<string, number> = {
  xs: 8,
  s: 16,
  m: 32,
  l: 64,
  xl: 128,
};

// The section variants map onto the primitive's style choices; "dots" is the
// dotted line. No variant (legacy nodes) stays the plain line.
const DIVIDER_STYLE: Record<string, string> = {
  line: "line",
  space: "space",
  dots: "dotted",
};

export function sectionToPrimitiveProps(
  section: string,
  props: Record<string, unknown>,
  variant?: string,
): Record<string, unknown> | undefined {
  if (section === "divider") {
    const spacing = typeof props["spacing"] === "string" ? props["spacing"] : "m";
    return {
      style: DIVIDER_STYLE[variant ?? ""] ?? "line",
      spacing: DIVIDER_SPACING_PX[spacing] ?? DIVIDER_SPACING_PX["m"],
    };
  }
  if (section === "embed") {
    const provider = variant === "map" || variant === "social" ? variant : "iframe";
    return {
      url: typeof props["url"] === "string" ? props["url"] : "",
      provider,
      aspect: typeof props["aspect"] === "string" ? props["aspect"] : "16/9",
      title: typeof props["title"] === "string" ? props["title"] : "Eingebetteter Inhalt",
    };
  }
  return undefined;
}

// Primitives referenced by the mapping but missing from the catalog.
export function missingPrimitives(
  composition: readonly SectionComposition[] = SECTION_COMPOSITION,
): Array<{ section: string; primitive: string }> {
  const known = new Set(primitiveTypes());
  const gaps: Array<{ section: string; primitive: string }> = [];
  for (const entry of composition) {
    for (const primitive of entry.primitives) {
      if (!known.has(primitive)) {
        gaps.push({ section: entry.section, primitive });
      }
    }
  }
  return gaps;
}

// Catalog primitives that no existing section needs yet.
export function unusedPrimitiveTypes(): string[] {
  const used = new Set<string>();
  for (const entry of SECTION_COMPOSITION) {
    for (const primitive of entry.primitives) {
      used.add(primitive);
    }
  }
  return primitiveTypes().filter((type) => !used.has(type));
}
