import { loadGuidePages } from "./guides.ts";
import type { DocsPage } from "./model.ts";
import { referencePages } from "./reference.ts";

// The complete portal corpus: generated reference pages plus curated guides.
// The site, the agent exports and the docs tools all read from this list.
export function portalPages(guidesDir?: string): DocsPage[] {
  return [...referencePages(), ...loadGuidePages(guidesDir)];
}