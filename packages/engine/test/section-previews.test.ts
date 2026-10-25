import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPreviewable,
  previewFileName,
  previewTargets,
  sectionPreview,
} from "../src/section-previews.ts";

// Die Vorschaubilder im Theme einer Site (Produktpunkt aus `stand.md`).
//
// Geprueft wird die ENTSCHEIDUNG ohne Browser: welche Varianten ein Bild
// bekommen, wie die Datei heisst (der Theme-Stand steckt darin), dass ein
// zweiter Aufruf nicht wieder backt, und dass eine unbekannte Variante nicht
// still ein leeres Bild liefert. Das Backen selbst ist injiziert; es hat einen
// eigenen Test (unten), weil ein echter Bake einen Browser startet.

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex",
);

const ordner: string[] = [];
function neuerOrdner(): string {
  const dir = mkdtempSync(join(tmpdir(), "senify-section-previews-test-"));
  ordner.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of ordner.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const ersatz = () => vi.fn(async () => PNG);

describe("previewTargets", () => {
  it("bietet nur einfuegbare Sektionen an", () => {
    const ziele = previewTargets();
    expect(ziele.length).toBeGreaterThan(0);
    // Die drei gesperrten Typen brauchen einen Zusammenhang und haben kein Bild.
    for (const gesperrt of ["outlet", "collection-list", "card"]) {
      expect(ziele.some((ziel) => ziel.type === gesperrt)).toBe(false);
    }
  });

  it("nennt zu jeder Sektion ihre Varianten, jede genau einmal", () => {
    const ziele = previewTargets();
    const hero = ziele.filter((ziel) => ziel.type === "hero");
    expect(hero.length).toBeGreaterThan(1);
    const schluessel = ziele.map((ziel) => `${ziel.type}/${ziel.variant}`);
    expect(new Set(schluessel).size).toBe(schluessel.length);
  });
});

describe("isPreviewable", () => {
  it("erkennt eine angebotene Variante", () => {
    const erstes = previewTargets()[0];
    expect(erstes).toBeDefined();
    expect(isPreviewable(erstes?.type ?? "", erstes?.variant ?? "")).toBe(true);
  });

  it("lehnt eine unbekannte Sektion und eine unbekannte Variante ab", () => {
    expect(isPreviewable("gibtsnicht", "standard")).toBe(false);
    expect(isPreviewable("hero", "gibtsnicht")).toBe(false);
  });

  it("lehnt die drei gesperrten Typen ab, auch mit echter Variante", () => {
    expect(isPreviewable("outlet", "default")).toBe(false);
    expect(isPreviewable("card", "default")).toBe(false);
  });
});

describe("previewFileName", () => {
  it("traegt den Theme-Stand im Namen", () => {
    // Ein neues Theme ergibt einen neuen Namen - niemand muss pruefen, ob ein
    // Bild alt ist.
    expect(previewFileName("hero", "split", 3)).toBe("hero-split-v3.png");
    expect(previewFileName("hero", "split", 4)).toBe("hero-split-v4.png");
  });
});

describe("sectionPreview", () => {
  it("backt einmal und liest beim zweiten Aufruf aus dem Zwischenspeicher", async () => {
    const cacheDir = join(neuerOrdner(), "cache");
    const render = ersatz();
    const ziel = previewTargets()[0];
    if (ziel === undefined) throw new Error("keine Variante");

    const erst = await sectionPreview(
      { themeCss: ":root{--brand:#123456}", themeVersion: 1, cacheDir, shoot: vi.fn(), render },
      ziel,
    );
    expect(erst.fresh).toBe(true);
    expect(render).toHaveBeenCalledTimes(1);

    const zweit = await sectionPreview(
      { themeCss: ":root{--brand:#123456}", themeVersion: 1, cacheDir, shoot: vi.fn(), render },
      ziel,
    );
    // Der zweite Aufruf kostet keinen Browser.
    expect(zweit.fresh).toBe(false);
    expect(render).toHaveBeenCalledTimes(1);
    expect(zweit.png.equals(PNG)).toBe(true);
  });

  it("schreibt das Bild unter dem Namen mit dem Theme-Stand", async () => {
    const cacheDir = join(neuerOrdner(), "cache");
    const ziel = previewTargets()[0];
    if (ziel === undefined) throw new Error("keine Variante");

    await sectionPreview(
      { themeCss: "", themeVersion: 7, cacheDir, shoot: vi.fn(), render: ersatz() },
      ziel,
    );
    const datei = join(cacheDir, previewFileName(ziel.type, ziel.variant, 7));
    expect(readFileSync(datei).equals(PNG)).toBe(true);
  });

  it("backt nach einem Theme-Wechsel neu", async () => {
    const cacheDir = join(neuerOrdner(), "cache");
    const render = ersatz();
    const ziel = previewTargets()[0];
    if (ziel === undefined) throw new Error("keine Variante");

    await sectionPreview(
      { themeCss: "", themeVersion: 1, cacheDir, shoot: vi.fn(), render },
      ziel,
    );
    const zweit = await sectionPreview(
      { themeCss: "", themeVersion: 2, cacheDir, shoot: vi.fn(), render },
      ziel,
    );

    // Anderer Stand, anderes Bild - sonst zeigte die Auswahl die alten Farben.
    expect(zweit.fresh).toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("wirft bei einer unbekannten Variante, statt ein leeres Bild zu liefern", async () => {
    const cacheDir = join(neuerOrdner(), "cache");
    const render = ersatz();

    await expect(
      sectionPreview(
        { themeCss: "", themeVersion: 1, cacheDir, shoot: vi.fn(), render },
        { type: "hero", variant: "gibtsnicht" },
      ),
    ).rejects.toThrow(/Unbekannte Variante/);
    expect(render).not.toHaveBeenCalled();
  });

  it("laesst kein Bild liegen, wenn das Backen scheitert", async () => {
    const cacheDir = join(neuerOrdner(), "cache");
    const ziel = previewTargets()[0];
    if (ziel === undefined) throw new Error("keine Variante");

    await expect(
      sectionPreview(
        {
          themeCss: "",
          themeVersion: 1,
          cacheDir,
          shoot: vi.fn(),
          render: async () => {
            throw new Error("Browser weg");
          },
        },
        ziel,
      ),
    ).rejects.toThrow("Browser weg");

    // Kein halbes Bild im Zwischenspeicher: sonst bliebe der Fehler fuer immer.
    const datei = join(cacheDir, previewFileName(ziel.type, ziel.variant, 1));
    expect(() => readFileSync(datei)).toThrow();
  });

  it("backt ohne injiziertes render selbst und fotografiert die gebackene Seite", async () => {
    // Der echte Weg: bakeSite laeuft, nur der Browser ist ein Doppel. Ohne
    // diesen Fall waere der Bake-Zweig nirgends beruehrt.
    const cacheDir = join(neuerOrdner(), "cache");
    const gesehen: string[] = [];
    const shoot = vi.fn(async (input: { url: string; width: number }) => {
      gesehen.push(input.url);
      expect(input.width).toBe(480);
      return { png: PNG };
    });
    const ziel = previewTargets()[0];
    if (ziel === undefined) throw new Error("keine Variante");

    const shot = await sectionPreview(
      { themeCss: ":root{--brand:#abcdef}", themeVersion: 1, cacheDir, shoot },
      ziel,
    );

    expect(shot.fresh).toBe(true);
    expect(gesehen).toHaveLength(1);
    expect(gesehen[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/index\.html$/);
    expect(shoot).toHaveBeenCalledTimes(1);
  }, 120000);
});
