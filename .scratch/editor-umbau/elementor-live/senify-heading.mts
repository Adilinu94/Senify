/* Senify-Seite des Vergleichs: Überschrift einfügen, Text setzen, speichern, Reload, Undo/Redo.
   Dann Link-Element (kein Link-Feld am Heading). */
import { startSenify } from "./senify-lib.mts";

const s = await startSenify();
const draft = async () => (await (await fetch(`${s.running.dashboardUrl}/api/pages/${s.page.id}`)).json()) as { draft: { nodes: Record<string, { type: string; props?: Record<string, unknown> }> } };
const nodesOf = async (type: string) => Object.entries((await draft()).draft.nodes).filter(([, n]) => n.type === type).map(([id, n]) => ({ id, props: n.props }));
const saved = () => s.tab.locator('[data-role="canvas-status"]').textContent();
try {
  await s.tab.waitForTimeout(2000);
  await s.tab.locator('.senify-elements__tile[data-primitive="heading"]').click();
  await s.tab.waitForTimeout(2500);
  console.log("heading direkt nach Einfügen: " + JSON.stringify(await nodesOf("heading")));

  const field = s.tab.locator(".senify-inspector textarea").first();
  await field.fill("Senify Abgleich Überschrift");
  await field.blur();
  console.log("ebene im inspector: " + (await s.tab.locator(".senify-inspector select").first().inputValue().catch(() => "n/a")) + " / im canvas: " + (await s.frame().locator('[data-widget="heading"]').first().evaluate((e) => e.tagName)));
  await s.tab.waitForTimeout(1500);
  await s.shot("22-senify-heading-text");
  console.log("status: " + (await saved()));
  console.log("heading nach Text: " + JSON.stringify(await nodesOf("heading")));
  console.log("canvas html: " + (await s.frame().locator('[data-widget="heading"]').first().evaluate((e) => e.outerHTML).catch((e) => "n/a " + String(e).slice(0, 80))).slice(0, 300));

  await s.tab.reload();
  await s.tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').waitFor({ timeout: 30000 });
  await s.tab.waitForTimeout(2500);
  console.log("nach Reload sichtbar: " + (await s.frame().locator('[data-widget="heading"]').first().textContent().catch(() => "n/a")));
  const undo = s.tab.locator('.senify-canvas__button[data-action="undo"]');
  console.log("undo nach reload aktiv: " + (await undo.isEnabled()));
  await undo.click();
  await s.tab.waitForTimeout(2000);
  console.log("nach Undo: " + JSON.stringify(await nodesOf("heading")));
  await s.tab.locator('.senify-canvas__button[data-action="redo"]').click();
  await s.tab.waitForTimeout(2000);
  console.log("nach Redo: " + JSON.stringify(await nodesOf("heading")));
  await s.shot("23-senify-nach-redo");

  // Stil-Tab des Headings
  await s.tab.locator('.senify-inspector__tab[data-tab="style"]').click();
  await s.tab.waitForTimeout(800);
  await s.shot("24-senify-heading-stil");
  console.log("stil-gruppen: " + JSON.stringify(await s.tab.locator(".senify-inspector__group-title").evaluateAll((els) => els.map((e) => (e.textContent || "").trim()))));
} finally {
  await s.close();
}
