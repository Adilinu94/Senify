/* Container-Vergleich, Senify-Seite: Erkundung. Frame einfügen, Überschrift einfügen, Struktur-DOM lesen. */
import { startSenify } from "./senify-lib.mts";

const s = await startSenify();
const draft = async () => (await (await fetch(`${s.running.dashboardUrl}/api/pages/${s.page.id}`)).json()) as { draft: { rootNodeId: string; nodes: Record<string, { type: string; props?: Record<string, unknown>; children?: string[] }> } };
const baum = async (titel: string) => {
  const d = (await draft()).draft;
  const zeilen: string[] = [];
  const geh = (id: string, tiefe: number) => {
    const n = d.nodes[id];
    if (!n) return;
    zeilen.push("-".repeat(tiefe) + n.type);
    for (const k of n.children ?? []) geh(k, tiefe + 1);
  };
  for (const k of d.nodes[d.rootNodeId]?.children ?? []) geh(k, 0);
  console.log(titel + ": " + zeilen.join(" | "));
};
try {
  await s.tab.waitForTimeout(2000);
  await baum("Ausgang");
  await s.tab.locator('.senify-elements__tile[data-primitive="frame"]').click();
  await s.tab.waitForTimeout(2000);
  await baum("Nach Frame"); await s.shot("50-senify-nach-frame"); console.log("tabs: " + JSON.stringify(await s.tab.locator("[role=tab]").evaluateAll((els) => els.map((e) => (e.textContent||"").trim() + (e.getAttribute("aria-selected") === "true" ? "*" : "") + (e.getBoundingClientRect().width ? "" : "(unsichtbar)")))));
  await s.tab.getByRole("tab", { name: "Elemente" }).first().click(); await s.tab.waitForTimeout(500); await s.tab.locator('.senify-elements__tile[data-primitive="heading"]').click();
  await s.tab.waitForTimeout(2000);
  await baum("Nach Heading (Frame ist gewählt)");
  await s.shot("50-senify-struktur");
  const html = await s.tab.locator("[aria-label=Struktur], .senify-explorer").first().evaluate((e) => e.outerHTML);
  console.log("explorer-html: " + html.slice(0, 2500));
} finally {
  await s.close();
}


