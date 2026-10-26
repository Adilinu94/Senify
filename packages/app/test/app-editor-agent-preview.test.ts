import { describe, expect, it } from "vitest";
import { AGENT_PREVIEW_KEY, createAgentPreview } from "../public/app-editor-agent-preview.js";

// Die Agent-Vorschau (Ticket 05, Punkt 5), R12-Schnitt aus `app-editor.js`.
//
// Vorher standen die drei Regeln in der Closure und waren nur ueber den Browser
// erreichbar. Hier stehen sie als eigene Faelle - besonders die dritte, die
// vorher niemand geprueft hatte: offene eigene Aenderungen blockieren JEDEN
// Seitenwechsel, weil ein Routenwechsel sie verwirft.

function setup({ gespeichert = null as string | null, busy = false } = {}) {
  const store = new Map<string, string>();
  if (gespeichert !== null) store.set(AGENT_PREVIEW_KEY, gespeichert);
  const messages: string[] = [];
  const button = {
    textContent: "",
    classes: [] as string[],
    attributes: {} as Record<string, string>,
    handlers: [] as (() => void)[],
    classList: {
      toggle(name: string, on?: boolean) {
        const has = button.classes.includes(name);
        const want = on ?? !has;
        if (want && !has) button.classes.push(name);
        if (!want && has) button.classes.splice(button.classes.indexOf(name), 1);
      },
    },
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
    button.attributes["data-action"] = String(spec["data-action"]);
    button.textContent = String(spec["text"]);
    return button;
  };
  const storage = {
    get: (key: string) => store.get(key) ?? null,
    set: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  const preview = createAgentPreview({
    el: el as never,
    storage,
    isBusy: () => busy,
    onMessage: (message) => messages.push(message),
  });
  return { button, preview, messages, store };
}

describe("createAgentPreview", () => {
  it("ist beim ersten Besuch AN", () => {
    // Ein leerer Speicher ist kein "aus": der Schalter ist standardmaessig an.
    const { preview } = setup();
    expect(preview.enabled()).toBe(true);
  });

  it("liest ein gespeichertes Aus", () => {
    const { preview } = setup({ gespeichert: "0" });
    expect(preview.enabled()).toBe(false);
  });

  it("schreibt die Entscheidung in den Speicher und an das Element", () => {
    const { preview, button, store } = setup();
    preview.set(false);

    expect(store.get(AGENT_PREVIEW_KEY)).toBe("0");
    expect(button.attributes["aria-pressed"]).toBe("false");
    expect(button.classes).not.toContain("active");
  });

  it("schaltet beim Klick um und meldet es", () => {
    const { preview, button, messages } = setup();
    button.click();
    expect(preview.enabled()).toBe(false);
    expect(messages).toEqual(["Agent-Vorschau aus"]);

    button.click();
    expect(preview.enabled()).toBe(true);
    expect(messages).toEqual(["Agent-Vorschau aus", "Agent-Vorschau an"]);
  });

  it("folgt nicht, wenn der Schalter aus ist", () => {
    const { preview } = setup({ gespeichert: "0" });
    const entscheidung = preview.mayFollow("seite-b", "seite-a");
    expect(entscheidung.allowed).toBe(false);
    // Kein Grund noetig: der Nutzer hat selbst ausgeschaltet.
    expect(entscheidung.reason).toBeNull();
  });

  it("folgt nicht auf die Seite, auf der man schon ist", () => {
    const { preview } = setup();
    expect(preview.mayFollow("seite-a", "seite-a").allowed).toBe(false);
  });

  it("folgt auf eine andere Seite, wenn nichts offen ist", () => {
    const { preview } = setup();
    expect(preview.mayFollow("seite-b", "seite-a")).toEqual({ allowed: true, reason: null });
  });

  it("blockiert den Wechsel bei offenen eigenen Aenderungen und nennt den Grund", () => {
    // Das ist die Regel, die vorher niemand geprueft hatte: ein Routenwechsel
    // verwirft offene Aenderungen - also gar nicht erst wechseln.
    const { preview } = setup({ busy: true });
    const entscheidung = preview.mayFollow("seite-b", "seite-a");

    expect(entscheidung.allowed).toBe(false);
    expect(entscheidung.reason).toBe("Fremde Änderung auf einer anderen Seite - bitte speichern");
  });

  it("setzt den Fokus nicht und taeuscht keinen Zustand vor", () => {
    // Der Schalter ist ein Menuepunkt, kein Dialog: `set` meldet nur, wenn es
    // gefragt wird. Ohne `announce` bleibt die Statuszeile still.
    const { preview, messages } = setup();
    preview.set(false, { announce: false });
    expect(messages).toEqual([]);
    expect(preview.enabled()).toBe(false);
  });
});
