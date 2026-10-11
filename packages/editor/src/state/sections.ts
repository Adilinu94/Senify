import { bundledSections } from "@senify/registry";
import type { SectionDefinition } from "@senify/section-sdk";

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
