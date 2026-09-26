/* Überlaufmessung: Editor und Shell bei vier Breiten.
   Aufruf: node .scratch/editor-v2-rebuild/pruef-ueberlauf.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;
const browser = await chromium.launch();
const res = {};

for (const [name, w] of [["1440", 1440], ["1280", 1280], ["1024", 1024], ["390", 390]]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto(target, { waitUntil: "load" });
  await page.waitForTimeout(350);
  const mess = async (hash) => {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForTimeout(250);
    return await page.evaluate(() => {
      const raus = [];
      document.querySelectorAll("body *").forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        if (r.right > innerWidth + 1 || r.left < -1) {
          const cls = (e.className || e.tagName).toString().split(/\s+/).slice(0, 2).join(".");
          raus.push({ cls: cls.slice(0, 34), links: Math.round(r.left), rechts: Math.round(r.right), text: (e.textContent || "").trim().slice(0, 18) });
        }
      });
      // nur die äußersten, nicht jeden Nachfahren
      const aeusserste = raus.filter((a) => !raus.some((b) => b !== a && b.links <= a.links && b.rechts >= a.rechts && b.cls === a.cls));
      return {
        docScroll: document.documentElement.scrollWidth, docClient: document.documentElement.clientWidth,
        ueberlauf: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        anzahl: raus.length,
        beispiele: aeusserste.slice(0, 6),
      };
    });
  };
  res[name] = { editor: await mess("#/editor"), start: await mess("#/") };
  await page.close();
}

await browser.close();
console.log(JSON.stringify(res, null, 2));
