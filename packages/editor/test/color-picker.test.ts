import { describe, expect, it } from "vitest";
import {
  colorFromPad,
  hsbToRgb,
  hueFromStrip,
  hueStripStops,
  padPosition,
  parseHex,
  rgbToHsb,
  toHex,
} from "../src/inspector/color-picker.ts";

// Die Rechnung des Farbwaehlers. Sie ist DOM-frei, damit die Faelle hier ohne
// Browser laufen; die Geste selbst belegt `color-picker-browser.test.ts`.
//
// Jeder Fall nennt den Grund, warum er da ist. Die drei wichtigsten:
//
//   1. Die Umrechnung muss bei den Eckwerten EXAKT sein (#ff0000 ist nicht
//      "fast rot"). Ein Farbwaehler, der beim Oeffnen die Farbe veraendert,
//      ist unbrauchbar.
//   2. Der Verlauf muss in HSB rechnen. Der Gegenbeweis steht unten: in HSL
//      waere die Mitte des Verlaufs nicht die Haelfte der Saettigung.
//   3. Fremde Farbformen (rgb(), "transparent", benannte Farben) duerfen NICHT
//      geraten werden - sie kommen als `null` zurueck, und der Aufrufer laesst
//      das Textfeld stehen.

describe("parseHex: nur die Formen, die der Inspektor schreibt", () => {
  it("liest #rrggbb und #rgb", () => {
    expect(parseHex("#4f8cff")).toEqual({ r: 0x4f, g: 0x8c, b: 0xff });
    // Die Kurzform ist keine andere Farbe, sie ist dieselbe in drei Ziffern.
    expect(parseHex("#f00")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseHex("#F00")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("gibt fuer alles andere null zurueck, statt zu raten", () => {
    // Der Grund: `rgb(255 0 0 / 50%)` und `transparent` sind gueltige
    // CSS-Farben, aber keine Hex-Werte. Ein Waehler, der sie "interpretiert",
    // schreibt beim ersten Klick eine andere Farbe zurueck.
    for (const fremd of [
      "transparent",
      "rgb(255 0 0)",
      "red",
      "hsl(0 100% 50%)",
      "#ff00",
      "#gggggg",
      "",
      "  ",
    ]) {
      expect(parseHex(fremd), fremd).toBeNull();
    }
  });

  it("ignoriert Leerzeichen am Rand", () => {
    expect(parseHex("  #00ff00  ")).toEqual({ r: 0, g: 255, b: 0 });
  });
});

describe("toHex: schreibt klein und immer sechsstellig", () => {
  it("fuellt kurze Kanaele auf", () => {
    expect(toHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
    expect(toHex({ r: 1, g: 2, b: 3 })).toBe("#010203");
  });

  it("klemmt Werte ausserhalb von 0..255, statt Unsinn zu schreiben", () => {
    expect(toHex({ r: -20, g: 300, b: 128.4 })).toBe("#00ff80");
  });
});

describe("rgbToHsb / hsbToRgb: die Umrechnung ist verlustfrei", () => {
  it("trifft die Eckwerte exakt", () => {
    expect(rgbToHsb({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, b: 1 });
    expect(rgbToHsb({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 1, b: 1 });
    expect(rgbToHsb({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 1, b: 1 });
    // Grau hat keinen Farbton und keine Saettigung - nicht "Farbton 0".
    expect(rgbToHsb({ r: 128, g: 128, b: 128 })).toEqual({ h: 0, s: 0, b: 128 / 255 });
    expect(rgbToHsb({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, b: 0 });
  });

  it("geht hin und zurueck, ohne die Farbe zu verschieben", () => {
    // Jede Farbe, die der Waehler schreibt, muss er auch wieder lesen koennen.
    for (const hex of ["#4f8cff", "#ff9a00", "#12ab34", "#c0ffee", "#7f7f7f"]) {
      const rgb = parseHex(hex);
      expect(rgb).not.toBeNull();
      expect(toHex(hsbToRgb(rgbToHsb(rgb!))), hex).toBe(hex);
    }
  });

  it("nimmt einen Farbton ausserhalb von 0..360 mit", () => {
    // Ein Zug am Streifen kann rechnerisch ueber den Rand gehen; das darf
    // nicht zu einer falschen Farbe fuehren.
    expect(hsbToRgb({ h: 360, s: 1, b: 1 })).toEqual(hsbToRgb({ h: 0, s: 1, b: 1 }));
    expect(hsbToRgb({ h: -120, s: 1, b: 1 })).toEqual(hsbToRgb({ h: 240, s: 1, b: 1 }));
  });
});

describe("der Verlauf rechnet in HSB, nicht in HSL", () => {
  it("die Mitte des Verlaufs ist die halbe Saettigung bei gleicher Helligkeit", () => {
    // DAS ist der Grund fuer HSB: links grau, rechts voll, oben hell. In der
    // Mitte steht genau der halbe Weg - und die Helligkeit bleibt, was sie
    // oben war.
    const links = colorFromPad(210, 0, 0);
    const mitte = colorFromPad(210, 0.5, 0);
    const rechts = colorFromPad(210, 1, 0);

    expect(links).toBe("#ffffff");
    expect(rechts).toBe("#0080ff");
    // Nachgerechnet fuer h=210, s=0.5, b=1: chroma 0.5, x 0.25, m 0.5 -
    // also (0,5 / 0,75 / 1,0) mal 255 = 128 / 191 / 255.
    expect(mitte).toBe("#80bfff");

    // Gegenprobe fuer die Entscheidung: die Helligkeit (der groesste Kanal)
    // ist bei allen drei gleich. In HSL waere sie es nicht - dort sinkt die
    // wahrgenommene Helligkeit mit steigender Saettigung, und der Verlauf
    // bekaeme einen sichtbaren Bauch.
    const helligkeit = (hex: string): number => {
      const rgb = parseHex(hex)!;
      return Math.max(rgb.r, rgb.g, rgb.b);
    };
    expect(helligkeit(links)).toBe(255);
    expect(helligkeit(mitte)).toBe(255);
    expect(helligkeit(rechts)).toBe(255);
  });

  it("oben ist hell und unten dunkel", () => {
    expect(colorFromPad(0, 1, 0)).toBe("#ff0000");
    expect(colorFromPad(0, 1, 1)).toBe("#000000");
    // Die Haelfte nach unten ist die halbe Helligkeit, nicht "ein bisschen
    // dunkler": 128 ist genau die Mitte zwischen 255 und 0.
    expect(colorFromPad(0, 1, 0.5)).toBe("#800000");
  });

  it("x und y ausserhalb der Flaeche werden geklemmt", () => {
    // Ein Zug, der die Flaeche verlaesst, soll am Rand bleiben und nicht in
    // eine ungueltige Farbe laufen.
    expect(colorFromPad(0, -3, 0)).toBe(colorFromPad(0, 0, 0));
    expect(colorFromPad(0, 5, 9)).toBe(colorFromPad(0, 1, 1));
  });
});

describe("padPosition: wo der Griff steht", () => {
  it("nennt den Punkt der aktuellen Farbe", () => {
    expect(padPosition("#ff0000")).toEqual({ x: 1, y: 0 });
    // Schwarz steht am linken Rand, ganz unten: es hat keine Saettigung, also
    // liegt es auf der Grau-Achse (x = 0), und die ist unten schwarz. Ein
    // Waehler, der Schwarz nach rechts setzt, behauptet eine Saettigung, die
    // die Farbe nicht hat.
    expect(padPosition("#000000")).toEqual({ x: 0, y: 1 });
    expect(padPosition("#ffffff")).toEqual({ x: 0, y: 0 });
  });

  it("gibt fuer Nicht-Hex null zurueck", () => {
    // Der Aufrufer blendet den Griff dann aus, statt ihn in die Ecke zu
    // setzen und eine Farbe zu behaupten, die nicht da ist.
    expect(padPosition("transparent")).toBeNull();
    expect(padPosition("rgb(1 2 3)")).toBeNull();
  });

  it("findet den Punkt auch nach einer Runde durch den Verlauf wieder", () => {
    const hex = colorFromPad(275, 0.42, 0.3);
    const point = padPosition(hex)!;
    expect(point.x).toBeCloseTo(0.42, 1);
    expect(point.y).toBeCloseTo(0.3, 1);
  });
});

describe("der Farbton-Streifen", () => {
  it("verteilt 0..360 Grad ueber die Breite", () => {
    expect(hueFromStrip(0)).toBe(0);
    expect(hueFromStrip(0.5)).toBe(180);
    expect(hueFromStrip(1)).toBe(360);
  });

  it("klemmt ausserhalb der Breite", () => {
    expect(hueFromStrip(-1)).toBe(0);
    expect(hueFromStrip(2)).toBe(360);
  });

  it("hat sieben Stuetzstellen, die an beiden Enden zusammenlaufen", () => {
    // Rot bei 0 und bei 360 - derselbe Wert, sonst haette der Streifen eine
    // sichtbare Naht.
    const stops = hueStripStops();
    expect(stops).toHaveLength(7);
    expect(stops[0]).toBe("#ff0000");
    expect(stops[6]).toBe("#ff0000");
    // Und die drei Grundfarben liegen dort, wo man sie erwartet.
    expect(stops[2]).toBe("#00ff00");
    expect(stops[4]).toBe("#0000ff");
  });
});
