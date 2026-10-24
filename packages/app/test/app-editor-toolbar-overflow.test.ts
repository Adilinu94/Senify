import { describe, expect, it } from "vitest";
import {
  createToolbarOverflow,
  ITEM_SELECTOR,
} from "../public/app-editor-toolbar-overflow.js";

// Das Overflow-Menue der Editor-Toolbar (R12-Schnitt aus `app-editor.js`).
//
// Vorher war es ein 90-Zeilen-Block in der Closure; die Regeln (Fokus zurueck
// bei Escape, kreisende Pfeiltasten, Home/End, Klick schliesst) galten nur im
// Browser. Hier stehen sie als eigene Faelle.
//
// Der Fake ist absichtlich klein: was das Modul nicht braucht, gibt es nicht.

type FakeNode = {
  tag: string;
  hidden: boolean;
  textContent: string;
  attributes: Record<string, string>;
  role?: string;
  classes: string[];
  children: FakeNode[];
  parent: FakeNode | null;
  isConnected: boolean;
  appends: FakeNode[];
  classList: { add(name: string): void; toggle(name: string, on?: boolean): void };
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  append(child: FakeNode): void;
  addEventListener(type: string, handler: (event: FakeEvent) => void): void;
  fire(type: string, event?: FakeEvent): void;
  focus(): void;
  querySelectorAll(selector: string): FakeNode[];
  contains(node: unknown): boolean;
};

type FakeEvent = {
  key?: string;
  target?: unknown;
  preventDefault?(): void;
  stopPropagation?(): void;
};

function makeDoc() {
  const all: FakeNode[] = [];
  let focused: FakeNode | null = null;

  function make(
    tag: string,
    spec: Record<string, unknown> = {},
    ...children: FakeNode[]
  ): FakeNode {
    const handlers: Record<string, ((event: FakeEvent) => void)[]> = {};
    const node: FakeNode = {
      tag,
      hidden: spec["hidden"] === true,
      textContent: typeof spec["text"] === "string" ? spec["text"] : "",
      attributes: {},
      classes: [],
      children: [...children],
      parent: null,
      isConnected: true,
      appends: [],
      classList: {
        add(name: string) {
          if (!node.classes.includes(name)) node.classes.push(name);
        },
        toggle(name: string, on?: boolean) {
          const has = node.classes.includes(name);
          const want = on ?? !has;
          if (want && !has) node.classes.push(name);
          if (!want && has) node.classes.splice(node.classes.indexOf(name), 1);
        },
      },
      setAttribute(name: string, value: string) {
        node.attributes[name] = value;
      },
      getAttribute(name: string) {
        return node.attributes[name] ?? null;
      },
      append(child: FakeNode) {
        child.parent = node;
        node.children.push(child);
        node.appends.push(child);
      },
      addEventListener(type: string, handler: (event: FakeEvent) => void) {
        (handlers[type] ??= []).push(handler);
      },
      fire(type: string, event: FakeEvent = {}) {
        for (const handler of handlers[type] ?? []) handler(event);
      },
      focus() {
        focused = node;
      },
      querySelectorAll(selector: string) {
        // Nur der eine Selektor, den das Modul benutzt.
        if (selector !== ITEM_SELECTOR) return [];
        return node.children.filter(
          (child) => child.tag === "button" && child.hidden !== true,
        );
      },
      contains(candidate: unknown) {
        if (candidate === node) return true;
        return node.children.some((child) => child.contains(candidate));
      },
    };
    for (const [key, value] of Object.entries(spec)) {
      if (key === "class") node.classes.push(String(value));
      if (key === "id" || key.startsWith("aria-") || key === "role" || key === "type") {
        node.attributes[key] = String(value);
      }
    }
    all.push(node);
    return node;
  }

  const doc = {
    activeElement: null as FakeNode | null,
    listeners: {} as Record<string, ((event: FakeEvent) => void)[]>,
    addEventListener(type: string, handler: (event: FakeEvent) => void) {
      (doc.listeners[type] ??= []).push(handler);
    },
    removeEventListener(type: string, handler: (event: FakeEvent) => void) {
      doc.listeners[type] = (doc.listeners[type] ?? []).filter((entry) => entry !== handler);
    },
    fire(type: string, event: FakeEvent = {}) {
      for (const handler of doc.listeners[type] ?? []) handler(event);
    },
  };

  return {
    doc,
    make,
    all,
    focused: () => focused,
    setFocus(node: FakeNode) {
      focused = node;
      doc.activeElement = node;
    },
  };
}

