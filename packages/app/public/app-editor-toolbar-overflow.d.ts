// Typen fuer `app-editor-toolbar-overflow.js`.

export type OverflowEvent = {
  key?: string;
  target?: unknown;
  preventDefault?(): void;
  stopPropagation?(): void;
};

export type OverflowNode = {
  hidden?: boolean;
  isConnected?: boolean;
  textContent?: string;
  classList: { add(name: string): void };
  setAttribute(name: string, value: string): void;
  getAttribute?(name: string): string | null;
  append(child: OverflowNode): void;
  removeEventListener?(type: string, handler: (event: OverflowEvent) => void): void;
  querySelectorAll(selector: string): ArrayLike<OverflowNode>;
  contains(node: unknown): boolean;
  focus?(): void;
  addEventListener(type: string, handler: (event: OverflowEvent) => void): void;
};

export type OverflowDocument = OverflowNode & {
  activeElement: OverflowNode | null;
  removeEventListener(type: string, handler: (event: OverflowEvent) => void): void;
};

export type OverflowEntry = {
  element: OverflowNode;
  /** `menuitemcheckbox` fuer Umschalter, sonst `menuitem`. */
  role?: "menuitem" | "menuitemcheckbox";
};

export type CreateToolbarOverflowOptions = {
  doc: OverflowDocument;
  el: (tag: string, spec: Record<string, unknown>, ...children: OverflowNode[]) => OverflowNode;
  label?: string;
  entries?: OverflowEntry[];
};

export type ToolbarOverflow = {
  element: OverflowNode;
  button: OverflowNode;
  menu: OverflowNode;
  isOpen(): boolean;
  close(): void;
  dispose(): void;
};

export const ITEM_SELECTOR: string;

export function createToolbarOverflow(options: CreateToolbarOverflowOptions): ToolbarOverflow;
