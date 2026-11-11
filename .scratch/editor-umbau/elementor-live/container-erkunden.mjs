/* Container-Vergleich, Elementor-Seite: Flexbox einfügen, Überschrift hineinziehen,
   Div-Block verschachteln, Struktur lesen. Testseite 1337 auf hcm.local. */
import { openEditor } from "./lib.mjs";

const { browser, page, shot, frame } = await openEditor();
const doc = () => frame.locator('[data-elementor-id="1337"]');
const baum = async (titel) => {
  const zeilen = await doc().locator("[data-id]").evaluateAll((els) =>
    els.map((e) => {
      let tiefe = 0;
      for (let p = e.parentElement; p; p = p.parentElement) if (p.hasAttribute("data-id")) tiefe += 1;
      return `${"  ".repeat(tiefe)}${e.getAttribute("data-element_type")}${e.getAttribute("data-widget_type") ? ":" + e.getAttribute("data-widget_type") : ""}`;
    }),
  );
  console.log(titel + "\n" + zeilen.join("\n"));
};
try {
  await baum("Ausgang");
  const ziele = await frame.locator(".elementor-add-new-section, .elementor-add-section, .elementor-add-section-inner, .e-empty-view, .elementor-empty-view").evaluateAll((els) => els.map((e) => e.className));
  console.log("ablageziele: " + JSON.stringify(ziele));
  await shot("31-elementor-container-ausgang");
} finally {
  await browser.close();
}
