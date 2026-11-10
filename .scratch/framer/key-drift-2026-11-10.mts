// Driftet die IR-Schluesselzuordnung zwischen der gestempelten Live-Seite und
// dem HTML, das captureHtml nummeriert? Vergleicht beide Reihen Folie fuer
// Folie und meldet die erste Abweichung.
// Lauf: pnpm exec tsx .scratch/framer/key-drift-2026-11-10.mts
import { chromium } from "playwright";
import { captureHtml } from "../../packages/framer-import/src/capture-html.ts";
import type { IrNode } from "../../packages/framer-import/src/ir.ts";

const SCRIPT = `
(function () {
  var SKIP = { style: 1, script: 1, noscript: 1, template: 1 };
  var LEAF = { svg: 1, select: 1 };
  var ordinal = 0;
  var out = [];
  function visit(el) {
    ordinal += 1;
    var classes = typeof el.className === "string" ? el.className : "";
    out.push({ key: "n" + ordinal, tag: el.tagName.toLowerCase(), classes: classes.slice(0, 80) });
    if (LEAF[el.tagName.toLowerCase()]) return;
    var list = classes.split(/\\s+/);
    if (list.indexOf("ssr-variant") !== -1 && el.children.length === 1) {
      visit(el.children[0]);
      return;
    }
    for (var i = 0; i < el.children.length; i += 1) {
      var child = el.children[i];
      if (SKIP[child.tagName.toLowerCase()]) continue;
      visit(child);
    }
  }
  var main = document.querySelector("#main");
  if (main) {
    for (var i = 0; i < main.children.length; i += 1) {
      if (SKIP[main.children[i].tagName.toLowerCase()]) continue;
      visit(main.children[i]);
    }
  }
  return out;
})()
`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto("https://gracious-balance-599544.framer.app/", { waitUntil: "load", timeout: 90_000 });
await page.waitForTimeout(750);
const live = (await page.evaluate(SCRIPT)) as { key: string; tag: string; classes: string }[];
const html = await page.content();
await browser.close();

const document = captureHtml({ html, url: "https://gracious-balance-599544.framer.app/" });
const ir: { key: string; tag: string; classes: string }[] = [];
const walk = (node: IrNode): void => {
  ir.push({ key: node.key, tag: node.tag, classes: (node.baseClasses ?? []).join(" ").slice(0, 80) });
  for (const child of node.children) walk(child);
};
walk(document.pages[0]!.root);

const base = (entry: { tag: string; classes: string }): string =>
  `${entry.tag} ${entry.classes.split(/\s+/).filter((name) => name !== "" && !name.startsWith("framer-v-")).sort().join(" ")}`;
// Compare BY KEY, not by position: the IR drops the `ssr-variant` shell, so the
// two lists have different lengths while the ordinals still line up.
const byKey = new Map(ir.filter((entry) => entry.key !== "root").map((entry) => [entry.key, entry]));
let firstDiff = -1;
let missing = 0;
for (const entry of live) {
  const other = byKey.get(entry.key);
  if (other === undefined) {
    missing += 1;
    continue;
  }
  if (base(entry) !== base(other)) {
    firstDiff = live.indexOf(entry);
    console.log("ABWEICHUNG", entry.key);
    console.log("live", JSON.stringify(entry));
    console.log("ir  ", JSON.stringify(other));
    break;
  }
}
console.log("live:", live.length, "ir:", byKey.size, "ohne IR-Gegenstueck:", missing);
console.log("erste Abweichung bei Index:", firstDiff);
if (firstDiff < 0) {
  const target = live.find((entry) => entry.key === "n1630");
  console.log("n1630 live:", JSON.stringify(target), "im IR:", JSON.stringify(byKey.get("n1630")));
}
