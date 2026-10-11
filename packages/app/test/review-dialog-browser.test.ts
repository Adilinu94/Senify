import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Der Kommentar-Dialog der Review gehört zur Aktion: „Abbrechen“ bricht die
// Aktion ab, erst die Bestätigung führt sie aus. Früher lieferte das native
// `prompt()` bei Abbruch `null`, und die Aktion lief trotzdem - ein Klick auf
// „Verwerfen“ und danach „Abbrechen“ hat die Review verworfen.

const AUTHOR = { kind: "human", id: "operator", label: "Operator" };

describe.skipIf(!browserAvailable)("Review-Aktionen mit Kommentar-Dialog", () => {
  it("Abbrechen lässt die Review stehen, Bestätigen führt die Aktion mit Kommentar aus", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-review-dialog-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    const base = running.dashboardUrl;
    const post = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
      const response = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      expect(response.status, `${path}: ${text}`).toBeLessThan(300);
      return JSON.parse(text) as Record<string, unknown>;
    };
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    const nativeDialogs: string[] = [];
    try {
      const site = (await post("/api/sites", { name: "Review-Dialog" })) as { id: string };
      const page = (await post(`/api/sites/${site.id}/pages`, {
        title: "Start",
        path: "/",
      })) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const inserted = (await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        author: AUTHOR,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: { id: "hero-1", type: "hero", props: { headline: "Vorher" } },
          },
        ],
      })) as { newDraftVersion: number };
      await post(`/api/sites/${site.id}/releases`, { author: AUTHOR, note: "Basis" });
      await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: inserted.newDraftVersion,
        author: AUTHOR,
        mutations: [{ op: "updateNodeProps", id: "hero-1", patch: { headline: "Nachher" } }],
      });
      const review = (await post(`/api/sites/${site.id}/reviews`, {
        author: AUTHOR,
        note: "Bitte prüfen",
      })) as { review: { id: string } };
      const reviewId = review.review.id;
      const statusOf = async (): Promise<string> => {
        const response = await fetch(`${base}/api/reviews/${reviewId}`);
        const body = (await response.json()) as { status?: string };
        return body.status ?? `HTTP ${response.status}`;
      };
      expect(await statusOf()).toBe("submitted");

      const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(15000);
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      tab.on("dialog", (dialog) => {
        nativeDialogs.push(`${dialog.type()}: ${dialog.message()}`);
        void dialog.dismiss();
      });
      await tab.goto(`${base}/#/projects/${site.id}/review`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".panel button:has-text('Verwerfen')");

      const dialog = tab.locator("dialog.ask-dialog[open]");
      const discard = tab.locator(".panel").getByRole("button", { name: "Verwerfen" });

      // Abbrechen: kein Request, der Status bleibt.
      await discard.click();
      await dialog.waitFor();
      expect(await tab.getByRole("dialog", { name: "Review verwerfen" }).count()).toBe(1);
      await dialog.getByRole("button", { name: "Abbrechen" }).click();
      await dialog.waitFor({ state: "detached" });
      // Der Abbruch hätte die Aktion sofort abgeschickt; eine kurze Frist
      // genügt, damit ein (fälschlich gesendeter) Request angekommen ist.
      await tab.waitForTimeout(800);
      expect(await statusOf()).toBe("submitted");

      // Bestätigen: die Aktion läuft, der Kommentar kommt an.
      await discard.click();
      await dialog.waitFor();
      await dialog.locator("textarea").fill("Passt nicht");
      await dialog.getByRole("button", { name: "Verwerfen" }).click();
      await dialog.waitFor({ state: "detached" });
      // Mit Abstand fragen: die API begrenzt auf 60 Anfragen pro Minute.
      await expect.poll(statusOf, { interval: 500, timeout: 10000 }).toBe("discarded");
      const resolved = (await (await fetch(`${base}/api/reviews/${reviewId}`)).json()) as {
        thread: { note: string }[];
      };
      expect(resolved.thread.map((entry) => entry.note)).toContain("Passt nicht");

      expect(nativeDialogs).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
