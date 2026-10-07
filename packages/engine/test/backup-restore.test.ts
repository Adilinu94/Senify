import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  type BootEnv,
} from "./helpers.ts";

// Prüfstelle 1: playing a backup back (T12) against the real engine - tables,
// data directory, the safety copy taken right before the write and the refusal
// of incomplete folders.

type BackupView = {
  id: string;
  path: string;
  tables: Record<string, number>;
  fileCount: number;
};

type BackupListBody = {
  status: { count: number; targetDir: string };
  backups: BackupView[];
};

type RestoreBody = {
  id: string;
  restoredAt: string;
  tables: Record<string, number>;
  files: number;
  safetyBackup: BackupView;
};

type ErrorBody = {
  error: { category: string; message: string; field?: string };
};

let env: BootEnv;

beforeAll(async () => {
  env = await bootEngine();
});

afterAll(async () => {
  await env.close();
});

async function createBackup(): Promise<BackupView> {
  const run = await env.api.request<{ backup: BackupView }>({
    method: "POST",
    path: "/api/backups",
  });
  expect(run.status).toBe(201);
  return run.body.backup;
}

async function listBackups(): Promise<BackupListBody> {
  const list = await env.api.request<BackupListBody>({
    method: "GET",
    path: "/api/backups",
  });
  return list.body;
}

function restore(
  name: string,
  body?: unknown,
): Promise<{ status: number; body: Partial<RestoreBody> & ErrorBody }> {
  return env.api.request<Partial<RestoreBody> & ErrorBody>({
    method: "POST",
    path: `/api/backups/${name}/restore`,
    ...(body === undefined ? {} : { body }),
  });
}

async function siteNames(): Promise<string[]> {
  const list = await env.api.request<{ sites: { name: string }[] }>({
    method: "GET",
    path: "/api/sites",
  });
  return list.body.sites.map((site) => site.name);
}

async function pageTitles(siteId: string): Promise<string[]> {
  const pages = await env.api.request<{ pages: { title: string }[] }>({
    method: "GET",
    path: `/api/sites/${siteId}/pages`,
  });
  return pages.body.pages.map((page) => page.title);
}

// Row count of one table in a manifest or a restore answer (0 when absent).
function rows(tables: Record<string, number> | undefined, name: string): number {
  return tables?.[name] ?? 0;
}

// Content fingerprint of a folder: paths and SHA-256 of every file. Used to
// prove that a restore never writes into the backup it reads.
function fingerprint(dir: string): string[] {
  const entries: string[] = [];
  const walk = (from: string, prefix: string): void => {
    const children = readdirSync(from, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const child of children) {
      const path = join(from, child.name);
      const relative = prefix === "" ? child.name : `${prefix}/${child.name}`;
      if (child.isDirectory()) walk(path, relative);
      else {
        entries.push(
          `${relative}:${createHash("sha256").update(readFileSync(path)).digest("hex")}`,
        );
      }
    }
  };
  walk(dir, "");
  return entries;
}

