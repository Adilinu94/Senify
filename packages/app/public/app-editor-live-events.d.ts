// Typen fuer `app-editor-live-events.js`.

export type EngineEventLike = { data?: string | null } | null | undefined;

/** Ein geparster Frame; alles, was kein Objekt ist, wird zu `{}`. */
export type EnginePayload = {
  actor?: { label?: string } | null;
  pageId?: string;
  action?: string;
  [key: string]: unknown;
};

export function parseEngineEvent(event: EngineEventLike): EnginePayload;

export function isOwnEvent(payload: EnginePayload | null | undefined, authorLabel: string): boolean;
