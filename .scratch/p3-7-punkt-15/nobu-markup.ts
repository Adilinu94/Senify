// Wo fehlen „nobu"/„naga"? Der echte Capture liefert drei Markup-Stände:
// den gesetzten (1440), den frühen (350 ms) und die Geräte-Builds.
import { captureBrowser, captureHtml } from "../../packages/framer-import/src/index.ts";

const URL = "https://unifiersofjapan.framer.website/";

type IrNode = {
  tag: string;
  key: string;
  states: { text: { content: string } | null; hiddenAt: string[] }[];
  children: IrNode[];
};

const textsOf = (html: string, label: string): void => {
  const document = captureHtml({ html, url: URL });
  const out: string[] = [];
  const walk = (node: IrNode): void => {
    for (const state of node.states) {
      const text = state.text?.content ?? "";
      if (/^(nobu|naga|nobunaga)$/i.test(text.trim())) {
        out.push(`<${node.tag} key=${node.key}> "${text}" hiddenAt=${JSON.stringify(state.hiddenAt)}`);
      }
    }
    for (const child of node.children) walk(child);
  };
  walk(document.pages[0]?.root as IrNode);
  console.log(`\n## ${label}: ${out.length} Treffer`);
  for (const line of out) console.log(`  ${line}`);
};

const result = await captureBrowser({ url: URL, pagePath: "/", settleMs: 600 });
console.log(`earlyMarkup ${result.earlyMarkup === undefined ? "fehlt" : `${result.earlyMarkup.length} Zeichen`}`);
console.log(`deviceMarkup ${Object.keys(result.deviceMarkup ?? {}).join(", ")}`);
textsOf(result.earlyMarkup ?? "", "earlyMarkup (350 ms, 1440)");
for (const device of ["tablet", "mobile"] as const) {
  const markup = result.deviceMarkup?.[device];
  if (markup !== undefined && markup !== "") textsOf(markup, `deviceMarkup ${device}`);
}
const settled = result.document;
const out: string[] = [];
const walk = (node: IrNode): void => {
  for (const state of node.states) {
    const text = state.text?.content ?? "";
    if (/^(nobu|naga|nobunaga)$/i.test(text.trim())) {
      out.push(`<${node.tag} key=${node.key}> "${text}" hiddenAt=${JSON.stringify(state.hiddenAt)}`);
    }
  }
  for (const child of node.children) walk(child);
};
walk(settled.pages[0]?.root as IrNode);
console.log(`\n## settled document: ${out.length} Treffer`);
for (const line of out) console.log(`  ${line}`);
