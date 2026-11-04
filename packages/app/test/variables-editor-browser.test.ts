import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

describe.skipIf(!browserAvailable)("global variables in the editor", () => {
  it("edits and creates colors with immediate canvas updates and conflict protection", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-variables-"));
    const running = await startProgram({ db: database.db, dataDir, programTokenFile: join(dataDir, "token.json"), enginePort: 0, appPort: 0, openBrowser: false, reviewVisuals: false, rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 } });
    const browser = await chromium.launch({ headless: true });
    try {
      const request = (path: string, body: unknown, method = "POST") => fetch(`${running.dashboardUrl}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const site = await (await request("/api/sites", { name: "Variablen" })).json() as { id: string };
      const page = await (await request(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })).json() as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const seeded = await request(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        mutations: [
          { op: "insertNode", parent: { nodeId: page.draft.rootNodeId }, node: { id: "frame00001", type: "frame", props: { width: "200px", height: "80px", background: { $token: "color.accent" }, margin: { $token: "spacing.luft" } } } },
          { op: "insertNode", parent: { nodeId: "frame00001" }, node: { id: "icon000001", type: "icon" } },
        ],
      });
      expect(seeded.status, await seeded.text()).toBe(200);
      const rule = await request(`/api/sites/${site.id}/style-rules`, { name: "accent-test", styles: { color: { $token: "color.accent" } } });
      expect(rule.status).toBe(201);
      const tab = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`);
      await tab.waitForFunction('document.querySelector(".canvas-view__stage")?.dataset.startFit != null', undefined, { timeout: 30000 });
      const node = tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').contentFrame().locator('[data-node-id="frame00001"]');
      const color = () => node.evaluate((element) => {
        const target = element as unknown as { ownerDocument: { defaultView: { getComputedStyle(node: unknown): { backgroundColor: string } } } };
        return target.ownerDocument.defaultView.getComputedStyle(element).backgroundColor;
      });
      await tab.getByRole("tab", { name: "Variablen" }).click();
      await tab.getByRole("textbox", { name: "Farbe success", exact: true }).fill("#789abc");
      const search = tab.getByRole("searchbox", { name: "Variablen suchen" });
      await search.fill("ACC");
      expect(await tab.locator('input[aria-label="Farbe success"]').isVisible()).toBe(false);
      expect(await tab.getByRole("textbox", { name: "Farbe accent", exact: true }).isVisible()).toBe(true);
      await search.fill("nicht-vorhanden");
      await tab.getByText("Keine Variablen gefunden.").waitFor();
      await search.fill("accent");
      await tab.getByLabel("Farbe accent auswählen").fill("#123456");
      await tab.getByRole("button", { name: "Farbe accent speichern" }).click();
      await expect.poll(color).toBe("rgb(18, 52, 86)");
      await tab.getByRole("button", { name: "Verwendung von Farbe accent anzeigen" }).click();
      await tab.getByText("Gespeicherte direkte Verweise: 1 Element auf 1 Seite", { exact: false }).waitFor();
      await tab.getByText("Seite /: 1 Element (frame00001)", { exact: true }).waitFor();
      await tab.getByText("Stilregel: accent-test", { exact: true }).waitFor();
      expect(await search.inputValue()).toBe("accent");
      await search.fill("");
      expect(await tab.getByRole("textbox", { name: "Farbe success", exact: true }).inputValue()).toBe("#789abc");
      await tab.getByRole("textbox", { name: "Name der neuen Farbe" }).fill("marke");
      await tab.getByRole("textbox", { name: "Wert der neuen Farbe" }).fill("#abcdef");
      await tab.getByRole("button", { name: "Farbe hinzufügen" }).click();
      await tab.getByRole("textbox", { name: "Farbe marke", exact: true }).waitFor();
      await tab.getByRole("textbox", { name: "Name des neuen Abstands" }).fill("luft");
      await tab.getByRole("textbox", { name: "Wert des neuen Abstands" }).fill("12px");
      await tab.getByRole("button", { name: "Abstand hinzufügen" }).click();
      await tab.getByRole("textbox", { name: "Abstand luft", exact: true }).waitFor();
      await tab.getByRole("button", { name: "Verwendung von Abstand luft anzeigen" }).click();
      await tab.getByText("Gespeicherte direkte Verweise: 1 Element auf 1 Seite", { exact: false }).last().waitFor();
      await search.fill("LUFT");
      expect(await tab.locator('input[aria-label="Farbe accent"]').isVisible()).toBe(false);
      expect(await tab.getByRole("textbox", { name: "Abstand luft", exact: true }).isVisible()).toBe(true);
      await search.fill("");
      const spacing = () => node.evaluate((element) => {
        const target = element as unknown as { ownerDocument: { defaultView: { getComputedStyle(node: unknown): { marginTop: string } } } };
        return target.ownerDocument.defaultView.getComputedStyle(element).marginTop;
      });
      await expect.poll(spacing).toBe("12px");
      await tab.getByRole("textbox", { name: "Abstand luft", exact: true }).fill("24px");
      await tab.getByRole("button", { name: "Abstand luft speichern" }).click();
      await expect.poll(spacing).toBe("24px");
      await node.click();
      await tab.locator('.senify-inspector__tab[data-tab="content"]').click();
      const paddingField = tab.locator('.senify-inspector__field[data-key="padding"]');
      await paddingField.locator('[data-control="tokens"]').click();
      await paddingField.locator('[data-ref="spacing.luft"]').click();
      await paddingField.getByText("Token: spacing.luft").waitFor();
      await paddingField.locator('[data-control="tokens"]').click();
      await paddingField.locator('[data-action="token-literal"]').click();
      expect(await paddingField.locator('[data-edge="top"] input').inputValue()).toBe("24");
      expect(await paddingField.locator('[data-control="spacing-unit"]').inputValue()).toBe("px");
      await paddingField.locator('[data-control="spacing-unit"]').selectOption("rem");
      expect(await paddingField.locator('[data-edge="top"] input').inputValue()).toBe("24");
      expect(await paddingField.locator('[data-control="spacing-unit"]').inputValue()).toBe("rem");
      await paddingField.locator('[data-control="spacing-unit"]').selectOption("px");
      await paddingField.locator('[data-control="tokens"]').click();
      await paddingField.locator('[data-ref="spacing.luft"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.reload();
      await tab.getByRole("tab", { name: "Variablen" }).click();
      await expect.poll(color, { timeout: 15000 }).toBe("rgb(18, 52, 86)");
      await expect.poll(spacing).toBe("24px");
      const padding = await node.evaluate((element) => {
        const target = element as unknown as { ownerDocument: { defaultView: { getComputedStyle(node: unknown): { paddingTop: string } } } };
        return target.ownerDocument.defaultView.getComputedStyle(element).paddingTop;
      });
      expect(padding).toBe("24px");
      expect(await tab.getByRole("textbox", { name: "Farbe marke", exact: true }).inputValue()).toBe("#abcdef");
      const icon = tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').contentFrame().locator('[data-node-id="icon000001"]');
      await icon.click();
      await tab.locator('.senify-inspector__tab[data-tab="content"]').click();
      const size = tab.locator('.senify-inspector__field[data-key="size"]');
      await size.getByRole("combobox", { name: "Einheit" }).selectOption("rem");
      const sizeInput = size.locator('[data-control="number"] input');
      await sizeInput.fill("2");
      await sizeInput.dispatchEvent("change");
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.reload();
      await expect.poll(() => icon.evaluate((element) => {
        const target = element as unknown as { ownerDocument: { defaultView: { getComputedStyle(node: unknown): { width: string } } } };
        return target.ownerDocument.defaultView.getComputedStyle(element).width;
      }), { timeout: 15000 }).toBe("32px");
      await tab.getByRole("tab", { name: "Variablen" }).click();
      const concurrent = await request(`/api/sites/${site.id}/theme`, { theme: { tokens: { primitive: { color: { accent: "#334455" } } } } }, "PUT");
      expect(concurrent.status).toBe(200);
      await tab.getByRole("textbox", { name: "Farbe accent", exact: true }).fill("#ffffff");
      await tab.getByRole("textbox", { name: "Name der neuen Farbe" }).fill("entwurf");
      await tab.getByRole("textbox", { name: "Wert der neuen Farbe" }).fill("#112233");
      await tab.getByRole("button", { name: "Farbe accent speichern" }).click();
      await tab.getByRole("status").getByText("Die Variablen wurden zwischenzeitlich geändert.", { exact: false }).waitFor();
      const persisted = await (await fetch(`${running.dashboardUrl}/api/sites/${site.id}/theme`)).json() as { theme: { tokens: { primitive: { color: { accent: string } } } } };
      expect(persisted.theme.tokens.primitive.color.accent).toBe("#334455");
      await tab.getByRole("button", { name: "Variablen neu laden" }).click();
      expect(await tab.getByRole("textbox", { name: "Farbe accent", exact: true }).inputValue()).toBe("#ffffff");
      expect(await tab.getByRole("textbox", { name: "Name der neuen Farbe" }).inputValue()).toBe("entwurf");
      expect(await tab.getByRole("textbox", { name: "Wert der neuen Farbe" }).inputValue()).toBe("#112233");
      await tab.getByRole("button", { name: "Farbe accent speichern" }).click();
      await expect.poll(color).toBe("rgb(255, 255, 255)");
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120_000);
});
