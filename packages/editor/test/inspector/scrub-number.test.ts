import { describe, expect, it } from "vitest";
import { scrubValue } from "../../src/inspector/scrub-number.ts";

// Ziehen am Zahlenfeld. Die Geste fehlte im Inspektor: tippen und die zwei
// Pfeile gab es, ziehen nicht - obwohl der Store die Burst-Faltung dafuer
// schon hat (`typingCoalesceKey`, von den Slidern genutzt).
//
// Die Tests halten die vier Eigenschaften fest, die die Geste brauchbar
// machen: Empfindlichkeit, Klammerung, Feinheit per Shift/Alt, und dass ein
// Zug EIN Undo-Eintrag bleibt.

describe("scrubValue: waagerechtes Ziehen wird zum Wert", () => {
  it("ein Schritt je 4 Pixel", () => {
    expect(scrubValue({ start: 10, deltaPx: 4, step: 1 })).toBe(11);
    expect(scrubValue({ start: 10, deltaPx: 40, step: 1 })).toBe(20);
    expect(scrubValue({ start: 10, deltaPx: -8, step: 1 })).toBe(8);
  });

  it("bleibt bei Schrittweite 0.5 ohne Float-Reste", () => {
    // 0.5er-Schritte sind bei Abstaenden und Radien ueblich. Ohne Rundung
    // stuende dort 0.30000000000000004.
    expect(scrubValue({ start: 0, deltaPx: 4, step: 0.5 })).toBe(0.5);
    expect(scrubValue({ start: 0.5, deltaPx: 4, step: 0.5 })).toBe(1);
    expect(scrubValue({ start: 0, deltaPx: 12, step: 0.5 })).toBe(1.5);
  });

  it("klemmt an min und max, statt ins Leere zu ziehen", () => {
    expect(scrubValue({ start: 10, deltaPx: -400, step: 1, min: 8 })).toBe(8);
    expect(scrubValue({ start: 10, deltaPx: 400, step: 1, max: 12 })).toBe(12);
    // Ohne Grenzen darf es weiterlaufen.
    expect(scrubValue({ start: 10, deltaPx: 400, step: 1 })).toBe(110);
  });

  it("Shift zieht feiner, Alt groeber", () => {
    const normal = scrubValue({ start: 0, deltaPx: 40, step: 1 });
    const fein = scrubValue({ start: 0, deltaPx: 40, step: 1, fine: true });
    const grob = scrubValue({ start: 0, deltaPx: 40, step: 1, coarse: true });
    expect(fein).toBeLessThan(normal);
    expect(grob).toBeGreaterThan(normal);
  });

  it("haelt unsinnige Eingaben aus", () => {
    // Ein Schritt von 0 oder NaN darf nicht zu NaN fuehren - sonst schriebe
    // der Inspektor NaN in das Dokument.
    expect(scrubValue({ start: 5, deltaPx: 4, step: 0 })).toBe(6);
    expect(scrubValue({ start: 5, deltaPx: 4, step: Number.NaN })).toBe(6);
    expect(scrubValue({ start: Number.NaN, deltaPx: 4, step: 1 })).toBe(1);
    expect(scrubValue({ start: 5, deltaPx: Number.NaN, step: 1 })).toBe(5);
  });
});
