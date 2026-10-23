import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Die Oberflaeche liegt seit dem Split (P3-2 Schritt 27) in ES-Modulen, und
// neun Importe laufen im Kreis: `app.js` holt die Views, die Views holen
// `renderRoute` aus `app.js`. Heute ist das harmlos - jede Funktion, die
// ueber eine solche Kante laeuft, ist eine `function`-Deklaration, und die
// wird gehoisted: sie ist beim Auswerten des Moduls schon da.
//
// Das ist eine Eigenschaft, die man nicht sieht. Wer eine dieser Funktionen
// spaeter in ein `const` umbaut (weil es moderner aussieht, weil ein
// Standardwert dazukommt), bekommt zur Ladezeit `undefined` - und der Fehler
// zeigt sich als `x is not a function` irgendwo in der Oberflaeche, nicht an
// der Stelle der Aenderung.
//
// `pnpm deps:check` faengt das nicht: die Regel `no-new-package-cycle` gilt
// auf der Ordnerebene und mit Absicht nur zwischen PAKETEN. Ein Zyklus
// zwischen zwei Dateien desselben Pakets ist eine Frage der Dateiorganisation,
// keine der Paketgrenze (so steht es im Kommentar der Regel). Fuer `app-core.js`
// und die Views ist das trotzdem eine Last: sie laden in einer Reihenfolge,
// die niemand aufgeschrieben hat.
//
// Dieser Test haelt die Bedingung fest, unter der die Zyklen harmlos sind:
// **ueber eine Zykluskante darf nur ein gehoisteter Export laufen.** Er ist
// kein Verbot von Zyklen - er ist die Bedingung, unter der sie hier stehen
// duerfen.
const hier = dirname(fileURLToPath(import.meta.url));
const publicDir = join(dirname(hier), "public");

type Export = {
  name: string;
  art: "function" | "const" | "let" | "class" | "re-export";
  datei: string;
};

function exporte(): Map<string, Export[]> {
  const karte = new Map<string, Export[]>();
  for (const datei of readdirSync(publicDir).filter((f) => f.startsWith("app") && f.endsWith(".js"))) {
    const text = readFileSync(join(publicDir, datei), "utf8");
    const liste: Export[] = [];
    for (const m of text.matchAll(/^export (async )?(function|const|let|class) ([\w$]+)/gm)) {
      const art = m[2] as Export["art"];
      liste.push({ name: m[3] ?? "", art, datei });
    }
    // Ein Re-Export ist so gut wie das Original: `export { x } from "./y.js"`
    // laedt `y` und gibt dessen Bindung weiter. Fuer die Frage "ist das beim
    // Auswerten da" zaehlt die Art des Originals - deshalb wird der Re-Export
    // als eigener Eintrag gefuehrt und spaeter aufgeloest.
    for (const m of text.matchAll(/^export \{([^}]+)\} from "\.\/([\w.-]+\.js)";$/gm)) {
      for (const name of (m[1] ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
        liste.push({ name, art: "re-export", datei: m[2] ?? "" });
      }
    }
    karte.set(datei, liste);
  }
  return karte;
}

function importe(datei: string): { ziel: string; namen: string[] }[] {
  const text = readFileSync(join(publicDir, datei), "utf8");
  const kanten: { ziel: string; namen: string[] }[] = [];
  for (const m of text.matchAll(/^import \{([^}]+)\} from "\.\/([\w.-]+\.js)";$/gm)) {
    const ziel = m[2];
    if (!ziel || ziel === datei) continue;
    kanten.push({
      ziel,
      namen: (m[1] ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    });
  }
  return kanten;
}

function zyklen(): string[][] {
  const dateien = readdirSync(publicDir).filter((f) => f.startsWith("app") && f.endsWith(".js"));
  const graph = new Map(dateien.map((f) => [f, importe(f).map((k) => k.ziel)]));
  const gesehen = new Set<string>();
  const stapel: string[] = [];
  const gefunden: string[][] = [];

  const besuchen = (knoten: string): void => {
    if (stapel.includes(knoten)) {
      gefunden.push([...stapel.slice(stapel.indexOf(knoten))]);
      return;
    }
    if (gesehen.has(knoten)) return;
    gesehen.add(knoten);
    stapel.push(knoten);
    for (const ziel of graph.get(knoten) ?? []) besuchen(ziel);
    stapel.pop();
  };
  for (const f of graph.keys()) besuchen(f);

  // Dieselbe Kette kann ueber mehrere Startknoten gefunden werden.
  const eindeutig = new Map<string, string[]>();
  for (const k of gefunden) eindeutig.set([...k].sort().join("|"), k);
  return [...eindeutig.values()];
}

describe("Oberflaeche: die Bedingung der Import-Zyklen", () => {
  it("fuehrt ueber eine Zykluskante nur gehoistete Exporte", () => {
    const karte = exporte();
    const verstoesse: string[] = [];

    const aufloesen = (eintrag: Export | undefined): Export | undefined => {
      if (!eintrag || eintrag.art !== "re-export") return eintrag;
      const ziel = karte.get(eintrag.datei)?.find((x) => x.name === eintrag.name);
      // Ein Re-Export auf einen Re-Export gibt es hier nicht; wenn doch,
      // meldet der Test es als Verstoss statt still zu bestehen.
      return ziel?.art === "re-export" ? undefined : ziel;
    };

    for (const kette of zyklen()) {
      for (let i = 0; i < kette.length; i++) {
        const von = kette[i] ?? "";
        const nach = kette[(i + 1) % kette.length] ?? "";
        const kante = importe(von).find((k) => k.ziel === nach);
        if (!kante) continue;
        for (const name of kante.namen) {
          const roh = karte.get(nach)?.find((x) => x.name === name);
          const echt = aufloesen(roh);
          if (!echt) {
            verstoesse.push(`${von} -> ${nach}: ${name} (nicht aufloesbar)`);
          } else if (echt.art !== "function") {
            verstoesse.push(`${von} -> ${nach}: ${name} ist ein ${echt.art}, nicht gehoisted`);
          }
        }
      }
    }

    expect(verstoesse).toEqual([]);
  });
});
