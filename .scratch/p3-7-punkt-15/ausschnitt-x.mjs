// Crop mit x-Bereich: pnpm exec tsx .scratch/p3-7-punkt-15/ausschnitt-x.mjs datei x1 y1 x2 y2 name
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
const [file, x1, y1, x2, y2, name] = process.argv.slice(2);
const image = PNG.sync.read(readFileSync(file));
const left = Math.max(0, Number(x1)), top = Math.max(0, Number(y1));
const right = Math.min(image.width, Number(x2)), bottom = Math.min(image.height, Number(y2));
const width = right - left, height = bottom - top;
const out = new PNG({ width, height });
PNG.bitblt(image, out, left, top, width, height, 0, 0);
writeFileSync(name, PNG.sync.write(out));
console.log(`${name} ${width}x${height}`);
