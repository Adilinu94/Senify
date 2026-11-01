// Befund zu P3-7 Punkt 15: die stärksten Bänder der frischen Messung als
// Ausschnitte, Quelle und Import untereinander. Kein Vergleich, nur Sicht.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";

const WORK = resolve(".scratch/p3-7-punkt-15/bilder");
const BANDS = [
  [600, 800],
  [1000, 1400],
  [2800, 3000],
  [7000, 7400],
];

function crop(file, from, to) {
  const image = PNG.sync.read(readFileSync(file));
  const top = Math.max(0, Math.min(from, image.height));
  const bottom = Math.max(top, Math.min(to, image.height));
  const height = bottom - top;
  if (height === 0) return null;
  const out = new PNG({ width: image.width, height });
  PNG.bitblt(image, out, 0, top, image.width, height, 0, 0);
  return out;
}

for (const [from, to] of BANDS) {
  for (const side of ["quelle", "import"]) {
    const file = resolve(WORK, `desktop-${side === "quelle" ? "original" : "import"}.png`);
    const out = crop(file, from, to);
    if (out === null) {
      console.log(`${side} ${from}..${to}: leer`);
      continue;
    }
    const target = resolve(WORK, `neu-${side}-${from}-${to}.png`);
    writeFileSync(target, PNG.sync.write(out));
    console.log(`${side} ${from}..${to}: ${out.width}x${out.height} -> ${target}`);
  }
}
