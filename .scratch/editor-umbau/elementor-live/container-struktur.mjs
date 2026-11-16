/* Container-Vergleich, Elementor-Seite, Teil 2: Struktur-Panel. Ausgang ist der gespeicherte Stand aus
   container-ablauf.mjs (Flexbox > Überschrift, Div-Block > Absatz). Verschachteln und Umsortieren im Panel,
   Undo/Redo innerhalb der Sitzung, speichern, neu laden. */
import { openEditor } from "./lib.mjs";

const { browser, page, shot, frame } = await openEditor();
const baum = async (titel) => {
  const zeilen = await frame.locator('[data-elementor-id="1337"] [data-id]').evaluateAll((els) =>
    els.map((e) => {
      let d = 0;
      for (let p = e.parentElement; p; p = p.parentElement) if (p.hasAttribute("data-id")) d++;
      return "-".repeat(d) + e.getAttribute("data-element_type") + (e.getAttribute("data-widget_type") ? ":" + e.getAttribute("data-widget_type") : "");
    }),
  );
  console.log(titel + ": " + zeilen.join(" | "));
};
const zeile = (text) => page.locator("#elementor-navigator .elementor-navigator__element", { hasText: text }).first();
const ziehePanel = async (von, nach, anteilY) => {
  const a = await von.boundingBox();
  const b = await nach.boundingBox();
  await page.mouse.move(a.x + 60, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 70, a.y + a.height / 2 + 4, { steps: 4 });
  await page.mouse.move(b.x + 60, b.y + b.height * anteilY, { steps: 20 });
  await page.waitForTimeout(500);
  await page.mouse.move(b.x + 62, b.y + b.height * anteilY + 1, { steps: 3 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(2000);
};
const panelZeilen = async () =>
  console.log("panel: " + JSON.stringify(await page.locator("#elementor-navigator .elementor-navigator__element").evaluateAll((els) => els.map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()))));
try {
  if (!(await page.locator("#elementor-navigator").isVisible().catch(() => false))) {
    await page.keyboard.press("Control+i");
    await page.waitForTimeout(1200);
  }
  await baum("Ausgang");
  await panelZeilen();
  await shot("40-struktur-ausgang");

  // 1) Div-Block auf die Flexbox-Zeile ziehen (Mitte = hineinlegen)
  await ziehePanel(zeile("Div-Block"), zeile("Flexbox"), 0.5);
  await baum("Div-Block auf Flexbox gezogen");
  await panelZeilen();
  await shot("41-struktur-verschachtelt");

  // 2) Undo / Redo in der Sitzung
  await page.locator("#elementor-navigator").click({ position: { x: 100, y: 300 } });
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(1500);
  await baum("Nach Undo");
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(1500);
  await baum("Nach Redo");

  // 3) Speichern, Reload
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("#elementor-panel", { timeout: 180000 });
  await page.waitForTimeout(8000);
  await baum("Nach Speichern und Reload");
  await shot("42-struktur-nach-reload");
} catch (e) {
  console.log("FEHLER: " + String(e.message).slice(0, 500));
  await shot("49-fehler");
} finally {
  await browser.close();
}
