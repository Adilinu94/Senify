import { existsSync, readFileSync, readdirSync } from "node:fs";
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

/** Zeilen wie im Editor gezaehlt - ein Schluss-Newline macht keine Zeile. */
function zeilenZahl(pfad: string): number {
  const roh = readFileSync(pfad, "utf8");
  const n = roh.split(/\r?\n/).length;
  return roh.endsWith("\n") ? n - 1 : n;
}

/**
 * Jede Quelldatei unter `packages` im Ordner `src` oder `public`, rekursiv.
 *
 * Bewusst OHNE Dateiliste: die vorige Fassung des grossen-Dateien-Waechters
 * zaehlte sechs Pfade von Hand auf und uebersah dabei fuenf Dateien ueber
 * 1 000 Zeilen. `node_modules`, `dist` und `.tmp` fliegen raus - das sind
 * Build-Reste, keine Quellen.
 */
function quellDateien(): string[] {
  const treffer: string[] = [];
  const lauf = (dir: string): void => {
    let eintraege: Array<{ name: string; isDirectory(): boolean }>;
    try {
      eintraege = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Paket ohne `src`/`public`
    }
    for (const e of eintraege) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".tmp") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) lauf(p);
      else if (/\.(ts|js)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) treffer.push(p);
    }
  };
  for (const paket of readdirSync(join(root, "packages"), { withFileTypes: true })) {
    if (!paket.isDirectory()) continue;
    for (const teil of ["src", "public"]) lauf(join(root, "packages", paket.name, teil));
  }
  return treffer;
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
    // Befund vom 25.10.2026: der Waechter sah trotzdem nur einen Teil des
    // Baums. Er las `packages/engine/src` NICHT rekursiv (also nicht
    // `mutations/apply.ts`) und sonst eine von Hand gepflegte Liste von sechs
    // Pfaden. Fuenf Dateien ueber der Schwelle waren damit unsichtbar:
    // `manifest/src/tools.ts` (1 796), `editor/src/state/operations.ts`
    // (1 240), `engine/src/mutations/apply.ts` (1 144),
    // `renderer/src/motion.ts` (1 137) und `renderer/src/bake.ts` (1 004) -
    // zusammen 6 321 Zeilen ohne Entscheidung. Eine Liste von Dateien, die man
    // messen soll, ist genau die Liste, die man zu spaet nachzieht.
    //
    // Deshalb jetzt ohne Liste: der Waechter laeuft selbst durch `packages/`,
    // und der Test darunter beweist, dass er dabei nichts auslaesst.
    //
    // Die Schwelle ist eine Konvention, keine Ableitung. Sie war einmal die
    // Zeilenzahl der groessten Datei, die noch geteilt wird - dieser Bezug ist
    // entfallen (`app-references.js` liegt nach Schritt 59 bei 597). 1000
    // Zeilen heisst: die Datei passt nicht mehr in einen Pruefdurchgang, und
    // die Frage "wohin gehoert eine Aenderung" wird unklar. Wer sie reisst,
    // entscheidet bewusst - teilen oder begruenden.
    const SCHWELLE = 1000;
    // Zwei Tabellen, zwei Aussagen: `BLEIBT` begruendet eine Datei UEBER der
    // Schwelle, `ZUSCHNITT` nennt eine darunter, die weiter geteilt wird.
    const begruendet = new Set(
      [...module.matchAll(/^\| `([^`]+\.(?:ts|js))` \| \d+ \|/gm)].map((m) => m[1]),
    );

    // Der Bericht nennt entweder den Dateinamen (Fachmodul-Tabellen) oder den
    // vollen Pfad (BLEIBT-Tabelle). Ein Dateiname zaehlt nur, wenn er im Baum
    // eindeutig ist - `tools.ts` gibt es in `mcp/` UND in `manifest/`; ein
    // Namensvergleich allein wuerde die eine Datei durch die andere decken.
    const alle = quellDateien();
    const gleichnamig = new Map<string, number>();
    for (const p of alle) {
      const n = p.slice(p.lastIndexOf("/") + 1);
      gleichnamig.set(n, (gleichnamig.get(n) ?? 0) + 1);
    }

    const vergessen: string[] = [];
    for (const pfad of alle) {
      const n = zeilenZahl(pfad);
      if (n <= SCHWELLE) continue;
      const relat = pfad.slice(root.length + 1).replace(/\\/g, "/");
      const name = relat.slice(relat.lastIndexOf("/") + 1);
      const perName = gleichnamig.get(name) === 1 && begruendet.has(name);
      if (!begruendet.has(relat) && !perName) {
        vergessen.push(`${relat}: ${n} Zeilen, weder Fachmodul noch begruendet`);
      }
    }
    expect(vergessen.sort()).toEqual([]);
  });

  it("begruendet nur, was die Schwelle wirklich reisst", () => {
    // Die Gegenrichtung. Eine Tabelle mit der Ueberschrift "warum so gross"
    // darf keine 259-Zeilen-Datei fuehren: dann stimmt die Frage nicht mehr,
    // und der naechste Leser sucht den Grund an der falschen Stelle. Bis zum
    // 25.10.2026 standen hier `http.ts` (259) und `app.js` (219).
    const SCHWELLE = 1000;
    const zuKlein: string[] = [];
    for (const m of module.matchAll(/^\| `(packages\/[^`]+\.(?:ts|js))` \| (\d+) \|/gm)) {
      const pfad = m[1]!;
      const n = Number(m[2]);
      if (n > SCHWELLE) continue;
      // Nur die Tabelle "Die grossen Dateien" ist gemeint - der Abschnitt
      // "Der laufende Zuschnitt" fuehrt bewusst kleinere Dateien.
      const abschnitt = module.slice(0, module.indexOf("## Der laufende Zuschnitt"));
      if (abschnitt.includes(`| \`${pfad}\` |`)) zuKlein.push(`${pfad}: ${n} Zeilen`);
    }
    expect(zuKlein.sort()).toEqual([]);
  });

  it("laesst beim Suchen keine Quelldatei aus", () => {
    // Die Gegenprobe zum Waechter oben. Er kann nur finden, was er durchsucht -
    // und genau daran war er bis zum 25.10.2026 kaputt: `engine/src` wurde
    // nicht rekursiv gelesen, `mutations/apply.ts` war unsichtbar.
    //
    // Verglichen wird gegen `git ls-files`, also gegen die Wahrheit des
    // Repositorys, nicht gegen eine zweite selbstgebaute Liste. Jede
    // versionierte Quelldatei unter `packages/` muss im Suchraum liegen.
    const versioniert = execFileSync("git", ["ls-files", "packages"], { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .filter((p) => /\.(ts|js)$/.test(p) && !/\.d\.ts$/.test(p))
      .filter((p) => /\/(src|public)\//.test(p));
    const gesucht = new Set(quellDateien().map((p) => p.slice(root.length + 1).replace(/\\/g, "/")));
    const fehlend = versioniert.filter((p) => !gesucht.has(p)).sort();
    expect(fehlend).toEqual([]);

    // Und die Gegenrichtung: der Suchraum enthaelt nichts, was nicht im
    // Repository steht (sonst zaehlte der Waechter Build-Reste mit).
    const ueberzaehlig = [...gesucht].filter((p) => !versioniert.includes(p)).sort();
    expect(ueberzaehlig).toEqual([]);
  });

  it("fuehrt jeden Routen-Schnitt im Arbeitsstand", () => {
    // Der Befund vom 26.10.2026: die Schritte 68, 69, 70 und 71 (vier
    // gemergte PRs, 178 Routen, 31 Werkzeuge) fehlten in der Tabelle
    // "Arbeitsstand dieses Dokuments". `AGENTS.md` sagt: jeder Arbeitsschritt
    // endet mit einem ausgefuehrten Gate aus `docs/fahrplan.md` - ein Schritt,
    // der dort nicht steht, ist nicht nachvollziehbar.
    //
    // Geprueft wird gegen den CODE, nicht gegen eine zweite Liste: jedes
    // `http-routes-*.ts`-Modul und jedes `tools-*.ts`-Modul, das im Bericht
    // steht, muss im Arbeitsstand mindestens einmal genannt sein. Ein Modul
    // ohne Eintrag ist ein Schritt ohne Protokoll.
    const arbeitsstand = fahrplan.slice(
      fahrplan.findIndex((z) => z.startsWith("## Arbeitsstand dieses Dokuments")),
    );
    const zeilen = arbeitsstand.filter((z) => /^\| \d\d\.\d\d\.\d{4} \|/.test(z));

    // Module, die im Bericht stehen und einen Eintrag brauchen.
    const module = [
      ...[...readdirSync(SRC).filter((n) => /^http-routes-.*\.ts$/.test(n))],
      ...[...readdirSync(join(root, "packages/mcp/src")).filter((n) => /^tools(-[\w-]+)?\.ts$/.test(n))],
    ];

    const fehlend = module.filter((n) => !zeilen.some((z) => z.includes(n))).sort();
    expect(fehlend, "diese Module haben keinen Eintrag im Arbeitsstand").toEqual([]);
  });

  it("haelt die Arbeitsstand-Tabelle in absteigender Datumsfolge", () => {
    // Eine Tabelle, die "Arbeitsstand" heisst und deren neueste Zeile in der
    // Mitte steht, ist beim Nachschlagen wertlos. Geprueft wird die Folge der
    // Datumsangaben; gleiche Tage duerfen beliebig oft vorkommen.
    const start = fahrplan.findIndex((z) => z.startsWith("## Arbeitsstand dieses Dokuments"));
    const daten: string[] = [];
    for (let i = start; i < fahrplan.length; i++) {
      const m = /^\| (\d\d)\.(\d\d)\.(\d{4}) \|/.exec(fahrplan[i] ?? "");
      if (m) daten.push(`${m[3]}-${m[2]}-${m[1]}`);
      if (i > start && /^## /.test(fahrplan[i] ?? "")) break;
    }
    expect(daten.length, "die Arbeitsstand-Tabelle ist leer").toBeGreaterThan(50);

    const verletzungen: string[] = [];
    for (let i = 1; i < daten.length; i++) {
      if (daten[i]! > daten[i - 1]!) {
        // Die Meldung nennt die ZEILE, an der die Folge bricht - also die
        // spaetere, nicht die fruehere. Der erste Anlauf nannte `i + 1` und
        // zeigte damit auf den Vorgaenger; das war beim Nachschlagen
        // irrefuehrend.
        verletzungen.push(`${daten[i - 1]} steht vor ${daten[i]} (#${i + 1})`);
      }
    }
    expect(verletzungen.slice(0, 5)).toEqual([]);
  });

  it("begruendet die zwei Framer-Dateien mit der gemessenen Zahl", () => {
    // Der Befund vom 26.10.2026: `capture-html.ts` (2 726) und `mapper.ts`
    // (1 819) sind die zwei groessten Dateien im Baum, und ihre Begruendung
    // sagte nur "der HTML-Capture des Imports" bzw. "die Abbildung Framer nach
    // NodeTree". Das ist eine Ueberschrift, kein Grund.
    //
    // Fuer `capture-html.ts` wurde der Schnitt VERSUCHT und verworfen: der
    // CSS-Block (726 Zeilen, 21 Funktionen) ist keine Senke, weil
    // `applyClassRules` den Baum liest und neun interne Helfer braucht.
    //
    // Die Zahlen in der Begruendung sind pruefbar, also werden sie geprueft.
    const capture = readFileSync(join(root, "packages/framer-import/src/capture-html.ts"), "utf8");
    const mapper = readFileSync(join(root, "packages/framer-import/src/mapper.ts"), "utf8");

    const funktionen = (text: string): number => (text.match(/^(?:export )?(?:async )?function /gm) ?? []).length;
    // 69 seit dem 26.10.2026: der Commit 539b533 ("Der Page Loader ist keine
    // Einblendung") hat eine Funktion ergaenzt.
    expect(funktionen(capture), "capture-html.ts hat eine andere Zahl Funktionen").toBe(69);
    // 57 seit dem 26.10.2026: der fremde Commit 7a5b838 (Browser-Abgriff der
    // Animationen) hat drei Funktionen ergaenzt. Der Waechter hat es sofort
    // gemeldet - genau dafuer steht er hier. Der Bericht nennt dieselbe Zahl.
    expect(funktionen(mapper), "mapper.ts hat eine andere Zahl Funktionen").toBe(57);

    // Der CSS-Block wird ueber ANKER geprueft, nicht ueber Zeilennummern.
    //
    // Der erste Anlauf pruefte `zeilen[1901]` und `zeilen[2626]`. Zwei fremde
    // Commits (7a5b838, 539b533) haben die Datei um 32 Zeilen verschoben - der
    // Test wurde rot, obwohl die Aussage ("der Block ist da und hat 21
    // Funktionen") stimmte. Ein Waechter, der bei jeder fremden Aenderung rot
    // wird, wird abgeschaltet statt gelesen.
    const captureZeilen = capture.split(/\r?\n/);
    const start = captureZeilen.findIndex((z) => z.includes("order` is the rule"));
    expect(start, "der CSS-Block beginnt nicht mehr mit seinem Kommentar").toBeGreaterThan(0);
    const ende = captureZeilen.findIndex((z, i) => i > start && z.startsWith("function isLoopEntry("));
    expect(ende, "hinter dem CSS-Block fehlt `isLoopEntry`").toBeGreaterThan(start);
    const block = captureZeilen.slice(start, ende);
    const imBlock = block.filter((z) => /^(?:export )?(?:async )?function /.test(z)).length;
    expect(imBlock, "der CSS-Block hat eine andere Zahl Funktionen als die Begruendung nennt").toBe(21);

    // Und die Begruendung muss die Zahlen tragen, die sie behauptet.
    expect(module).toContain("(21 Funktionen)");
    expect(module).toContain("57 Funktionen");
    // `mapNode` ist mit der Datei gewachsen (289 -> 336).
    expect(module).toContain("336 Zeilen");
  });

  it("begruendet den Inspektor mit der gemessenen Zahl", () => {    // Der Befund vom 26.10.2026: `inspector.ts` war mit 1 884 Zeilen die
    // drittgroesste Datei, und die Begruendung sagte nur "eine Closure". Das
    // ist wahr, aber es sagt nicht, ob die Closure teilbar waere. Die
    // Messung sagt: nein - 22 Renderer, keiner haengt nur an `doc`,
    // `renderFieldRow` allein nennt elf Fremdnamen.
    //
    // Diese Aussage ist pruefbar, also wird sie geprueft. Sonst ist sie in
    // einem Monat eine Behauptung wie jede andere.
    const quelle = readFileSync(join(root, "packages/editor/src/inspector/inspector.ts"), "utf8");
    const zeilen = quelle.split(/\r?\n/);

    // Renderer auf Ebene 2 zaehlen.
    const starts: number[] = [];
    for (let i = 0; i < zeilen.length; i++) {
      if (/^ {2}function render[a-zA-Z0-9_]*\(/.test(zeilen[i]!)) starts.push(i);
    }
    expect(starts.length, "der Inspektor hat keine Renderer mehr - die Messung passt nicht mehr").toBe(22);

    // Closure-Namen auf Ebene 2.
    const closure = new Set<string>();
    for (const z of zeilen) {
      const m = /^ {2}(?:const|let|function) ([a-zA-Z_][a-zA-Z0-9_]*)/.exec(z);
      if (m) closure.add(m[1]!);
    }

    // Kein Renderer darf nur an `doc` haengen (ausser den drei kleinen).
    const eigenstaendig: string[] = [];
    for (let k = 0; k < starts.length; k++) {
      const name = /function (render[a-zA-Z0-9_]*)/.exec(zeilen[starts[k]!]!)?.[1] ?? "";
      const ende = k + 1 < starts.length ? starts[k + 1]! : zeilen.length;
      const text = zeilen.slice(starts[k], ende).join("\n");
      const fremd = [...closure].filter((n) => n !== name && new RegExp(`\\b${n}\\b`).test(text)).sort();
      // `doc` ist die Dokument-Referenz, kein Zustand: sie allein macht keinen
      // Renderer unabhaengig.
      const ohneDoc = fremd.filter((n) => n !== "doc" && !n.startsWith("render"));
      if (ohneDoc.length === 0 && !fremd.some((n) => n.startsWith("render"))) eigenstaendig.push(name);
    }

    // Genau der eine, der wirklich ohne Fremdnamen auskommt. Kommt ein zweiter
    // hinzu, ist die Aussage "keiner haengt nur an doc" falsch geworden.
    //
    // Der erste Anlauf dieser Pruefung erwartete drei (`renderSelect`,
    // `renderEntryField`, `renderSwitcher`) und war rot: `renderSelect` ruft
    // `renderVariantTiles`, `renderEntryField` ruft `renderSwitcher` und
    // `renderSelect`. Nur `renderSwitcher` ist wirklich eigenstaendig - 24
    // Zeilen. Genau deshalb steht die Zahl in der Begruendung: sie ist kleiner,
    // als der erste Blick suggeriert.
    expect(eigenstaendig.sort()).toEqual(["renderSwitcher"]);

    // Und die Begruendung muss die Zahl tragen, die sie behauptet.
    expect(module).toContain("22 Renderer");
    expect(module).toContain("elf Fremdnamen");
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
    // Transaktionen - das ist eine Aussage ueber eine Datei, die man pruefen
    // kann). Sie darf NICHT wieder 73 Dateinamen und 8 Routenzahlen tragen:
    // genau das ist am 23.10.2026 driftet.
    const zeile = r12Zeile();
    expect(zeile).toContain("docs/current/module.md");
    const dateinamen = [...zeile.matchAll(/`([a-z0-9-]+\.(?:ts|js))`/g)].map((m) => m[1]);
    expect(dateinamen.length).toBeLessThanOrEqual(4);
    expect(zeile).not.toMatch(/\d+ Routen/);
  });

  it("nennt in store.ts so viele Delegaten, wie wirklich delegieren", () => {
    // Befund vom 25.10.2026: der Kommentar an dieser Stelle sagte "211 von
    // 235 Delegaten". Beide Zahlen waren falsch - gemessen sind es 202 von
    // 244. Die Aussage ist pruefbar, also wird sie geprueft: eine Zahl in
    // einem Kommentar ist eine Behauptung wie jede andere, und eine
    // gedriftete Zahl macht den Kommentar wertlos (er soll erklaeren, warum
    // die Datei so gross sein darf).
    //
    // Die Zahl steht deshalb HIER und wird unten gegen eine Messung geprueft:
    // 202 von 244 Delegaten.
    const zeilen = readFileSync(join(root, "packages/engine/src/store.ts"), "utf8").split(/\r?\n/);
    const start: number[] = [];
    for (let i = 0; i < zeilen.length; i++) {
      if (/^ {2}(async )?[a-zA-Z#][a-zA-Z0-9_]*\s*\(/.test(zeilen[i]!)) start.push(i);
    }
    const methoden = start.map((s, k) => {
      const grenze = k + 1 < start.length ? start[k + 1]! : zeilen.length;
      let ende = s;
      for (let i = s; i < grenze; i++) {
        if (/^ {2}\}/.test(zeilen[i]!)) { ende = i; break; }
        ende = i;
      }
      const koerper = zeilen.slice(s + 1, ende).filter((z) => z.trim() !== "" && !z.trim().startsWith("//"));
      return koerper.join(" ").trim();
    });
    const delegaten = methoden.filter((text) =>
      /^return (await )?this\.#[a-zA-Z0-9]+\.[a-zA-Z0-9_]+\(.*\);?$/.test(text),
    ).length;
    expect(delegaten, "store.ts hat keine Delegaten mehr - der Waechter misst nichts").toBeGreaterThan(150);
    expect(delegaten).toBeLessThan(methoden.length);
    // Die Zahl im Kommentar dieser Datei muss dazu passen.
    const kommentar = readFileSync(new URL(import.meta.url), "utf8");
    expect(kommentar).toContain(`${delegaten} von ${methoden.length} Delegaten`);
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
    // nicht gibt. Geprueft wird die Richtung in beide Faelle.
    //
    // ZWEI BEFUNDE VOM 26.10.2026, die diese Fassung behebt:
    //
    // 1. `!l.includes("geschlossen")` liest das Wort IRGENDWO in der Zeile.
    //    P3-7 Punkt 15 sagt "`unifiersofjapan` bleibt offen bei 14,73 %" und
    //    enthaelt weiter hinten "geschlossen" - er galt damit als erledigt.
    //    Punkt 1 nennt "das X-Logo ist **geschlossen**", waehrend die Sterne
    //    fehlen. Zwei offene Punkte, beide unsichtbar.
    //
    // 2. "teilweise geschlossen" ist ein Status, den die Ueberschrift nach
    //    einer Berichtigung traegt - das Muster kannte ihn nicht und haette
    //    den Abschnitt danach GAR NICHT mehr geprueft. Ein Waechter, der
    //    einen Abschnitt still fallenlaesst, ist schlimmer als keiner.
    //
    // Gelesen wird der Status deshalb dort, wo er steht: am ANFANG der
    // Ursachen-Zelle. Drei Klassen wie im Risiko-Register - "zu", "grenze"
    // (bewusste Grenze der Quelle) und "offen".
    const KOPF = /^### (P\d-\d+) .*?[-\u2013\u2014] (offen|teilweise geschlossen|geschlossen)\b/;
    const punktStatus = (zeile: string): "zu" | "grenze" | "offen" => {
      const ursache = zeile.split("|").map((c) => c.trim())[3] ?? "";
      if (/^\*\*geschlossen\b/.test(ursache)) return "zu";
      // Eine bewusste Grenze ist keine offene Arbeit: die Ursache sagt, dass
      // es keine Luecke IST (P3-7 Punkt 1: die Sterne stehen nicht im SSR).
      if (/keine Import-L(?:ü|ue)cke|Grenze der .*Quelle|Produktentscheidung/i.test(ursache)) return "grenze";
      return "offen";
    };

    const falsch: string[] = [];
    let geprueft = 0;
    for (let i = 0; i < fahrplan.length; i++) {
      const kopf = KOPF.exec(fahrplan[i] ?? "");
      if (kopf === null) continue;
      const [, id, status] = kopf;
      const rumpf: string[] = [];
      for (let j = i + 1; j < fahrplan.length && !/^### /.test(fahrplan[j] ?? ""); j++) rumpf.push(fahrplan[j] ?? "");
      const punkte = rumpf.filter((l) => /^\| \d+b? \|/.test(l));
      // Ohne nummerierte Punkttabelle ist die Ueberschrift die einzige Quelle.
      if (punkte.length === 0) continue;
      geprueft++;

      const offen = punkte.filter((l) => punktStatus(l) === "offen");
      const grenzen = punkte.filter((l) => punktStatus(l) === "grenze");

      if (status === "geschlossen" && offen.length > 0) {
        falsch.push(
          `${id}: Ueberschrift "geschlossen", aber ${offen.length} offen: ${offen
            .map((l) => l.split("|")[1]?.trim())
            .join(", ")}`,
        );
      }
      if (status === "teilweise geschlossen" && offen.length === 0) {
        falsch.push(`${id}: Ueberschrift "teilweise", aber kein Punkt ist offen`);
      }
      if (status === "offen" && offen.length === 0) {
        falsch.push(
          `${id}: Ueberschrift "offen", aber alle ${punkte.length} Punkte sind zu` +
            (grenzen.length > 0 ? ` (${grenzen.length} bewusste Grenze(n))` : ""),
        );
      }
    }
    // Der Waechter muss etwas messen. Ohne Abschnitt mit Punkttabelle waere er
    // gruen und blind - genau der Fehler, den er beheben soll.
    expect(geprueft, "kein Abschnitt mit Punkttabelle gefunden").toBeGreaterThan(0);
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

  // Der Befund vom 25.10.2026: R14 stand in `stand.md` als "offen, terminiert
  // bis 30.11.2026" und in `fahrplan.md` als "geschlossen 22.10.2026" - seit
  // Tagen. Die Mengen-Waechter oben sahen das nicht: dieselbe NUMMER in beiden
  // Dateien genuegt ihnen, ueber den INHALT sagen sie nichts.
  //
  // Das ist die gefaehrlichste Sorte Doku-Drift: beide Dokumente fuehren das
  // Risiko, beide sehen gepflegt aus, und wer nachschlaegt, bekommt je nach
  // Datei eine andere Antwort. Ein offenes Risiko, das als geschlossen gilt,
  // wird nicht mehr bearbeitet; ein geschlossenes, das als offen gilt, kostet
  // Arbeit ohne Grund.
  //
  // Verglichen wird die STATUS-SPALTE, auf drei Werte reduziert. Die Prosa
  // daneben darf sich unterscheiden - `stand.md` nennt Belege, `fahrplan.md`
  // den Schritt. Nur die Aussage "offen oder geschlossen" muss dieselbe sein.
  const status = (zeile: string): "offen" | "zu" | "grenze" => {
    const spalte = zeile.split("|")[3] ?? "";
    // Ein bewusst vertagtes Risiko ist keine offene Luecke. Beide Dokumente
    // formulieren das unterschiedlich - `fahrplan.md` sagt "bewusst nicht
    // vereinheitlicht", `architektur.md` "bewusst vertagt", `stand.md` "keine
    // offene Luecke". Es zaehlt als eigene Klasse, damit die Wortwahl frei
    // bleibt, ohne dass die Aussage kippt.
    //
    // Die Reihenfolge ist wichtig: "keine offene Luecke" enthaelt das Wort
    // "offene" und wuerde sonst als offen gelesen. Und "bewusst" allein
    // genuegt NICHT: `stand.md` schreibt bei R12 "diese Zeile nennt bewusst
    // keine Zahl" - eine Aussage ueber die DOKU, nicht ueber das Risiko. Der
    // erste Anlauf las das als vertagt und machte aus einem offenen Risiko
    // eine Grenze.
    if (/bewusst (nicht )?(vereinheitlicht|vertagt)|bewusst vertagt|keine offene luecke|keine offene Luecke/i.test(spalte)) {
      return "grenze";
    }
    // "teilweise" ist offen: ein halb erledigtes Risiko ist nicht erledigt.
    // `architektur.md` schreibt R12 so, ohne Fettschrift - der erste Anlauf
    // verlangte `**offen` und las die Zeile deshalb als geschlossen. Genau
    // die Sorte Fehlalarm, die einen Waechter unbrauchbar macht.
    if (/offen|in Arbeit|teilweise/i.test(spalte)) return "offen";
    return "zu";
  };

  it("nennt in stand.md denselben Risiko-Status wie fahrplan.md", () => {
    const abweichend: string[] = [];
    for (const id of ids(fahrplan)) {
      const sZeile = stand.find((l) => l.startsWith(`| ${id} |`));
      const fZeile = fahrplan.find((l) => l.startsWith(`| ${id} |`));
      if (sZeile === undefined || fZeile === undefined) continue; // der Mengen-Waechter oben meldet das
      const a = status(sZeile);
      const b = status(fZeile);
      if (a !== b) abweichend.push(`${id}: stand.md=${a}, fahrplan.md=${b}`);
    }
    expect(abweichend).toEqual([]);
  });

  it("nennt in architektur.md denselben Risiko-Status wie fahrplan.md", () => {
    const abweichend: string[] = [];
    for (const id of ids(fahrplan)) {
      const aZeile = architektur.find((l) => l.startsWith(`| ${id} |`));
      const fZeile = fahrplan.find((l) => l.startsWith(`| ${id} |`));
      if (aZeile === undefined || fZeile === undefined) continue;
      const a = status(aZeile);
      const b = status(fZeile);
      if (a !== b) abweichend.push(`${id}: architektur.md=${a}, fahrplan.md=${b}`);
    }
    expect(abweichend).toEqual([]);
  });

  // ---- Die Belege in den Risiko-Zeilen sind Belege, keine Behauptungen ----
  //
  // Befund vom 26.10.2026: R12 im Fahrplan sagte "`tools.ts` 2 714 -> 2 614
  // Zeilen" - die Datei hatte da schon 1 671, weil drei Schnitte dazwischen
  // lagen. Und R6 in `stand.md` belegte den Idempotency-Fix mit
  // `http.ts:531-541`; die Datei hat seit dem Routen-Schnitt 275 Zeilen, der
  // Beleg lag also hinter dem Dateiende. Beides sieht nach Nachweis aus und ist
  // keiner.
  //
  // Die Regel gilt fuer RISIKO-Zeilen, nicht fuer die Historientabelle: dort
  // stehen Messwerte von damals, und die sollen bleiben, wie sie waren.
  const SUCHORTE = [
    "packages/engine/src", "packages/engine/test",
    "packages/editor/src", "packages/editor/src/inspector",
    "packages/editor/test",
    "packages/mcp/src", "packages/mcp/test",
    "packages/app/public", "packages/app/test",
    "packages/manifest/src", "packages/framer-import/src",
    "packages/framer-import/test", "packages/renderer/src",
    "packages/registry/src", "packages/widget-engine/src",
    "scripts", "",
  ];

  /** Findet die Datei zu einem Verweis - mit oder ohne Ordner. */
  const findeDatei = (name: string): string | null =>
    (name.includes("/") ? [join(root, name)] : SUCHORTE.map((d) => join(root, d, name))).find((p) =>
      existsSync(p),
    ) ?? null;

  const risikoZeilen = (L: string[]): Array<{ nr: number; id: string; text: string }> =>
    L.map((text, i) => ({ nr: i + 1, id: /^\| (R\d+) \|/.exec(text)?.[1] ?? "", text })).filter(
      (z) => z.id !== "",
    );

  it("belegt jede Risiko-Zeile mit einer Zeile, die es noch gibt", () => {
    // `datei:123` oder `datei:123-456`.
    const kaputt: string[] = [];
    let geprueft = 0;
    for (const [doku, L] of [["fahrplan.md", fahrplan], ["stand.md", stand], ["architektur.md", architektur]] as const) {
      for (const z of risikoZeilen(L)) {
        for (const m of z.text.matchAll(/`([\w./-]+\.(?:ts|js|json|mjs)):(\d+)(?:-(\d+))?`/g)) {
          geprueft++;
          const pfad = findeDatei(m[1]!);
          if (pfad === null) {
            kaputt.push(`${doku}:${z.nr} ${z.id}: ${m[1]} existiert nicht`);
            continue;
          }
          const n = zeilenZahl(pfad);
          const bis = Number(m[3] ?? m[2]);
          if (bis > n) {
            kaputt.push(`${doku}:${z.nr} ${z.id}: ${m[1]}:${m[2]}-${bis}, Datei hat ${n} Zeilen`);
          }
        }
      }
    }
    // Die Gegenprobe: der Waechter muss etwas messen. Ohne Verweise waere er gruen
    // und blind - genau der Fehler, den der Grosse-Dateien-Waechter hatte.
    expect(geprueft, "keine Zeilenverweise gefunden - der Waechter misst nichts").toBeGreaterThan(2);
    expect(kaputt).toEqual([]);
  });

  it("nennt in jeder Risiko-Zeile die Zeilenzahl, die die Datei hat", () => {
    // "`x.ts` 1 671 Zeilen" und "`x.ts` 2 714 -> 1 671 Zeilen": der LETZTE Wert
    // ist die Gegenwartsaussage. Zwei Ausnahmen, beide positionsbezogen:
    // ein Loesch-Beleg ("`mount.ts` (3 270 Zeilen) ist geloescht") und die
    // ausdrueckliche Nennung einer frueheren Fassung ("nannte noch 2 614").
    //
    // Eine zeilenweite Ausnahme waere falsch: R12 traegt BEIDES, den Bericht
    // und die Gegenwart.
    const BERICHT =
      /vorige Fassung|fruehere Fassung|frühere Fassung|sagte bisher|nannte bisher|gel(?:oe|ö)scht|entfiel|entfernt/i;
    const abweichend: string[] = [];
    let geprueft = 0;
    for (const [doku, L] of [["fahrplan.md", fahrplan], ["stand.md", stand], ["architektur.md", architektur]] as const) {
      for (const z of risikoZeilen(L)) {
        for (const m of z.text.matchAll(
          /`([\w./-]+\.(?:ts|js))`[^\d`]{0,40}((?:\d[\d ]*\s*(?:->|→)\s*)*\d[\d ]*)\s*Zeilen/g,
        )) {
          const davor = z.text.slice(Math.max(0, m.index - 160), m.index);
          const danach = z.text.slice(m.index, m.index + 160);
          if (BERICHT.test(davor) || BERICHT.test(danach)) continue;

          geprueft++;
          const zahlen = m[2]!.split(/->|→/).map((v) => Number(v.replace(/[^\d]/g, "")));
          const behauptet = zahlen[zahlen.length - 1]!;
          const pfad = findeDatei(m[1]!);
          if (pfad === null) {
            abweichend.push(`${doku}:${z.nr} ${z.id}: ${m[1]} existiert nicht (Zeilenzahl ${behauptet})`);
            continue;
          }
          const ist = zeilenZahl(pfad);
          if (ist !== behauptet) abweichend.push(`${doku}:${z.nr} ${z.id}: ${m[1]} behauptet ${behauptet}, ist ${ist}`);
        }
      }
    }
    expect(geprueft, "keine Zeilenzahlen gefunden - der Waechter misst nichts").toBeGreaterThan(2);
    expect(abweichend).toEqual([]);
  });
});
