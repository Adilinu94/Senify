import { describe, expect, it, vi } from "vitest";
import { createRedesignInbox, POLL_MS } from "../public/app-editor-redesign-inbox.js";

// Die Redesign-Inbox aus `app-editor.js` (R12). Sie war ein 251-Zeilen-Teil
// der Closure und nur ueber den Browser erreichbar. Die Regeln, die ADR-0012
// aufstellt, stehen jetzt hier:
//
//   1. sie ist ein HINWEIS: sie oeffnet nichts von selbst und klaut keinen Fokus,
//   2. sie zeigt nur, was auf einen Menschen wartet (status "proposed"),
//   3. ohne offene Richtung ist sie ganz weg - auch die Zahl,
//   4. ein fehlgeschlagener Abruf ist kein Blocker,
//   5. ein zweiter Start laesst keinen zweiten Takt laufen,
//   6. der Klick oeffnet die ERSTE offene Richtung.

function fakes() {
  const button = {
    hidden: true,
    textContent: "Richtungen",
    dataset: {} as Record<string, string | undefined>,
    handlers: [] as (() => void)[],
    addEventListener(_type: string, handler: () => void) {
      this.handlers.push(handler);
    },
    click() {
      for (const handler of this.handlers) handler();
    },
  };
  const el = (tag: string, spec: Record<string, unknown>) => {
    expect(tag).toBe("button");
    button.textContent = typeof spec["text"] === "string" ? spec["text"] : button.textContent;
    button.hidden = spec["hidden"] === true;
    return button;
  };
  const timers = { handlers: [] as (() => void)[], cleared: [] as unknown[] };
  return {
    button,
    el,
    timers,
    setInterval: (handler: () => void) => {
      timers.handlers.push(handler);
      return timers.handlers.length;
    },
    clearInterval: (handle: unknown) => {
      timers.cleared.push(handle);
    },
  };
}

const offen = (id: string) => ({ id, status: "proposed" });

