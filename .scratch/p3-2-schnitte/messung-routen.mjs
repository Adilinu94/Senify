import { readFileSync } from "node:fs";

// Der Zuschnitt wird gemessen, nicht geraten (Schritt 53): je Routengruppe
// zaehlen wir, welche Import-Quellen sie braucht. Wer die wenigsten Fremdimporte
// zieht, ist der sauberste Fachbereich.
//
// Zwei Messfehler, die dieser Anlauf behebt:
//   1. `"([a-z-]+)"` uebersieht `":siteId"` (Grossbuchstabe) und `"theme.css"`
//      (Punkt) - dann fallen Pfadsegmente weg und 50 Routen landen in einer
//      Scheingruppe.
//   2. Ein Import ueber mehrere Zeilen (`import {\n  A,\n  B,\n} from "x"`)
//      wird von einer Zeilen-Regex nicht gesehen - jede Gruppe sieht dann aus,
//      als brauche sie nichts.
const datei = "packages/engine/src/http-routes-sites.ts";
const quelle = readFileSync(datei, "utf8");
const L = quelle.split(/\r?\n/);

const starts = [];
for (let i = 0; i < L.length; i++) if (/^ {2}\{$/.test(L[i])) starts.push(i);

const routen = starts.map((s, k) => {
  const grenze = k + 1 < starts.length ? starts[k + 1] - 1 : L.length;
  let ende = grenze - 1;
  while (ende > s && !/^ {2}\},?$/.test(L[ende])) ende--;
  const block = L.slice(s, ende + 1);
  const text = block.join("\n");
  const methode = /method: "([A-Z]+)"/.exec(text)?.[1] ?? "?";
  const segmente = /segments: \[([^\]]+)\]/.exec(text)?.[1] ?? "";
  const pfad = [...segmente.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  return { start: s + 1, ende: ende + 1, methode, pfad, block };
});

// Importe ueber den ganzen Text: `import ... from "x"` in beliebiger Zeilenzahl.
const imports = [];
for (const m of quelle.matchAll(/^import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+"([^"]+)"/gm)) {
  const namen = m[1]
    .split(",")
    .map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim() ?? "")
    .filter((n) => n !== "" && !n.startsWith("//"));
  imports.push({ namen, quelle: m[2] });
}
for (const m of quelle.matchAll(/^import\s+(?:type\s+)?(\w+)\s+from\s+"([^"]+)"/gm)) {
  imports.push({ namen: [m[1]], quelle: m[2] });
}

function braucht(block) {
  const text = block.join("\n");
  const treffer = new Set();
  for (const imp of imports) {
    for (const n of imp.namen) {
      if (new RegExp(`\\b${n.replace(/[$]/g, "\\$")}\\b`).test(text)) treffer.add(`${imp.quelle}#${n}`);
    }
  }
  return [...treffer];
}

function gruppeVon(pfad) {
  const rest = pfad.slice(3);
  return rest.length === 0 ? "(site selbst)" : rest[0];
}

const gruppen = new Map();
for (const r of routen) {
  const g = gruppeVon(r.pfad);
  if (!gruppen.has(g)) gruppen.set(g, []);
  gruppen.get(g).push(r);
}

const zeilen = [];
for (const [g, rs] of gruppen) {
  const quellen = new Set();
  let z = 0;
  for (const r of rs) {
    z += r.ende - r.start + 1;
    for (const q of braucht(r.block)) quellen.add(q);
  }
  zeilen.push({ gruppe: g, routen: rs.length, zeilen: z, quellen: quellen.size, liste: [...quellen] });
}
zeilen.sort((a, b) => a.quellen - b.quellen || b.zeilen - a.zeilen);

console.log(`${datei}: ${routen.length} Routen, ${L.length} Zeilen, ${imports.length} Importe\n`);
console.log("Gruppe".padEnd(20) + "Routen  Zeilen  Quellen");
for (const z of zeilen) {
  console.log(`${z.gruppe.padEnd(20)}${String(z.routen).padStart(5)}  ${String(z.zeilen).padStart(6)}  ${String(z.quellen).padStart(6)}`);
}

console.log("\n=== Die zehn kleinsten Kandidaten ===");
for (const z of zeilen.slice(0, 10)) {
  console.log(`\n--- ${z.gruppe} (${z.routen} Routen, ${z.zeilen} Zeilen, ${z.quellen} Quellen) ---`);
  for (const q of z.liste.sort()) console.log(`    ${q}`);
}
