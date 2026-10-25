// Die Raster-Schwellen der Sektionen folgen dem Paar der Site (ADR-0020).
//
// Der Befund, den ADR-0020 benennt: "Registry-Sektionen folgen dem Paar nicht.
// Ihre Raster brechen bei festen Breiten". Die Sektionen benutzen
// Tailwind-Utilities (`md:grid-cols-3`), und Tailwind uebersetzt sie ueber
// die Breakpoint-Variablen. Ueberschreibt man die, brechen die Sektionen an
// den Schwellen der Site.
//
// Diese Tests pruefen die Ableitung selbst (reine Rechnung) und ihre Wirkung
// im gebackenen CSS (der Weg, den der Besucher sieht).
import { describe, expect, it } from "vitest";
import {
  sectionBreakpointTheme,
  sectionBreakpoints,
} from "@senify/widget-engine/section-breakpoints";
import { BREAKPOINTS } from "@senify/widget-engine/breakpoints";

describe("sectionBreakpoints", () => {
  it("nimmt ohne Paar die Tailwind-Standardwerte", () => {
    // Das Standardpaar (1024 / 640) ergibt genau die Tailwind-Standards
    // (sm 640, md 768, lg 1024) - damit bauen bestehende Projekte
    // byte-gleich wie vorher (ADR-0020, Entscheidung 1).
    const bp = sectionBreakpoints(null);
    expect(bp.sm).toBe(640);
    expect(bp.md).toBe(768);
    expect(bp.lg).toBe(1024);
  });

  it("bildet das Standardpaar auf dieselben Zahlen ab", () => {
    const bp = sectionBreakpoints({ ...BREAKPOINTS });
    expect(bp.sm).toBe(640);
    expect(bp.md).toBe(768);
    expect(bp.lg).toBe(1024);
  });

  it("folgt einem eigenen Paar der Site", () => {
    // Ein Framer-Paar (1200 Tablet / 810 Mobil): die Sektionen brechen an
    // den Schwellen der Site, nicht an den Tailwind-Standardwerten. Die
    // Zwischenstufe wandert im gleichen Verhaeltnis mit: heute teilt `md:`
    // die Spanne zwischen 640 und 1024 im Verhaeltnis 1 : 2.
    const bp = sectionBreakpoints({ tablet: 1200, mobile: 810 });
    expect(bp.sm).toBe(810);
    expect(bp.lg).toBe(1200);
    expect(bp.md).toBe(810 + Math.round(390 / 3));
  });

  it("haelt die Reihenfolge der Stufen", () => {
    // Die Stufen muessen aufsteigen: sonst holt die breitere Stufe die
    // schmalere ein und die Sektionen zeigen ihr Layout in der falschen
    // Reihenfolge.
    for (const paar of [
      { tablet: 641, mobile: 320 },
      { tablet: 1024, mobile: 640 },
      { tablet: 1600, mobile: 900 },
      { tablet: 1200, mobile: 810 },
    ]) {
      const bp = sectionBreakpoints(paar);
      expect(bp.sm).toBeLessThan(bp.md);
      expect(bp.md).toBeLessThanOrEqual(bp.lg);
    }
  });
});

describe("sectionBreakpointTheme", () => {
  it("schreibt die drei Tailwind-Variablen", () => {
    const theme = sectionBreakpointTheme({ tablet: 1200, mobile: 810 });
    // 810 px / 940 px / 1200 px in rem (1 rem = 16 px).
    expect(theme).toContain("--breakpoint-sm: 50.625rem");
    expect(theme).toContain("--breakpoint-md: 58.75rem");
    expect(theme).toContain("--breakpoint-lg: 75rem");
    expect(theme).toContain("@theme {");
  });

  it("schreibt ohne Paar die Tailwind-Standardwerte", () => {
    const theme = sectionBreakpointTheme(null);
    expect(theme).toContain("--breakpoint-sm: 40rem");
    expect(theme).toContain("--breakpoint-md: 48rem");
    expect(theme).toContain("--breakpoint-lg: 64rem");
  });
});
