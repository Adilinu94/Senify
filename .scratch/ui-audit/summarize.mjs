/* Wertet .scratch/ui-audit/audit.json aus: Detailbefunde je Route.
   Aufruf: node .scratch/ui-audit/summarize.mjs [route-slug...] */
import { readFileSync } from "node:fs";

const report = JSON.parse(readFileSync(".scratch/ui-audit/audit.json", "utf8"));
const want = process.argv.slice(2);

const fmt = (list, max = 14) =>
  list
    .slice(0, max)
    .map(([value, count]) => `${value} ×${count}`)
    .join("\n      ");

for (const entry of report.routes) {
  if (entry.mode !== "light") continue;
  if (want.length > 0 && !want.includes(entry.slug)) continue;
  const d = entry.data;
  console.log(`\n${"=".repeat(78)}\n${entry.slug} · ${entry.label}\n${"=".repeat(78)}`);
  console.log(`Elemente ${d.elementCount} · Blätter ${d.leafCount} · Text ${d.textLength} Zeichen`);
  console.log(`viewport-Box ${d.viewBox} px · scrollWidth ${d.scrollWidth} · Überlauf ${d.overflowX}`);
  console.log(`\n  Typografie (${d.fontsDistinct} Varianten):\n      ${fmt(d.fonts, 18)}`);
  console.log(`\n  Farben (${d.colorsDistinct}):\n      ${fmt(d.colors, 8)}`);
  console.log(`  Flächen: ${d.backgroundsDistinct}`);
  console.log(`\n  Radien:\n      ${fmt(d.radii, 12)}`);
  console.log(`\n  Abstände (gap):\n      ${fmt(d.gaps, 10)}`);
  console.log(`\n  Innenabstände:\n      ${fmt(d.paddings, 12)}`);
  console.log(`\n  Schatten:\n      ${fmt(d.shadows, 6)}`);
  console.log(`\n  linke Kanten: ${d.leftEdgesDistinct.join(", ")}`);
  console.log(`\n  Überschriften (${d.headings.length}):`);
  for (const h of d.headings.slice(0, 12)) console.log(`      ${h}`);
  if (d.headings.length > 12) console.log(`      … +${d.headings.length - 12}`);
  console.log(`\n  Buttons (${d.buttons.length}) primär (${d.primaryButtons.length}):`);
  for (const b of d.buttons.slice(0, 50)) console.log(`      ${b}`);
  console.log(`  primär: ${d.primaryButtons.join(" | ")}`);
  console.log(`\n  Links (${d.links.length}):`);
  for (const l of d.links.slice(0, 20)) console.log(`      ${l}`);
  console.log(`\n  Bilder (${d.images.length}):`);
  for (const i of d.images.slice(0, 12)) console.log(`      alt=${JSON.stringify(i.alt)} ${i.src}`);
  console.log(
    `\n  Pillen ${d.pillCount} · Verläufe ${d.gradientCount} · Glas ${d.glassCount} · Großschrift ${d.uppercaseCount} · zentriert ${d.centeredCount}`,
  );
  console.log(`  Transitions ${d.transitionCount} · Animationen ${d.animationCount} · Tabellen ${d.tables} · Cards ${d.cards}`);
  if (d.emoji.length > 0) console.log(`  Emoji: ${d.emoji.join(" | ")}`);
  if (entry.axe.length > 0) {
    console.log(`\n  Axe (${entry.axe.length}):`);
    for (const a of entry.axe) {
      console.log(`      [${a.impact}] ${a.id} ×${a.nodes} — ${a.help}`);
      for (const t of a.targets) console.log(`        · ${t}`);
      for (const det of a.detail ?? []) console.log(`        ${det.replace(/\n/g, " ").slice(0, 220)}`);
    }
  }
}
