// Legacy section bridge (rebuild Phase 0, fifth slice).
//
// Until the section building blocks become visual components (Phase 4), the
// page drafts of the running engine still name their nodes by section type
// ("hero", "navbar", ...). The primitive catalog does not know those names, so a
// migrated v1 page would look "inconsistent" to the editor document check and
// the canvas could not open it. This module gives every existing section type a
// deliberately permissive stand-in definition: it carries no controls and no
// known slots (the section's real shape lives in the section registry), but it
// marks the node as structurally tolerated so the canvas can show and edit the
// running page while the two worlds live side by side (strangler, decision E2).

import type { PrimitiveDefinition } from "./types.ts";

// The section types of the current registry (`@senify/registry`). The list is
// mirrored from `SECTION_COMPOSITION`; a guard test keeps both in step.
export const LEGACY_SECTION_TYPES = [
  "navbar",
  "footer",
  "hero",
  "content",
  "media",
  "cta",
  "features",
  "services-process",
  "stats",
  "logo-cloud",
  "projects",
  "testimonials",
  "pricing",
  "faq",
  "team",
  "contact",
  "banner",
  "newsletter",
  "divider",
  "embed",
  "gallery",
  "timeline",
  "comparison",
  "cookie-note",
  "marquee",
  "outlet",
  "collection-list",
  "card",
] as const;

const LEGACY = new Set<string>(LEGACY_SECTION_TYPES);

export function isLegacySection(type: string): boolean {
  return LEGACY.has(type);
}

export function legacyPrimitive(type: string): PrimitiveDefinition | undefined {
  if (!LEGACY.has(type)) return undefined;
  return {
    type,
    name: type,
    category: "advanced",
    description:
      `Bestehende Section "${type}" (Altbestand): der Canvas zeigt sie über die bestehende Renderer-Brücke, ihre Bausteine werden in Phase 4 zu Visual Components.`,
    container: true,
    allowedChildren: "any",
    slots: {},
    controls: [],
    styleGroups: [],
    legacy: true,
  };
}
