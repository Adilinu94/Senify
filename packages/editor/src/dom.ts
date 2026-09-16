// The project has no DOM lib (tsconfig `lib: ["ES2023"]`, `types: ["node"]`),
// so the editor declares the structural slice of the DOM it actually touches.
// This keeps `mount.ts` typed without changing the shared compiler config.

export type DomEvent = {
  readonly key?: string;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly shiftKey?: boolean;
  readonly detail?: number;
  readonly target?: unknown;
  preventDefault?(): void;
  stopPropagation?(): void;
};

export type DomElement = {
  readonly style: Record<string, string>;
  readonly dataset: Record<string, string | undefined>;
  readonly classList: {
    add(...tokens: string[]): void;
    remove(...tokens: string[]): void;
    toggle(token: string, force?: boolean): void;
  };
  readonly contentWindow?: DomWindow | null;
  readonly ownerDocument?: DomDocument;
  // Reflects typed input text (inputs, textareas, selects).
  value?: string;
  textContent: string | null;
  className: string;
  scrollLeft: number;
  scrollTop: number;
  appendChild(child: DomElement): DomElement;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  addEventListener(
    type: string,
    handler: (event: DomEvent) => void,
    options?: { capture?: boolean },
  ): void;
  removeEventListener(type: string, handler: (event: DomEvent) => void): void;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): DomElement[];
  closest(selector: string): DomElement | null;
  focus?(): void;
  remove(): void;
};

export type DomDocument = {
  readonly body: DomElement;
  readonly head?: DomElement | null;
  createElement(tag: string): DomElement;
  addEventListener(type: string, handler: (event: DomEvent) => void): void;
  removeEventListener(type: string, handler: (event: DomEvent) => void): void;
  querySelector(selector: string): DomElement | null;
};

export type DomWindow = {
  readonly document: DomDocument;
  readonly location: { readonly search: string; readonly href: string };
  readonly history: {
    replaceState(data: unknown, title: string, url: string): void;
  };
  addEventListener(type: string, handler: (event: DomEvent) => void): void;
  removeEventListener(type: string, handler: (event: DomEvent) => void): void;
};

export function getWindow(): DomWindow | null {
  const global = globalThis as { window?: DomWindow };
  return global.window ?? null;
}

export function getDocument(): DomDocument | null {
  const win = getWindow();
  if (win) return win.document;
  const global = globalThis as { document?: DomDocument };
  return global.document ?? null;
}

export function requireDocument(): DomDocument {
  const doc = getDocument();
  if (!doc) {
    throw new Error("mountEditor needs a DOM (document) — run it in the browser");
  }
  return doc;
}
