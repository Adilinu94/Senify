// Erzeugt `packages/app/public/fonts.css` aus der einen Quelle, die der
// Editor schon benutzt (`editorFontFaceCss` in packages/editor/src/ui/fonts.ts).
//
// Warum das eine Datei ist und kein @font-face-Block im HTML: das Dashboard
// nennt in ui.css `Inter` und `Sora`, ohne dass eine Datei diese Familie je
// bindet. Der Browser faellt dann auf `system-ui` zurueck - unter Windows
// Segoe UI, unter Linux DejaVu Sans. Dieselbe Oberflaeche sieht damit auf
// jedem Betriebssystem anders aus, und genau daran scheitert das PNG-Gate
// (Settings/Referenzen 1,2 bis 2,5 % geaenderte Pixel gegen die unter
// Windows erzeugten Baselines, erlaubt sind 1 % - Lauf 22 vom 02.10.2026).
//
// Mit dieser Datei rendert das Dashboard dieselbe Schrift wie der Editor und
// wie das generierte Theme, unabhaengig vom Betriebssystem.
//
// Das Skript ist absichtlich idempotent und laeuft in `pnpm build`, nicht
// beim Start: die Ausgabe ist eine eingecheckte Datei, damit das Gate nicht
// von einem Schreibzugriff waehrend des Tests abhaengt.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(ROOT, "packages", "app", "public", "fonts.css");

// Die Bindungen stehen in packages/editor/src/ui/fonts.ts. Die Datei wird
// hier nicht per Import gebraucht (das Paket ist zur Laufzeit nicht gebaut),
// sondern als Text gelesen: die Liste der Familien und Gewichte bleibt so an
// einer Stelle gepflegt, ohne einen Build-Zyklus zu brauchen.
const EDITOR_FONTS = join(ROOT, "packages", "editor", "src", "ui", "fonts.ts");
const source = readFileSync(EDITOR_FONTS, "utf8");

// Die beiden Listen aus der Datei uebernehmen: `EDITOR_FONT_FILES` bindet
// die Werkzeugschriften (Inter Display fuer Ueberschriften, Inter fuer
// Text), `EDITOR_CONTENT_FONT_FILES` die Inhaltsschrift Sora. Beide Zeilen
// haben dieselbe Form, deshalb genuegt ein Muster.
function readList(name) {
  const start = source.indexOf(`export const ${name}`);
  if (start === -1) throw new Error(`${name} nicht gefunden in ${EDITOR_FONTS}`);
  const block = source.slice(start, source.indexOf("];", start));
  return [...block.matchAll(/family:\s*"([^"]+)",\s*weight:\s*(\d+),\s*file:\s*"([^"]+)"/g)].map(
    (m) => ({ family: m[1], weight: m[2], file: m[3] }),
  );
}

const files = [...readList("EDITOR_FONT_FILES"), ...readList("EDITOR_CONTENT_FONT_FILES")];
if (files.length === 0) {
  throw new Error(`Keine Schriftdateien in ${EDITOR_FONTS} gefunden - nichts gebunden.`);
}

const quote = (family) => (/[\s"']/.test(family) ? `"${family.replace(/"/g, "")}"` : family);

const lines = [
  "/* Erzeugt von packages/app/build-fonts.mjs aus packages/editor/src/ui/fonts.ts.",
  "   Nicht von Hand editieren: das Dashboard bindet damit dieselben Familien,",
  "   die der Editor und das generierte Theme benutzen. Ohne diese Datei faellt",
  "   `Inter` auf system-ui zurueck und das PNG-Gate misst je Betriebssystem",
  "   ein anderes Bild. */",
  "",
  ...files.map(({ family, weight, file }) =>
    [
      "@font-face {",
      `  font-family: ${quote(family)};`,
      "  font-style: normal;",
      `  font-weight: ${weight};`,
      "  font-display: swap;",
      `  src: url("/editor-fonts/${file}") format("woff2");`,
      "}",
    ].join("\n"),
  ),
  "",
];

mkdirSync(dirname(OUT), { recursive: true });
const next = lines.join("\n");
const current = (() => {
  try {
    return readFileSync(OUT, "utf8");
  } catch {
    return null;
  }
})();
if (current !== next) {
  writeFileSync(OUT, next, "utf8");
  console.log(`[app] fonts.css geschrieben (${files.length} Schriftdateien).`);
} else {
  console.log("[app] fonts.css ist bereits aktuell.");
}
