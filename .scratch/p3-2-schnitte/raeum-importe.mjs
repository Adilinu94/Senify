import { readFileSync, writeFileSync } from "node:fs";

// Entfernt aus einer Datei die Import-Namen, die nach einem Schnitt nicht mehr
// benutzt werden. Prueft gegen den REST der Datei, nicht gegen die importierte
// Zeile - deshalb faengt es auch Namen, die nur noch im Import stehen.
//
// Aufruf: node raeum-importe.mjs <datei>
const datei = process.argv[2];
if (!datei) {
  console.error("Aufruf: node raeum-importe.mjs <datei>");
  process.exit(1);
}

const L = readFileSync(datei, "utf8").split(/\r?\n/);
const importBereich = [];
for (let i = 0; i < L.length; i++) {
  if (/^import /.test(L[i])) {
    let j = i;
    while (j < L.length && !/from "/.test(L[j])) j++;
    importBereich.push([i, j]);
    i = j;
  } else if (L[i].trim() !== "" && !L[i].startsWith("//")) {
    break;
  }
}

// Der Text ohne die Importbloecke: was danach noch vorkommt, wird gebraucht.
const ohneImporte = L.filter((_, i) => !importBereich.some(([a, b]) => i >= a && i <= b)).join("\n");

const entfernt = [];
const neu = [...L];
// Von hinten nach vorn, damit sich die Zeilennummern nicht verschieben.
for (const [a, b] of [...importBereich].reverse()) {
  const block = L.slice(a, b + 1);
  if (!block[0].includes("{")) continue;
  // Ein einzeiliger Import: `import { A, B } from "x";`
  const einzeilig = /^import (?:type )?\{([^}]*)\} from "([^"]+)";?$/.exec(block.join(" ").trim());
  if (einzeilig) {
    const namen = einzeilig[1].split(",").map((n) => n.trim()).filter((n) => n !== "");
    const bleibt = namen.filter((n) => new RegExp(`\\b${n.replace(/^type /, "").split(/\s+as\s+/).pop()}\\b`).test(ohneImporte));
    if (bleibt.length === 0) {
      for (const n of namen) entfernt.push(n);
      neu.splice(a, b - a + 1);
    } else if (bleibt.length !== namen.length) {
      for (const n of namen) if (!bleibt.includes(n)) entfernt.push(n);
      neu.splice(a, b - a + 1, `import { ${bleibt.join(", ")} } from "${einzeilig[2]}";`);
    }
    continue;
  }
  // Mehrzeilig: Zeilen mit Namen einzeln pruefen.
  const zeilen = block.slice();
  for (let k = zeilen.length - 1; k >= 0; k--) {
    const m = /^\s{2}(?:type )?([A-Za-z_$][\w$]*),?\s*$/.exec(zeilen[k]);
    if (!m) continue;
    if (!new RegExp(`\\b${m[1]}\\b`).test(ohneImporte)) {
      entfernt.push(m[1]);
      zeilen.splice(k, 1);
    }
  }
  // Wenn nichts uebrig bleibt, faellt der ganze Block weg.
  if (zeilen.length === 2 && zeilen[0].includes("{") && zeilen[1].includes("}")) {
    neu.splice(a, b - a + 1);
  } else {
    neu.splice(a, b - a + 1, ...zeilen);
  }
}

if (entfernt.length === 0) {
  console.log(`${datei}: keine unbenutzten Importe`);
  process.exit(0);
}
writeFileSync(datei, neu.join("\n"), "utf8");
console.log(`${datei}: ${entfernt.length} Importe entfernt:`);
for (const n of entfernt.sort()) console.log(`  ${n}`);
