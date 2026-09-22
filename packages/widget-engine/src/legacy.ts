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

// The reserved types of the component model (ticket 04). A definition, an
// instance and a slot placeholder are nodes in the tree; the editor holds them
// like any other node (the inspector writes props, the explorer shows them),
// while the inliner turns them into the plain tree both render paths consume.
// Their names are reserved — a section may never claim them.
export const COMPONENT_DEFINITION_PRIMITIVE = "__component";
export const COMPONENT_INSTANCE_PRIMITIVE = "__component_instance";
export const COMPONENT_SLOT_PRIMITIVE = "__component_slot";

const RESERVED: Record<string, { name: string; description: string }> = {
  [COMPONENT_DEFINITION_PRIMITIVE]: {
    name: "Komponente",
    description:
      "Definition einer Visual Component: der eine Wurzelknoten in den Kindern ist die wiederverwendbare Struktur, `__component_slot`-Knoten sind ihre Füllplätze.",
  },
  [COMPONENT_INSTANCE_PRIMITIVE]: {
    name: "Komponenten-Instanz",
    description:
      "Instanz einer Komponente: `componentId` nennt die Definition, die Slots tragen den Inhalt. Wird beim Rendern und beim Bake inlined.",
  },
  [COMPONENT_SLOT_PRIMITIVE]: {
    name: "Komponenten-Slot",
    description:
      "Füllplatz in einer Komponenten-Definition: `name` ist der Slot-Name, den eine Instanz füllt.",
  },
};

export function componentPrimitive(type: string): PrimitiveDefinition | undefined {
  const entry = RESERVED[type];
  if (entry === undefined) return undefined;
  const isSlot = type === COMPONENT_SLOT_PRIMITIVE;
  return {
    type,
    name: entry.name,
    category: "advanced",
    description: entry.description,
    container: !isSlot,
    allowedChildren: isSlot ? "none" : "any",
    slots: {},
    controls: [],
    // No style groups: a definition container carries no styling of its own;
    // the subtree inside it uses the full style surface.
    styleGroups: [],
    legacy: true,
  };
}

// The structural node types of the component model. Their props are JSON
// (componentId, name, the override bag), not style values, so the value
// grammar of ADR-0005 does not apply to them.
export function isComponentPrimitive(type: string): boolean {
  return RESERVED[type] !== undefined;
}

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

// The only two names both vocabularies carry: `divider` and `embed` exist as
// running sections (`SECTION_COMPONENTS`) *and* as real catalog primitives.
// The strangler (E2) keeps the section authoritative until the parity gate —
// `sectionTwinControls` (catalog.ts) hands the editor the section's own control
// surface, `sectionToPrimitiveProps` (mapping.ts) is the cutover bridge. The
// guard test pins the list, so a new accidental collision fails CI instead of
// silently hijacking a page.
export const SECTION_PRIMITIVE_TWINS = ["divider", "embed"] as const;

export function isSectionPrimitiveTwin(type: string): boolean {
  return (SECTION_PRIMITIVE_TWINS as readonly string[]).includes(type);
}

// The structural props of the component model: JSON values (ids, the override
// and variant bags), never style values. The value grammar (ADR-0005) does not
// apply to them, and the CSS compiler's open pass must not emit them as
// declarations.
export const STRUCTURAL_PROP_KEYS: readonly string[] = [
  "overrides",
  "variants",
  "componentId",
  "componentVersion",
  "name",
  "version",
  "allowedTypes",
  "max",
];

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
