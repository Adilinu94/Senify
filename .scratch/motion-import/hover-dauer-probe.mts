// Wann ist ein Laufzeit-Hover fertig? Liest background-color alle 40 ms bis 2,4 s.
// Aufruf: pnpm exec tsx .scratch/motion-import/hover-dauer-probe.mts [url] [index,index,...]
import { chromium } from "playwright";

const url = process.argv[2] ?? "https://gracious-balance-599544.framer.app/";
const indexe = (process.argv[3] ?? "15,16,17,18,25").split(",").map(Number);
const SEL = `#main a[href], #main button, #main [role=button]`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

for (const i of indexe) {
  await page.mouse.move(1, 1);
  await page.waitForTimeout(600);
  await page.evaluate(`(function(){var l=document.querySelectorAll(${JSON.stringify(SEL)});document.querySelectorAll("[data-probe]").forEach(function(e){e.removeAttribute("data-probe")});l[${i}].setAttribute("data-probe","1");})()`);
  const read = async () => (await page.evaluate(`getComputedStyle(document.querySelector("[data-probe]")).backgroundColor`)) as string;
  const start = await read();
  const t0 = Date.now();
  await page.locator("[data-probe]").hover({ timeout: 3000 });
  const reihe: Array<[number, string]> = [];
  while (Date.now() - t0 < 2400) {
    reihe.push([Date.now() - t0, await read()]);
    await page.waitForTimeout(40);
  }
  const ende = reihe[reihe.length - 1][1];
  const ersteAnderung = reihe.find(([, v]) => v !== start)?.[0] ?? -1;
  let letzte = 0;
  for (const [t, v] of reihe) if (v !== ende) letzte = t;
  const bei450 = reihe.reduce((b, e) => (Math.abs(e[0] - 450) < Math.abs(b[0] - 450) ? e : b))[1];
  console.log(`#${i} start=${start} ende=${ende} beginnt~${ersteAnderung}ms letzterWechsel~${letzte}ms wert@450=${bei450}`);
}
await browser.close();
