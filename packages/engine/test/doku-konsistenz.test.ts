import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Prueft die Current-Dokumente gegen den Code.
//
// Der Anlass: am 23.10.2026 stand die Moduluebersicht als eine 7 046 Zeichen
// lange Tabellenzelle in `docs/current/stand.md` - 73 Dateinamen, 8
// Routenzahlen, 8 Zeilenzahlen, alles von Hand. Zwei Routenzahlen waren falsch
// (`http-routes-sites.ts` 64 statt 61, `http-routes-media.ts` 16 statt 15),
// vier Mapper-Module fehlten ganz. Ein Mensch findet das nicht beim Lesen.
//
// Die Uebersicht liegt jetzt in `docs/current/module.md` und wird von
// `scripts/render-modules.mjs` aus dem Code erzeugt. Diese Datei prueft beide
// Seiten: dass der Generator die Datei reproduziert, und dass die Prosa in
// `stand.md` nicht wieder Zahlen von Hand behauptet.
const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(dirname(dirname(here)));
const SRC = join(root, "packages", "engine", "src");
const PUB = join(root, "packages", "app", "public");

const stand = readFileSync(join(root, "docs/current/stand.md"), "utf8").split(/\r?\n/);
const fahrplan = readFileSync(join(root, "docs/fahrplan.md"), "utf8").split(/\r?\n/);
const architektur = readFileSync(join(root, "docs/current/architektur.md"), "utf8").split(/\r?\n/);
const module = readFileSync(join(root, "docs/current/module.md"), "utf8");

function r12Zeile() {
  const zeile = stand.find((l) => l.startsWith("| R12 |"));
  if (zeile === undefined) throw new Error("R12-Zeile fehlt in docs/current/stand.md");
  return zeile;
}