describe("restore a backup", () => {
  it("writes tables and files back and leaves the backup untouched", async () => {
    const site = await createTestSite(env.api, "Vor der Sicherung");
    await createTestPage(env.api, site.id, { title: "Startseite" });
    writeFileSync(join(env.engine.dataDir, "vorher.txt"), "vor der Sicherung");

    const backup = await createBackup();
    const before = fingerprint(backup.path);

    // State the restore has to roll back.
    const late = await createTestSite(env.api, "Nach der Sicherung");
    await createTestPage(env.api, late.id, { title: "Spaeter" });
    writeFileSync(join(env.engine.dataDir, "nachher.txt"), "nach der Sicherung");

    // Without an explicit confirmation nothing happens.
    const refused = await restore(backup.id, {});
    expect(refused.status).toBe(400);
    expect(refused.body.error.field).toBe("confirm");
    expect(refused.body.error.message).toContain("confirm: true");
    expect(await siteNames()).toContain("Nach der Sicherung");

    const count = (await listBackups()).status.count;
    const restored = await restore(backup.id, { confirm: true });
    expect(restored.status).toBe(200);
    expect(restored.body.id).toBe(backup.id);
    expect(restored.body.restoredAt).toBeTruthy();
    expect(restored.body.tables?.sites).toBe(backup.tables.sites);
    expect(restored.body.tables?.pages).toBe(backup.tables.pages);
    expect(restored.body.files).toBe(backup.fileCount);

    // The safety copy holds the state the restore replaced.
    const safety = restored.body.safetyBackup;
    expect(safety?.id).not.toBe(backup.id);
    expect(rows(safety?.tables, "sites")).toBe(rows(backup.tables, "sites") + 1);
    expect(rows(safety?.tables, "pages")).toBe(rows(backup.tables, "pages") + 1);

    // The engine is back on the snapshot, and the token still works: it came
    // back with the dump.
    expect(await siteNames()).toEqual(["Vor der Sicherung"]);
    expect(await pageTitles(site.id)).toEqual(["Startseite"]);
    const gone = await env.api.request<{ sites: { id: string }[] }>({
      method: "GET",
      path: "/api/sites",
    });
    expect(gone.body.sites.some((entry) => entry.id === late.id)).toBe(false);

    // JSONB rows survive the round trip: the draft tree and the theme of the
    // snapshot are readable objects again, not quoted text.
    const pages = await env.api.request<{ pages: { id: string }[] }>({
      method: "GET",
      path: `/api/sites/${site.id}/pages`,
    });
    const page = await env.api.request<{
      meta: Record<string, unknown>;
      draft: { rootNodeId: string; nodes: Record<string, unknown> };
    }>({ method: "GET", path: `/api/pages/${pages.body.pages[0]?.id ?? ""}` });
    expect(typeof page.body.meta).toBe("object");
    expect(typeof page.body.draft.rootNodeId).toBe("string");
    expect(Object.keys(page.body.draft.nodes).length).toBeGreaterThan(0);
    const theme = await env.api.request<{
      name: string;
      theme: { name: string; tokens: Record<string, unknown> };
    }>({ method: "GET", path: `/api/sites/${site.id}/theme` });
    expect(theme.status).toBe(200);
    expect(typeof theme.body.theme).toBe("object");
    expect(Object.keys(theme.body.theme.tokens).length).toBeGreaterThan(0);

    // The data directory holds the files of the snapshot again.
    expect(existsSync(join(env.engine.dataDir, "vorher.txt"))).toBe(true);
    expect(readFileSync(join(env.engine.dataDir, "vorher.txt"), "utf8")).toBe(
      "vor der Sicherung",
    );
    expect(existsSync(join(env.engine.dataDir, "nachher.txt"))).toBe(false);

    // The source backup was only read, and the safety copy shows up in the list.
    expect(fingerprint(backup.path)).toEqual(before);
    const after = await listBackups();
    expect(after.backups.some((entry) => entry.id === safety?.id)).toBe(true);
    expect(after.status.count).toBe(count + 1);
  });

  it("restores redesign proposals with their cards, decision and card images", async () => {
    // ADR-0012: the decision is a durable fact, so it must survive a restore
    // together with the images the human decided on.
    const site = await createTestSite(env.api, "Richtungs-Backup");
    const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
    const png = Buffer.alloc(24);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(0x0d0a1a0a, 4);
    png.writeUInt32BE(1920, 16);
    png.writeUInt32BE(1080, 20);
    const reference = await env.api.request<{ reference: { id: string } }>({
      method: "POST",
      path: "/api/references/manual",
      body: {
        name: "Backup-Vorbild",
        image: `data:image/png;base64,${png.toString("base64")}`,
        documents: {
          design: "# Backup\n\n## Colors\n| Token | Value |\n|---|---|\n| brand | #2f6f4e |\n",
          guidelines: null,
          components: null,
        },
      },
    });
    expect(reference.status).toBe(201);
    const created = await env.api.request<{
      proposal: { id: string; cards: { id: string }[] };
    }>({
      method: "POST",
      path: `/api/pages/${page.id}/redesign-proposals`,
      body: {
        referenceIds: [reference.body.reference.id],
        idempotencyKey: "backup-proposal-1",
      },
    });
    expect(created.status).toBe(201);
    const proposalId = created.body.proposal.id;
    const directionId = created.body.proposal.cards[0]?.id ?? "";
    const confirmed = await env.humanApi.request<{ proposal: { status: string } }>({
      method: "POST",
      path: `/api/redesign-proposals/${proposalId}/confirm`,
      body: { directionId, idempotencyKey: "backup-confirm-1" },
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.proposal.status).toBe("applied");

    const backup = await createBackup();
    expect(rows(backup.tables, "redesign_proposals")).toBeGreaterThan(0);

    // The proposal is replaced by a later run and its image folder removed.
    await env.db.query("DELETE FROM redesign_proposals WHERE id = $1", [proposalId]);
    rmSync(join(env.engine.dataDir, "redesign-proposals", proposalId), {
      recursive: true,
      force: true,
    });

    const restored = await restore(backup.id, { confirm: true });
    expect(restored.status).toBe(200);

    const after = await env.api.request<{
      proposal: {
        status: string;
        cards: {
          id: string;
          screenshot: { fileName: string };
          sectionPlan: { planHash: string; entries: unknown[]; media: unknown[] };
        }[];
        decision: { directionId: string } | null;
        applyResult: {
          siteId: string | null;
          scope?: string;
          sectionPlanApplied?: boolean;
          planHash?: string | null;
        } | null;
      };
    }>({ method: "GET", path: `/api/redesign-proposals/${proposalId}` });
    expect(after.status).toBe(200);
    expect(after.body.proposal.status).toBe("applied");
    expect(after.body.proposal.decision?.directionId).toBe(directionId);
    expect(after.body.proposal.applyResult?.siteId).toBeTruthy();
    // ADR-0013 + P2-1: the section plan and the honest apply scope survive the
    // round trip as readable objects, and the plan hash still identifies the
    // plan. The scope is not pinned to one value: what matters across a backup
    // is that the flag survives and that it and the scope agree, because both
    // are read from the same decision (see RedesignProposalApplyResult).
    expect(typeof after.body.proposal.cards[0]?.id).toBe("string");
    expect(after.body.proposal.cards[0]?.sectionPlan.planHash).toBeTruthy();
    expect(Array.isArray(after.body.proposal.cards[0]?.sectionPlan.entries)).toBe(true);
    expect(Array.isArray(after.body.proposal.cards[0]?.sectionPlan.media)).toBe(true);
    const applied = after.body.proposal.applyResult?.sectionPlanApplied;
    expect(typeof applied).toBe("boolean");
    expect(after.body.proposal.applyResult?.scope).toBe(
      applied === true ? "section-plan" : "scaffold-theme",
    );
    expect(after.body.proposal.applyResult?.planHash).toBe(
      after.body.proposal.cards[0]?.sectionPlan.planHash,
    );

    const fileName = after.body.proposal.cards[0]?.screenshot.fileName ?? "";
    const image = join(env.engine.dataDir, "redesign-proposals", proposalId, fileName);
    expect(existsSync(image)).toBe(true);
    const shot = await env.api.request<ErrorBody>({
      method: "GET",
      path: `/api/redesign-proposals/${proposalId}/cards/${directionId}/screenshot`,
    });
    expect(shot.status).toBe(200);
  }, 60000);

  it("refuses an incomplete backup and changes nothing", async () => {
    const backup = await createBackup();
    const targetDir = (await listBackups()).status.targetDir;

    const missingTable = join(targetDir, `${backup.id}-ohne-tabelle`);
    cpSync(backup.path, missingTable, { recursive: true });
    rmSync(join(missingTable, "tables", "pages.json"));

    const edited = join(targetDir, `${backup.id}-geaendert`);
    cpSync(backup.path, edited, { recursive: true });
    const sitesFile = join(edited, "tables", "sites.json");
    writeFileSync(sitesFile, `${readFileSync(sitesFile, "utf8")} \n`);

    const before = await siteNames();
    const count = (await listBackups()).status.count;

    const missing = await restore(`${backup.id}-ohne-tabelle`, { confirm: true });
    expect(missing.status).toBe(400);
    expect(missing.body.error.category).toBe("validation");
    expect(missing.body.error.message).toContain("unvollständig");
    expect(missing.body.error.message).toContain("pages");

    const changed = await restore(`${backup.id}-geaendert`, { confirm: true });
    expect(changed.status).toBe(400);
    expect(changed.body.error.message).toContain("Prüfsumme");

    // No safety copy was written, no row and no file was touched.
    expect(await siteNames()).toEqual(before);
    expect((await listBackups()).status.count).toBe(count);
  });

  it("knows no backup outside its folder", async () => {
    const unknown = await restore("gibt-es-nicht", { confirm: true });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.category).toBe("not_found");

    const escape = await restore("%2E%2E%2F%2E%2E%2Fetc", { confirm: true });
    expect(escape.status).toBe(400);
    expect(escape.body.error.message).toContain("Ungültiger Name");
  });
});

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Bedingung wurde nicht erreicht");
}

