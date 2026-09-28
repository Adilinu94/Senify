import type { ToolFact, ToolGroup } from "./types.ts";

export type { ToolFact, ToolGroup, ToolScope } from "./types.ts";

/** The facts by name. A `Map`, not a plain object, because a tool named
 *  `constructor` or `toString` in a plain object would find an inherited method
 *  instead of missing - and "this tool is not in the manifest" has to be a miss
 *  everywhere, including for the names nobody would think to type.
 *
 *  Built in a function rather than at module scope: the generated file holds
 *  data, and a `Map` over it built at import time would have to live in the
 *  generated file too - which would make every regeneration rewrite the logic
 *  along with the data. */
export function toolsByName(
  facts: readonly ToolFact[],
): ReadonlyMap<string, ToolFact> {
  return new Map(facts.map((fact) => [fact.name, fact]));
}

/** The groups in the order the documentation walks them.
 *
 *  A fixed order, not the manifest's own order: the catalogue belongs before the
 *  pages, and an implementation detail like "the manifest happens to be sorted"
 *  should not decide the reading order of a manual. */
export const TOOL_GROUP_ORDER: ToolGroup[] = [
  "katalog",
  "seiten",
  "medien",
  "referenzen",
  "redesign",
  "review",
  "release",
  "einstellungen",
];

export const TOOL_GROUP_LABELS: Record<ToolGroup, string> = {
  katalog: "Katalog und Identität",
  seiten: "Seiten",
  medien: "Medien und Einträge",
  referenzen: "Referenzen",
  redesign: "Redesign",
  review: "Review",
  release: "Release und Deploy",
  einstellungen: "Einstellungen",
};

export function toolsInGroup(
  facts: readonly ToolFact[],
  group: ToolGroup,
): ToolFact[] {
  return facts.filter((fact) => fact.group === group);
}
