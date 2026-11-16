/* 5b Strukturbaum ein-/ausklappen mit Kindern per Tastatur, 5d Bedienelemente fuer Screenreader (Rollen, Namen). Messwerkzeug. */
import { startSenify } from "./senify-lib.mts";

const s = await startSenify();
type Knoten = { type: string; children?: string[] };
const draft = async () => (await (await fetch(`${s.running.dashboardUrl}/api/pages/${s.page.id}`)).json()) as { draft: { rootNodeId: string; nodes: Record<string, Knoten> } };
const einfuegen = async (primitive: string) => {
  await s.tab.getByRole("tab", { name: "Elemente" }).first().click();
  await s.tab.waitForTimeout(400);
  await s.tab.locator(`.senify-elements__tile[data-primitive="${primitive}"]`).click();
  await s.tab.waitForTimeout(1500);
};
const zeile = (id: string) => s.tab.locator(`.senify-explorer__item[data-node="${id}"]`);
const BESCHREIBUNG = `(() => [...document.querySelectorAll(".senify-explorer__item")].map((e) => ({ id: (e.dataset.node || "").slice(0, 4), level: e.getAttribute("aria-level"), expanded: e.getAttribute("aria-expanded"), selected: e.getAttribute("aria-selected"), role: e.getAttribute("role"), name: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30) })))()`;
try {
  await s.tab.waitForTimeout(2000);
  await einfuegen("frame");
  await einfuegen("heading");
  const d = (await draft()).draft;
  const [f, h] = d.nodes[d.rootNodeId]!.children!;
  await zeile(h!).dragTo(zeile(f!), { targetPosition: { x: 60, y: 11 } });
  await s.tab.waitForTimeout(1800);
  console.log("Baum nach Verschachteln: " + JSON.stringify(await s.tab.evaluate(BESCHREIBUNG)));

  await zeile(f!).focus();
  for (const taste of ["ArrowLeft", "ArrowLeft", "ArrowRight", "ArrowRight", "ArrowDown", "ArrowUp"]) {
    await s.tab.keyboard.press(taste);
    await s.tab.waitForTimeout(250);
    const z = (await s.tab.evaluate(BESCHREIBUNG)) as { id: string; expanded: string | null }[];
    const fokus = await s.tab.evaluate(`(document.activeElement?.dataset?.node || "").slice(0,4)`);
    console.log(`${taste}: zeilen=${z.length} fokus=${fokus} frame.expanded=${z.find((e) => e.id === f!.slice(0, 4))?.expanded}`);
  }
  await s.shot("60-baum-tastatur");

  // Screenreader: Rollen und Namen wichtiger Bedienelemente
  await zeile(h!).click();
  await s.tab.waitForTimeout(800);
  const unbenannt = await s.tab.evaluate(`(() => {
    const out = [];
    for (const e of document.querySelectorAll("button, input, textarea, select, [role=switch], [role=tab], [role=button]")) {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const name = (e.getAttribute("aria-label") || e.getAttribute("title") || (e.labels && e.labels[0] && e.labels[0].textContent) || e.textContent || e.getAttribute("placeholder") || "").trim();
      const labelledby = e.getAttribute("aria-labelledby");
      if (name === "" && !labelledby) out.push((e.className || e.tagName) + " | " + (e.getAttribute("data-control") || e.getAttribute("data-action") || ""));
    }
    return out;
  })()`);
  console.log("Bedienelemente ohne Namen: " + JSON.stringify(unbenannt));
  const felder = await s.tab.evaluate(`(() => [...document.querySelectorAll(".senify-inspector__field")].map((f) => { const c = f.querySelector("input,textarea,select,button[role=switch],[data-control]"); return { key: f.dataset.key, label: (f.querySelector(".senify-inspector__field-label")?.textContent || "").trim(), steuerName: c ? (c.getAttribute("aria-label") || c.getAttribute("aria-labelledby") || (c.labels && c.labels[0] ? "label-for" : "")) : "kein-control" }; }))()`);
  console.log("Inspector-Felder: " + JSON.stringify(felder));
  console.log("Landmarks/Tree: " + JSON.stringify(await s.tab.evaluate(`[...document.querySelectorAll("[role=tree],[role=tablist],[role=toolbar],nav,main,header,aside")].map((e) => e.tagName + (e.getAttribute("role") ? "[" + e.getAttribute("role") + "]" : "") + (e.getAttribute("aria-label") ? ":" + e.getAttribute("aria-label") : ""))`)));
} finally {
  await s.close();
}