describe("Doku-Waechter: die Moduluebersicht gehoert dem Generator", () => {
  it("module.md ist, was der Generator schreibt", () => {
    // Dasselbe Muster wie bei der Route-Matrix: eine generierte Datei, die
    // niemand prueft, driftet still.
    expect(() =>
      execFileSync(process.execPath, [join(root, "scripts", "render-modules.mjs"), "--check"], {
        cwd: root,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("nennt jedes Fachmodul im Bericht", () => {
    const genannt = new Set([...module.matchAll(/^\| `([a-z0-9-]+\.(?:ts|js))`/gm)].map((m) => m[1]));
    const vorhanden = [
      ...readdirSync(SRC).filter((n) => /^(store|http)-.*\.ts$/.test(n)),
      ...readdirSync(PUB).filter((n) => /^app-.*\.js$/.test(n)),
    ];
    const fehlend = vorhanden.filter((n) => !genannt.has(n)).sort();
    expect(fehlend).toEqual([]);
  });

  it("begruendet jede grosse Datei, die noch als Ganzes steht", () => {
    // Der Befund vom 24.10.2026: `http-routes-sites.ts` war mit 1 440 Zeilen die
    // zweitgroesste Datei im Baum und stand trotzdem NICHT in der Liste "Was
    // noch nicht geteilt ist". Die Liste ist eine Entscheidung, keine Messung -
    // aber eine Datei, die die Schwelle reisst und in keiner der beiden Listen
    // steht, ist eine vergessene Entscheidung. Genau das soll hier auffallen.
    //
    // Die Schwelle ist bewusst die Zeilenzahl der groessten Datei, die noch
    // geteilt wird (`app-references.js` nach Schritt 59): alles darueber muss
    // entweder ein Fachmodul sein oder einen Grund haben.
    const SCHWELLE = 1000;
    const begruendet = new Set(
      [...module.matchAll(/^\| `([^`]+\.(?:ts|js))` \| \d+ \|/gm)].map((m) => m[1]),
    );

    const kandidaten: Array<[string, string]> = [
      ...[...readdirSync(SRC).filter((n) => n.endsWith(".ts"))].map((n) => [n, join(SRC, n)] as [string, string]),
      ...[...readdirSync(PUB).filter((n) => n.endsWith(".js"))].map((n) => [n, join(PUB, n)] as [string, string]),
      ...["packages/mcp/src/tools.ts", "packages/editor/src/inspector/inspector.ts",
          "packages/editor/src/inspector/model.ts", "packages/editor/src/canvas/canvas.ts",
          "packages/framer-import/src/capture-html.ts", "packages/framer-import/src/mapper.ts",
      ].map((p) => [p.split("/").pop()!, join(root, p)] as [string, string]),
    ];

    const vergessen: string[] = [];
    for (const [name, pfad] of kandidaten) {
      const text = readFileSync(pfad, "utf8");
      const n = text.split(/\r?\n/).length;
      if (n <= SCHWELLE) continue;
      // Der Bericht nennt entweder den Dateinamen (Fachmodul-Tabellen) oder den
      // vollen Pfad (BLEIBT-Tabelle).
      const relat = pfad.slice(root.length + 1).replace(/\\/g, "/");
      if (!begruendet.has(relat) && !begruendet.has(name)) {
        vergessen.push(`${relat}: ${n} Zeilen, weder Fachmodul noch begruendet`);
      }
    }
    expect(vergessen.sort()).toEqual([]);
  });

  it("nennt je Route-Modul die richtige Routenzahl", () => {
    // Der Befund vom 23.10.2026: die Zahl stand von Hand in `stand.md` und war
    // fuer zwei Module falsch. Jetzt steht sie im Bericht, und der Bericht
    // kommt aus der Datei, die er beschreibt.
    const falsch = [];
    for (const m of module.matchAll(/^\| `(http-routes-[a-z-]+\.ts)` \| (\d+|-) \|/gm)) {
      const datei = m[1];
      if (datei === undefined) continue;
      const behauptet = m[2] === "-" ? 0 : Number(m[2]);
      const echt = (readFileSync(join(SRC, datei), "utf8").match(/^\s*method: "/gm) ?? []).length;
      if (echt !== behauptet) falsch.push(`${datei}: Bericht ${behauptet}, Code ${echt}`);
    }
    expect(falsch).toEqual([]);
  });

  it("nennt in der Summe so viele Routen, wie die Module tragen", () => {
    const module_ = readdirSync(SRC).filter((n) => n.startsWith("http-routes-") && n.endsWith(".ts"));
    const summe = module_.reduce(
      (n, name) => n + (readFileSync(join(SRC, name), "utf8").match(/^\s*method: "/gm) ?? []).length,
      0,
    );
    const genannt = Number(/^\| \*\*Summe\*\* \| \*\*(\d+)\*\*/m.exec(module)?.[1] ?? -1);
    expect(summe).toBe(genannt);

    // Gegenprobe zur Route-Matrix: dieselbe Zahl steht dort auch - die Matrix
    // liest Text, dieser Test liest die Tabelle.
    const matrix = readFileSync(join(root, "docs/mcp-route-matrix.md"), "utf8");
    expect(summe).toBe(Number(/\*\*Zahlen:\*\* (\d+) Routen/.exec(matrix)?.[1] ?? -1));
  });

  it("haelt die R12-Zeile frei von handgepflegten Zahlen", () => {
    // Die Zeile darf den Fortschritt in Worten nennen (sie nennt die vier
    // Transaktionen und die 211 von 235 Delegaten - das ist eine Aussage ueber
    // eine Datei, die man pruefen kann). Sie darf NICHT wieder 73 Dateinamen
    // und 8 Routenzahlen tragen: genau das ist am 23.10.2026 driftet.
    const zeile = r12Zeile();
    expect(zeile).toContain("docs/current/module.md");
    const dateinamen = [...zeile.matchAll(/`([a-z0-9-]+\.(?:ts|js))`/g)].map((m) => m[1]);
    expect(dateinamen.length).toBeLessThanOrEqual(4);
    expect(zeile).not.toMatch(/\d+ Routen/);
  });
});

describe("Doku-Waechter: die Risiko-Nummern sind synchron", () => {
  // `docs/README.md` sagt: die Risiko-Nummern sind ueber `fahrplan.md`,
  // `stand.md` und `architektur.md` identisch. Am 23.10.2026 war das nicht mehr
  // wahr: der Fahrplan fuehrte R1-R20, die Current-Dokumente R1-R13. Wer R14
  // nachschlagen wollte (die vitest-Frist), fand in `stand.md` nichts.
  const ids = (L: string[]): string[] =>
    [
      ...new Set(
        L.filter((l) => /^\| R\d+ \|/.test(l)).map((l) => /^\| (R\d+) \|/.exec(l)?.[1] ?? ""),
      ),
    ]
      .filter((id) => id !== "")
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

  it("fuehrt in stand.md dieselben Risiken wie fahrplan.md", () => {
    expect(ids(stand)).toEqual(ids(fahrplan));
  });

  it("fuehrt in architektur.md dieselben Risiken wie fahrplan.md", () => {
    expect(ids(architektur)).toEqual(ids(fahrplan));
  });

  it("nennt in der Prosa dieselbe Obergrenze wie das Register", () => {
    // Der Befund vom 24.10.2026: die Mengen stimmten, die Prosa nicht.
    // `docs/README.md` und der Kopf von `fahrplan.md` sagten weiterhin
    // "R1-R13", waehrend alle drei Register R1-R20 fuehrten. Der Mengen-Waechter
    // oben sieht das nicht, weil er nur Tabellenzeilen liest.
    const register = ids(fahrplan);
    const hoechste = register[register.length - 1];
    expect(hoechste, "das Register ist leer").toBeDefined();

    // Eine Bereichsangabe tragen nur die drei Dokumente, die sie behaupten.
    // `stand.md` sagt stattdessen, dass es die Nummern von `fahrplan.md`
    // uebernimmt - dort waere eine zweite Bereichsangabe eine Doppelung.
    //
    // Gezaehlt wird nur die verbindliche Aussage: die Zeile muss zugleich
    // "synchron" oder "identisch" sagen. Historische Nennungen ("die Zeile
    // sagte bis zum 24.10. R1-R13") sind Bericht und bleiben erlaubt - der
    // erste Anlauf verwarf genau sie und war damit ein Fehlalarm.
    const anspruch = /synchron|identisch/i;
    const dokumente: Array<[string, string[], boolean]> = [
      ["docs/README.md", readFileSync(join(root, "docs/README.md"), "utf8").split(/\r?\n/), true],
      ["docs/fahrplan.md", fahrplan, true],
      ["docs/current/architektur.md", architektur, true],
      ["docs/current/stand.md", stand, false],
    ];
    const falsch: string[] = [];
    for (const [name, L, pflicht] of dokumente) {
      const bereiche: string[] = [];
      for (let i = 0; i < L.length; i++) {
        if (!anspruch.test(L[i]!)) continue;
        for (const m of L[i]!.matchAll(/`R1`\s*[-–]\s*`(R\d+)`/g)) bereiche.push(`${i + 1}|${m[1]}`);
      }
      if (pflicht && bereiche.length === 0) {
        falsch.push(`${name}: keine verbindliche Bereichsangabe R1-R? gefunden`);
        continue;
      }
      for (const treffer of bereiche) {
        const [zeile, ende] = treffer.split("|");
        if (ende !== hoechste) falsch.push(`${name}:${zeile} endet auf ${ende} statt ${hoechste}`);
      }
    }
    expect(falsch).toEqual([]);
  });

  it("laesst die Ueberschrift nicht offen, wenn jeder Punkt geschlossen ist", () => {
    // Der Befund vom 24.10.2026: P3-7 stand als "offen" im Fahrplan, obwohl
    // alle sechs Tabellenzeilen darunter mit Datum, Messwert und Testbeleg
    // geschlossen waren. Wer die Ueberschrift liest, plant Arbeit ein, die es
    // nicht gibt. Geprueft wird die Richtung in beide Faelle: eine offene
    // Zeile unter "geschlossen" ist genauso falsch.
    const falsch: string[] = [];
    for (let i = 0; i < fahrplan.length; i++) {
      const kopf = /^### (P\d-\d+) .*?[-–—] (offen|geschlossen)\b/.exec(fahrplan[i] ?? "");
      if (kopf === null) continue;
      const [, id, status] = kopf;
      const rumpf: string[] = [];
      for (let j = i + 1; j < fahrplan.length && !/^### /.test(fahrplan[j] ?? ""); j++) rumpf.push(fahrplan[j] ?? "");
      const punkte = rumpf.filter((l) => /^\| \d+b? \|/.test(l));
      // Ohne nummerierte Punkttabelle ist die Ueberschrift die einzige Quelle.
      if (punkte.length === 0) continue;
      const offen = punkte.filter((l) => !l.includes("geschlossen"));
      if (status === "offen" && offen.length === 0) {
        falsch.push(`${id}: Ueberschrift "offen", aber alle ${punkte.length} Punkte sind geschlossen`);
      }
      if (status === "geschlossen" && offen.length > 0) {
        falsch.push(`${id}: Ueberschrift "geschlossen", aber ${offen.length} Punkt(e) ohne Geschlossen-Vermerk`);
      }
    }
    expect(falsch).toEqual([]);
  });

  it("hat fuer jede Risiko-Nummer eine Zeile mit vier Zellen", () => {
    // Eine Zeile mit drei Pipes ist in Markdown keine Tabellenzeile: sie
    // verschwindet aus der Darstellung, und die Nummer steht da, ohne dass
    // jemand sie sieht.
    const dokumente: Array<[string, string[]]> = [
      ["stand.md", stand],
      ["architektur.md", architektur],
      ["fahrplan.md", fahrplan],
    ];
    for (const [name, L] of dokumente) {
      for (const id of ids(L)) {
        const zeile = L.find((l) => l.startsWith(`| ${id} |`));
        expect(zeile, `${name}: ${id} fehlt`).toBeDefined();
        expect((zeile?.match(/\|/g) ?? []).length, `${name}: ${id} hat nicht vier Zellen`).toBe(5);
      }
    }
  });
});
