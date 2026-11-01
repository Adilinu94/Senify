// Diagnose: Tragen die Seitenschienen im Desktop-DOM die `hidden-<hash>`-
// Klassen, und kommen diese im IR als Sichtbarkeit oder als Regel an?
//
// Usage: pnpm exec tsx .scratch/p3-7-punkt-15/schienen-capture.ts

import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { captureHtml } from "../../packages/framer-import/src/capture-html.ts";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("https://unifiersofjapan.framer.website/", { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(2500);
const html = await page.content();
await browser.close();

const document = captureHtml({ html, url: "https://unifiersofjapan.framer.website/" });
writeFileSync(".scratch/p3-7-punkt-15/schienen-capture.html", html);

const all: any[] = [];
const walk = (node: any) => { all.push(node); for (const child of node.children ?? []) walk(child); };
for (const page of document.pages) walk(page.root);
const lines: string[] = [];
lines.push(`Knoten: ${all.length}, Breakpoints: ${JSON.stringify(document.breakpoints)}`);
const railed = all.filter((node) => node.baseClasses.some((name: string) => name.startsWith("hidden-")) && node.baseClasses.some((name: string) => name.startsWith("framer-")));
lines.push(`\nKnoten mit hidden-Klasse in baseClasses: ${railed.length}`);
for (const node of railed.slice(0, 20)) {
  lines.push(`  ${node.key} ${node.tag} name=${node.name ?? "-"} classes=${node.baseClasses.join(" ")}`);
  lines.push(`    states=${node.states.map((state) => `${state.device}:hiddenAt=[${state.hiddenAt.join(",")}] display=${state.visual["display"] ?? "-"}`).join(" | ")}`);
}
lines.push("\nRegeln mit hidden-*:");
for (const rule of document.rules ?? []) {
  if (rule.name.includes("hidden-")) {
    lines.push(`  ${rule.device} .${rule.name} nodes=${rule.nodeKeys.length}`);
  }
}
writeFileSync(".scratch/p3-7-punkt-15/schienen-capture.log", lines.join("\n"));
console.log(lines.slice(0, 60).join("\n"));
