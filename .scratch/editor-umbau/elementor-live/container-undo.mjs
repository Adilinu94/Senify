/* Elementor 4.2.3, Testseite 1337: Undo/Redo nach einer erfolgreichen Aktion (Trenner in den Div-Block). */
import { openEditor } from "./lib.mjs";

const { browser, page, frame } = await openEditor();
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
try {
  await baum("Ausgang");
  const db = await frame.locator("[data-element_type='e-div-block']").first().boundingBox();
  await ziehe(page.locator(".elementor-element-wrapper", { hasText: "Trenner" }).first(), db.x + 200, db.y + db.height - 6);
  await baum("Nach Trenner");
  await page.mouse.click(700, 700); // Fokus auf die Seite statt in ein Feld
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(1500);
  await baum("Nach Undo (Strg+Z)");
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(1500);
  await baum("Nach Redo (Strg+Umschalt+Z)");
  const verlauf = page.locator("#elementor-panel-footer-saver-options, [id*=history]");
  console.log("verlaufsknöpfe: " + (await verlauf.count()));
} catch (e) {
  console.log("FEHLER: " + String(e.message).slice(0, 400));
} finally {
  await browser.close();
}
