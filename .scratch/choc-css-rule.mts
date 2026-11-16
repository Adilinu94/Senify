import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BUILD = process.argv[2]!;
const needle = process.argv[3]!;
const html = readFileSync(join(BUILD, "index.html"), "utf8");
const styles: string[] = [];
for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styles.push(m[1]!);
const astro = join(BUILD, "_astro");
for (const f of readdirSync(astro)) if (f.endsWith(".css")) styles.push(readFileSync(join(astro, f), "utf8"));
const css = styles.join("\n");
const regeln = css.match(/[^{}]+\{[^{}]*\}/g) ?? [];
let treffer = 0;
for (const r of regeln) {
  if (r.includes(needle)) { console.log(r.trim().slice(0, 600)); console.log("---"); treffer += 1; }
}
console.log(`# regeln gesamt ${regeln.length}, treffer ${treffer}, style-tags ${styles.length}`);