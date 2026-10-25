// Typen fuer `app-editor-panel-toggle.js`.

export type PanelNode = {
  classList?: { add(name: string): void };
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  addEventListener(type: string, handler: () => void): void;
};

export type PanelHost = {
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
};

export type CreatePanelToggleOptions = {
  el: (tag: string, spec: Record<string, unknown>) => PanelNode;
  host: PanelHost;
  /** `side` oder `explorer`. */
  attribute: string;
  label: string;
};

export type PanelToggle = {
  element: PanelNode;
  isOpen(): boolean;
  setOpen(value: boolean): void;
};

export const PANEL_OPEN: string;
export const PANEL_CLOSED: string;

export function createPanelToggle(options: CreatePanelToggleOptions): PanelToggle;