// Das Modul gibt seine Knoten ueber den schmalen Vertrag heraus; im Test sind
// es die Fakes, die auch `fire` und `children` koennen.
type FakeOverflow = Omit<ReturnType<typeof createToolbarOverflow>, "element" | "button" | "menu"> & {
  element: FakeNode;
  button: FakeNode;
  menu: FakeNode;
};

function setup(hidden: number[] = []) {
  const f = makeDoc();
  const entries = ["erster", "zweiter", "dritter"].map((action, index) => {
    const element = f.make("button", { type: "button", "data-action": action });
    if (hidden.includes(index)) element.hidden = true;
    return {
      element,
      role: index === 1 ? ("menuitemcheckbox" as const) : ("menuitem" as const),
    };
  });
  // Der Fake erfuellt den Vertrag des Moduls; die Umwandlung ist noetig, weil
  // `doc`/`el` im Test mehr koennen als der schmale Vertrag verlangt.
  const overflow = createToolbarOverflow({
    doc: f.doc as unknown as Parameters<typeof createToolbarOverflow>[0]["doc"],
    el: f.make as unknown as Parameters<typeof createToolbarOverflow>[0]["el"],
    entries: entries as unknown as Parameters<typeof createToolbarOverflow>[0]["entries"],
  }) as unknown as FakeOverflow;
  return { f, overflow, entries };
}

