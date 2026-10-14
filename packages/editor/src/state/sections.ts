import { bundledSections } from "@senify/registry";
import type { PropValue, SectionDefinition } from "@senify/section-sdk";

// The registry definition behind a section node ("hero", "features", …).
//
// A node of a section type carries the section's own props (a headline, a list
// of items, a link). Their shape lives here, in the section registry, not in the
// primitive catalog: the store validates writes against it and the inspector
// builds its Content tab from it.

const DEFINITIONS: ReadonlyMap<string, SectionDefinition> = new Map(
  bundledSections.map((section) => [section.type, section]),
);

export function sectionDefinitionFor(type: string): SectionDefinition | undefined {
  return DEFINITIONS.get(type);
}

// Diese drei brauchen einen Zusammenhang, den eine Seite allein nicht liefert:
// der Outlet steht in Layouts und Entry-Templates, die Karte im Item-Slot einer
// Sammlung, und die Sammlungsliste braucht eine Collection mit Eintraegen. Sie
// haben ihre eigenen Wege (Templates, Collections) und lassen sich nicht ueber
// das Elemente-Panel oder die Spotlight einfuegen.
export const SECTION_NOT_INSERTABLE: ReadonlySet<string> = new Set([
  "outlet",
  "collection-list",
  "card",
]);

// The variant a fresh section starts with: the golden tree's own, else the
// first one the section declares.
export function defaultSectionVariant(definition: SectionDefinition): string {
  const names = Object.keys(definition.variants ?? {});
  const golden = definition.golden.tree.variant;
  if (golden !== undefined && names.includes(golden)) return golden;
  return names[0] ?? "";
}

export type SectionInsertSpec = {
  primitive: string;
  props: Record<string, PropValue>;
  variant: string;
};

// The node an insert places: the type, the variant and the golden tree's props
// plus the variant's preset (the composition the engine's redesign apply uses).
// `undefined` when the section is unknown, not insertable or the variant is not
// one it declares.
export function sectionInsertSpec(type: string, variant?: string): SectionInsertSpec | undefined {
  if (SECTION_NOT_INSERTABLE.has(type)) return undefined;
  const definition = DEFINITIONS.get(type);
  if (definition === undefined) return undefined;
  const chosen = variant ?? defaultSectionVariant(definition);
  const declared = definition.variants?.[chosen];
  if (declared === undefined) return undefined;
  const props = structuredClone({
    ...definition.golden.tree.props,
    ...declared.preset,
  }) as Record<string, PropValue>;
  return { primitive: type, props, variant: chosen };
}