// The maintenance window of a running engine (T12): the restore drains running
// requests and locks out new ones while it swaps tables and the data
// directory, so no reader sees a half-written state. Health stays reachable
// and marks the window.
describe("maintenance window during restore", () => {
  it("answers other requests with 503 while an exclusive task runs", async () => {
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const running = env.engine.maintenance.runExclusive(async () => {
      await held;
    });
    await waitFor(() => env.engine.maintenance.active);

    const blocked = await env.api.request<ErrorBody>({
      method: "GET",
      path: "/api/sites",
    });
    expect(blocked.status).toBe(503);
    expect(blocked.body.error.category).toBe("conflict");
    expect(blocked.body.error.message).toContain("Wartung");
    expect(blocked.headers["retry-after"]).toBe("5");

    const health = await env.api.request<{ ok: boolean; maintenance: boolean }>({
      method: "GET",
      path: "/api/health",
    });
    expect(health.status).toBe(200);
    expect(health.body.maintenance).toBe(true);

    finish();
    await running;

    const after = await env.api.request<{ sites: unknown[] }>({
      method: "GET",
      path: "/api/sites",
    });
    expect(after.status).toBe(200);
    const healthAfter = await env.api.request<{ maintenance: boolean }>({
      method: "GET",
      path: "/api/health",
    });
    expect(healthAfter.body.maintenance).toBe(false);
  });

  it("waits for running requests and queues exclusive tasks", async () => {
    const gate = env.engine.maintenance;
    const order: string[] = [];
    const release = gate.enter();
    const exclusive = gate.runExclusive(async () => {
      order.push("exclusive");
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual([]);
    release();
    await exclusive;
    expect(order).toEqual(["exclusive"]);

    const first = gate.runExclusive(async () => {
      order.push("first");
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
    const second = gate.runExclusive(async () => {
      order.push("second");
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["exclusive", "first", "second"]);
  });

  it("opens the gate again after a failed restore", async () => {
    const refused = await restore("gibt-es-nicht", { confirm: true });
    expect(refused.status).toBe(404);

    const after = await env.api.request<{ sites: unknown[] }>({
      method: "GET",
      path: "/api/sites",
    });
    expect(after.status).toBe(200);
    expect(env.engine.maintenance.active).toBe(false);
  });

  it("queues the actual restore behind a running exclusive task", async () => {
    const backup = await createBackup();
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const running = env.engine.maintenance.runExclusive(async () => {
      await held;
    });
    await waitFor(() => env.engine.maintenance.active);

    const pending = restore(backup.id, { confirm: true });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    // The route waits for its turn instead of writing during the window.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(settled).toBe(false);

    finish();
    await running;
    const result = await pending;
    expect(result.status).toBe(200);
    expect(result.body.id).toBe(backup.id);
  });
});

// Every file below a folder, as relative paths with "/" separators.
function filesBelow(root: string): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else found.push(relative(root, path).replaceAll("\\", "/"));
    }
  };
  visit(root);
  return found;
}

describe("a backup carries no key material", () => {
  it("leaves the encryption key and the program token out and still keeps the rest", async () => {
    const saved = await env.api.request({
      method: "PUT",
      path: "/api/settings",
      body: { email: { host: "smtp.example", user: "mailer", password: "geheim-123", from: "a@b.de" } },
    });
    expect(saved.status).toBe(200);
    const secret = await env.engine.store.getOrCreateEngineSecret();
    writeFileSync(join(env.dataDir, "program-token.json"), '{"token":"sfy_operator_geheim"}');
    writeFileSync(join(env.dataDir, "notizen.txt"), "bleibt im Backup");

    const backup = await createBackup();
    const files = filesBelow(backup.path);
    expect(files).not.toContain("tables/engine_secrets.json");
    expect(files).not.toContain("files/engine-secret.key");
    expect(files).not.toContain("files/program-token.json");
    expect(files).toContain("files/notizen.txt");
    expect(files).toContain("tables/sites.json");
    expect(backup.tables).not.toHaveProperty("engine_secrets");

    // Nowhere in the backup: not the key, not the operator token.
    for (const file of files) {
      const text = readFileSync(join(backup.path, file), "utf8");
      expect(text, file).not.toContain(secret);
      expect(text, file).not.toContain("sfy_operator_geheim");
    }
    // The password is in the backup only as ciphertext.
    const settings = readFileSync(join(backup.path, "tables/smtp_settings.json"), "utf8");
    expect(settings).toContain("v1.");
    expect(settings).not.toContain("geheim-123");
  }, 60000);
});
