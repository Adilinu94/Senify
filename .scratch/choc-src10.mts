import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
for (const w of [1440, 768]) {
  const page = await browser.newPage({ viewport: { width: w, height: 1024 } });
  await page.addInitScript("window.__name = (f) => f;");
  await page.goto("https://chocolate-attributes-385353.framer.app/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  const d = await page.evaluate(() => [...document.querySelectorAll(".framer-1uss29n")].map((el) => {
    const p = el.querySelector("p") ?? el; const cs = getComputedStyle(p);
    const anc = [] as string[]; let c = el.parentElement; for (let i = 0; i < 4 && c; i++, c = c.parentElement) anc.push((c.getAttribute("class") ?? "").split(" ")[0] ?? "");
    return `${(el.textContent ?? "").trim().slice(0, 26)} | fs=${cs.fontSize} col=${cs.color} | ${anc.join(" < ")}`;
  }));
  console.log(`== ${w}\n` + d.join("\n"));
  await page.close();
}
await browser.close();