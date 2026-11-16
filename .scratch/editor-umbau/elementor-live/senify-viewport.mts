/* Schmaler Viewport: welche Elemente ragen ueber das Fenster, wie breit ist die Seite. Messwerkzeug.
   Das Messskript ist reines JS als String, weil tsx sonst __name in den Browser schreibt. */
import { startSenify } from "./senify-lib.mts";

const MESSEN = `(() => {
  const w = window.innerWidth;
  const klasse = (e) => (e.className && typeof e.className === "string" ? e.className.split(" ")[0] : e.tagName.toLowerCase());
  const tiefe = (e) => { let n = 0; let p = e; while (p) { n++; p = p.parentElement; } return n; };
  const ueber = [...document.querySelectorAll("body *")]
    .map((e) => ({ e, r: e.getBoundingClientRect() }))
    .filter((x) => x.r.width > 0 && x.r.right > w + 1)
    .map((x) => ({ k: klasse(x.e), links: Math.round(x.r.left), rechts: Math.round(x.r.right), tiefe: tiefe(x.e) }))
    .sort((a, b) => a.tiefe - b.tiefe)
    .slice(0, 8);
  const bar = document.querySelector("[class*=topbar], header");
  const kinder = bar ? [...bar.children].map((c) => ({ k: klasse(c), b: Math.round(c.getBoundingClientRect().width), rechts: Math.round(c.getBoundingClientRect().right) })) : [];
  const main = document.querySelector("[class*=editor__main], main");
  return {
    fenster: w,
    scrollBreite: document.documentElement.scrollWidth,
    bar: bar ? { b: Math.round(bar.getBoundingClientRect().width), scroll: bar.scrollWidth, wrap: getComputedStyle(bar).flexWrap, display: getComputedStyle(bar).display } : null,
    kinder,
    main: main ? { cols: getComputedStyle(main).gridTemplateColumns, b: Math.round(main.getBoundingClientRect().width), scroll: main.scrollWidth } : null,
    ueber,
  };
})()`;

const s = await startSenify();
try {
  await s.tab.waitForTimeout(2000);
  for (const breite of [1440, 1100, 900, 768, 390]) {
    await s.tab.setViewportSize({ width: breite, height: 900 });
    await s.tab.waitForTimeout(600);
    console.log(`--- ${breite}\n` + JSON.stringify(await s.tab.evaluate(MESSEN)));
    await s.shot(`viewport-${breite}`);
  }
} finally {
  await s.close();
}

