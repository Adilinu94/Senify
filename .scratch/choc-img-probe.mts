import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { chromium } from "playwright";
const ROOT = process.argv[2]!;
const MIME: Record<string,string> = {".html":"text/html; charset=utf-8",".css":"text/css",".js":"text/javascript",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".avif":"image/avif",".svg":"image/svg+xml",".woff2":"font/woff2",".gif":"image/gif"};
const server = createServer(async (rq, rs) => {
  let p = decodeURIComponent(new URL(rq.url ?? "/", "http://l").pathname); if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(normalize(join(ROOT, p))); rs.writeHead(200, {"content-type": MIME[extname(p)] ?? "application/octet-stream"}); rs.end(b); } catch { rs.writeHead(404); rs.end(); }
});
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${(server.address() as any).port}/`;
const browser = await chromium.launch();
for (const w of [1440, 768]) {
  const page = await browser.newPage({ viewport: { width: w, height: 1024 } });
  const failed: string[] = [];
  page.on("requestfailed", r => failed.push(r.url().slice(0, 100)));
  page.on("response", r => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().slice(0, 100)); });
  await page.goto(url, { waitUntil: "networkidle" });
  for (let y = 0; y < 12000; y += 600) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(120); }
  const r = await page.evaluate(() => {
    const imgs = [...document.images];
    const big = imgs.filter(i => i.getBoundingClientRect().width > 300);
    return { total: imgs.length, big: big.length, bigNotLoaded: big.filter(i => !i.complete || i.naturalWidth === 0).length,
      bigHidden: big.filter(i => { const cs = getComputedStyle(i); return cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05; }).length,
      sample: big.slice(0, 3).map(i => ({ src: i.currentSrc.slice(0, 80), nw: i.naturalWidth, w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height), op: getComputedStyle(i).opacity, disp: getComputedStyle(i).display })) };
  });
  console.log(w, JSON.stringify(r), "fehler:", failed.length, failed.slice(0, 5));
  await page.close();
}
await browser.close(); server.close();
