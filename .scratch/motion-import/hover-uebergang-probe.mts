// Misst, ob Laufzeit-Hover-Wechsel weich laufen (Stufe-2-Frage von Issue 08).
// Aufruf: pnpm exec tsx .scratch/motion-import/hover-uebergang-probe.mts [url]
import { chromium } from "playwright";

const url = process.argv[2] ?? "https://gracious-balance-599544.framer.app/";
const PROPS = ["color", "background-color", "border-color", "opacity", "transform", "box-shadow", "filter"];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const READ = `(function(el){var s=getComputedStyle(el);var o={};${JSON.stringify(PROPS)}.forEach(function(p){o[p]=s.getPropertyValue(p)});o.td=s.transitionDuration;o.tp=s.transitionProperty;return o;})`;
const total = await page.locator("#main a[href], #main button, #main [role=button]").count();
console.log("Kandidaten:", total);
let hoverNodes = 0;
let weich = 0;
for (let i = 0; i < Math.min(total, 40); i++) {
  const loc = page.locator("#main a[href], #main button, #main [role=button]").nth(i);
  const box = await loc.boundingBox().catch(() => null);
  if (!box || box.width < 4 || box.height < 4) continue;
  await page.mouse.move(1, 1);
  await page.waitForTimeout(150);
  const handle = await loc.elementHandle();
  if (!handle) continue;
  await handle.evaluate(`document.querySelector("#main")`).catch(() => undefined);
  await page.evaluate(`(function(){var l=document.querySelectorAll("#main a[href], #main button, #main [role=button]");document.querySelectorAll("[data-probe]").forEach(function(e){e.removeAttribute("data-probe")});l[${i}].setAttribute("data-probe","1");})()`);
  const read = async () => (await page.evaluate(`(${READ})(document.querySelector("[data-probe]"))`)) as Record<string, string>;
  const a = await read();
  await page.waitForTimeout(80);
  const a2 = await read();
  try {
    await loc.hover({ timeout: 2000 });
  } catch {
    continue;
  }
  await page.waitForTimeout(30);
  const t30 = await read();
  await page.waitForTimeout(90);
  const t120 = await read();
  await page.waitForTimeout(380);
  const t500 = await read();
  const geaendert = PROPS.filter((p) => a[p] === a2[p] && t500[p] !== a[p]);
  if (geaendert.length === 0) continue;
  hoverNodes += 1;
  const dazwischen = geaendert.filter((p) => (t30[p] !== a[p] && t30[p] !== t500[p]) || (t120[p] !== a[p] && t120[p] !== t500[p]));
  if (dazwischen.length > 0) weich += 1;
  console.log(
    `#${i} ${JSON.stringify((await loc.innerText().catch(() => "")).slice(0, 24))} geaendert=${geaendert.join(",")} ` +
      `css-transition=${a.td}/${a.tp.slice(0, 30)} zwischenwerte=${dazwischen.join(",") || "keine"}`,
  );
  for (const p of geaendert.slice(0, 2)) console.log(`     ${p}: ${a[p]} -> 30ms ${t30[p]} -> 120ms ${t120[p]} -> 500ms ${t500[p]}`);
}
console.log(`Hover-Knoten: ${hoverNodes}, davon mit Zwischenwerten (weich): ${weich}`);
await browser.close();
