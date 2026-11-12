import { chromium } from "playwright";

const ORIGIN = "https://chocolate-attributes-385353.framer.app";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
page.setDefaultTimeout(90_000);
await page.goto(ORIGIN, { waitUntil: "load" });
const funde = await page.evaluate(async () => {
  window.scrollTo(0, 2457);
  const gesehen = new Map<string, unknown>();
  for (let i = 0; i < 20; i += 1) {
    await new Promise((d) => setTimeout(d, 100));
    const sy = window.scrollY;
    for (const a of document.getAnimations()) {
      const ziel = (a.effect as KeyframeEffect | null)?.target as Element | null;
      if (!ziel) continue;
      const r = ziel.getBoundingClientRect();
      if (!(r.top + sy < 3481 && r.bottom + sy > 2457)) continue;
      const key = `${ziel.getAttribute("data-framer-name") ?? ziel.tagName}|${(a as any).animationName ?? a.id}`;
      if (gesehen.has(key)) continue;
      const frames = (a.effect as KeyframeEffect).getKeyframes().map((f: any) => ({
        opacity: f.opacity, transform: f.transform, offset: f.offset,
      }));
      const t = a.effect?.getTiming?.();
      gesehen.set(key, {
        name: (ziel.getAttribute("data-framer-name") ?? ziel.tagName),
        cls: (ziel.getAttribute("class") ?? "").slice(0, 60),
        playState: a.playState,
        duration: t?.duration, delay: t?.delay, iterations: t?.iterations,
        frames: frames.slice(0, 4),
      });
    }
  }
  return [...gesehen.values()];
});
console.log(JSON.stringify(funde, null, 1));
await browser.close();