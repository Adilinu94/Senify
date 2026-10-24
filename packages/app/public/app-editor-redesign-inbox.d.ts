// Typen fuer `app-editor-redesign-inbox.js`.
//
// Die App-Module in `public/` sind reines JavaScript; dieses eine wird von
// einem Vitest-Test direkt importiert und braucht deshalb Deklarationen.

export type RedesignInboxElement = {
  hidden: boolean;
  textContent?: string;
  dataset: Record<string, string | undefined>;
  addEventListener(type: string, handler: () => void): void;
};

export type RedesignProposalLike = { status?: string; [key: string]: unknown };

export type CreateRedesignInboxOptions = {
  el: (tag: string, spec: Record<string, unknown>) => RedesignInboxElement;
  /**
   * Fragt die Route. Der Rueckgabewert ist ABSICHTLICH `unknown`: die Antwort
   * kommt aus dem Netz und wird erst beim Zaehlen geprueft. Ein `Proposal[]`
   * hier waere eine Typzusage, die niemand einloest.
   */
  fetchProposals: () => Promise<unknown>;
  /** Wird beim Klick mit der ersten offenen Richtung gerufen. */
  onOpen: (proposal: RedesignProposalLike) => void;
  setInterval: (handler: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

export type RedesignInbox = {
  element: RedesignInboxElement;
  start(): void;
  stop(): void;
  load(): Promise<number>;
  openCount(): number;
};

export const POLL_MS: number;

export function createRedesignInbox(options: CreateRedesignInboxOptions): RedesignInbox;
