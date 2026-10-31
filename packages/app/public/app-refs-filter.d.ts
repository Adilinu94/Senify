// Typen fuer `app-refs-filter.js`.

export type RefsFilterState = {
  query: string;
  collection: string;
  sort: string;
  view: string;
};

export type RefsStyleCollection = {
  name: string;
  recognize?: string[];
  vocabulary?: string[];
};

export type RefsHeader = {
  title: string;
  description: string;
};

export const REFS_DEFAULT_FILTER: Readonly<RefsFilterState>;

export function refsSearchParams(state: RefsFilterState): URLSearchParams;

export function refsStyleMatches(collection: RefsStyleCollection, query: string): boolean;

export function refsFooterText(count: number, noun: string, query: string): string;

export function refsHeaderText(input: {
  styleMode: boolean;
  collection: string;
  activeCollection: { name: string } | null | undefined;
}): RefsHeader;