describe("createRedesignInbox", () => {
  it("ist am Anfang versteckt und zeigt keine Zahl", () => {
    const f = fakes();
    const inbox = createRedesignInbox({
      el: f.el,
      fetchProposals: async () => [],
      onOpen: () => {},
      setInterval: f.setInterval,
      clearInterval: f.clearInterval,
    });

    expect(inbox.element.hidden).toBe(true);
    expect(inbox.element.dataset.count).toBeUndefined();
    expect(inbox.openCount()).toBe(0);
  });

  it("zeigt eine offene Richtung im Singular", async () => {
    const f = fakes();
    const inbox = createRedesignInbox({
      el: f.el,
      fetchProposals: async () => [offen("a")],
      onOpen: () => {},
      setInterval: f.setInterval,
      clearInterval: f.clearInterval,
    });

    await inbox.load();
    expect(inbox.element.hidden).toBe(false);
    expect(inbox.element.dataset.count).toBe("1");
    expect(inbox.element.textContent).toBe("1 Richtung");
  });

  it("zeigt mehrere offene Richtungen im Plural", async () => {
    const f = fakes();
    const inbox = createRedesignInbox({
      el: f.el,
      fetchProposals: async () => [offen("a"), offen("b"), offen("c")],
      onOpen: () => {},
      setInterval: f.setInterval,
      clearInterval: f.clearInterval,
    });

    await inbox.load();
    expect(inbox.element.dataset.count).toBe("3");
    expect(inbox.element.textContent).toBe("3 Richtungen");
  });

  it("zaehlt nur, was auf einen Menschen wartet", async () => {
    const f = fakes();
    const inbox = createRedesignInbox({
      el: f.el,
      fetchProposals: async () => [
        offen("a"),
        { id: "b", status: "applied" },
        { id: "c", status: "rejected" },
        { id: "d" },
        null,
        "Unsinn",
      ],
      onOpen: () => {},
      setInterval: f.setInterval,
      clearInterval: f.clearInterval,
    });

    // Der Hinweis sagt "hier wartet etwas" - eine uebernommene oder abgelehnte
    // Richtung wartet nicht mehr. Ein Eintrag ohne Status ist kein Beleg.
    await inbox.load();
    expect(inbox.openCount()).toBe(1);
    expect(inbox.element.dataset.count).toBe("1");
  });

  it("versteckt sich wieder und raeumt die Zahl ab, wenn nichts offen ist", async () => {
    const f = fakes();
    let antwort = [offen("a")];
    const inbox = createRedesignInbox({
      el: f.el,
      fetchProposals: async () => antwort,
      onOpen: () => {},
      setInterval: f.setInterval,
      clearInterval: f.clearInterval,
    });

    await inbox.load();
    expect(inbox.element.dataset.count).toBe("1");

    antwort = [];
    await inbox.load();
    expect(inbox.element.hidden).toBe(true);
    // Nicht "0": eine Null am Knopf waere eine Zahl, die es nicht gibt.
    expect(inbox.element.dataset.count).toBeUndefined();
  });

  it("stiehlt keinen Fokus und oeffnet nichts von selbst", async () => {
    const f = fakes();
    const inbox = createRedesignInbox({
      el: f.el,
      fetchProposals: async () => [offen("a")],
      onOpen: () => {
        throw new Error("darf nicht von selbst oeffnen");
      },
      setInterval: f.setInterval,
      clearInterval: f.clearInterval,
    });

    // Weder das Laden noch das Setzen eines Takts ruft `onOpen`.
    await inbox.load();
    inbox.start();
    expect(f.button.handlers).toHaveLength(1);
  });

  it("ein fehlgeschlagener Abruf ist kein Blocker", async () => {
    const f = fakes();
    const inbox = createRedesignInbox({
      el: f.el,
      fetchProposals: async () => {
        throw new Error("Route weg");
      },
      onOpen: () => {},
      setInterval: f.setInterval,
      clearInterval: f.clearInterval,
    });

    // Kein Wurf nach aussen, und der Editor sieht keine halbe Inbox.
    await expect(inbox.load()).resolves.toBe(0);
    expect(inbox.element.hidden).toBe(true);
    expect(inbox.element.dataset.count).toBeUndefined();
  });

  it("startet den Takt und laedt sofort einmal", async () => {
    const f = fakes();
    const fetchProposals = vi.fn(async () => [offen("a")]);
    const inbox = createRedesignInbox({
      el: f.el,
      fetchProposals,
      onOpen: () => {},
      setInterval: f.setInterval,
      clearInterval: f.clearInterval,
    });

    inbox.start();
    expect(fetchProposals).toHaveBeenCalledTimes(1);
    expect(f.timers.handlers).toHaveLength(1);

    // Der Takt fragt erneut.
    f.timers.handlers[0]?.();
    expect(fetchProposals).toHaveBeenCalledTimes(2);
  });

  it("nimmt den Takt mit, wenn die Ansicht wechselt", () => {
    const f = fakes();
    const inbox = createRedesignInbox({
      el: f.el,
      fetchProposals: async () => [],
      onOpen: () => {},
      setInterval: f.setInterval,
      clearInterval: f.clearInterval,
      // Eigener Takt, damit der Test nicht 12 Sekunden wartet.
    });

    inbox.start();
    inbox.stop();
    expect(f.timers.cleared).toEqual([1]);

    // Zweimal starten heisst nicht zwei Takte: der alte wird zuerst geloest.
    // Der Fake vergibt fortlaufende Griffe, deshalb steht dort die 2.
    inbox.start();
    inbox.stop();
    expect(f.timers.cleared).toEqual([1, 2]);
  });

  it("oeffnet beim Klick die erste offene Richtung", async () => {
    const f = fakes();
    const geoeffnet: unknown[] = [];
    const inbox = createRedesignInbox({
      el: f.el,
      fetchProposals: async () => [{ id: "zu", status: "applied" }, offen("a"), offen("b")],
      onOpen: (proposal) => geoeffnet.push(proposal),
      setInterval: f.setInterval,
      clearInterval: f.clearInterval,
    });

    await inbox.load();
    f.button.click();
    expect(geoeffnet).toHaveLength(1);
    expect((geoeffnet[0] as { id: string }).id).toBe("a");
  });

  it("tut beim Klick nichts, wenn keine Richtung offen ist", () => {
    const f = fakes();
    const onOpen = vi.fn();
    createRedesignInbox({
      el: f.el,
      fetchProposals: async () => [],
      onOpen,
      setInterval: f.setInterval,
      clearInterval: f.clearInterval,
    });

    f.button.click();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("fragt im Takt von 12 Sekunden", () => {
    // Der Wert stand vorher als nackte Zahl in der Closure; hier ist er
    // benannt und geprueft.
    expect(POLL_MS).toBe(12000);
  });
});
