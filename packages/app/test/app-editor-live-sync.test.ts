import { describe, expect, it } from "vitest";
import {
  draftChangedDecision,
  nodesToFlash,
  pageCreatedDecision,
} from "../public/app-editor-live-sync.js";

// Die Entscheidung "was tun mit einer fremden Live-Meldung?", R12-Schnitt aus
// `app-editor.js`. Vorher stand sie ueber vier Handler verteilt in der Closure.
//
// Der teure Fall ist `blocked`: er sieht wie ein normaler Ablauf aus, und ein
// Nachladen an dieser Stelle zerstoert die offenen Aenderungen des Nutzers.

describe("draftChangedDecision", () => {
  const pageId = "p1";

  it("ignoriert eine Meldung ohne Seitenbezug", () => {
    expect(draftChangedDecision({ payload: {}, pageId, isBusy: () => false })).toEqual({
      action: "ignore",
    });
    expect(draftChangedDecision({ payload: null, pageId, isBusy: () => false })).toEqual({
      action: "ignore",
    });
    expect(draftChangedDecision({ payload: { pageId: "" }, pageId, isBusy: () => false })).toEqual({
      action: "ignore",
    });
  });

  it("folgt einer Aenderung auf einer anderen Seite", () => {
    expect(draftChangedDecision({ payload: { pageId: "p2" }, pageId, isBusy: () => false })).toEqual({
      action: "follow",
    });
  });

  it("laedt nach, wenn die offene Seite betroffen ist und nichts offen ist", () => {
    expect(draftChangedDecision({ payload: { pageId }, pageId, isBusy: () => false })).toEqual({
      action: "reload",
    });
  });

  it("blockiert, wenn offene eigene Aenderungen bestehen", () => {
    // Der teure Fall: nachladen wuerde die offenen Aenderungen verwerfen.
    const entscheidung = draftChangedDecision({ payload: { pageId }, pageId, isBusy: () => true });
    expect(entscheidung).toEqual({
      action: "blocked",
      message: "Fremde Änderung erkannt - bitte speichern oder neu laden",
    });
  });

  it("blockiert auch bei einer anderen Seite nicht", () => {
    // Der Seitenwechsel wird an anderer Stelle geprueft (Agent-Vorschau);
    // hier ist die offene Seite nicht betroffen.
    expect(draftChangedDecision({ payload: { pageId: "p2" }, pageId, isBusy: () => true })).toEqual({
      action: "follow",
    });
  });

  it("nimmt eine pageId, die kein String ist, nicht als Ziel", () => {
    expect(draftChangedDecision({ payload: { pageId: 7 }, pageId, isBusy: () => false })).toEqual({
      action: "ignore",
    });
  });
});

describe("pageCreatedDecision", () => {
  it("meldet den Wechsel, wenn die Ansicht gefolgt ist", () => {
    expect(pageCreatedDecision({ payload: { pageId: "p2" }, followed: true })).toEqual({
      action: "followed",
    });
  });

  it("sagt, dass die Seite waehlbar ist, wenn nicht gefolgt wurde", () => {
    expect(pageCreatedDecision({ payload: { pageId: "p2" }, followed: false })).toEqual({
      action: "hint",
      message: "Neue Seite angelegt - im Explorer wählbar",
    });
  });

  it("schweigt, wenn die Meldung keine Seite nennt", () => {
    expect(pageCreatedDecision({ payload: {}, followed: false })).toEqual({ action: "ignored" });
  });
});

describe("nodesToFlash", () => {
  it("nimmt die Kennungen der geaenderten Knoten", () => {
    expect(nodesToFlash({ nodeIds: ["a", "b"] })).toEqual(["a", "b"]);
  });

  it("gibt ohne nodeIds eine leere Liste zurueck statt zu werfen", () => {
    expect(nodesToFlash({})).toEqual([]);
    expect(nodesToFlash(null)).toEqual([]);
    expect(nodesToFlash({ nodeIds: "a" })).toEqual([]);
  });

  it("filtert alles, was keine Knoten-Kennung ist", () => {
    // Zahlen und Objekte wuerden im Canvas still nichts treffen.
    expect(nodesToFlash({ nodeIds: ["a", 7, null, { id: "x" }, "", "b"] })).toEqual(["a", "b"]);
  });
});
