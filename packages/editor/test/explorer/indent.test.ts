import { describe, expect, it } from "vitest";
import { indentForDepth } from "../../src/explorer/indent.ts";

// Die Einrueckung im Ebenenbaum war `6 + depth * 14` px, ohne Deckel. Gemessen
// an den drei echten Exporten:
//
//   Export                          Tiefe  Einrueckung  Zeilen mit kaum Platz
//   framer-stupendous-football        16        230 px                      3
//   framer-fluffy-rectangle           20        286 px                    477
//   framer-easier-train               18        258 px                     62
//
// Das Panel ist 259 px breit (UI-Audit 24.09.2026). Bei Tiefe 20 laeuft die
// Zeile also 27 px aus dem Panel, und in der grossen Fixture hat fast jede
// dritte Zeile keinen Platz fuer ihren Namen mehr.
//
// Die Einrueckung ist ein Hinweis, keine Messung: ab einer Grenze darf sie
// stehen bleiben. Der Bezug zum Elternteil bleibt ueber die Baumlinie und die
// Reihenfolge lesbar.

describe("indentForDepth: die Einrueckung laeuft nicht aus dem Panel", () => {
  it("beginnt flach mit einem kleinen Rand", () => {
    expect(indentForDepth(0)).toBe(6);
    expect(indentForDepth(1)).toBe(20);
    expect(indentForDepth(2)).toBe(34);
  });

  it("bleibt ab der Grenze stehen, statt weiter zu wachsen", () => {
    const grenze = indentForDepth(11);
    expect(indentForDepth(12)).toBe(grenze);
    expect(indentForDepth(18)).toBe(grenze);
    expect(indentForDepth(20)).toBe(grenze);
  });

  it("laesst mindestens die halbe Panelbreite fuer den Namen", () => {
    // Ein Panel von 259 px: der Name braucht die Haelfte, sonst ist die Zeile
    // unlesbar. Der Deckel muss das einhalten - auch bei Tiefe 40.
    const panel = 259;
    for (const depth of [0, 5, 11, 12, 18, 20, 40]) {
      expect(indentForDepth(depth)).toBeLessThanOrEqual(panel / 2);
    }
  });

  it("bleibt bei negativer Tiefe beim Grundrand", () => {
    expect(indentForDepth(-3)).toBe(6);
  });
});
