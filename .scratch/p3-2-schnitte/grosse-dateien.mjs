// Listet alle Quelldateien ueber einer Zeilenschwelle - fuer die Frage, ob der
// Grosse-Dateien-Waechter wirklich jede grosse Datei sieht.
//
// `doku-konsistenz.test.ts` prueft heute: alle `*.ts` in `packages/engine/src`,
// alle `*.js` in `packages/app/public` und eine HANDGEPFLEGTE Liste von sechs
// Pfaden (mcp/tools.ts, editor/inspector.ts, editor/model.ts, editor/canvas.ts,
// framer-import/capture-html.ts, framer-import/mapper.ts). Was nicht in dieser
// Liste steht, wird nicht gemessen - und eine handgepflegte Liste von Dateien,
// die man messen soll, ist genau die Sorte Liste, die man zu spaet nachzieht.
//
// Dieses Skript zaehlt ohne Liste: alles unter `packages/*/src` und
// `packages/app/public`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SCHWELLE = Number(process.argv[2] ?? 1000);

function* lauf(dir) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === "dist" || n === ".tmp") continue;
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) yield* lauf(p);
    else if (/\.(ts|js|mjs)$/.test(n) && !/\.d\.ts$/.test(n)) yield p;
  }
}

const zeilen = (p) => {
  const roh = readFileSync(p, "utf8");
  const n = roh.split(/\r?\n/).length;
  return roh.endsWith("\n") ? n - 1 : n;
};

const treffer = [];
for (const paket of readdirSync("packages")) {
  for (const teil of ["src", "public"]) {
    const basis = join("packages", paket, teil);
    try {
      if (!statSync(basis).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const p of lauf(basis)) {
      const n = zeilen(p);
      if (n > SCHWELLE) treffer.push({ n, p: p.replace(/\\/g, "/") });
    }
  }
}

treffer.sort((a, b) => b.n - a.n);
console.log(`${treffer.length} Dateien ueber ${SCHWELLE} Zeilen:\n`);
for (const t of treffer) console.log(`${String(t.n).padStart(6)}  ${t.p}`);
