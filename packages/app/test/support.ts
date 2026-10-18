import { existsSync } from "node:fs";
import { expect } from "vitest";
import { createTestDb } from "@senify/core/testing";
import type { Db, DbResult, Row } from "@senify/engine";

// pg-mem double, same shape as the engine and MCP test helpers use.
export function memoryDb(): { db: Db; close(): Promise<void> } {
  const memory = createTestDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  const db: Db = {
    query: async <R extends Row>(
      text: string,
      params?: readonly unknown[],
    ): Promise<DbResult<R>> => {
      const result = await pool.query(text, params as unknown[] | undefined);
      return { rows: result.rows as R[] };
    },
    async withTransaction(task) {
      return task(db);
    },
  };
  return { db, close: () => pool.end() };
}

// Playwright is an optional dev dependency: browser tests skip cleanly when
// the package or its chromium build is missing (same contract as the
// reference capture test).
export const playwright = await import("playwright").catch(() => undefined);

export const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

// The parity gate runs as a blocking step (`pnpm verify:parity`, ticket 17
// point 5): with SENIFY_REQUIRE_BROWSER=1 a missing browser fails the gate
// instead of skipping it silently.
export const browserRequired = process.env["SENIFY_REQUIRE_BROWSER"] === "1";
export const browserSkip = !browserAvailable && !browserRequired;

// Die Kategorien des Inspektors sind Akkordeons und bauen ihren Inhalt nur, solange
// sie offen sind. Diese Hilfe oeffnet eine Kategorie (z. B. "style/spacing"), falls
// sie zu ist; ein Feld darin ist erst danach im DOM.
type CategoryPage = {
  locator(selector: string): {
    waitFor(options?: { timeout?: number }): Promise<unknown>;
    getAttribute(name: string): Promise<string | null>;
    click(): Promise<unknown>;
  };
};
// Der Live-Modus hat keinen Schalter in der Werkzeugleiste mehr (E7 Teil 3); die
// Spotlight-Befehle "Live-Modus" und "Design-Modus" sind der Weg dorthin. Diese
// Hilfe fuehrt einen solchen Befehl aus: Strg+K, suchen, die erste Zeile bestaetigen.
type SpotlightPage = {
  keyboard: { press(key: string): Promise<unknown> };
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  fill(selector: string, value: string): Promise<unknown>;
  locator(selector: string): { first(): { textContent(): Promise<string | null> } };
};
export async function runSpotlightCommand(page: SpotlightPage, label: string): Promise<void> {
  await page.keyboard.press("Control+k");
  await page.waitForSelector('.senify-spotlight[data-open="true"]', { timeout: 30000 });
  await page.fill(".senify-spotlight__input", label);
  await expect
    .poll(async () => page.locator(".senify-spotlight__row").first().textContent())
    .toContain(label);
  await page.keyboard.press("Enter");
}

export async function openInspectorCategory(page: CategoryPage, groupId: string): Promise<void> {
  const head = page.locator(
    `.senify-inspector__group[data-group="${groupId}"] .senify-inspector__group-title`,
  );
  await head.waitFor({ timeout: 30000 });
  if ((await head.getAttribute("aria-expanded")) === "false") await head.click();
}
