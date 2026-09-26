/* CSS-Struktur-Analyse: Blockgrößen, Klassen-Abdeckung, tote Regeln.
   Aufruf: node .scratch/ui-audit/css-scan.mjs */
import { readFileSync } from "node:fs";

const css = readFileSync("packages/app/public/app.css", "utf8");
const js = readFileSync("packages/app/public/app.js", "utf8");
const html = readFileSync("packages/app/public/index.html", "utf8");
const haystack = js + "\n" + html;

const lines = css.split(/\r?\n/);
console.log(`app.css: ${lines.length} Zeilen`);

// Blockgrößen anhand von Kommentar-Markern
const sections = [];
lines.forEach((line, index) => {
  const short = line.trim();
  if (/^\/\* ={3,}/.test(short) || /^\/\*\s*-{3,}/.test(short)) {
    sections.push({ line: index + 1, title: short.replace(/[/*=-]+/g, "").trim().slice(0, 70) });
  }
});
if (sections.length > 0) {
  console.log("\nAbschnitte:");
  sections.forEach((section, index) => {
    const next = sections[index + 1]?.line ?? lines.length + 1;
    if (next - section.line < 8 && index + 1 < sections.length) return;
    console.log(`  ${String(section.line).padStart(5)}–${String(next - 1).padStart(5)} (${String(next - section.line).padStart(4)} Z.) ${section.title}`);
  });
}

// Familien nach Klassennamen-Präfix
const families = new Map();
for (const match of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
  const name = match[1];
  const prefix = name.split("-")[0];
  families.set(prefix, (families.get(prefix) ?? 0) + 1);
}
console.log("\nKlassen-Präfixe (Vielfalt = wie viele Design-Systeme parallel laufen):");
[...families.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30)
  .forEach(([prefix, count]) => console.log(`  ${prefix.padEnd(22)} ${count}`));

// Tote Regeln: Klassen, die im CSS stehen, aber in app.js/index.html nie vorkommen
const used = new Set();
for (const match of haystack.matchAll(/[\w-]{3,}/g)) used.add(match[0]);
const declared = new Map();
for (const match of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
  const name = match[1];
  declared.set(name, (declared.get(name) ?? 0) + 1);
}
const dead = [...declared.entries()].filter(([name]) => !used.has(name));
console.log(`\nKlassen im CSS: ${declared.size} · davon nirgends in app.js/index.html: ${dead.length}`);
dead.sort((a, b) => b[1] - a[1]).slice(0, 60).forEach(([name, count]) => console.log(`  .${name} (${count} Regeln)`));
