import { openEditor } from "./lib.mjs";
const { browser, page, shot, frame } = await openEditor();
const baum = async (t) => console.log(t + ": " + (await frame.locator('[data-elementor-id="1337"] [data-id]').evaluateAll((els) => els.map((e) => { let d = 0; for (let p = e.parentElement; p; p = p.parentElement) if (p.hasAttribute("data-id")) d++; return "-".repeat(d) + e.getAttribute("data-element_type") + (e.getAttribute("data-widget_type") ? ":" + e.getAttribute("data-widget_type") : ""); }))).join(" | "));
const manuell = async (label, x, y) => {
  const w = page.locator(".elementor-element-wrapper", { hasText: label }).first();
  const b = await w.boundingBox();
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
  await page.locator(".elementor-element-wrapper", { hasText: "Div-Block" }).first().dragTo(frame.locator(".elementor-add-section-inner").first());
  await page.waitForTimeout(2500);
  await baum("Nach Div-Block");
  await page.mouse.click(88, 24);
  await page.waitForTimeout(1500);
  const b = await frame.locator("[data-element_type='e-div-block']").first().boundingBox();
  await manuell("Absatz", b.x + 200, b.y + b.height / 2);
  await baum("Nach Absatz (manuell)");
  await shot("33-elementor-absatz");
} catch (e) { console.log("FEHLER: " + String(e.message).slice(0, 400)); } finally { await browser.close(); }


