/* Geräte-Vergleich, Senify-Seite: Schriftgröße am Desktop setzen, am Tablet überschreiben,
   Desktop darf sich nicht ändern; zurücksetzen; Tastaturbedienung der Struktur. */
import { startSenify } from "./senify-lib.mts";

const s = await startSenify();
type Knoten = { type: string; props?: Record<string, unknown>; overrides?: unknown; children?: string[] };
const draft = async () => (await (await fetch(`${s.running.dashboardUrl}/api/pages/${s.page.id}`)).json()) as { draft: { rootNodeId: string; nodes: Record<string, Knoten> } };
const heading = async () => Object.entries((await draft()).draft.nodes).filter(([, n]) => n.type === "heading").map(([id, n]) => ({ id, props: { props: n.props, overrides: n.overrides } }))[0];
const feld = (label: string) => s.tab.locator(".ed-field, .senify-inspector__row, .senify-inspector__field").filter({ hasText: label });
try {
  await s.tab.waitForTimeout(2000);
  await s.tab.locator('.senify-elements__tile[data-primitive="heading"]').click();
  await s.tab.waitForTimeout(1500);
  const text = s.tab.locator(".senify-inspector textarea").first();
  await text.fill("Geräte-Test");
  await text.blur();
  await s.tab.waitForTimeout(1200);

  await s.tab.locator('.senify-inspector__tab[data-tab="style"]').click();
  await s.tab.waitForTimeout(600);
  const gruppen = await s.tab.locator(".senify-inspector__group-title").evaluateAll((els) => els.map((e) => (e.textContent || "").trim()));
  console.log("stil-gruppen: " + JSON.stringify(gruppen));
  // Typografie öffnen, falls eingeklappt
  await s.tab.locator(".senify-inspector__group-title", { hasText: "Typografie" }).first().click().catch(() => undefined);
  await s.tab.waitForTimeout(600);
  const zeile = s.tab.locator("label, .senify-inspector__label, span").filter({ hasText: /^Schriftgröße$/ }).first();
  console.log("schriftgröße-label gefunden: " + (await zeile.count()));
  await s.shot("60-senify-typografie");
  const eingabe = zeile.locator("xpath=ancestor::*[.//input[@data-control='number'] or .//input[@type='number']][1]").locator("input").first();
  await eingabe.fill("40");
  await eingabe.press("Enter");
  await s.tab.waitForTimeout(1200);
  console.log("desktop gesetzt: " + JSON.stringify((await heading())?.props));

  await s.tab.locator('.senify-canvas__button[data-action="device"][data-device="tablet"]').click();
  await s.tab.waitForTimeout(1200);
  await s.shot("61-senify-tablet");
  const tabletEingabe = s.tab.locator("label, .senify-inspector__label, span").filter({ hasText: /^Schriftgröße$/ }).first().locator("xpath=ancestor::*[.//input[@data-control='number'] or .//input[@type='number']][1]").locator("input").first();
  console.log("tablet zeigt vererbt: " + (await tabletEingabe.inputValue()));
  await tabletEingabe.fill("24");
  await tabletEingabe.press("Enter");
  await s.tab.waitForTimeout(1200);
  console.log("tablet überschrieben: " + JSON.stringify((await heading())?.props));
  await s.shot("62-senify-tablet-ueberschrieben");

  await s.tab.locator('.senify-canvas__button[data-action="device"][data-device="desktop"]').click();
  await s.tab.waitForTimeout(1000);
  const desktopEingabe = s.tab.locator("label, .senify-inspector__label, span").filter({ hasText: /^Schriftgröße$/ }).first().locator("xpath=ancestor::*[.//input[@data-control='number'] or .//input[@type='number']][1]").locator("input").first();
  console.log("desktop zeigt weiter: " + (await desktopEingabe.inputValue()));

  // Reset am Tablet
  await s.tab.locator('.senify-canvas__button[data-action="device"][data-device="tablet"]').click();
  await s.tab.waitForTimeout(1000);
  const reset = s.tab.locator('.senify-inspector__reset[data-action="reset"]').first();
  console.log("reset-knöpfe am Tablet: " + (await s.tab.locator('.senify-inspector__reset[data-action="reset"]').count()));
  if (await reset.count()) {
    await reset.click();
    await s.tab.waitForTimeout(1200);
    console.log("nach Reset: " + JSON.stringify((await heading())?.props));
  }
} catch (e) {
  console.log("FEHLER: " + String((e as Error).message).slice(0, 500));
  await s.shot("69-fehler");
} finally {
  await s.close();
}