describe("createToolbarOverflow", () => {
  it("baut Ausloeser, Menue und Host mit den ARIA-Attributen", () => {
    const { f, overflow } = setup();

    expect(overflow.button.getAttribute("aria-haspopup")).toBe("menu");
    expect(overflow.button.getAttribute("aria-expanded")).toBe("false");
    expect(overflow.button.getAttribute("aria-controls")).toBe("canvas-toolbar-overflow");
    expect(overflow.menu.getAttribute("role")).toBe("menu");
    // Das Menue startet zu.
    expect(overflow.menu.hidden).toBe(true);
    expect(overflow.isOpen()).toBe(false);
    expect(f.all.length).toBeGreaterThan(0);
  });

  it("uebernimmt die Rolle je Eintrag statt sie aus der Position zu raten", () => {
    const { entries } = setup();
    expect(entries[0]?.element.getAttribute("role")).toBe("menuitem");
    expect(entries[1]?.element.getAttribute("role")).toBe("menuitemcheckbox");
    expect(entries[2]?.element.getAttribute("role")).toBe("menuitem");
    // Jeder Eintrag traegt die Klasse, die das Stylesheet erwartet.
    for (const entry of entries) {
      expect(entry.element.classes).toContain("toolbar-overflow__item");
    }
  });

  it("oeffnet am Ausloeser und setzt den Fokus auf den ersten Eintrag", () => {
    const { f, overflow } = setup();

    overflow.button.fire("click", { stopPropagation() {} });
    expect(overflow.menu.hidden).toBe(false);
    expect(overflow.button.getAttribute("aria-expanded")).toBe("true");
    expect(f.focused()).toBe(overflow.menu.children[0]);
  });

  it("schliesst beim zweiten Klick wieder", () => {
    const { overflow } = setup();
    overflow.button.fire("click", { stopPropagation() {} });
    overflow.button.fire("click", { stopPropagation() {} });
    expect(overflow.menu.hidden).toBe(true);
    expect(overflow.isOpen()).toBe(false);
  });

  it("springt mit ArrowDown auf den letzten und mit ArrowUp auf den ersten Eintrag", () => {
    const { f, overflow } = setup();
    const dritter = overflow.menu.children[2];

    overflow.button.fire("keydown", { key: "ArrowUp", preventDefault() {} });
    expect(f.focused()).toBe(dritter);

    overflow.button.fire("keydown", { key: "ArrowDown", preventDefault() {} });
    expect(f.focused()).toBe(overflow.menu.children[0]);
  });

  it("laesst die Pfeiltasten im Kreis laufen", () => {
    const { f, overflow } = setup();
    const [erster, zweiter, dritter] = overflow.menu.children;

    f.setFocus(dritter as never);
    overflow.menu.fire("keydown", { key: "ArrowDown", preventDefault() {} });
    expect(f.focused()).toBe(erster);

    f.setFocus(erster as never);
    overflow.menu.fire("keydown", { key: "ArrowUp", preventDefault() {} });
    expect(f.focused()).toBe(dritter);

    f.setFocus(erster as never);
    overflow.menu.fire("keydown", { key: "ArrowDown", preventDefault() {} });
    expect(f.focused()).toBe(zweiter);
  });

  it("springt mit Home und End an Anfang und Ende", () => {
    const { f, overflow } = setup();
    const [erster, , dritter] = overflow.menu.children;

    f.setFocus(erster as never);
    overflow.menu.fire("keydown", { key: "End", preventDefault() {} });
    expect(f.focused()).toBe(dritter);

    overflow.menu.fire("keydown", { key: "Home", preventDefault() {} });
    expect(f.focused()).toBe(erster);
  });

  it("schliesst mit Escape und gibt den Fokus an den Ausloeser zurueck", () => {
    const { f, overflow } = setup();
    overflow.button.fire("click", { stopPropagation() {} });
    f.setFocus(overflow.menu.children[0] as never);

    overflow.menu.fire("keydown", { key: "Escape", preventDefault() {} });
    expect(overflow.menu.hidden).toBe(true);
    // Ohne diesen Fokus landet der Nutzer nach dem Schliessen im Nichts.
    expect(f.focused()).toBe(overflow.button);
  });

  it("ueberspringt versteckte Eintraege", () => {
    // Ohne Konflikt sind "Neu laden" und "Erneut versuchen" versteckt; die
    // Tastatur darf dort nicht hineinlaufen.
    const { f, overflow } = setup([0, 2]);
    expect(overflow.menu.children[1]?.hidden).toBe(false);

    overflow.button.fire("click", { stopPropagation() {} });
    expect(f.focused()).toBe(overflow.menu.children[1]);

    // Ein einzelner sichtbarer Eintrag bleibt bei ArrowDown auf sich selbst.
    f.setFocus(overflow.menu.children[1] as never);
    overflow.menu.fire("keydown", { key: "ArrowDown", preventDefault() {} });
    expect(f.focused()).toBe(overflow.menu.children[1]);
  });

  it("schliesst bei einem Klick im Menue", () => {
    const { overflow } = setup();
    overflow.button.fire("click", { stopPropagation() {} });
    overflow.menu.fire("click", {});
    expect(overflow.menu.hidden).toBe(true);
  });

  it("schliesst bei einem Zeigerdruck ausserhalb, aber nicht innerhalb", () => {
    const { f, overflow } = setup();
    overflow.button.fire("click", { stopPropagation() {} });

    // Ein Druck in den Host hinein (der Ausloeser) laesst das Menue offen.
    f.doc.fire("pointerdown", { target: overflow.button });
    expect(overflow.menu.hidden).toBe(false);

    f.doc.fire("pointerdown", { target: { irgendwas: true } });
    expect(overflow.menu.hidden).toBe(true);
  });

  it("nimmt den Dokument-Zuhoerer beim Aufraeumen wieder ab", () => {
    const { f, overflow } = setup();
    overflow.button.fire("click", { stopPropagation() {} });
    overflow.dispose();

    expect(overflow.menu.hidden).toBe(true);
    // Ohne das Abnehmen liefe nach jedem Seitenwechsel ein weiterer Zuhoerer.
    f.doc.fire("pointerdown", { target: { irgendwas: true } });
    expect(f.doc.listeners["pointerdown"]).toHaveLength(0);
  });

  it("gibt einen nicht zuordenbaren Schluessel ungehindert weiter", () => {
    const { f, overflow } = setup();
    overflow.button.fire("click", { stopPropagation() {} });
    f.setFocus(overflow.menu.children[1] as never);

    let prevented = false;
    overflow.menu.fire("keydown", {
      key: "a",
      preventDefault() {
        prevented = true;
      },
    });
    // Tippen im Menue darf nicht geschluckt werden.
    expect(prevented).toBe(false);
    expect(f.focused()).toBe(overflow.menu.children[1]);
  });
});
