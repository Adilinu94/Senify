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
  readonly button?: number;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly target?: unknown;
  // Set by a handler that already consumed the event; later listeners (the
  // canvas shortcut layer) skip it.
  readonly defaultPrevented?: boolean;
  preventDefault?(): void;
  stopPropagation?(): void;
};

// Inline styles. Index assignment (`style.color = …`) covers the ordinary
// declarations; the custom properties of the panel widths (Aufgabe 29) need
// `setProperty`, which only a real `CSSStyleDeclaration` carries.
export type DomStyle = Record<string, string> & {
  setProperty?(name: string, value: string): void;
};

export type DomElement = {
  readonly style: DomStyle;
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
  hidden?: boolean;
  scrollLeft: number;
  scrollTop: number;
  // Scrolling geometry (the scrub slider, ticket 19 M6): a real element exposes
  // both; test doubles may leave them out.
  scrollHeight?: number;
  clientHeight?: number;
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
  contains?(node: unknown): boolean;
  focus?(): void;
  scrollIntoView?(options?: unknown): void;
  remove(): void;
  // Real elements in the browser expose their box; the overlay handle and the
  // "+" insert points are positioned from it.
  getBoundingClientRect?(): {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

export type DomDocument = {
  readonly body: DomElement;
  readonly head?: DomElement | null;
  // The document element carries the page scroll (the scrub slider reads and
  // writes it, ticket 19 M6); test doubles may leave it out.
  readonly documentElement?: DomElement;
  // The focused element; the spotlight remembers and restores it (E7).
  readonly activeElement?: DomElement | null;
  createElement(tag: string): DomElement;
  addEventListener(type: string, handler: (event: DomEvent) => void): void;
  removeEventListener(type: string, handler: (event: DomEvent) => void): void;
  querySelector(selector: string): DomElement | null;
};

export type DomWindow = {
  readonly document: DomDocument;
  // Panel widths (Aufgabe 29) survive a reload: the editor stores them here
  // when the browser offers it (a private window may not).
  readonly localStorage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
  // The variant prompt (ticket 04) asks for a name; test doubles may leave it
  // out, then the action reports instead of asking.
  prompt?(message: string, initial: string): string | null;
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
