import { describe, expect, it, vi } from "vitest";
import { createConflictDialog } from "../public/app-editor-conflict-dialog.js";

// Der Konflikt-Dialog (L17), R12-Schnitt aus `app-editor.js`.
//
// Die Texte und Zahlen kommen aus `conflictDialogModel` (`persist.ts`) und sind
// dort geprueft. Hier steht die DOM-Regel, die vorher nur im Browser galt:
// EIN Dialog je Konfliktlage. `applyState` laeuft bei jeder Zustandsaenderung;
// ohne Schluessel ginge der Dialog bei jedem Tastendruck neu auf - auch nachdem
// der Nutzer ihn zugeklappt hat.

type FakeNode = {
  tag: string;
  open: boolean;
  textContent: string;
  attributes: Record<string, string>;
  children: FakeNode[];
  handlers: (() => void)[];
  appends: FakeNode[];
  append(child: FakeNode): void;
  replaceChildren(...children: FakeNode[]): void;
  addEventListener(type: string, handler: () => void): void;
  click(): void;
  showModal(): void;
  close(): void;
};

function makeEl() {
  const el = (tag: string, spec: Record<string, unknown> = {}, ...kinder: FakeNode[]) => {
    const node: FakeNode = {
      tag,
      open: false,
      textContent: typeof spec["text"] === "string" ? spec["text"] : "",
      attributes: {},
      children: [...kinder],
      handlers: [],
      appends: [],
      append(child) {
        node.children.push(child);
        node.appends.push(child);
      },
      replaceChildren(...next) {
        node.children = next;
      },
      addEventListener(_type, handler) {
        node.handlers.push(handler);
      },
      click() {
        for (const handler of node.handlers) handler();
      },
      showModal() {
        node.open = true;
      },
      close() {
        node.open = false;
      },
    };
    for (const [key, value] of Object.entries(spec)) {
      // Alle Attribute, die der Fake kennt: data-*, class, type, aria-*.
      if (
        key === "class" ||
        key === "type" ||
        key.startsWith("data-") ||
        key.startsWith("aria-")
      ) {
        node.attributes[key] = String(value);
      }
    }
    return node;
  };
  return el;
}

// Das Modul gibt seine Knoten ueber den schmalen Vertrag heraus; im Test sind
// es die Fakes, die auch `attributes`, `children` und `click` koennen.
type FakeDialog = Omit<ReturnType<typeof createConflictDialog>, "element"> & {
  element: FakeNode;
};

function setup() {
  const el = makeEl();
  const host = { children: [] as FakeNode[], append(child: FakeNode) { this.children.push(child); } };
  const onReload = vi.fn();
  const onRetry = vi.fn();
  const dialog = createConflictDialog({
    el: el as never,
    host,
    onReload,
    onRetry,
  }) as unknown as FakeDialog;
  return { el, host, dialog, onReload, onRetry };
}

const modell = {
  title: "Entwurf wurde inzwischen geändert",
  hint: "Der Server steht auf Version 7 …",
  expectedVersion: 5,
  serverVersion: 7,
  pending: 2,
  reloadLabel: "Server laden (eigene Änderungen verwerfen)",
  retryLabel: "Eigene Änderungen senden (2)",
  dismissLabel: "Später",
};

describe("createConflictDialog", () => {
  it("legt den Dialog an und haengt ihn an den Host, ohne ihn zu oeffnen", () => {
    const { host, dialog } = setup();
    expect(host.children).toHaveLength(1);
    expect(dialog.element.attributes["data-role"]).toBe("conflict-dialog");
    expect(dialog.isOpen()).toBe(false);
  });

  it("oeffnet sich mit Titel, Hinweis und drei Knoepfen", () => {
    const { dialog } = setup();
    dialog.sync(modell);

    expect(dialog.isOpen()).toBe(true);
    const [titel, hinweis, actions] = dialog.element.children;
    expect(titel?.textContent).toBe(modell.title);
    expect(hinweis?.textContent).toBe(modell.hint);
    expect(actions?.children).toHaveLength(3);
    expect(actions?.children[0]?.textContent).toBe(modell.reloadLabel);
    expect(actions?.children[1]?.textContent).toBe(modell.retryLabel);
    expect(actions?.children[2]?.textContent).toBe(modell.dismissLabel);
  });

  it("geht bei derselben Konfliktlage nicht ein zweites Mal auf", () => {
    const { dialog } = setup();
    dialog.sync(modell);
    const kinder = dialog.element.children.length;

    // So sieht es aus, wenn der Nutzer tippt: `applyState` laeuft erneut.
    dialog.sync({ ...modell });
    expect(dialog.element.children.length).toBe(kinder);
    expect(dialog.isOpen()).toBe(true);
  });

  it("bleibt zu, wenn der Nutzer ihn geschlossen hat und die Lage gleich bleibt", () => {
    const { dialog } = setup();
    dialog.sync(modell);
    dialog.element.close();

    // Ohne den Schluessel ginge der Dialog hier wieder auf - genau das war
    // der Fehler, den die Regel verhindert.
    dialog.sync({ ...modell });
    expect(dialog.isOpen()).toBe(false);
  });

  it("oeffnet bei einer NEUEN Lage wieder", () => {
    const { dialog } = setup();
    dialog.sync(modell);
    dialog.element.close();

    // Andere Server-Version: das ist ein neuer Konflikt, kein alter.
    dialog.sync({ ...modell, serverVersion: 9 });
    expect(dialog.isOpen()).toBe(true);
  });

  it("schliesst sich, wenn kein Konflikt mehr vorliegt", () => {
    const { dialog } = setup();
    dialog.sync(modell);
    expect(dialog.isOpen()).toBe(true);

    dialog.sync(null);
    expect(dialog.isOpen()).toBe(false);
  });

  it("meldet 'Server laden' und schliesst vorher", () => {
    const { dialog, onReload } = setup();
    dialog.sync(modell);

    const actions = dialog.element.children[2];
    actions?.children[0]?.click();
    expect(dialog.isOpen()).toBe(false);
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("meldet 'Eigene senden' und schliesst vorher", () => {
    const { dialog, onRetry } = setup();
    dialog.sync(modell);

    const actions = dialog.element.children[2];
    actions?.children[1]?.click();
    expect(dialog.isOpen()).toBe(false);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("schliesst bei 'Spaeter', ohne etwas zu senden", () => {
    const { dialog, onReload, onRetry } = setup();
    dialog.sync(modell);

    const actions = dialog.element.children[2];
    actions?.children[2]?.click();
    expect(dialog.isOpen()).toBe(false);
    expect(onReload).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("ersetzt die Knoepfe bei einer neuen Lage statt sie zu stapeln", () => {
    const { dialog } = setup();
    dialog.sync(modell);
    dialog.element.close();
    dialog.sync({ ...modell, serverVersion: 9, pending: 4 });

    const actions = dialog.element.children[2];
    // Drei, nicht sechs: ein zweiter Aufbau haengt sonst an den alten an.
    expect(actions?.children).toHaveLength(3);
    expect(actions?.children[1]?.textContent).toBe("Eigene Änderungen senden (2)");
  });
});
