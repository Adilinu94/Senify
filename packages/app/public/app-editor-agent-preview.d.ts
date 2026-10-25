// Typen fuer `app-editor-agent-preview.js`.

export type AgentPreviewNode = {
  textContent?: string;
  classList: { toggle(name: string, on?: boolean): void };
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, handler: () => void): void;
};

export type AgentPreviewStorage = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

export type CreateAgentPreviewOptions = {
  el: (tag: string, spec: Record<string, unknown>) => AgentPreviewNode;
  storage: AgentPreviewStorage;
  /** Sind eigene Aenderungen offen oder laeuft gerade ein Speichern? */
  isBusy: () => boolean;
  onMessage: (message: string) => void;
};

export type FollowDecision = { allowed: boolean; reason: string | null };

export type AgentPreview = {
  element: AgentPreviewNode;
  enabled(): boolean;
  set(value: boolean, options?: { announce?: boolean }): void;
  toggle(): void;
  mayFollow(targetPageId: string, currentPageId: string): FollowDecision;
};

export const AGENT_PREVIEW_KEY: string;

export function createAgentPreview(options: CreateAgentPreviewOptions): AgentPreview;
