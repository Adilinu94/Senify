/* Senify-Seite des Stil-Tab-Vergleichs: Gruppen und Feldbeschriftungen des Headings, je Zustand. */
import { startSenify } from "./senify-lib.mts";

const s = await startSenify();
try {
  await s.tab.waitForTimeout(2000);
  await s.tab.locator('.senify-elements__tile[data-primitive="heading"]').click();
  await s.tab.waitForTimeout(2500);
  await s.tab.locator('.senify-inspector__tab[data-tab="style"]').click();
  await s.tab.waitForTimeout(800);
  while ((await s.tab.locator('.senify-inspector__group[data-collapsed="true"]').count()) > 0) {
    await s.tab.locator('.senify-inspector__group[data-collapsed="true"] .senify-inspector__group-title').first().click();
    await s.tab.waitForTimeout(150);
  }
  const dump = () =>
    s.tab.evaluate(() => {
      const root = document.querySelector(".senify-inspector");
      const groups: Array<{ gruppe: string; offen: boolean; felder: string[] }> = [];
      root?.querySelectorAll(".senify-inspector__group").forEach((g) => {
        const title = (g.querySelector(".senify-inspector__group-title")?.textContent ?? "").trim();
        const felder = Array.from(g.querySelectorAll(".senify-inspector__field")).map((f) => (f.querySelector(".senify-inspector__field-label")?.textContent ?? "").trim() + " [" + (f.getAttribute("data-key") ?? "") + "]");
        groups.push({ gruppe: title, offen: !g.hasAttribute("hidden") && g.getAttribute("data-open") !== "false", felder: Array.from(new Set(felder)) });
      });
      return groups;
    });
  console.log("STIL-GRUPPEN " + JSON.stringify(await dump(), null, 1));
  console.log("ZUSTAENDE " + JSON.stringify(await s.tab.locator('[data-role="state-select"], .senify-inspector__states button, .senify-inspector select').evaluateAll((els) => els.map((e) => ((e as HTMLElement).dataset.state ?? e.textContent ?? "").trim().slice(0, 60))).catch(() => [])));
  await s.shot("25-senify-stil-tab");
} finally {
  await s.close();
}
