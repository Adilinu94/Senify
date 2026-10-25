// Typen fuer `app-editor-bake-status.js`.

export type BakeStatusElement = {
  hidden: boolean;
  textContent?: string;
  dataset: Record<string, string | undefined>;
};

export type BakeJobLike = {
  status?: string;
  lastError?: string | null;
} | null;

export type BakeStatusText = { text: string; error: boolean } | null;

export type CreateBakeStatusOptions = {
  el: (tag: string, spec: Record<string, unknown>) => BakeStatusElement;
  /** Fragt die Bake-Jobs; die Antwort ist ungeprueft (`unknown`). */
  fetchJobs: () => Promise<{ jobs?: unknown } | unknown>;
};

export type BakeStatus = {
  element: BakeStatusElement;
  refresh(): Promise<BakeStatusText>;
  /** Meldet ein Ergebnis direkt (Live-Ereignis statt Job-Abfrage). */
  show(text: string, isError?: boolean): void;
};

/** Reine Rechnung: welcher Text gehoert zu welchem Job? */
export function bakeStatusText(job: BakeJobLike | undefined): BakeStatusText;

export function createBakeStatus(options: CreateBakeStatusOptions): BakeStatus;
