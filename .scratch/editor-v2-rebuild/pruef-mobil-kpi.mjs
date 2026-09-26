import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
const t = pathToFileURL(".scratch/editor-v2-rebuild/ui-preview/index.html").href;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 900 } });
await p.goto(t, { waitUntil: "load" });
await p.waitForTimeout(400);
console.log(JSON.stringify(await p.evaluate(() => {
  const out = [];
  document.querySelectorAll("body *").forEach((e) => {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    if (r.width < 100 || r.height < 30) return;
    if (e.scrollWidth > e.clientWidth + 2 && (cs.overflowX === "hidden" || cs.overflowX === "clip")) {
      out.push({ cls: (e.className || e.tagName).toString().slice(0, 26), sw: e.scrollWidth, cw: e.clientWidth, verloren: e.scrollWidth - e.clientWidth, rechts: Math.round(r.right) });
    }
  });
  const kpi = [...document.querySelectorAll("body *")].filter((e) => /^\d+$/.test((e.textContent || "").trim()) && e.children.length === 0);
  return { beschnitten: out.slice(0, 10), kpiRechts: kpi.map((e) => Math.round(e.getBoundingClientRect().right)).filter((x) => x > 250).slice(0, 12) };
}), null, 2));
await b.close();
