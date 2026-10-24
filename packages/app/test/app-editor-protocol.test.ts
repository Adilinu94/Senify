import { describe, expect, it } from "vitest";
import {
  createProtocolLog,
  type CreateProtocolLogOptions,
  type ProtocolElement,
} from "../public/app-editor-protocol.js";

// Das Bau-Protokoll unter dem Canvas (R12-Schnitt aus `app-editor.js`).
//
// Der Block hatte keine Tests: er war ein Teil der 913-Zeilen-Closure und nur
// ueber den Browser erreichbar. Jetzt ist er ein Modul mit eigener Flaeche,
// und die vier Regeln, auf die es ankommt, stehen hier:
//
//   1. die neueste Zeile steht OBEN,
//   2. die Liste bleibt bei sechs Zeilen (ein Protokoll, das den Bildschirm
//      fuellt, ist keins mehr),
//   3. ein Ereignis ohne Actor heisst "Unbekannt" statt "undefined",
//   4. die Zeit kommt von aussen - ein Test kann sie festhalten.

type FakeNode = ProtocolElement & { tag: string; className: string; ownText: string };

function fakeDoc(): {
  host: { children: FakeNode[]; append(child: FakeNode): void };
  el: CreateProtocolLogOptions["el"];
} {
  // Minimaler DOM: `el(tag, spec, ...kinder)` erzeugt Knoten, `append` merkt
  // sich das Kind, `replaceChildren` ersetzt die Kinder. Mehr braucht das
  // Modul nicht - der Test baut nicht mehr nach, als noetig ist.
  const make = (
    tag: string,
    spec?: Record<string, unknown>,
    ...kinder: FakeNode[]
  ): FakeNode => ({
    tag,
    className: typeof spec?.["class"] === "string" ? spec["class"] : "",
    ownText: typeof spec?.["text"] === "string" ? spec["text"] : "",
    hidden: false,
    children: [...kinder],
    append(child: FakeNode) {
      (this.children as FakeNode[]).push(child);
    },
    replaceChildren(...next: FakeNode[]) {
      this.children = next;
    },
  });
  const host = {
    children: [] as FakeNode[],
    append(child: FakeNode) {
      this.children.push(child);
    },
  };
  return { host, el: make as unknown as CreateProtocolLogOptions["el"] };
}

const labels = { insertNode: "Baustein eingefügt", setNodeProp: "Eigenschaft geändert" };
const festeZeit = (): Date => new Date(2026, 9, 24, 14, 5, 9);

describe("createProtocolLog", () => {
  it("legt das Panel an, versteckt es und zeigt es beim ersten Eintrag", () => {
    const { host, el } = fakeDoc();
    const log = createProtocolLog({ doc: {}, el, host, labels, clock: festeZeit });

    expect(host.children).toHaveLength(1);
    expect(log.element.hidden).toBe(true);

    log.log({ actor: { label: "Agent" }, action: "insertNode" });
    expect(log.element.hidden).toBe(false);
  });

  it("stellt die neueste Zeile nach oben", () => {
    const { host, el } = fakeDoc();
    const log = createProtocolLog({ doc: {}, el, host, labels, clock: festeZeit });

    log.log({ actor: { label: "Erster" }, action: "insertNode" });
    log.log({ actor: { label: "Zweiter" }, action: "setNodeProp" });

    // Die Merkliste ist die Wahrheit; das DOM ist ihre Darstellung.
    expect(log.rows().map((row) => row.actor)).toEqual(["Zweiter", "Erster"]);
    // Und im DOM steht die neueste Zeile direkt nach dem Titel.
    const zeilen = (log.element.children as FakeNode[]).filter(
      (child) => child.className === "canvas-view__protocol-row",
    );
    expect((zeilen[0]?.children as FakeNode[])[0]?.ownText).toBe("Zweiter");
  });

  it("behaelt nur sechs Zeilen", () => {
    const { host, el } = fakeDoc();
    const log = createProtocolLog({ doc: {}, el, host, labels, clock: festeZeit });

    for (let i = 1; i <= 9; i += 1) {
      log.log({ actor: { label: `Nr ${i}` }, action: "insertNode" });
    }

    // Ein Protokoll, das unbegrenzt waechst, schiebt den Canvas aus dem Bild.
    expect(log.rows()).toHaveLength(6);
    // Die AELTESTEN fallen heraus, nicht die neuesten.
    expect(log.rows()[0]?.actor).toBe("Nr 9");
    expect(log.rows()[5]?.actor).toBe("Nr 4");
  });

  it("nennt ein Ereignis ohne Actor Unbekannt und ohne Aktion Aenderung", () => {
    const { host, el } = fakeDoc();
    const log = createProtocolLog({ doc: {}, el, host, labels, clock: festeZeit });

    log.log({});
    expect(log.rows()[0]).toMatchObject({ actor: "Unbekannt", action: "Änderung" });

    // Eine unbekannte Aktion wird durchgereicht, nicht verschluckt: sie ist
    // immer noch mehr Information als "Aenderung".
    log.log({ action: "eineNeueAktion" });
    expect(log.rows()[0]?.action).toBe("eineNeueAktion");
  });

  it("uebersetzt bekannte Aktionen und nimmt die Zeit von aussen", () => {
    const { host, el } = fakeDoc();
    const log = createProtocolLog({ doc: {}, el, host, labels, clock: festeZeit });

    log.log({ actor: { label: "Agent" }, action: "setNodeProp" });
    expect(log.rows()[0]).toEqual({
      actor: "Agent",
      action: "Eigenschaft geändert",
      time: "14:05:09",
    });
  });

  it("gibt Kopien heraus, damit niemand die Merkliste von aussen verbiegt", () => {
    const { host, el } = fakeDoc();
    const log = createProtocolLog({ doc: {}, el, host, labels, clock: festeZeit });
    log.log({ actor: { label: "Agent" }, action: "insertNode" });

    const kopie = log.rows();
    const erste = kopie[0];
    if (erste !== undefined) erste.actor = "Manipuliert";
    expect(log.rows()[0]?.actor).toBe("Agent");
  });

  it("zwei Aufrufe teilen sich keinen Zustand", () => {
    // Das ist der Grund, warum die Liste in der Closure liegt und nicht im
    // Modul: zwei Canvas-Ansichten (zwei Seiten) duerfen sich nicht mischen.
    const a = fakeDoc();
    const b = fakeDoc();
    const logA = createProtocolLog({ doc: {}, el: a.el, host: a.host, labels, clock: festeZeit });
    const logB = createProtocolLog({ doc: {}, el: b.el, host: b.host, labels, clock: festeZeit });

    logA.log({ actor: { label: "Nur A" }, action: "insertNode" });
    expect(logA.rows()).toHaveLength(1);
    expect(logB.rows()).toHaveLength(0);
  });
});
