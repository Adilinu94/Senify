/* B3: Link-Ziel und "Neuer Tab" am Senify-Heading - Inspector, Canvas, Speicherstand, Reload, Inline-Text. */
import { startSenify } from "./senify-lib.mts";

const s = await startSenify();
const draft = async () => (await (await fetch(`${s.running.dashboardUrl}/api/pages/${s.page.id}`)).json()) as { draft: { nodes: Record<string, { type: string; props?: Record<string, unknown> }> } };
const headings = async () => Object.entries((await draft()).draft.nodes).filter(([, n]) => n.type === "heading").map(([id, n]) => ({ id, props: n.props }));
const html = () => s.frame().locator('[data-widget="heading"]').first().evaluate((e) => e.outerHTML);
try {
  await s.tab.waitForTimeout(2000);
  await s.tab.locator('.senify-elements__tile[data-primitive="heading"]').click();
  await s.tab.waitForTimeout(2500);
  console.log("labels: " + JSON.stringify(await s.tab.locator(".senify-inspector label, .senify-inspector legend").evaluateAll((els) => els.map((e) => (e.textContent || "").trim().slice(0, 40)))));
  console.log("canvas ohne Link: " + (await html()));

  const link = s.tab.locator('.senify-inspector__field[data-key="link"] input');
  await link.fill("https://example.com/ziel");
  await link.blur();
  await s.tab.waitForTimeout(1500);
  console.log("canvas mit Link: " + (await html()));
  console.log("newTab-feld: " + (await s.tab.locator('.senify-inspector__field[data-key="newTab"]').innerHTML()).replace(/\s+/g, " ").slice(0, 600));
  const newTab = s.tab.locator('.senify-inspector__field[data-key="newTab"] button[role="switch"]');
  await newTab.click();
  await s.tab.waitForTimeout(1500);
  console.log("canvas neuer Tab: " + (await html()));
  console.log("draft: " + JSON.stringify(await headings()));
  await s.shot("25-senify-heading-link");

  // Inline-Text am Anker
  await s.frame().locator('[data-widget="heading"] a').first().dblclick();
  await s.tab.waitForTimeout(500);
  console.log("inline editierbar: " + (await s.frame().locator('[data-widget="heading"] a[contenteditable], [data-widget="heading"] [contenteditable]').count()));

  await s.tab.reload();
  await s.tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').waitFor({ timeout: 30000 });
  await s.tab.waitForTimeout(2500);
  console.log("nach Reload: " + (await html()));

  // unsicheres Ziel
  await s.frame().locator('[data-widget="heading"]').first().click();
  await s.tab.waitForTimeout(800);
  const again = s.tab.locator('.senify-inspector__field[data-key="link"] input');
  await again.fill("javascript:alert(1)");
  await again.blur();
  await s.tab.waitForTimeout(1500);
  console.log("canvas unsicher: " + (await html()));
} finally {
  await s.close();
}



