import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReentrantTestDb, createTestDb } from "@senify/core/testing";
import type { Db, DbResult, Row } from "@senify/engine";
import { startProgram } from "@senify/app";

// pg-mem double, same shape as the engine and MCP test helpers use. The
// reentrant variant tolerates the second schema boot of a restart.
function memoryDb(options: { reentrant?: boolean } = {}): {
  db: Db;
  close(): Promise<void>;
} {
  const memory =
    options.reentrant === true ? createReentrantTestDb() : createTestDb();
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

  it("rejects cross-origin API requests before injecting the operator token", async () => {
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-app-origin-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    try {
      const response = await fetch(`${running.dashboardUrl}/api/sites`, {
        headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
      });
      expect(response.status).toBe(403);
      expect(await response.text()).toContain("lokalen Dashboard");
    } finally {
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30000);

  it("heals a pre-ticket-18 program token in place to kind human", async () => {
    const database = memoryDb({ reentrant: true });
    const dataDir = mkdtempSync(join(tmpdir(), "senify-app-heal-"));
    const tokenFile = join(dataDir, "program-token.json");
    const first = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: tokenFile,
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    let saved: { id: string; secret: string };
    try {
      saved = JSON.parse(readFileSync(tokenFile, "utf8")) as {
        id: string;
        secret: string;
      };
      // Simulate an installation from before ticket 18: the same token, but
      // with the fail-closed default kind "agent".
      await database.db.query(
        "UPDATE api_tokens SET kind = 'agent' WHERE id = $1",
        [saved.id],
      );
    } finally {
      await first.close();
    }

    const second = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: tokenFile,
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    try {
      const who = await fetch(`${second.engineOrigin}/api/whoami`, {
        headers: { authorization: `Bearer ${saved.secret}` },
      });
      expect(who.status).toBe(200);
      expect(((await who.json()) as { kind: string }).kind).toBe("human");

      // The same token was healed, not replaced: exactly one "Programm" entry.
      const listed = await fetch(`${second.engineOrigin}/api/tokens`, {
        headers: { authorization: `Bearer ${saved.secret}` },
      });
      const body = (await listed.json()) as {
        tokens: { id: string; name: string }[];
      };
      const programs = body.tokens.filter((token) => token.name === "Programm");
      expect(programs).toHaveLength(1);
      expect(programs[0]?.id).toBe(saved.id);
    } finally {
      await second.close();
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

      // The dashboard ships the markup that renders the image (the detail
      // window); the analysis data itself stays out of it.
      const script = await (await fetch(`${running.dashboardUrl}/app.js`)).text();
      expect(script).toContain("snapshots/");
      expect(script).toContain("refs-inspector");
      expect(script).not.toContain("snapshot-slider");
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

  // Die Oberflächen-Stufe (T14) braucht keinen neuen Proxy: sie fährt die
  // Sammlungs-, Bibliotheks- und Brief-Routen der Engine über dieselbe
  // Dashboard-Weiterleitung. Der Test prüft Nutzlast und Antwortformen.
  it("runs the reference library through the dashboard proxy", async () => {
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-app-library-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    const author = { kind: "human", id: "programm", label: "Programm" };
    const jsonHeaders = { "content-type": "application/json" };
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
    const patch = (path: string, body: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
    try {
      // Sammlung anlegen, lesen und bearbeiten.
      const created = await post("/api/reference-collections", {
        name: "Editorial",
        description: "Ruhige Flaechen, viel Weissraum.",
        deployFor: "B2B-SaaS",
        vocabulary: ["grain", "quiet space"],
        risk: "Eine Richtung zum Erkunden",
        accent: "#6346d7",
      });
      expect(created.status).toBe(201);
      const collection = (await created.json()) as {
        collection: { id: string; name: string; accent: string; referenceCount: number };
      };
      expect(collection.collection.name).toBe("Editorial");
      expect(collection.collection.accent).toBe("#6346d7");

      const listed = (await (
        await fetch(`${running.dashboardUrl}/api/reference-collections`)
      ).json()) as { collections: { id: string }[]; styleCatalog: { total: number } };
      expect(listed.collections.some((entry) => entry.id === collection.collection.id)).toBe(true);
      expect(listed.styleCatalog.total).toBe(18);

      const renamed = await patch(`/api/reference-collections/${collection.collection.id}`, {
        name: "Editorial Journal",
        vocabulary: ["grain", "quiet space", "editorial"],
      });
      expect(renamed.status).toBe(200);
      const renamedBody = (await renamed.json()) as {
        collection: { name: string; vocabulary: string[] };
      };
      expect(renamedBody.collection.name).toBe("Editorial Journal");
      expect(renamedBody.collection.vocabulary).toContain("editorial");

      // Manuelle Referenz per Upload (PNG-Bytes als Base64): sofort bereit.
      const png = Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
        "hex",
      );
      const manual = await post("/api/references/manual", {
        name: "ATELO - Interior Gallery",
        collectionId: collection.collection.id,
        note: "Bildstreifen, dann grosse Headline",
        vocabulary: ["staggered gallery", "oversized headline"],
        imageRecipe: "cream ground, bronze accent",
        image: png.toString("base64"),
        author,
      });
      expect(manual.status).toBe(201);
      const reference = (await manual.json()) as {
        reference: {
          id: string;
          origin: string;
          status: string;
          collection: { id: string } | null;
          snapshots: { previewPath?: string }[];
        };
      };
      expect(reference.reference.origin).toBe("manual");
      expect(reference.reference.status).toBe("ready");
      expect(reference.reference.collection?.id).toBe(collection.collection.id);
      expect(reference.reference.snapshots[0]?.previewPath).toContain(
        `/api/references/${reference.reference.id}/snapshots/`,
      );

      // Die Liste traegt Karten, Sammlungen mit Zaehlern und die Fusszeile.
      const list = (await (
        await fetch(
          `${running.dashboardUrl}/api/references?collection=${collection.collection.id}&sort=name&q=atelo`,
        )
      ).json()) as {
        references: { id: string }[];
        counts: { references: number; inView: number; collections: number };
        footer: { text: string; query: string | null };
      };
      expect(list.references.some((entry) => entry.id === reference.reference.id)).toBe(true);
      expect(list.counts.inView).toBe(1);
      expect(list.footer.query).toBe("atelo");
      expect(list.footer.text).toContain("matching");

      // Die Bibliotheksfelder lassen sich ueber PATCH pflegen.
      const patchedReference = await patch(`/api/references/${reference.reference.id}`, {
        note: "Neue Notiz",
        vocabulary: ["staggered gallery"],
        heroUsage: "Fuenf Bilder ueber die Breite",
      });
      expect(patchedReference.status).toBe(200);

      // Briefe kommen aus der Engine: Einzelbrief, Sammelbrief, Sammlungsbrief.
      const brief = (await (
        await fetch(`${running.dashboardUrl}/api/references/${reference.reference.id}/brief`)
      ).json()) as {
        brief: { text: string; status: string };
        imagePrompt: string | null;
      };
      expect(brief.brief.text).toContain("Reference: ATELO - Interior Gallery");
      expect(brief.brief.text).toContain("What to borrow: Neue Notiz");
      // Die Bildadresse im Brief zeigt auf das Dashboard, nicht auf den
      // Engine-Port: nur dieser Ursprung schiebt den Operator-Token nach, ein
      // reiner Engine-Link liefe im Browser in ein 401.
      expect(brief.brief.text).toContain(
        `Screenshot: ${running.dashboardUrl}/api/references/${reference.reference.id}/snapshots/`,
      );
      expect(brief.imagePrompt).toContain("cream ground, bronze accent");
      expect(brief.imagePrompt).toContain(
        `Use ${running.dashboardUrl}/api/references/${reference.reference.id}/snapshots/`,
      );

      const combined = await post("/api/references/brief", {
        referenceIds: [reference.reference.id],
      });
      expect(combined.status).toBe(200);
      expect(((await combined.json()) as { brief: { text: string } }).brief.text).toContain(
        "Primary action",
      );

      const collectionBrief = (await (
        await fetch(
          `${running.dashboardUrl}/api/reference-collections/${collection.collection.id}/brief`,
        )
      ).json()) as { brief: { text: string }; vocabulary: string | null };
      expect(collectionBrief.brief.text).toContain("Aesthetic: Editorial Journal");
      expect(collectionBrief.vocabulary).toContain("grain");

      // Vorlieben und Haus-DNA liegen in den Einstellungen (T12/T14).
      const saved = await fetch(`${running.dashboardUrl}/api/settings`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify({
          referenceDna: { constants: ["Klar vor laut"], never: ["Keine Stockfotos"] },
          referencePreferences: { includeDna: true, overrides: "Pastell in diesem Projekt." },
        }),
      });
      expect(saved.status).toBe(200);
      const savedBody = (await saved.json()) as {
        referenceDna: { constants: string[]; never: string[] };
        referencePreferences: { includeDna: boolean; overrides: string };
      };
      expect(savedBody.referenceDna.constants).toContain("Klar vor laut");
      expect(savedBody.referenceDna.never).toContain("Keine Stockfotos");
      expect(savedBody.referencePreferences.includeDna).toBe(true);

      // Loeschen einer Sammlung verliert keine Referenz: sie meldet die Zahl.
      const deleted = (await (
        await fetch(
          `${running.dashboardUrl}/api/reference-collections/${collection.collection.id}`,
          { method: "DELETE" },
        )
      ).json()) as { deleted: string; affectedReferences: number };
      expect(deleted.affectedReferences).toBe(1);
      const afterDelete = (await (
        await fetch(`${running.dashboardUrl}/api/references/${reference.reference.id}`)
      ).json()) as { collectionId: string | null };
      expect(afterDelete.collectionId).toBeNull();
    } finally {
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30000);

  // Sichtbarkeit der Bausteine im Markup (Leiste, Vergleichsleiste, Dialoge)
  // und der Zustand in der Adresse.
  it("ships the reference library markup and the address state", async () => {
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-app-markup-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    try {
      const script = await (await fetch(`${running.dashboardUrl}/app.js`)).text();
      for (const marker of [
        "refs-shell",
        "refs-sidebar",
        "refs-gallery",
        "refs-compare-tray",
        "refs-select",
        "refs-add-dialog",
        "refs-collection-dialog",
        "refs-compare-dialog",
        "refs-style-card",
        "Referenz öffnen",
        "Brief zusammen kopieren",
        "Filter zurücksetzen",
        "Über diese Sammlung",
        "Wähle bis zu 3 Referenzen zum Vergleichen",
        "Stil-Guide",
      ]) {
        expect(script).toContain(marker);
      }
      // Zustand in der Adresse: `?q=&collection=&sort=`.
      expect(script).toContain("refsSyncAddress");
      expect(script).toContain('search.get("q")');
      expect(script).toContain('params.set("collection"');
      expect(script).toContain("history.replaceState");

      const css = await (await fetch(`${running.dashboardUrl}/app.css`)).text();
      expect(css).toContain(".view.refs-view");
      expect(css).toContain(".refs-compare-tray");
      expect(css).toContain(".refs-gallery");
    } finally {
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30000);
});