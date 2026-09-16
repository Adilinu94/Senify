import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// The submissions view (T11): a real form goes through the bake and the public
// endpoint, then the program shows the incoming row, the CSV export and the
// notification job whose retry tick turns the job into "Gesendet". Skipped
// when playwright is not installed.

const author = { kind: "human", id: "programm", label: "Programm" };
// The stamped token was issued at bake time; submissions pass the minimum
// fill time only after this pause.
const MIN_FILL_WAIT_MS = 2_500;

function contactCollectionBody(): Record<string, unknown> {
  return {
    name: "Kontaktanfragen",
    slug: "kontaktanfragen",
    supports: ["search"],
    fields: [
      { key: "name", label: "Name", description: "Name.", type: "text", required: true },
      { key: "email", label: "E-Mail", description: "Adresse.", type: "email", required: true },
      { key: "nachricht", label: "Nachricht", description: "Text.", type: "longText", required: true },
      {
        key: "status",
        label: "Status",
        description: "Bearbeitungsstand.",
        type: "select",
        options: [
          { value: "neu", label: "Neu" },
          { value: "beantwortet", label: "Beantwortet" },
        ],
      },
      {
        key: "submitted_at",
        label: "Eingegangen am",
        description: "Zeitpunkt des Absendens.",
        type: "dateTime",
      },
      {
        key: "source_path",
        label: "Quellseite",
        description: "Pfad der Quellseite.",
        type: "text",
      },
    ],
  };
}

describe.skipIf(!browserAvailable)("submissions view in the program (T11)", () => {
  it("lists the incoming row, the CSV and sends due notification jobs", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-submissions-browser-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
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
      const site = (await (await post("/api/sites", { name: "Formular-Projekt" })).json()) as {
        id: string;
      };
      const privacy = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Datenschutz", path: "/datenschutz" })
      ).json()) as { id: string };
      const thanks = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Danke", path: "/danke" })
      ).json()) as { id: string };
      const home = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const collection = (await (
        await post(`/api/sites/${site.id}/collections/from-fields`, contactCollectionBody())
      ).json()) as { id: string };

      const placed = await post(`/api/pages/${home.id}/mutations`, {
        baseDraftVersion: home.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: home.draft.rootNodeId },
            node: {
              type: "contact",
              props: {
                title: "Kontakt",
                fields: [
                  { kind: "text", key: "name", label: "Name", required: true },
                  { kind: "email", key: "email", label: "E-Mail", required: true },
                  { kind: "textarea", key: "nachricht", label: "Nachricht", required: true },
                ],
                targetCollectionId: collection.id,
                consentText: "Mit dem Absenden stimmen Sie der Datenschutzerklärung zu.",
                consentPage: { pageId: privacy.id },
                successMessage: "Danke für deine Nachricht!",
                successPage: { pageId: thanks.id },
                notifyEmail: "team@musterstudio.de",
              },
            },
          },
        ],
      });
      expect(placed.status).toBe(200);

      // Publishing freezes the form snapshot and stamps the signed token.
      const release = await post(`/api/sites/${site.id}/releases`, { author });
      expect(release.status).toBe(201);
      const buildRef = ((await release.json()) as { release: { buildRef: string } }).release
        .buildRef;
      const html = readFileSync(join(buildRef, "index.html"), "utf8");
      const action =
        html.match(/action="([^"]*\/api\/forms\/[^"]*\/submit)"/)?.[1] ?? "";
      const token =
        html.match(/name="form_token"\s+value="([^"]+)"/)?.[1] ??
        html.match(/value="([^"]+)"\s+name="form_token"/)?.[1] ??
        "";
      const formId = action.split("/")[3] ?? "";
      expect(formId).not.toBe("");

      await new Promise((resolve) => setTimeout(resolve, MIN_FILL_WAIT_MS));
      const submitted = await fetch(`${running.dashboardUrl}/api/forms/${formId}/submit`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          origin: running.dashboardUrl,
        },
        body: JSON.stringify({
          token,
          values: {
            name: "Max Mustermann",
            email: "max@muster.de",
            nachricht: "Bitte um Rückruf",
          },
          consent: true,
        }),
      });
      expect(submitted.status).toBe(200);

      const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(15000);
      tab.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/submissions`, {
        waitUntil: "domcontentloaded",
      });

      // The submission row with the snapshot columns.
      await tab.waitForSelector('td:has-text("Max Mustermann")', { timeout: 30000 });
      const headers = await tab.locator("th").allTextContents();
      expect(headers).toEqual(
        expect.arrayContaining(["Name", "E-Mail", "Nachricht", "Eingegangen am", "Status"]),
      );
      expect(await tab.locator('td:has-text("Bitte um Rückruf")').count()).toBe(1);
      expect(
        (await tab.locator('a:has-text("CSV herunterladen")').getAttribute("href")) ?? "",
      ).toContain(`/api/forms/${formId}/submissions.csv`);

      // The notification job is visible with recipient and retry state.
      await tab.waitForSelector('td:has-text("team@musterstudio.de")');
      expect(await tab.locator('td:has-text("Wartet")').count()).toBeGreaterThan(0);

      // The tick sends the due job; the view re-renders with the new status.
      await tab.locator('button:has-text("Fällige Jobs jetzt senden")').click();
      await tab.waitForSelector('td:has-text("Gesendet")', { timeout: 20000 });
      expect(await tab.locator('td:has-text("Wartet")').count()).toBe(0);

      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 240000);
});
