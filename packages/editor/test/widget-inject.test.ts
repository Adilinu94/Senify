import { describe, expect, it } from "vitest";
import type { DomDocument, DomElement } from "../src/dom.ts";
import {
  injectWidgetRuntime,
  widgetInjected,
  WIDGET_MODULE_BASE,
} from "../src/widget-inject.ts";

// Minimaler DOM-Ersatz: genug fuer die Injection, ohne Browser
// (Vorbild `elements.test.ts`).
class FakeElement {
  readonly tagName: string;
  attrs: Record<string, string> = {};
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  private text: string | null = null;
  constructor(tagName: string) {
    this.tagName = tagName;
  }
  get textContent(): string | null {
    return this.text;
  }
  set textContent(value: string | null) {
    this.text = value;
  }
  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }
  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  appendChild(child: FakeElement): FakeElement {
    child.parent?.remove();
    child.parent = this;
    this.children.push(child);
    return child;
  }
  remove(): void {
    if (this.parent === null) return;
    this.parent.children = this.parent.children.filter((entry) => entry !== this);
    this.parent = null;
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const found: FakeElement[] = [];
    const visit = (element: FakeElement): void => {
      for (const child of element.children) {
        if (matches(child, selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

// Die Selektor-Teilmenge der Injection: Tag, `[name]`, `[name="value"]` und
// Kombinationen daraus.
function matches(element: FakeElement, selector: string): boolean {
  const parts = /^([a-zA-Z][\w-]*)?((?:\[[^\]]+\])*)$/.exec(selector);
  if (parts === null) throw new Error(`unsupported selector: ${selector}`);
  const tag = parts[1];
  if (tag !== undefined && element.tagName !== tag) return false;
  for (const attr of (parts[2] ?? "").matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
    const name = attr[1] ?? "";
    const expected = attr[2];
    const actual = element.getAttribute(name);
    if (actual === null) return false;
    if (expected !== undefined && actual !== expected) return false;
  }
  return true;
}

class FakeDocument {
  readonly body = new FakeElement("body");
  readonly defaultView: {
    __senifyWidgetHandles?: Record<string, { destroy?(): void }>;
    __senifyWidgetPending?: Record<string, boolean>;
  } = {};
  createElement(tag: string): FakeElement {
    return new FakeElement(tag);
  }
  querySelector(selector: string): FakeElement | null {
    return this.body.querySelector(selector);
  }
}

type Frame = { doc: FakeDocument; body: FakeElement };

function frame(hosts: number): Frame {
  const doc = new FakeDocument();
  for (let index = 0; index < hosts; index += 1) {
    const host = doc.createElement("div");
    host.setAttribute("data-island", "widget");
    host.setAttribute("data-widget-type", "ribbon-gallery");
    host.setAttribute("data-node-id", `n${index + 1}`);
    host.setAttribute("data-props", JSON.stringify({ speed: 8.28 }));
    doc.body.appendChild(host);
  }
  return { doc, body: doc.body };
}

function inject(target: Frame, moduleBase?: string): void {
  injectWidgetRuntime({
    doc: target.doc as unknown as DomDocument,
    body: target.body as unknown as DomElement,
    ...(moduleBase === undefined ? {} : { moduleBase }),
  });
}

function scripts(target: Frame): FakeElement[] {
  return target.body.querySelectorAll("script[data-senify-widget]");
}

function only<T>(items: T[]): T {
  const [first] = items;
  if (first === undefined) throw new Error("expected at least one element");
  return first;
}

describe("widget inject", () => {
  it("injects a module script for widget hosts", () => {
    const target = frame(1);
    inject(target);
    const script = only(scripts(target));
    expect(scripts(target).length).toBe(1);
    expect(script.getAttribute("type")).toBe("module");
    const code = script.textContent ?? "";
    expect(code).toContain('[data-island="widget"]');
    expect(code).toContain("data-props");
    expect(code).toContain("setProps");
    expect(code).toContain("destroy");
    expect(code).toContain(WIDGET_MODULE_BASE);
    // Der Parent haengt am Body: das Script laeuft im Frame-Dokument.
    expect(script.parent).toBe(target.body);
  });

  it("reports whether the frame already carries the runtime", () => {
    const target = frame(1);
    const doc = target.doc as unknown as DomDocument;
    expect(widgetInjected(doc)).toBe(false);
    inject(target);
    expect(widgetInjected(doc)).toBe(true);
  });

  it("replaces the script on re-render instead of stacking a second one", () => {
    const target = frame(1);
    inject(target);
    const first = only(scripts(target));
    inject(target);
    const second = only(scripts(target));
    expect(scripts(target).length).toBe(1);
    expect(second).not.toBe(first);
    expect(first.parent).toBeNull();
    // Der Re-Render laeuft ueber den Cache: setProps statt Remount.
    expect(second.textContent ?? "").toContain("setProps");
  });

  it("drops the script when no widget host is left", () => {
    const target = frame(1);
    inject(target);
    expect(scripts(target).length).toBe(1);
    for (const host of target.body.querySelectorAll('[data-island="widget"]')) host.remove();
    inject(target);
    expect(scripts(target)).toEqual([]);
    expect(widgetInjected(target.doc as unknown as DomDocument)).toBe(false);
  });

  it("destroys the handle of a removed host before the next script runs", () => {
    const target = frame(2);
    const destroyed: string[] = [];
    target.doc.defaultView.__senifyWidgetHandles = {
      n1: { destroy: () => destroyed.push("n1") },
      n2: { destroy: () => destroyed.push("n2") },
    };
    target.body.querySelectorAll('[data-island="widget"]')[1]?.remove();
    inject(target);
    expect(destroyed).toEqual(["n2"]);
    expect(Object.keys(target.doc.defaultView.__senifyWidgetHandles ?? {})).toEqual(["n1"]);
  });

  it("destroys every handle when the last host is gone", () => {
    const target = frame(1);
    inject(target);
    const destroyed: string[] = [];
    target.doc.defaultView.__senifyWidgetHandles = {
      n1: { destroy: () => destroyed.push("n1") },
    };
    for (const host of target.body.querySelectorAll('[data-island="widget"]')) host.remove();
    inject(target);
    expect(destroyed).toEqual(["n1"]);
    expect(target.doc.defaultView.__senifyWidgetHandles).toEqual({});
    expect(scripts(target)).toEqual([]);
  });

  it("honours a custom module base", () => {
    const target = frame(1);
    inject(target, "/api/custom-widget");
    const code = only(scripts(target)).textContent ?? "";
    expect(code).toContain("/api/custom-widget");
    expect(code).not.toContain(WIDGET_MODULE_BASE);
  });
});
