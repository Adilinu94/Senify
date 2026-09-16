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

      // The editor bundle is built on demand from the TypeScript sources.
      const editor = await fetch(`${running.dashboardUrl}/editor.js`);
      expect(editor.status).toBe(200);
      const bundle = await editor.text();
      expect(bundle).toContain("mountEditor");
      expect(bundle).toContain("createRegistry");

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

  it("runs the reference flow through the dashboard proxy", async () => {
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-app-refs-"));
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
      const snapshot = await post("/api/references", {
        url: "https://reference.example/",
        author,
        wait: true,
        snapshot: {
          html: "<html><head><style>:root{--brand:#ff0044} h1{font-size:48px;color:#112233}</style></head><body><h1>Hallo</h1></body></html>",
        },
      });
      expect(snapshot.status).toBe(201);
      const analyzed = (await snapshot.json()) as {
        reference: { id: string; status: string; method: string; profile: { reduced: boolean } | null };
      };
      expect(analyzed.reference.method).toBe("snapshot");
      expect(analyzed.reference.status).toBe("ready");
      expect(analyzed.reference.profile?.reduced).toBe(true);

      const list = (await (
        await fetch(`${running.dashboardUrl}/api/references`)
      ).json()) as { references: { id: string }[] };
      expect(list.references.some((entry) => entry.id === analyzed.reference.id)).toBe(true);

      const detail = (await (
        await fetch(`${running.dashboardUrl}/api/references/${analyzed.reference.id}`)
      ).json()) as { profile: { reduced: boolean } };
      expect(detail.profile.reduced).toBe(true);

      const site = (await (
        await post("/api/sites", { name: "Referenz-Projekt" })
      ).json()) as { id: string };
      const assigned = await post(`/api/sites/${site.id}/references`, {
        author,
        referenceId: analyzed.reference.id,
        scales: ["color", "type"],
      });
      expect(assigned.status).toBe(201);
      const assignment = (await (
        await fetch(`${running.dashboardUrl}/api/sites/${site.id}/references`)
      ).json()) as {
        assignments: { referenceId: string; scales: string[] }[];
        unchanged: { unchanged: boolean };
      };
      expect(
        assignment.assignments.some(
          (entry) => entry.referenceId === analyzed.reference.id,
        ),
      ).toBe(true);
      expect(typeof assignment.unchanged.unchanged).toBe("boolean");

      const removed = await fetch(
        `${running.dashboardUrl}/api/sites/${site.id}/references/${analyzed.reference.id}`,
        { method: "DELETE" },
      );
      expect(removed.status).toBe(200);
    } finally {
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30000);

  it("shows reference snapshots through the dashboard proxy", async () => {
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-app-shots-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    const author = { kind: "human", id: "programm", label: "Programm" };
    try {
      const png = Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
        "hex",
      );
      const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
      const created = await fetch(`${running.dashboardUrl}/api/references`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://reference.example/",
          author,
          wait: true,
          snapshot: {
            html: "<html><body><h1>Hallo</h1></body></html>",
            screenshots: [
              { breakpoint: "1440", kind: "fullpage", width: 1440, height: 900, storageRef: "ref", hash: "h1", dataUrl },
              { breakpoint: "390", kind: "fullpage", width: 390, height: 800, storageRef: "ref2", hash: "h2", dataUrl },
            ],
          },
        }),
      });
      expect(created.status).toBe(201);
      const body = (await created.json()) as {
        reference: { id: string; snapshots: { breakpoint: string; previewPath?: string }[] };
      };
      const preview = body.reference.snapshots[0]?.previewPath;
      expect(preview).toContain(`/api/references/${body.reference.id}/snapshots/`);

      // The image is delivered through the same-origin proxy with the PNG type.
      const image = await fetch(`${running.dashboardUrl}${preview}`);
      expect(image.status).toBe(200);
      expect(image.headers.get("content-type")).toBe("image/png");
      expect(Buffer.from(await image.arrayBuffer())).toEqual(png);

      const detail = (await (
        await fetch(`${running.dashboardUrl}/api/references/${body.reference.id}`)
      ).json()) as { snapshots: { previewPath?: string }[] };
      expect(detail.snapshots.map((shot) => shot.previewPath)).toContain(preview);

      // The dashboard ships the slider markup that renders the images.
      const script = await (await fetch(`${running.dashboardUrl}/app.js`)).text();
      expect(script).toContain("snapshots/");
      expect(script).toContain("snapshot-slider");
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

  it("exposes settings, test mail and backups through the dashboard proxy", async () => {
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-app-settings-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    const json = (path: string): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`);
    const put = (path: string, body: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      const settings = (await (await json("/api/settings")).json()) as {
        email: { hasPassword: boolean };
        defaults: { defaultProfile: string; autostart: boolean };
        backup: { targetDir: string };
      };
      expect(settings.email.hasPassword).toBe(false);
      expect(settings.defaults.defaultProfile).toBe("standard");
      expect(settings.defaults.autostart).toBe(false);
      expect(typeof settings.backup.targetDir).toBe("string");

      // Test mail before SMTP is configured: a structured failure, no network.
      const test = await fetch(`${running.dashboardUrl}/api/settings/email/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: "ops@kunde.de" }),
      });
      expect(test.status).toBe(200);
      const testBody = (await test.json()) as { ok: boolean; reason: string };
      expect(testBody.ok).toBe(false);
      expect(testBody.reason).toBe("unconfigured");

      // Saving email settings stores the password but never echoes it.
      const saved = (await (
        await put("/api/settings", {
          email: { host: "smtp.example", from: "formular@kunde.de", password: "secret-pw" },
        })
      ).json()) as { email: { host: string; hasPassword: boolean } };
      expect(saved.email.host).toBe("smtp.example");
      expect(saved.email.hasPassword).toBe(true);
      expect(JSON.stringify(saved)).not.toContain("secret-pw");

      const defaults = (await (
        await put("/api/settings", {
          defaults: { defaultProfile: "showcase", defaultLayout: "Weit", autostart: true },
        })
      ).json()) as {
        defaults: { defaultProfile: string; defaultLayout: string; autostart: boolean };
      };
      expect(defaults.defaults).toEqual({
        defaultProfile: "showcase",
        defaultLayout: "Weit",
        autostart: true,
      });

      const created = await fetch(`${running.dashboardUrl}/api/backups`, {
        method: "POST",
      });
      expect(created.status).toBe(201);
      const createdBody = (await created.json()) as {
        backup: { id: string; fileCount: number };
        manifest: { version: string };
      };
      expect(createdBody.manifest.version).toBe("1");

      const list = (await (await json("/api/backups")).json()) as {
        status: { count: number; lastBackup: { id: string } | null };
        backups: { id: string }[];
      };
      expect(list.backups.some((entry) => entry.id === createdBody.backup.id)).toBe(true);
      expect(list.status.count).toBeGreaterThanOrEqual(1);
      expect(list.status.lastBackup?.id).toBe(createdBody.backup.id);
    } finally {
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30000);
});