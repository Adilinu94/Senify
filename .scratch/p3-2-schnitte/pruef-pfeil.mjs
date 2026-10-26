// Prueft, ob der Pfeil in `docs/current/module.md` als echtes UTF-8 ankommt.
import { readFileSync } from "node:fs";

const text = readFileSync("docs/current/module.md", "utf8");
const zeile = text.split(/\r?\n/).find((z) => z.includes("http-routes-sites"));
if (!zeile) {
  console.error("Zeile nicht gefunden");
  process.exit(1);
}
const i = zeile.indexOf("1 205");
console.log("Fundstelle:", i);
console.log("Ausschnitt:", JSON.stringify(zeile.slice(i, i + 24)));
console.log("Zeichencodes:", [...zeile.slice(i, i + 12)].map((c) => c.codePointAt(0)).join(","));

const quelle = readFileSync("scripts/render-modules.mjs", "utf8");
const qz = quelle.split(/\r?\n/).find((z) => z.includes("1 205"));
console.log("Quelle     :", JSON.stringify(qz?.slice(qz.indexOf("1 205"), qz.indexOf("1 205") + 24)));
