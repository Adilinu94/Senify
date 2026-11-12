import { captureBrowser } from "../packages/framer-import/src/capture-browser.ts";
import { captureHtml } from "../packages/framer-import/src/capture-html.ts";
import { mergeDeviceVariants, restoreIdLessDeviceVariants, fetchLinkedCss } from "../packages/framer-import/src/import.ts";
const url = "https://chocolate-attributes-385353.framer.app/price";
const res = await captureBrowser({ url, pagePath: "/price", settleMs: 800 });
let doc = res.document;
const builds: any = {};
for (const d of ["tablet", "mobile"] as const) {
  const dd = captureHtml({ html: res.deviceMarkup![d]!, url, pagePath: "/price" });
  builds[d] = structuredClone(dd);
  doc = mergeDeviceVariants(doc, dd, d);
}
const html = await (await fetch(url)).text();
const st = captureHtml({ html, url, pagePath: "/price", css: await fetchLinkedCss(html, url) });
type N = any;
const findText = (n: N, t: string, path: N[] = [], out: N[][] = []): N[][] => { const p = [...path, n]; if (n.states?.some((s: any) => s.text?.content === t)) out.push(p); for (const c of n.children) findText(c, t, p, out); return out; };
const show = (label: string, root: N) => {
  for (const t of ["Astra Starter", "Meridian Starter"]) {
    const ps = findText(root, t);
    console.log(label, t, ps.length, ps.slice(0, 2).map((p) => p.slice(-3).map((n: N) => `${n.tag}.${(n.baseClasses ?? []).join(".")} vis=${JSON.stringify(n.visibleOn)} hid=${JSON.stringify(n.states.map((s: any) => s.hiddenAt))}`).join(" > ")).join(" || "));
  }
};
show("STATIC", st.pages[0]!.root);
show("BEFORE", doc.pages[0]!.root);
console.log("bps", JSON.stringify(doc.breakpoints), JSON.stringify(st.breakpoints));
const n = restoreIdLessDeviceVariants(doc, st, builds);
console.log("restored", n);
show("AFTER", doc.pages[0]!.root);
process.exit(0);