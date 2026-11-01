// Der gemessene Badge aus dem gespeicherten SSR von `unifiersofjapan` durch den
// Sanitizer: bleibt „SITE OF THE MONTH ✦" samt Typografie stehen?
import { readFileSync } from "node:fs";
import { sanitizeSvgMarkup } from "../../packages/widget-engine/src/svg-markup.ts";

const html = readFileSync(new URL("./quelle.html", import.meta.url), "utf8");
const at = html.indexOf("SITE OF THE MONTH");
if (at < 0) throw new Error("Badge steht nicht im gespeicherten SSR");

const start = html.lastIndexOf("<svg", at);
const end = html.indexOf("</svg>", at) + "</svg>".length;
const markup = html.slice(start, end);

const out = sanitizeSvgMarkup(markup);
if (out === undefined) throw new Error("Sanitizer verwirft den Badge");

const hasWords = out.html.includes("SITE OF THE MONTH \u2726");
const hasFont = out.html.includes("font-family:&quot;Panchang&quot;");
const hasRef = out.html.includes('href="#curve-wnxkz4"') || /href="#[^"]+"/.test(out.html);
console.log(`Wörter erhalten: ${hasWords}`);
console.log(`Schrift erhalten: ${hasFont}`);
console.log(`Pfad-Referenz erhalten: ${hasRef}`);
console.log(`Länge Eingabe ${markup.length}, Ausgabe ${out.html.length}`);
if (!hasWords || !hasFont || !hasRef) {
  console.log(out.html);
  process.exitCode = 1;
}
