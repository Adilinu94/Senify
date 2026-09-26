// S0 offener Punkt 4, Lauf 2: die Live-Seite hinter vollem Settle prüfen —
// IntersectionObserver-Registrierungen und Appear-Skripte erst nach Scroll
// durch die ganze Seite, dann drei Sekunden Ruhe.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const URL = "https://font2yeux.github.io/";
const motionSource = readFileSync(
  "Repos/site-clone/skills/clone-site/scripts/motion-probe.js",
  "utf8",
);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript({
  content:
    `${motionSource}\n;` +
    "window.instrumentMotion=instrumentMotion;window.motionProbe=motionProbe;" +
    "window.motionSummary=motionSummary;instrumentMotion();",
});
const page = await context.newPage();
await page.goto(URL, { waitUntil: "networkidle", timeout: 90_000 });
await page.evaluate(async () => {
  const step = window.innerHeight;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 250));
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 800));
});
await page.waitForTimeout(3000);
const s = await page.evaluate("motionSummary()");
console.log("Stack:", JSON.stringify(s.summary ?? {}));
console.log("ScrollTrigger:", s.scrollTriggers, "· Tweens:", s.tweens, "· WAAPI:", JSON.stringify(s.waapi ?? {}));
console.log("Lenis:", JSON.stringify(s.lenis ?? null), "· SplitText:", s.splitText ?? 0);
console.log("Sliders:", JSON.stringify(s.sliders ?? []));
console.log("topTransitions:", JSON.stringify((s.topTransitions ?? []).slice(0, 6)));
console.log("notes:", JSON.stringify(s.notes ?? []));
const appear = await page.evaluate(() => {
  const out = [];
  for (const script of document.querySelectorAll("script")) {
    const id = script.id || "";
    if (/appear|breakpoint/i.test(id)) out.push({ id, bytes: (script.textContent ?? "").length });
  }
  return out;
});
console.log("appear/breakpoint-Skripte:", JSON.stringify(appear));
// Der animate-Zustand (nicht der SSR-Startzustand): die opacity eines
// typischen Appear-Elements nach dem Settle.
const opacity = await page.evaluate(() => {
  const el = document.querySelector('[data-framer-name] [data-framer-appear-id], [data-framer-appear-id]');
  return el ? getComputedStyle(el).opacity : "kein Element gefunden";
});
console.log("animate-Opacity nach Settle:", opacity);
await browser.close();
