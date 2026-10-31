// Schneider aus den vier Screenshots einer Messung je Band ein Paar
// (Quelle | Import) nebeneinander, damit das Auge den Befund prüfen kann.
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const work = ".scratch/p3-7-punkt-15/bilder";
const bands = process.argv.slice(2).map((pair) => pair.split(":").map(Number));
const source = PNG.sync.read(readFileSync(`${work}/desktop-original.png`));
const imported = PNG.sync.read(readFileSync(`${work}/desktop-import.png`));

function crop(image, from, to) {
  const height = Math.min(to, image.height) - from;
  const out = new PNG({ width: image.width, height });
  PNG.bitblt(image, out, 0, from, image.width, height, 0, 0);
  return out;
}

for (const [from, to] of bands) {
  const left = crop(source, from, to);
  const right = crop(imported, from, to);
  const width = left.width + right.width + 8;
  const joined = new PNG({ width, height: left.height });
  // Trennlinie in Rot.
  for (let y = 0; y < joined.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (width * y + x) << 2;
      const inGap = x >= left.width && x < left.width + 8;
      joined.data[index] = inGap ? 255 : 255;
      joined.data[index + 1] = inGap ? 0 : 255;
      joined.data[index + 2] = inGap ? 0 : 255;
      joined.data[index + 3] = 255;
    }
  }
  PNG.bitblt(left, joined, 0, 0, left.width, left.height, 0, 0);
  PNG.bitblt(right, joined, 0, 0, right.width, right.height, left.width + 8, 0);
  writeFileSync(`${work}/band-${from}-${to}.png`, PNG.sync.write(joined));
  console.log(`band-${from}-${to}.png`);
}
