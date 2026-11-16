import { writeFileSync } from "node:fs";
import { captureHtml } from "../packages/framer-import/src/capture-html.ts";
import { captureBrowser } from "../packages/framer-import/src/capture-browser.ts";
import { normalize } from "../packages/framer-import/src/normalize.ts";
import { fetchLinkedCss, mergeDeviceVariants, restoreIdLessDeviceVariants } from "../packages/framer-import/src/import.ts";
import type { IrNode, FramerIrDocument } from "../packages/framer-import/src/ir.ts";

// Befund 6: die verworfenen CSS-Deklarationen der Chocolate-Startseite
// aufschluesseln. normalize.ts droppt nur -webkit-/-moz- Praefix-Properties.
// Frage: redundant (No-op-Wert oder Standard-Gegenstueck) oder echter Verlust?
// Der Lauf bildet die Browser-Pipeline des Imports nach (import.ts 688-736).

const URL = "https://chocolate-attributes-385353.framer.app/";
const fromBrowser = await captureBrowser({ url: URL, pagePath: "/", settleMs: 800 });
let document: FramerIrDocument = fromBrowser.document;
for (const device of ["tablet", "mobile"] as const) {
  const markup = fromBrowser.deviceMarkup?.[device];
  if (markup === undefined || markup === "") continue;
  document = mergeDeviceVariants(document, captureHtml({ html: markup, url: URL, pagePath: "/" }), device);
}
const html = await (await fetch(URL)).text();
const staticCss = await fetchLinkedCss(html, URL);
const staticDocument = captureHtml({ html, url: URL, pagePath: "/", css: staticCss });
restoreIdLessDeviceVariants(document, staticDocument);
const normalized = normalize(document, { mode: "fidelity" });

const NOOP = new Set(["inherit", "initial", "unset", "none", "auto", "0", "0px"]);
const STANDARD: Record<string, string> = {
  "-webkit-transform": "transform",
  "-webkit-transition": "transition",
  "-webkit-animation": "animation",
  "-webkit-filter": "filter",
  "-webkit-backdrop-filter": "backdrop-filter",
  "-webkit-background-clip": "background-clip",
  "-webkit-background-size": "background-size",
  "-webkit-border-radius": "border-radius",
  "-webkit-box-shadow": "box-shadow",
  "-webkit-user-select": "user-select",
  "-moz-user-select": "user-select",
  "-webkit-appearance": "appearance",
  "-moz-appearance": "appearance",
  "-webkit-line-clamp": "line-clamp",
  "-webkit-mask-image": "mask-image",
  "-webkit-mask": "mask",
  "-webkit-font-feature-settings": "font-feature-settings",
  "-moz-font-feature-settings": "font-feature-settings",
};
const norm = (v: string): string => v.trim().replace(/'/g, '"');

type Eintrag = { total: number; noop: number; redundant: number; verlust: number; werte: Record<string, number> };
const namen: Record<string, Eintrag> = {};
let total = 0, noop = 0, redundant = 0, verlust = 0;
let maskMitSvg = 0, maskOhneSvg = 0;
const maskOhneSvgBeispiele: string[] = [];
let ffsStandardDa = 0, ffsStandardFehlt = 0, ffsStandardAnders = 0;

const walk = (node: IrNode): void => {
  for (const state of node.states) {
    const merged: Record<string, string> = {};
    for (const [p, v] of Object.entries(state.visual)) if (v !== undefined) merged[p] = v;
    if (state.text !== null) Object.assign(merged, state.text.inline);
    for (const [name, value] of Object.entries(merged)) {
      if (!name.startsWith("-webkit-") && !name.startsWith("-moz-")) continue;
      total += 1;
      const eintrag = namen[name] ?? { total: 0, noop: 0, redundant: 0, verlust: 0, werte: {} };
      eintrag.total += 1;
      eintrag.werte[value] = (eintrag.werte[value] ?? 0) + 1;
      const standard = STANDARD[name];
      if (NOOP.has(value.trim())) { noop += 1; eintrag.noop += 1; }
      else if (standard !== undefined && merged[standard] !== undefined && norm(merged[standard]) === norm(value)) { redundant += 1; eintrag.redundant += 1; }
      else {
        verlust += 1; eintrag.verlust += 1;
        if (name === "-webkit-mask") {
          if (node.svg !== null || node.kind === "svg") maskMitSvg += 1;
          else { maskOhneSvg += 1; if (maskOhneSvgBeispiele.length < 8) maskOhneSvgBeispiele.push(`${node.key} kind=${node.kind} tag=${node.tag ?? "-"}`); }
        }
        if (name === "-webkit-font-feature-settings" || name === "-moz-font-feature-settings") {
          const std = merged["font-feature-settings"];
          if (std === undefined) ffsStandardFehlt += 1;
          else if (norm(std) === norm(value)) ffsStandardDa += 1;
          else ffsStandardAnders += 1;
        }
      }
      namen[name] = eintrag;
    }
  }
  for (const child of node.children) walk(child);
};
for (const page of document.pages) walk(page.root);

console.log("normalize droppedDeclarations:", normalized.stats.droppedDeclarations);
console.log("IR-Praefix-Deklarationen:", total, "| No-op:", noop, "| redundant (Standard gleich):", redundant, "| echter Verlust:", verlust);
console.log("-webkit-mask auf SVG-Knoten (Icon als Asset erfasst):", maskMitSvg, "| ohne SVG:", maskOhneSvg);
if (maskOhneSvgBeispiele.length > 0) console.log("  Beispiele ohne SVG:", maskOhneSvgBeispiele.join(" | "));
console.log("font-feature-settings Verlust-Faelle: Standard gleichwertig da:", ffsStandardDa, "| Standard fehlt:", ffsStandardFehlt, "| Standard anders:", ffsStandardAnders);
const sortiert = Object.entries(namen).sort((a, b) => b[1].total - a[1].total);
for (const [name, w] of sortiert) {
  const top = Object.entries(w.werte).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([v, n]) => `${v} (${n})`).join(", ");
  console.log(`  ${name}: ${w.total} [noop ${w.noop}, red ${w.redundant}, verlust ${w.verlust}] Werte: ${top}`);
}
writeFileSync(".scratch/choc-css-drop.json", JSON.stringify({ dropped: normalized.stats.droppedDeclarations, total, noop, redundant, verlust, maskMitSvg, maskOhneSvg, maskOhneSvgBeispiele, ffsStandardDa, ffsStandardFehlt, ffsStandardAnders, namen: Object.fromEntries(sortiert) }, null, 1));