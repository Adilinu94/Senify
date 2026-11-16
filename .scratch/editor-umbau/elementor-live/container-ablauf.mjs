/* Container-Vergleich, Elementor-Seite (4.2.3, Testseite 1337):
   Flexbox > Überschrift (Ausgang), Div-Block daneben, Absatz hinein, Div-Block in die Flexbox
   verschachteln, Reihenfolge ändern, speichern, neu laden, Undo/Redo. */
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
  return zeilen;
};
// Ziehen mit manueller Mausführung: dragTo löst den Drop in Elementors Sortierer nicht aus.
const ziehe = async (quelle, x, y) => {
  const b = await quelle.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2, { steps: 5 });
  await page.mouse.move(x, y, { steps: 25 });
  await page.waitForTimeout(600);
  await page.mouse.move(x + 2, y + 2, { steps: 3 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(2500);
};
const widget = (label) => page.locator(".elementor-element-wrapper", { hasText: label }).first();
const zurueckZurListe = async () => { await page.mouse.click(88, 24); await page.waitForTimeout(1500); };
const struktur = async () => {
  if (!(await page.locator("#elementor-navigator").isVisible().catch(() => false))) {
    await page.keyboard.press("Control+i");
    await page.waitForTimeout(1200);
  }
  const text = await page.locator("#elementor-navigator").innerText().catch(() => "kein Navigator");
  console.log("struktur-panel: " + JSON.stringify(text.replace(/\s+/g, " ").trim()));
};
try {
  await baum("Ausgang");
  await widget("Div-Block").dragTo(frame.locator(".elementor-add-section-inner").first());
  await page.waitForTimeout(2500);
  await baum("Div-Block auf oberster Ebene");
  await zurueckZurListe();
  const db = await frame.locator("[data-element_type='e-div-block']").first().boundingBox();
  await ziehe(widget("Absatz"), db.x + 200, db.y + db.height / 2);
  await baum("Absatz im Div-Block");
  await shot("35-elementor-struktur-vorher");
  await struktur();

  // Div-Block in die Flexbox verschachteln: neuen Div-Block in den Freiraum unter der Überschrift legen.
  await zurueckZurListe();
  const flex = await frame.locator("[data-element_type='e-flexbox']").first().boundingBox();
  const kopf = await frame.locator("[data-widget_type='e-heading.default'] .e-heading-base").first().boundingBox();
  console.log("flexbox " + JSON.stringify(flex) + " überschrift " + JSON.stringify(kopf));
  await ziehe(widget("Div-Block"), kopf.x + kopf.width + 40, flex.y + flex.height / 2);
  await baum("Div-Block neben der Überschrift in der Flexbox");
  await shot("36-elementor-verschachtelt");

  await page.keyboard.press("Control+S");
  await page.waitForTimeout(4000);
  await shot("37-elementor-gespeichert");
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("#elementor-panel", { timeout: 180000 });
  await page.waitForTimeout(8000);
  await baum("Nach Reload");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(1500);
  await baum("Nach Undo (Strg+Z)");
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(1500);
  await baum("Nach Redo (Strg+Umschalt+Z)");
} catch (e) {
  console.log("FEHLER: " + String(e.message).slice(0, 400));
  await shot("39-fehler");
} finally {
  await browser.close();
}
