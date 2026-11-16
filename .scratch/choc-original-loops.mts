import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

// Was sind die 346 laufenden WAAPI-Animationen des Originals beim Laden?
// Dauer, Iterationen, Zieleigenschaften und Ziel-Elemente klassifizieren.

const ORIGIN = process.env.SENIFY_CENSUS_SOURCE ?? "https://chocolate-attributes-385353.framer.app";
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${ORIGIN}/`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const details = await page.evaluate(() => {
    const alle = document.getAnimations();
    const eintraege = alle.map((a) => {
      const timing = a.effect?.getTiming?.() ?? {};
      const ziel = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const keyframes = (a.effect as KeyframeEffect | null)?.getKeyframes?.() ?? [];
      const props = new Set<string>();
      for (const frame of keyframes) {
        for (const key of Object.keys(frame)) {
          if (!["offset", "computedOffset", "easing", "composite"].includes(key)) props.add(key);
        }
      }
      return {
        art: a.constructor.name,
        status: a.playState,
        dauer: timing.duration,
        iterationen: timing.iterations,
        delay: timing.delay,
        props: [...props].slice(0, 6),
        zielTag: ziel?.tagName.toLowerCase() ?? "-",
        zielKlasse: (ziel?.getAttribute("class") ?? "").slice(0, 80),
        zielAppear: ziel?.getAttribute("data-framer-appear-id") ?? null,
        imBild: ziel ? (() => { const r = ziel.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; })() : false,
      };
    });
    const infinite = eintraege.filter((e) => e.iterationen === Infinity);
    const endlich = eintraege.filter((e) => e.iterationen !== Infinity);
    const gruppiere = (liste: typeof eintraege) => {
      const gruppen: Record<string, number> = {};
      for (const e of liste) {
        const schluessel = `${e.dauer}|${e.iterationen}|${e.props.join(",")}|${e.zielTag}`;
        gruppen[schluessel] = (gruppen[schluessel] ?? 0) + 1;
      }
      return Object.entries(gruppen).sort((a, b) => b[1] - a[1]).slice(0, 15);
    };
    return {
      gesamt: alle.length,
      infinite: infinite.length,
      endlich: endlich.length,
      infiniteGruppen: gruppiere(infinite),
      endlichGruppen: gruppiere(endlich),
      infiniteImBild: infinite.filter((e) => e.imBild).length,
      Beispiele: eintraege.slice(0, 6),
    };
  });
  writeFileSync(".scratch/choc-original-loops.json", JSON.stringify(details, null, 1));
  console.log(JSON.stringify(details, null, 1));
} finally {
  await browser.close();
}