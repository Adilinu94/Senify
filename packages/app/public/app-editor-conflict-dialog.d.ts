// Typen fuer `app-editor-conflict-dialog.js`.

export type ConflictNode = {
  open?: boolean;
  hidden?: boolean;
  textContent?: string;
  children: ConflictNode[];
  append(child: ConflictNode): void;
  replaceChildren(...children: ConflictNode[]): void;
  addEventListener(type: string, handler: () => void): void;
  showModal?(): void;
  close?(): void;
};

export type ConflictDialogModelLike = {
  title: string;
  hint: string;
  expectedVersion: number;
  serverVersion: number | null;
  pending: number;
  reloadLabel: string;
  retryLabel: string;
  dismissLabel: string;
};

export type CreateConflictDialogOptions = {
  el: (tag: string, spec: Record<string, unknown>, ...children: ConflictNode[]) => ConflictNode;
  host: { append(child: ConflictNode): void };
  onReload: () => void;
  onRetry: () => void;
};

export type ConflictDialog = {
  element: ConflictNode;
  isOpen(): boolean;
  close(): void;
  sync(model: ConflictDialogModelLike | null): void;
};

export function createConflictDialog(options: CreateConflictDialogOptions): ConflictDialog;
