/* Bedienbarkeit, Senify-Seite: Tastatur in der Struktur (Pfeile, Einklappen), Fokus-Sichtbarkeit,
   schmaler Viewport (768 und 390 px Breite). Messwerkzeug, kein Produktcode. */
import { startSenify } from "./senify-lib.mts";

const s = await startSenify();
const gewaehlt = async () => s.tab.locator('.senify-explorer__item[data-selected="true"] .senify-explorer__label').first().textContent().catch(() => "keine");
try {
  await s.tab.waitForTimeout(2000);
  for (const art of ["frame", "heading"]) {
    await s.tab.getByRole("tab", { name: "Elemente" }).first().click();
    await s.tab.waitForTimeout(300);
    await s.tab.locator(`.senify-elements__tile[data-primitive="${art}"]`).click();
    await s.tab.waitForTimeout(1200);
  }
  const zeilen = s.tab.locator(".senify-explorer__item");
  console.log("zeilen: " + (await zeilen.count()) + ", gewählt: " + (await gewaehlt()));
  await zeilen.nth(1).focus();
  await s.tab.keyboard.press("ArrowUp");
  await s.tab.waitForTimeout(300);
  console.log("nach Pfeil auf: fokus=" + (await s.tab.evaluate(() => (document.activeElement?.textContent || "").trim().slice(0, 30))) + " | gewählt=" + (await gewaehlt()));
  await s.tab.keyboard.press("ArrowDown");
  await s.tab.keyboard.press("ArrowDown");
  await s.tab.waitForTimeout(300);
  console.log("nach 2x Pfeil ab: fokus=" + (await s.tab.evaluate(() => (document.activeElement?.textContent || "").trim().slice(0, 30))));
  await s.tab.keyboard.press("Enter");
  await s.tab.waitForTimeout(500);
  console.log("nach Enter gewählt: " + (await gewaehlt()));
  await s.tab.keyboard.press("ArrowLeft");
  await s.tab.waitForTimeout(300);
  console.log("zeilen nach Pfeil links (Einklappen der Wurzel?): " + (await zeilen.count()));
  await s.tab.keyboard.press("ArrowRight");
  await s.tab.waitForTimeout(300);
  console.log("zeilen nach Pfeil rechts: " + (await zeilen.count()));
  // Sichtbarer Fokusrahmen an einer Zeile?
  const fokusStil = await s.tab.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "kein fokus";
    const st = getComputedStyle(el);
    return `outline=${st.outlineStyle} ${st.outlineWidth} / boxShadow=${st.boxShadow.slice(0, 50)}`;
  });
  console.log("fokus-darstellung: " + fokusStil);
  await s.shot("70-senify-tastatur");

  for (const breite of [768, 390]) {
    await s.tab.setViewportSize({ width: breite, height: 900 });
    await s.tab.waitForTimeout(1200);
    const info = await s.tab.evaluate(() => ({
      scrollBreite: document.documentElement.scrollWidth,
      fenster: window.innerWidth,
      sichtbareTabs: Array.from(document.querySelectorAll("[role=tab]")).filter((e) => (e as HTMLElement).getBoundingClientRect().width > 0 && (e as HTMLElement).getBoundingClientRect().right <= window.innerWidth).length,
      abgeschnitten: Array.from(document.querySelectorAll("[role=tab], button")).filter((e) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1; }).length,
    }));
    console.log(`viewport ${breite}: ` + JSON.stringify(info));
    await s.shot(`71-senify-${breite}`);
  }
} catch (e) {
  console.log("FEHLER: " + String((e as Error).message).slice(0, 500));
} finally {
  await s.close();
}
