// Schneidet einen Streifen aus einem Screenshot:
// node schnitt.mjs <datei> <von> <bis> <ziel> [x0] [x1]
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const [file, from, to, target, fromX, toX] = process.argv.slice(2);
const image = PNG.sync.read(readFileSync(file));
const top = Math.max(0, Math.min(image.height - 1, Number(from)));
const bottom = Math.max(top + 1, Math.min(image.height, Number(to)));
const left = fromX === undefined ? 0 : Math.max(0, Math.min(image.width - 1, Number(fromX)));
const right = toX === undefined ? image.width : Math.max(left + 1, Math.min(image.width, Number(toX)));
const width = right - left;
const height = bottom - top;
const out = new PNG({ width, height });
PNG.bitblt(image, out, left, top, width, height, 0, 0);
writeFileSync(target, PNG.sync.write(out));
console.log(`${file} ${top}..${bottom} x ${left}..${right} -> ${target} (${width}x${height})`);
