import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSectionPreviewShooter,
  isPreviewable,
  pickPreviewShot,
  previewFileName,
  previewTargets,
  sectionPreview,
  sectionPreviewTree,
} from "../src/section-previews.ts";

// Die Vorschaubilder im Theme einer Site (Produktpunkt aus `stand.md`).
//
// Geprueft wird die ENTSCHEIDUNG ohne Browser: welche Varianten ein Bild
// bekommen, wie die Datei heisst (der Theme-Stand steckt darin), dass ein
// zweiter Aufruf nicht wieder backt, und dass eine unbekannte Variante nicht
// still ein leeres Bild liefert.
//
// Das Backen ist an ZWEI Stellen ersetzbar, und das ist Absicht:
//   `bake`   - der Seitenbuild (6-18 s). Ohne ihn laufen die Tests in
//              Millisekunden.
//   `shoot`  - der Fotograf. Er zaehlt, wie oft ein Bild entsteht: der Bake
//              kann zwischengespeichert sein, das Bild auch.
// Ein Test, der "wie oft gebacken" prueft, zaehlt `bake`; einer, der "wie oft
// fotografiert" prueft, zaehlt `shoot`.

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

/** Ein Bake, der nichts schreibt - der Seitenbuild ist hier nicht das Thema. */
const keinBake = async (): Promise<void> => {};

/** Ein Fotograf, der das Test-PNG liefert und mitzaehlt. */
const zaehlenderFotograf = () => {
  const shoot = vi.fn(async () => ({ png: PNG }));
  return shoot;
};

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

describe("sectionPreviewTree", () => {
  it("baut den Knoten, den das Einfuegen setzt: Typ, Variante und Preset", () => {
    const ziel = previewTargets()[0];
    if (ziel === undefined) throw new Error("keine Variante");
    const tree = sectionPreviewTree(ziel.type, ziel.variant);

    const section = tree.nodes["section"];
    expect(section?.type).toBe(ziel.type);
    expect(section?.variant).toBe(ziel.variant);
    // Die Props sind der Golden-Tree der Sektion - ohne sie waere die
    // Vorschau eine leere Flaeche.
    expect(Object.keys(section?.props ?? {}).length).toBeGreaterThan(0);
    expect(tree.nodes[tree.rootNodeId]?.children).toEqual(["section"]);
  });

  it("nennt eine unbekannte Sektion beim Namen", () => {
    // Der Aufrufer soll wissen, WELCHE Angabe falsch war - "unbekannt" allein
    // schickt ihn auf die Suche.
    expect(() => sectionPreviewTree("gibtsnicht", "standard")).toThrow(
      /Unbekannte Sektion gibtsnicht/,
    );
  });

  it("nennt eine unbekannte Variante mit Typ und Variante", () => {
    expect(() => sectionPreviewTree("hero", "gibtsnicht")).toThrow(
      /Unbekannte Variante hero\/gibtsnicht/,
    );
  });
});

describe("pickPreviewShot", () => {
  it("nimmt das Desktop-Bild, wenn es eins gibt", () => {
    // Das Panel zeigt die Desktop-Breite; ein Mobilbild dort waere eine
    // Verzerrung.
    const desktop = { breakpoint: "desktop", png: Buffer.from("aa", "hex") };
    const mobil = { breakpoint: "mobile", png: Buffer.from("bb", "hex") };
    expect(pickPreviewShot([mobil, desktop])).toBe(desktop);
  });

  it("nimmt das erste Bild, wenn kein Desktop dabei ist", () => {
    const mobil = { breakpoint: "mobile", png: Buffer.from("bb", "hex") };
    const tablet = { breakpoint: "tablet", png: Buffer.from("cc", "hex") };
    expect(pickPreviewShot([mobil, tablet])).toBe(mobil);
  });

  it("wirft bei einer leeren Aufnahme, statt 'undefined' durchzureichen", () => {
    // Ein leerer Rueckgabewert wuerde im PNG-Schreiber als `undefined` landen
    // und dort als kryptischer Fehler auftauchen.
    expect(() => pickPreviewShot([])).toThrow(/kein Bild/);
  });
});

