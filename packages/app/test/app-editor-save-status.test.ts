import { describe, expect, it } from "vitest";
import { saveControls, saveStatusText } from "../public/app-editor-save-status.js";

// Die Statuszeile des Editors, R12-Schnitt aus `app-editor.js`.
//
// `applyState` war 26 Zeilen, die ableiten UND schreiben taten. Hier steht die
// Ableitung - der Teil mit den Regeln. Vier davon sind leicht zu vertauschen,
// und im Browser faellt es niemandem auf.

describe("saveStatusText", () => {
  it("sagt 'Speichert …' waehrend des Speicherns", () => {
    expect(saveStatusText({ status: "saving" })).toBe("Speichert …");
  });

  it("sagt 'Gespeichert' nach dem Speichern", () => {
    expect(saveStatusText({ status: "saved" })).toBe("Gespeichert");
  });

  it("nennt bei einem Konflikt die Meldung des Speicherers", () => {
    expect(saveStatusText({ status: "conflict", message: "Entwurf wurde geändert" })).toBe(
      "Entwurf wurde geändert",
    );
  });

  it("nimmt beim Konflikt einen eigenen Text, sonst den Standard", () => {
    expect(saveStatusText({ status: "conflict" })).toBe("Entwurf wurde geändert");
  });

  it("laesst den Konflikt alles andere schlagen", () => {
    // Regel 1: auch wenn noch Aenderungen offen sind, ist der Konflikt die
    // Nachricht. "2 offen" waere hier eine Verharmlosung.
    expect(saveStatusText({ status: "conflict", pending: 2 })).toBe("Entwurf wurde geändert");
  });

  it("sagt 'Speichern fehlgeschlagen' bei einem Fehler ohne Meldung", () => {
    expect(saveStatusText({ status: "error" })).toBe("Speichern fehlgeschlagen");
    expect(saveStatusText({ status: "error", message: "Netz weg" })).toBe("Netz weg");
  });

  it("zaehlt offene Aenderungen", () => {
    expect(saveStatusText({ status: "idle", pending: 3 })).toBe("3 offen");
  });

  it("ist ohne offene Aenderungen LEER, nicht '0 offen'", () => {
    // Regel 2: eine Null waere eine Zahl, die es nicht gibt.
    expect(saveStatusText({ status: "idle", pending: 0 })).toBe("");
    expect(saveStatusText({})).toBe("");
    expect(saveStatusText(null)).toBe("");
  });

  it("haengt 'nicht speicherbar' an, statt die Meldung zu ersetzen", () => {
    // Regel 4: die eigentliche Meldung darf nicht hinter der Liste
    // verschwinden.
    expect(
      saveStatusText({ status: "saved", unsupported: ["animation", "grid"] }),
    ).toBe("Gespeichert · nicht speicherbar: animation, grid");
  });

  it("setzt kein fuehrendes Trennzeichen, wenn es keine Meldung gibt", () => {
    expect(saveStatusText({ status: "idle", unsupported: ["animation"] })).toBe(
      "nicht speicherbar: animation",
    );
  });

  it("vertraegt ein fehlendes oder falsches unsupported-Feld", () => {
    expect(saveStatusText({ status: "saved" })).toBe("Gespeichert");
    expect(saveStatusText({ status: "saved", unsupported: [] })).toBe("Gespeichert");
    // Kein `.join` auf einem Nicht-Array.
    expect(
      saveStatusText({ status: "saved", unsupported: "kaputt" as unknown as string[] }),
    ).toBe("Gespeichert");
  });
});

describe("saveControls", () => {
  it("sperrt den Speichern-Knopf ohne offene Aenderungen", () => {
    expect(saveControls({ pending: 0 })).toEqual({
      pending: 0,
      saveDisabled: true,
      saveLabel: "Speichern",
      conflict: false,
    });
  });

  it("nennt die Zahl der offenen Aenderungen am Knopf", () => {
    expect(saveControls({ pending: 4 })).toEqual({
      pending: 4,
      saveDisabled: false,
      saveLabel: "Speichern (4)",
      conflict: false,
    });
  });

  it("meldet den Konflikt fuer die beiden Konflikt-Knoepfe", () => {
    expect(saveControls({ status: "conflict", pending: 1 }).conflict).toBe(true);
  });

  it("vertraegt einen fehlenden Zustand", () => {
    expect(saveControls(undefined)).toEqual({
      pending: 0,
      saveDisabled: true,
      saveLabel: "Speichern",
      conflict: false,
    });
  });
});
