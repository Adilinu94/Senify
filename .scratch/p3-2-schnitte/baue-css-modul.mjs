// Baut `capture-css.ts` aus dem ausgeschnittenen Block.
//
// Exportiert werden nur die vier Namen, die `capture-html.ts` weiter braucht -
// gemessen, nicht geraten: `applyClassRules` (2x), `fontFaceStyles` (1x),
// `readLinkedCss` (3x), `readTextPresets` (1x). Alles andere bleibt intern:
// `parseCssRules`, `resolveVars`, `cascade` und die Typen sind Handwerkszeug
// dieses Moduls, kein Vertrag nach aussen. Ein Export, den niemand ruft, ist
// eine Zusage ohne Nutzen.
import { readFileSync, writeFileSync } from "node:fs";

const block = readFileSync(".scratch/p3-2-schnitte/css-block.txt", "utf8").split(/\r?\n/);
while (block.length > 0 && block[0].trim() === "") block.shift();
while (block.length > 0 && block[block.length - 1].trim() === "") block.pop();

// Die vier oeffentlichen Namen exportieren.
const oeffentlich = ["applyClassRules", "fontFaceStyles", "readLinkedCss", "readTextPresets"];
const koerper = block.map((z) => {
  for (const n of oeffentlich) {
    if (new RegExp(`^(async )?function ${n}\\(`).test(z)) return z.replace(/^(async )?function /, "$1export function ");
    if (z.startsWith(`function ${n}(`)) return z.replace("function ", "export function ");
  }
  return z;
});

const kopf = `// Das Stylesheet der Quelle: Regeln zerlegen, Selektoren kompilieren, die
// Kaskade aufloesen, \`var()\` ersetzen, Text-Presets lesen.
//
// Der Zuschnitt aus \`capture-html.ts\` (R12). Der Block war zusammenhaengend -
// 726 Zeilen, 20 Funktionen und Typen, alle mit derselben Frage: welcher Wert
// gilt fuer dieses Element? Er stand am Ende der Datei und hatte mit dem
// HTML-Scan nichts zu tun.
//
// **Warum das eine Naht ist und keine Verschiebung.** Der Block braucht von
// aussen nur vier Dinge, und jedes davon ist eine Funktion, die er selbst
// nicht besitzt: \`elementStyleToParts\` (den Inline-Style eines Elements),
// \`START_STATE_PROPERTIES\`, \`SPACED_TEXT\` und \`KEEPS_SPACES\` (Zustand des
// Captures). Alles andere - \`splitDeclarations\`, \`parseDeclaration\`,
// \`devicesContaining\` - kam schon aus Modulen.
//
// **Exportiert wird nur, was gerufen wird.** \`applyClassRules\`,
// \`fontFaceStyles\`, \`readLinkedCss\` und \`readTextPresets\` (gemessen: 2x, 1x,
// 3x, 1x in \`capture-html.ts\`). \`parseCssRules\`, \`resolveVars\`, \`cascade\` und
// die Typen bleiben intern - ein Export, den niemand ruft, ist eine Zusage
// ohne Nutzen.
//
// **Die Regeln im Kommentar sind mitgewandert, nicht abgeschrieben.** Wo eine
// Entscheidung an einer Stelle stand (warum \`flex-flow\` in zwei Longhands
// zerlegt wird, warum \`place-content\` dasselbe braucht, warum \`var()\` ein
// echter Scanner sein muss und kein Regex), steht sie jetzt hier - woertlich.
// Ein Schnitt, der solche Begruendungen zuruecklaesst, verliert sie.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDeclaration, splitDeclarations } from "./css-util.ts";
import { devicesContaining } from "./devices.ts";
import type { IrNode } from "./ir.ts";

export`;

const text = [kopf, ...koerper, ""].join("\n");
writeFileSync("packages/framer-import/src/capture-css.ts", text, "utf8");

console.log(`capture-css.ts: ${text.split("\n").length} Zeilen`);
console.log("");
console.log("Exporte:");
for (const z of text.split("\n")) if (z.startsWith("export function")) console.log(`  ${z.slice(0, 80)}`);
