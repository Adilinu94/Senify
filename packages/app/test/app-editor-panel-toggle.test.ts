import { describe, expect, it } from "vitest";
import { createPanelToggle, PANEL_CLOSED, PANEL_OPEN } from "../public/app-editor-panel-toggle.js";

// Die Panel-Umschalter (E8), R12-Schnitt aus `app-editor.js`.
//
// Der Block stand zwischen Canvas-Aufbau und Zoom-Einpassung, obwohl er nur ein
// Attribut am Host umschaltet. Die Regeln, die vorher nur im Browser galten:
// das Attribut am Host ist die Wahrheit, und `aria-pressed` sagt dasselbe wie
// das Attribut.

function setup(attribute = "side", label = "Elemente") {
  const host = {
    attributes: {} as Record<string, string>,
    setAttribute(name: string, value: string) {
      host.attributes[name] = value;
    },
    getAttribute(name: string) {
      return host.attributes[name] ?? null;
    },
  };
  const button = {
    attributes: {} as Record<string, string>,
    handlers: [] as (() => void)[],
    setAttribute(name: string, value: string) {
      button.attributes[name] = value;
    },
    addEventListener(_type: string, handler: () => void) {
      button.handlers.push(handler);
    },
    click() {
      for (const handler of button.handlers) handler();
    },
  };
  const el = (tag: string, spec: Record<string, unknown>) => {
    expect(tag).toBe("button");
    // Der Fake uebernimmt die Attribute, die `el` setzt - sonst prueft der Test
    // nur seinen eigenen Fake.
    for (const [key, value] of Object.entries(spec)) {
      if (key === "type" || key === "class" || key.startsWith("data-") || key.startsWith("aria-")) {
        button.attributes[key] = String(value);
      }
    }
    return button;
  };
  const toggle = createPanelToggle({ el: el as never, host, attribute, label });
  return { host, button, toggle, attribute };
}

describe("createPanelToggle", () => {
  it("startet offen: ohne Attribut am Host gilt das Panel als sichtbar", () => {
    const { toggle, button } = setup();
    expect(toggle.isOpen()).toBe(true);
    expect(button.attributes["aria-pressed"]).toBe("true");
  });

  it("schliesst beim ersten Klick und setzt das Attribut am Host", () => {
    const { host, button, toggle } = setup();
    button.click();

    expect(host.attributes["data-side"]).toBe(PANEL_CLOSED);
    expect(toggle.isOpen()).toBe(false);
    // Gedrueckt heisst "offen"; geschlossen heisst also nicht gedrueckt.
    expect(button.attributes["aria-pressed"]).toBe("false");
  });

  it("oeffnet beim zweiten Klick wieder", () => {
    const { host, button, toggle } = setup();
    button.click();
    button.click();

    expect(host.attributes["data-side"]).toBe(PANEL_OPEN);
    expect(toggle.isOpen()).toBe(true);
    expect(button.attributes["aria-pressed"]).toBe("true");
  });

  it("nimmt ein bereits gesetztes geschlossenes Attribut ernst", () => {
    // Ein Neuaufbau des Hosts darf den Knopf nicht beluegen: das Attribut ist
    // die Wahrheit, nicht ein zweiter Zustand im Modul.
    const { toggle, button, host } = setup();
    host.attributes["data-side"] = PANEL_CLOSED;
    toggle.setOpen(false);

    expect(toggle.isOpen()).toBe(false);
    expect(button.attributes["aria-pressed"]).toBe("false");
  });

  it("haelt die beiden Panels auseinander", () => {
    // Zwei Umschalter auf demselben Host duerfen sich nicht beeinflussen.
    const { host, button } = setup("side");
    const rechts = setup("explorer");
    rechts.host.attributes = host.attributes;

    button.click();
    expect(host.attributes["data-side"]).toBe(PANEL_CLOSED);
    expect(host.attributes["data-explorer"]).toBeUndefined();
    expect(rechts.toggle.isOpen()).toBe(true);
  });

  it("traegt das Attribut, an dem das Stylesheet haengt", () => {
    // `data-panel-toggle` ist der Selektor der Browser-Tests; ohne ihn findet
    // kein Test und kein CSS den Knopf.
    const { button, attribute } = setup("explorer", "Struktur");
    expect(button.attributes["data-panel-toggle"]).toBe(attribute);
    expect(button.attributes["data-panel-toggle"]).toBe("explorer");
  });
});
