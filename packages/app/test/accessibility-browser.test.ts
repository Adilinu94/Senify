import { AxeBuilder } from "@axe-core/playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserSkip, memoryDb } from "./support.ts";

const author = { kind: "human", id: "programm", label: "Programm" };

async function postJson(url: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type AxeViolation = {
  id: string;
  impact?: string | null;
  help: string;
  nodes: Array<{ target: unknown[] }>;
};

function violationSummary(violations: AxeViolation[]): string[] {
  return violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help} — ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.map(String).join(" "))
        .join(", ")}`,
  );
}

describe.skipIf(browserSkip)("desktop accessibility and keyboard gates", () => {
  it("kept Settings, Referenzen und Editor axe-frei und tastaturbedienbar", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-a11y-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    try {
      const site = (await (await postJson(running.dashboardUrl, "/api/sites", { name: "A11y QA" })).json()) as {
        id: string;
      };
      const page = (await (
        await postJson(running.dashboardUrl, `/api/sites/${site.id}/pages`, { title: "A11y QA", path: "/" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      await postJson(running.dashboardUrl, `/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: { type: "hero", props: { headline: "A11y QA" } },
          },
        ],
      });
      await postJson(running.dashboardUrl, "/api/reference-collections", {
        name: "A11y Collection",
        description: "Accessible reference fixture.",
        accent: "#b98a52",
      });

      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(`class StableEventSource {
        addEventListener() {}
        removeEventListener() {}
        close() {}
      }
      Object.defineProperty(window, "EventSource", { configurable: true, writable: true, value: StableEventSource });`);
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      tab.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });

      const routes = [
        { name: "settings", hash: "#/settings", ready: ".panel" },
        { name: "references", hash: "#/references", ready: ".refs-shell" },
        { name: "editor", hash: `#/projects/${site.id}/pages/${page.id}`, ready: ".senify-canvas" },
      ] as const;
      for (const route of routes) {
        await tab.goto(`${running.dashboardUrl}/${route.hash}`, { waitUntil: "domcontentloaded" });
        await tab.waitForSelector(route.ready);
        if (route.name === "references") {
          await tab.waitForFunction('!document.querySelector(".refs-shell")?.classList.contains("refs-loading")');
        }
        await tab.evaluate(`(async () => {
          await document.fonts.ready;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        })()`);
        const results = await new AxeBuilder({ page: tab })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(violationSummary(results.violations), `${route.name}: Axe-Verstöße`).toEqual([]);
      }

      // Settings: Der Theme-Schalter ist per Tastatur erreichbar und schaltet
      // seine Wirkung sichtbar um, ohne Mausaktion.
      await tab.goto(`${running.dashboardUrl}/#/settings`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector("#theme-toggle");
      await tab.locator("#theme-toggle").focus();
      await tab.keyboard.press("Space");
      expect(await tab.evaluate("document.documentElement.dataset.mode")).toBe("dark");
      await tab.keyboard.press("Enter");
      expect(await tab.evaluate("document.documentElement.dataset.mode")).toBe("light");

      // Referenzen: Suchfeld und Karten sind in der Tab-Folge bedienbar.
      await tab.goto(`${running.dashboardUrl}/#/references`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".refs-search input");
      await tab.locator(".refs-search input").focus();
      await tab.keyboard.type("A11y");
      await expect.poll(async () => tab.locator(".refs-search input").inputValue()).toBe("A11y");
      await tab.keyboard.press("Tab");
      expect(await tab.evaluate("document.activeElement?.tagName")).toBe("SELECT");

      // Editor: Overflow öffnet mit ArrowDown, fokussiert den ersten
      // Menüpunkt und gibt den Fokus mit Escape an den Auslöser zurück.
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector('[data-action="canvas-overflow"]');
      const overflow = tab.locator('[data-action="canvas-overflow"]');
      await overflow.focus();
      await tab.keyboard.press("ArrowDown");
      await expect.poll(async () => tab.locator(".toolbar-overflow__menu").isVisible()).toBe(true);
      await expect.poll(async () => tab.evaluate("document.activeElement?.dataset.action")).toBe("framer-import-open");
      await tab.keyboard.press("Escape");
      await expect.poll(async () => tab.evaluate("document.activeElement?.dataset.action")).toBe("canvas-overflow");

      // Redesign-Dialog (ADR-0012): die menschliche Richtungswahl ist ein echtes
      // Radio-Set, hat eine benannte Beschriftung und gibt den Fokus an den
      // Auslöser zurück. Ohne Vorschlag bleibt der Hinweis versteckt.
      const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");
      const reference = await postJson(running.dashboardUrl, "/api/references/manual", {
        name: "A11y Richtung",
        image: png.toString("base64"),
        documents: {
          design: "# Richtung\n\n## Colors\n| Token | Value |\n|---|---|\n| brand | #2f6f4e |\n",
          guidelines: null,
          components: null,
        },
        author,
      });
      const referenceBody = (await reference.json()) as { reference: { id: string } };
      const proposalResponse = await postJson(
        running.dashboardUrl,
        `/api/pages/${page.id}/redesign-proposals`,
        { referenceIds: [referenceBody.reference.id], idempotencyKey: "a11y-proposal-1" },
      );
      expect(proposalResponse.status, await proposalResponse.clone().text()).toBe(201);

      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector(".senify-canvas");
      const inbox = tab.locator('[data-action="redesign-inbox-open"]');
      // The hint polls; give it one full cycle before judging.
      await expect.poll(async () => inbox.isVisible(), { timeout: 20000 }).toBe(true);
      await inbox.click();
      const dialog = tab.locator('dialog[data-role="redesign-dialog"]');
      await dialog.waitFor();
      // Genau eine auswählbare Richtung, nichts vorbelegt.
      expect(await dialog.locator('input[type="radio"]').count()).toBe(1);
      expect(await dialog.locator('input[type="radio"]:checked').count()).toBe(0);
      expect(await dialog.getAttribute("aria-labelledby")).toBe("redesign-direction-title");
      expect(await tab.locator("#redesign-direction-title").count()).toBe(1);
      // ADR-0013: build scope and media needs are readable text, not bare
      // status colour, and the confirm scope is stated in words.
      expect(await dialog.locator('[data-role="redesign-build-scope"]').count()).toBe(1);
      expect(await dialog.locator('[data-role="redesign-apply-scope"]').count()).toBe(1);
      expect(
        await dialog.locator('[data-role="redesign-scope-counts"]').innerText(),
      ).toContain("manuell");

      const dialogResults = await new AxeBuilder({ page: tab })
        .include('dialog[data-role="redesign-dialog"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(violationSummary(dialogResults.violations), "redesign-dialog: Axe-Verstöße").toEqual([]);

      // Tastatur: die Richtung ist ohne Maus wählbar, Escape schliesst und
      // gibt den Fokus an den Auslöser zurück.
      await dialog.locator('input[type="radio"]').first().focus();
      await tab.keyboard.press("Space");
      await expect
        .poll(async () => dialog.locator('[data-action="redesign-confirm"]').isEnabled())
        .toBe(true);
      await tab.keyboard.press("Escape");
      await expect.poll(async () => tab.locator('dialog[data-role="redesign-dialog"]').count()).toBe(0);
      await expect.poll(async () => tab.evaluate("document.activeElement?.dataset.action")).toBe(
        "redesign-inbox-open",
      );

      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 240000);
});
