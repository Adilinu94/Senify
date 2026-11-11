/* Container-Vergleich, Senify-Seite: Frame + Frame + Überschrift einfügen, Überschrift per Struktur-Drag
   in den ersten Frame legen, zweiten Frame vor den ersten ziehen, Reload, Undo/Redo. */
import { startSenify } from "./senify-lib.mts";

const s = await startSenify();
type Knoten = { type: string; props?: Record<string, unknown>; children?: string[] };
const draft = async () => (await (await fetch(`${s.running.dashboardUrl}/api/pages/${s.page.id}`)).json()) as { draft: { rootNodeId: string; nodes: Record<string, Knoten> } };
const baum = async (titel: string) => {
  const d = (await draft()).draft;
  const zeilen: string[] = [];
  const geh = (id: string, tiefe: number) => {
    const n = d.nodes[id];
    if (!n) return;
    zeilen.push("-".repeat(tiefe) + n.type + "(" + id.slice(0, 3) + ")");
    for (const k of n.children ?? []) geh(k, tiefe + 1);
  };
  for (const k of d.nodes[d.rootNodeId]?.children ?? []) geh(k, 0);
  console.log(titel + ": " + (zeilen.join(" | ") || "(leer)"));
  return d;
};
const einfuegen = async (primitive: string) => {
  await s.tab.getByRole("tab", { name: "Elemente" }).first().click();
  await s.tab.waitForTimeout(400);
  await s.tab.locator(`.senify-elements__tile[data-primitive="${primitive}"]`).click();
  await s.tab.waitForTimeout(1500);
};
const zeile = (id: string) => s.tab.locator(`.senify-explorer__item[data-node="${id}"]`);
const warteSpeichern = async () => { await s.tab.waitForTimeout(1800); };
try {
  await s.tab.waitForTimeout(2000);
  await einfuegen("frame");
  await einfuegen("frame");
  await einfuegen("heading");
  const d0 = await baum("Eingefügt (alle auf Seitenebene)");
  const [f1, f2, h] = d0.nodes[d0.rootNodeId]!.children!;
  await s.shot("51-senify-drei-knoten");

  // Überschrift in den ersten Frame ziehen (Mitte der Zeile = hineinlegen)
  await zeile(h!).dragTo(zeile(f1!), { targetPosition: { x: 60, y: 11 } });
  await warteSpeichern();
  await baum("Überschrift in Frame 1");
  await s.shot("52-senify-verschachtelt");

  // Frame 2 vor Frame 1 (obere Kante der Zeile)
  const hoehe = (await zeile(f1!).boundingBox())!.height;
  console.log("zeilenhöhe: " + hoehe);
  await zeile(f2!).dragTo(zeile(f1!), { targetPosition: { x: 60, y: 2 } });
  await warteSpeichern();
  await baum("Frame 2 vor Frame 1");
  await s.shot("53-senify-umsortiert");
  console.log("status: " + (await s.tab.locator('[data-role="canvas-status"]').textContent()));

  // Reload, dann Undo/Redo
  await s.tab.reload();
  await s.tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').waitFor({ timeout: 30000 });
  await s.tab.waitForTimeout(2500);
  await baum("Nach Reload");
  const undo = s.tab.locator('.senify-canvas__button[data-action="undo"]');
  const redo = s.tab.locator('.senify-canvas__button[data-action="redo"]');
  console.log("undo aktiv nach Reload: " + (await undo.isEnabled()));
  if (await undo.isEnabled()) {
    await undo.click(); await s.tab.waitForTimeout(1500);
    await baum("Nach Undo");
    await undo.click(); await s.tab.waitForTimeout(1500);
    await baum("Nach 2. Undo");
    await redo.click(); await s.tab.waitForTimeout(1500);
    await baum("Nach Redo");
  }
} catch (e) {
  console.log("FEHLER: " + String((e as Error).message).slice(0, 500));
  await s.shot("59-fehler");
} finally {
  await s.close();
}
