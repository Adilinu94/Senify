// Typen fuer `app-editor-save-status.js`.

export type SaveStateLike = {
  status?: string;
  message?: string | null;
  pending?: number;
  unsupported?: string[];
};

export type SaveControls = {
  pending: number;
  saveDisabled: boolean;
  saveLabel: string;
  conflict: boolean;
};

/** Was die Statuszeile sagt - reine Rechnung aus dem Speicherzustand. */
export function saveStatusText(state: SaveStateLike | null | undefined): string;

/** Die Knoepfe und die Beschriftung des Speichern-Knopfs. */
export function saveControls(state: SaveStateLike | null | undefined): SaveControls;
