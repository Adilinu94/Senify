import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestDb } from "@senify/core/testing";
import type { Db, DbResult, Row } from "@senify/engine";
import { startProgram } from "@senify/app";

// pg-mem double, same shape as the engine and MCP test helpers use.
function memoryDb(): { db: Db; close(): Promise<void> } {
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

describe("program shell (Prüfstelle Programm)", () => {
  it("starts engine + dashboard, serves the theme and proxies the API", async () => {
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-app-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    try {
      const dashboard = await fetch(running.dashboardUrl);
      expect(dashboard.status).toBe(200);
      const html = await dashboard.text();
      expect(html).toContain("Senify");
      expect(html).toContain("/app.js");

      const theme = await fetch(`${running.dashboardUrl}/theme.css`);
      expect(theme.status).toBe(200);
      expect(await theme.text()).toContain("--color-accent");

      const script = await fetch(`${running.dashboardUrl}/app.js`);
      expect(script.status).toBe(200);
      expect(script.headers.get("content-type")).toContain("javascript");

      // The dashboard acts as the local operator: writes go through the
      // proxy with the injected program token.
      const created = await fetch(`${running.dashboardUrl}/api/sites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Programm-Test" }),
      });
      expect(created.status).toBe(201);
      const site = (await created.json()) as { id: string; name: string };
      expect(site.name).toBe("Programm-Test");

      const sites = (await (
        await fetch(`${running.dashboardUrl}/api/sites`)
      ).json()) as { sites: { id: string }[] };
      expect(sites.sites.map((entry) => entry.id)).toContain(site.id);

      const missing = await fetch(`${running.dashboardUrl}/nicht-da.js`);
      expect(missing.status).toBe(404);
      const error = (await missing.json()) as { error: { message: string } };
      expect(error.error.message).toContain("nicht-da.js");
    } finally {
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30000);

  it("runs the project life cycle through the dashboard proxy", async () => {
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-app-life-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    const author = { kind: "human", id: "programm", label: "Programm" };
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      const created = await post("/api/sites", { name: "Lebenszyklus" });
      expect(created.status).toBe(201);
      const site = (await created.json()) as { id: string };

      const renamed = await fetch(`${running.dashboardUrl}/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Umbenannt", author }),
      });
      expect(renamed.status).toBe(200);
      expect(((await renamed.json()) as { name: string }).name).toBe("Umbenannt");

      const copied = await post(`/api/sites/${site.id}/duplicate`, {
        withContent: false,
        author,
      });
      expect(copied.status).toBe(201);
      expect(((await copied.json()) as { id: string }).id).not.toBe(site.id);

      expect((await post(`/api/sites/${site.id}/trash`, { author })).status).toBe(200);
      const active = (await (
        await fetch(`${running.dashboardUrl}/api/sites`)
      ).json()) as { sites: { id: string }[] };
      expect(active.sites.some((entry) => entry.id === site.id)).toBe(false);

      const trash = (await (
        await fetch(`${running.dashboardUrl}/api/sites?trash=1`)
      ).json()) as { sites: { id: string }[] };
      expect(trash.sites.some((entry) => entry.id === site.id)).toBe(true);

      expect(
        (await post(`/api/sites/${site.id}/restore`, { author })).status,
      ).toBe(200);
      const relisted = (await (
        await fetch(`${running.dashboardUrl}/api/sites`)
      ).json()) as { sites: { id: string }[] };
      expect(relisted.sites.some((entry) => entry.id === site.id)).toBe(true);
    } finally {
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30000);

  it("refuses to start without a database", async () => {
    await expect(
      startProgram({ openBrowser: false, databaseUrl: undefined, db: undefined }),
    ).rejects.toThrow(/Keine Datenbank konfiguriert/);
  });
});