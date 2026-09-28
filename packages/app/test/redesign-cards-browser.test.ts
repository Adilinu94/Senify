import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

const author = { kind: "human", id: "programm", label: "Programm" };
const referencePng = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex",
);

function designDocument(brand: string, font: string): string {
  return [
    "# Richtung",
    "",
    "## Colors",
    "| Token | Value |",
    "|---|---|",
    `| brand | ${brand} |`,
    "",
    "## Typography",
    `Font family: **${font}, Inter**`,
    "",
    "| Style | Size | Weight |",
    "|---|---|---|",
    "| Body | 15px | 400 |",
    "",
    "## Images",
    "| Asset | Kind | Where |",
    "|---|---|---|",
    "| https://example.test/hero.jpg | image | hero |",
    "| https://example.test/logo.svg | logo | navbar |",
  ].join("\n");
}

// Rules live in the guidelines document, not in design.md.
const guidelinesDocument = [
  "# Grundsaetze",
  "",
  "## Do",
  "- Grosse Schopfmarke als Signatur",
  "",
  "## Don't",
  "- Keine Versalien im Fliesstext",
].join("\n");

describe.skipIf(!browserAvailable)("redesign direction cards in a real browser", () => {
  it("offers the cards, lets a human choose one and opens the new draft", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-redesign-cards-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];

    try {
      const source = (await (await post("/api/sites", { name: "Richtungsquelle" })).json()) as {
        id: string;
      };
      const sourcePage = (await (
        await post(`/api/sites/${source.id}/pages`, { title: "Start", path: "/" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      await post(`/api/pages/${sourcePage.id}/mutations`, {
        baseDraftVersion: sourcePage.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: sourcePage.draft.rootNodeId },
            node: { type: "hero", props: { headline: "Quelle" } },
          },
        ],
      });

      const referenceIds: string[] = [];
      for (const [name, brand, font] of [
        ["Dunkle Richtung", "#101418", "Sora"],
        ["Helle Richtung", "#fbf7f0", "Fraunces"],
      ] as const) {
        const created = await post("/api/references/manual", {
          name,
          image: referencePng.toString("base64"),
          documents: {
            design: designDocument(brand, font),
            guidelines: guidelinesDocument,
            components: null,
          },
          author,
        });
        expect(created.status).toBe(201);
        const body = (await created.json()) as { reference: { id: string } };
        referenceIds.push(body.reference.id);
      }

      // The agent proposes; the program proxy acts as the human operator here.
      const proposed = await post(`/api/pages/${sourcePage.id}/redesign-proposals`, {
        referenceIds,
        idempotencyKey: "redesign-cards-browser-1",
      });
      expect(proposed.status).toBe(201);
      const proposal = (await proposed.json()) as {
        proposal: { id: string; cards: { id: string; reference: { name: string } }[] };
      };
      expect(proposal.proposal.cards).toHaveLength(2);

      const context = await browser.newContext({ viewport: { width: 2600, height: 1100 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      tab.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      tab.on("response", (response) => {
        if (response.status() < 400 || response.url().endsWith("/favicon.ico")) return;
        errors.push(`http ${response.status()}: ${response.url()}`);
      });

      await tab.goto(`${running.dashboardUrl}/#/projects/${source.id}/pages/${sourcePage.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector(".senify-canvas", { timeout: 30000 });

      // The hint is not modal and appears only while a direction is open.
      const inbox = tab.locator('[data-action="redesign-inbox-open"]');
      await expect.poll(async () => inbox.isVisible()).toBe(true);
      expect(await inbox.getAttribute("data-count")).toBe("1");
      expect(await tab.locator('dialog[data-role="redesign-dialog"]').count()).toBe(0);

      await inbox.click();
      const dialog = tab.locator('dialog[data-role="redesign-dialog"]');
      await dialog.waitFor();
      const cards = dialog.locator('[data-direction-card]');
      expect(await cards.count()).toBe(2);
      // Both offered directions are visible with their own stored image.
      await expect.poll(async () => dialog.locator(".redesign-direction-shot").count()).toBe(2);
      expect(await dialog.locator(".redesign-specimen-swatch").count()).toBeGreaterThan(0);
      expect(await dialog.locator(".redesign-direction-rules-line").count()).toBeGreaterThan(0);
      // ADR-0013: the build scope and the media needs are shown before the
      // decision, and the confirm's scope is stated honestly.
      expect(await dialog.locator('[data-role="redesign-build-scope"]').count()).toBe(2);
      expect(await dialog.locator('[data-role="redesign-scope-counts"]').count()).toBe(2);
      expect(await dialog.locator('[data-role="redesign-apply-scope"]').count()).toBe(1);
      // The reference fixture ships media, so at least one need is listed and
      // reference media are never presented as reusable.
      const needs = dialog.locator('[data-role="redesign-media-need"]');
      expect(await needs.count()).toBeGreaterThan(0);
      // The dialog marks the treatment on every need; reading it back through
      // the locator avoids depending on DOM types in the test environment.
      const reuseCount = await dialog
        .locator('[data-role="redesign-media-need"][data-treatment="reuse"]')
        .count();
      expect(reuseCount).toBe(0);

      // Nothing is preselected and nothing is applied before a choice.
      const confirm = dialog.locator('[data-action="redesign-confirm"]');
      expect(await confirm.isDisabled()).toBe(true);
      expect(await dialog.locator('input[type="radio"]:checked').count()).toBe(0);

      const chosen = proposal.proposal.cards[1];
      await dialog.locator(`[data-direction-card="${chosen?.id ?? ""}"] input[type="radio"]`).check();
      await expect.poll(async () => confirm.isEnabled()).toBe(true);
      const sourceHash = await tab.evaluate("location.hash");
      await confirm.click();

      // The fixture deliberately creates media needs. Confirm opens the
      // resolution panel first; explicitly leave each slot open, then the
      // workflow may navigate to the new draft.
      const needsDialog = tab.locator('[data-role="media-needs-dialog"]');
      await needsDialog.waitFor({ timeout: 60000 });
      const manualChoices = needsDialog.locator('[data-action="media-need-manual"]');
      const mediaNeedCount = await manualChoices.count();
      expect(mediaNeedCount).toBeGreaterThan(0);
      for (let index = 0; index < mediaNeedCount; index += 1) {
        await manualChoices.nth(index).click();
      }
      await needsDialog.locator('[data-action="media-needs-done"]').click();

      // The confirm runs through the human-only route and lands in the draft.
      await expect
        .poll(() => tab.evaluate("location.hash"), { timeout: 60000 })
        .not.toBe(sourceHash);
      const hash = (await tab.evaluate("location.hash")) as string;
      const segments = hash.split("/");
      const targetSiteId = segments[2] ?? "";
      const targetPageId = segments[4] ?? "";
      expect(targetSiteId).not.toBe(source.id);
      expect(targetPageId).toBeTruthy();
      await tab.waitForSelector(".senify-canvas", { timeout: 60000 });

      // The chosen direction's theme really landed in the new draft.
      const theme = (await (
        await fetch(`${running.dashboardUrl}/api/sites/${targetSiteId}/theme`)
      ).json()) as { theme: { scales: { brand: string } } };
      expect(String(theme.theme.scales.brand).toUpperCase()).toBe("#FBF7F0");

      // ADR-0013: the result names what was written. The sections are not
      // written by the confirm, and the proposal says so.
      const confirmed = (await (
        await fetch(`${running.dashboardUrl}/api/redesign-proposals/${proposal.proposal.id}`)
      ).json()) as {
        proposal: {
          status: string;
          decision: { directionId: string } | null;
          applyResult: { scope: string; sectionPlanApplied: boolean; planHash: string } | null;
          cards: { id: string; sectionPlan: { planHash: string } }[];
        };
      };
      expect(confirmed.proposal.status).toBe("applied");
      expect(confirmed.proposal.applyResult?.scope).toBe("scaffold-theme");
      expect(confirmed.proposal.applyResult?.sectionPlanApplied).toBe(false);
      // The result names the plan of the direction the human actually chose.
      const chosenCard = confirmed.proposal.cards.find(
        (card) => card.id === confirmed.proposal.decision?.directionId,
      );
      expect(confirmed.proposal.applyResult?.planHash).toBe(chosenCard?.sectionPlan.planHash);

      // Exactly one draft was created and the source is untouched.
      const sites = (await (await fetch(`${running.dashboardUrl}/api/sites`)).json()) as {
        sites: { id: string }[];
      };
      expect(sites.sites.filter((entry) => entry.id === targetSiteId)).toHaveLength(1);
      const sourceAfter = (await (
        await fetch(`${running.dashboardUrl}/api/pages/${sourcePage.id}`)
      ).json()) as { draftVersion: number };
      expect(sourceAfter.draftVersion).toBe(sourcePage.draftVersion + 1);

      // The inbox is empty again after the decision.
      await tab.goto(`${running.dashboardUrl}/#/projects/${source.id}/pages/${sourcePage.id}`, {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForSelector(".senify-canvas", { timeout: 30000 });
      await expect.poll(async () => inbox.isVisible()).toBe(false);

      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180000);
});
