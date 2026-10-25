// Typen fuer `app-editor-live-sync.js`.

export type LivePayload = {
  pageId?: unknown;
  nodeIds?: unknown;
  action?: string;
  [key: string]: unknown;
};

export type DraftChangedDecision = {
  action: "ignore" | "follow" | "blocked" | "reload";
  message?: string;
};

export type PageCreatedDecision = {
  action: "followed" | "ignored" | "hint";
  message?: string;
};

export function draftChangedDecision(input: {
  payload: LivePayload | null | undefined;
  pageId: string;
  /** Wird gefragt, nicht vorher ausgewertet: der Zustand aendert sich. */
  isBusy: () => boolean;
}): DraftChangedDecision;

export function pageCreatedDecision(input: {
  payload: LivePayload | null | undefined;
  followed: boolean;
}): PageCreatedDecision;

export function nodesToFlash(payload: LivePayload | null | undefined): string[];