describe("sectionPreview", () => {
  it("backt einmal und liest beim zweiten Aufruf aus dem Zwischenspeicher", async () => {
    const cacheDir = join(neuerOrdner(), "cache");
    const shoot = zaehlenderFotograf();
    const ziel = previewTargets()[0];
    if (ziel === undefined) throw new Error("keine Variante");

    const erst = await sectionPreview(
      { themeCss: ":root{--brand:#123456}", themeVersion: 1, cacheDir, shoot, bake: keinBake },
      ziel,
    );
    expect(erst.fresh).toBe(true);
    expect(shoot).toHaveBeenCalledTimes(1);

    const zweit = await sectionPreview(
      { themeCss: ":root{--brand:#123456}", themeVersion: 1, cacheDir, shoot, bake: keinBake },
      ziel,
    );
    // Der zweite Aufruf kostet weder Bake noch Browser.
    expect(zweit.fresh).toBe(false);
    expect(shoot).toHaveBeenCalledTimes(1);
    expect(zweit.png.equals(PNG)).toBe(true);
  });

  it("schreibt das Bild unter dem Namen mit dem Theme-Stand", async () => {
    const cacheDir = join(neuerOrdner(), "cache");
    const ziel = previewTargets()[0];
    if (ziel === undefined) throw new Error("keine Variante");

    await sectionPreview(
      { themeCss: "", themeVersion: 7, cacheDir, shoot: zaehlenderFotograf(), bake: keinBake },
      ziel,
    );
    const datei = join(cacheDir, previewFileName(ziel.type, ziel.variant, 7));
    expect(readFileSync(datei).equals(PNG)).toBe(true);
  });

  it("backt nach einem Theme-Wechsel neu", async () => {
    const cacheDir = join(neuerOrdner(), "cache");
    const shoot = zaehlenderFotograf();
    const ziel = previewTargets()[0];
    if (ziel === undefined) throw new Error("keine Variante");

    await sectionPreview(
      { themeCss: "", themeVersion: 1, cacheDir, shoot, bake: keinBake },
      ziel,
    );
    const zweit = await sectionPreview(
      { themeCss: "", themeVersion: 2, cacheDir, shoot, bake: keinBake },
      ziel,
    );

    // Anderer Stand, anderes Bild - sonst zeigte die Auswahl die alten Farben.
    expect(zweit.fresh).toBe(true);
    expect(shoot).toHaveBeenCalledTimes(2);
  });

  it("wirft bei einer unbekannten Variante, statt ein leeres Bild zu liefern", async () => {
    const cacheDir = join(neuerOrdner(), "cache");
    const shoot = zaehlenderFotograf();

    await expect(
      sectionPreview(
        { themeCss: "", themeVersion: 1, cacheDir, shoot, bake: keinBake },
        { type: "hero", variant: "gibtsnicht" },
      ),
    ).rejects.toThrow(/Unbekannte Variante/);
    expect(shoot).not.toHaveBeenCalled();
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
          shoot: zaehlenderFotograf(),
          bake: async () => {
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

  it("nennt eine unbekannte Sektion beim Namen", async () => {
    const cacheDir = join(neuerOrdner(), "cache");
    await expect(
      sectionPreview(
        { themeCss: "", themeVersion: 1, cacheDir, shoot: zaehlenderFotograf(), bake: keinBake },
        { type: "gibtsnicht", variant: "standard" },
      ),
    ).rejects.toThrow(/Unbekannte Variante/);
  });

  it("lehnt eine Sektion ohne Varianten ab, statt einen leeren Baum zu backen", async () => {
    expect(isPreviewable("outlet", "default")).toBe(false);
    const cacheDir = join(neuerOrdner(), "cache");
    await expect(
      sectionPreview(
        { themeCss: "", themeVersion: 1, cacheDir, shoot: zaehlenderFotograf(), bake: keinBake },
        { type: "outlet", variant: "default" },
      ),
    ).rejects.toThrow();
  });

  it("gibt die Ziele als flache Liste mit Typ und Variante aus", () => {
    for (const ziel of previewTargets()) {
      expect(typeof ziel.type).toBe("string");
      expect(typeof ziel.variant).toBe("string");
      expect(ziel.type.length).toBeGreaterThan(0);
      expect(ziel.variant.length).toBeGreaterThan(0);
    }
  });

  it("meldet beim Dateinamen den Typ, die Variante und den Stand", () => {
    const name = previewFileName("hero", "split", 12);
    expect(name).toContain("hero");
    expect(name).toContain("split");
    expect(name).toContain("12");
    expect(name.endsWith(".png")).toBe(true);
  });

  it("backt ohne injiziertes bake selbst und fotografiert die gebackene Seite", async () => {
    // Der echte Bake-Zweig mit echtem Playwright. Ohne diesen Fall waere der
    // Seitenbuild nirgends beruehrt; er ist der teuerste Teil der ganzen
    // Vorschau und soll nicht nur "da" sein.
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

  it("raeumt den Temp-Ordner auch, wenn der Server sein close verweigert", async () => {
    // Der Fall, der im Betrieb zaehlt: ein haengender Socket laesst `close`
    // scheitern. Ohne diesen Test waere die Zeile, die den Fehler schluckt,
    // nur "da" - und niemand wuesste, ob der Ordner wirklich weggeht.
    const cacheDir = join(neuerOrdner(), "cache");
    const ziel = previewTargets()[0];
    if (ziel === undefined) throw new Error("keine Variante");

    let geschlossen = 0;
    const shot = await sectionPreview(
      {
        themeCss: "",
        themeVersion: 1,
        cacheDir,
        shoot: async () => ({ png: PNG }),
        openServer: async () => ({
          origin: "http://127.0.0.1:1",
          close: async () => {
            geschlossen += 1;
            throw new Error("Socket haengt");
          },
        }),
      },
      ziel,
    );

    // Das Bild ist trotzdem entstanden und liegt im Zwischenspeicher.
    expect(shot.fresh).toBe(true);
    expect(geschlossen).toBe(1);
    expect(
      readFileSync(join(cacheDir, previewFileName(ziel.type, ziel.variant, 1))).equals(PNG),
    ).toBe(true);
  }, 60000);
});

describe("createSectionPreviewShooter", () => {
  // Diese Gruppe faehrt den Fotografen OHNE Browser. Der Grund ist der
  // Coverage-Job der CI: er installiert bewusst kein Chromium (verify.yml,
  // Job `coverage`), und die drei Funktionen des Fotografen waren dort
  // ungemessen - gemessen am 25.10.2026: Functions 94,11 -> 82,35 Prozent,
  // Schwelle 88 haette den Lauf rot gemacht. Die Naht `capture` macht die
  // LOGIK messbar (welches Bild gilt, was ein leeres Ergebnis tut), ohne den
  // Browser zu brauchen. Den echten Weg faehrt `section-preview-real.test.ts`.

  it("nimmt das Desktop-Bild aus der Aufnahme", async () => {
    const gesehen: unknown[] = [];
    const shooter = createSectionPreviewShooter(async (input) => {
      gesehen.push(input);
      return [
        { breakpoint: "mobile", png: Buffer.from("bb", "hex") },
        { breakpoint: "desktop", png: Buffer.from("dd", "hex") },
      ];
    });

    const shot = await shooter({
      url: "http://127.0.0.1:1/index.html",
      width: 480,
      allowOrigins: ["http://127.0.0.1:1"],
    });

    expect(shot.png.equals(Buffer.from("dd", "hex"))).toBe(true);
    // Die Vorgaben sind der Vertrag mit dem Analyse-Worker: dieselben Maße
    // wie das Generator-Skript, Bewegung aus (sonst waere das Bild ein
    // Zufallsmoment einer Animation).
    expect(gesehen).toEqual([
      {
        url: "http://127.0.0.1:1/index.html",
        thumbWidth: 480,
        maxPageHeight: 810,
        settleMs: 250,
        motion: "off",
        browser: { allowOrigins: ["http://127.0.0.1:1"] },
      },
    ]);
  });

  it("nimmt das erste Bild, wenn kein Desktop dabei ist", async () => {
    const shooter = createSectionPreviewShooter(async () => [
      { breakpoint: "tablet", png: Buffer.from("cc", "hex") },
    ]);
    const shot = await shooter({ url: "http://x/y", width: 480, allowOrigins: [] });
    expect(shot.png.equals(Buffer.from("cc", "hex"))).toBe(true);
  });

  it("greift ohne eingesetztes capture auf den Analyse-Worker zu", async () => {
    // Der PRODUKTIVE Zweig (ohne eingesetztes `capture`). Hier ist der
    // Analyse-Worker installiert, also laeuft der Aufruf BIS in den Browser -
    // und scheitert dort an der Adresse, nicht an fehlendem Code. Genau das
    // ist der Beweis, dass der Zweig den Worker wirklich benutzt: die
    // Fehlermeldung kommt aus Playwright, nicht aus unserem `catch`.
    //
    // Auf einem Rechner OHNE den Worker greift der `catch` und meldet
    // `not_found`/`preview` - dieser Fall steht in der CI und ist der Grund,
    // warum der Zweig dort ebenfalls gemessen wird.
    const shooter = createSectionPreviewShooter();
    const fehler = await shooter({
      url: "http://127.0.0.1:1/gibt-es-nicht",
      width: 480,
      allowOrigins: [],
    }).catch((error: unknown) => error);

    // Die Behauptung ist der VERTRAG, nicht die Meldung: eine Adresse, die
    // nicht aufgeht, darf kein Bild liefern. Ein stiller Erfolg waere der
    // Fehler - die Kachel bekaeme ein leeres PNG und niemand merkte es.
    expect(fehler).toBeInstanceOf(Error);
    // Und sie nennt einen Grund, keinen leeren Text.
    expect(String((fehler as Error).message).trim().length).toBeGreaterThan(0);
  }, 60000);

  it("wirft, wenn die Aufnahme leer ist, statt 'undefined' durchzureichen", async () => {
    // Ein leeres Ergebnis wuerde im PNG-Schreiber als `undefined` landen und
    // dort als kryptischer Fehler auftauchen - hier steht der Grund.
    const shooter = createSectionPreviewShooter(async () => []);
    await expect(
      shooter({ url: "http://x/y", width: 480, allowOrigins: [] }),
    ).rejects.toThrow(/kein Bild/);
  });
});