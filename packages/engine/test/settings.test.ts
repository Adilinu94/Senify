import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SmtpError, type MailMessage, type SmtpConfig } from "@senify/engine";
import { bootEngine, type BootEnv } from "./helpers.ts";

// Prüfstelle 1: settings, SMTP test mail, backups and defaults (T12) against
// the real engine. The mail transport is injected, so no test hits the network.

let env: BootEnv;
let failMode = false;
let sent: { config: SmtpConfig; message: MailMessage }[] = [];

type SettingsBody = {
  email: { host: string; port: number; tls: string; user: string; from: string; hasPassword: boolean };
  defaults: { defaultProfile: string; defaultLayout: string; autostart: boolean };
  backup: { targetDir: string };
};

beforeAll(async () => {
  env = await bootEngine({
    mailSender: async (config, message) => {
      if (failMode) throw new SmtpError("auth", "Authentifizierung fehlgeschlagen");
      sent.push({ config, message });
    },
  });
});

afterAll(async () => {
  await env.close();
});

describe("settings: SMTP", () => {
  it("stores email settings and never returns the password", async () => {
    const initial = await env.api.request<SettingsBody>({
      method: "GET",
      path: "/api/settings",
    });
    expect(initial.status).toBe(200);
    expect(initial.body.email.hasPassword).toBe(false);

    const saved = await env.api.request<SettingsBody>({
      method: "PUT",
      path: "/api/settings",
      body: {
        email: {
          host: "smtp.example",
          port: 2525,
          tls: "starttls",
          user: "mailer",
          password: "geheim-123",
          from: "formular@kunde.de",
        },
      },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.email.host).toBe("smtp.example");
    expect(saved.body.email.port).toBe(2525);
    expect(saved.body.email.hasPassword).toBe(true);
    expect(JSON.stringify(saved.body)).not.toContain("geheim-123");

    // At rest the password is ciphertext, never the plaintext.
    const record = await env.engine.store.getSmtpSettings();
    expect(record.passwordEncrypted?.startsWith("v1.")).toBe(true);
    expect(record.passwordEncrypted).not.toContain("geheim-123");

    // Omitting the password keeps it; null clears it.
    const kept = await env.api.request<SettingsBody>({
      method: "PUT",
      path: "/api/settings",
      body: { email: { host: "smtp.example" } },
    });
    expect(kept.body.email.hasPassword).toBe(true);
    const cleared = await env.api.request<SettingsBody>({
      method: "PUT",
      path: "/api/settings",
      body: { email: { password: null } },
    });
    expect(cleared.body.email.hasPassword).toBe(false);
  });

  it("reports unconfigured when no host is saved", async () => {
    await env.api.request({
      method: "PUT",
      path: "/api/settings",
      body: { email: { host: "", from: "" } },
    });
    const result = await env.api.request<{ ok: boolean; reason: string }>({
      method: "POST",
      path: "/api/settings/email/test",
      body: { to: "ops@kunde.de" },
    });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(false);
    expect(result.body.reason).toBe("unconfigured");
  });

  it("sends a test mail through the injected transport and names failures", async () => {
    await env.api.request({
      method: "PUT",
      path: "/api/settings",
      body: {
        email: { host: "smtp.example", from: "formular@kunde.de", tls: "none", user: "" },
      },
    });
    sent = [];
    const ok = await env.api.request<{ ok: boolean; to: string; message: string }>({
      method: "POST",
      path: "/api/settings/email/test",
      body: { to: "ops@kunde.de" },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.message.recipient).toBe("ops@kunde.de");
    expect(sent[0]?.config.host).toBe("smtp.example");
    expect(sent[0]?.config.from).toBe("formular@kunde.de");

    failMode = true;
    const bad = await env.api.request<{ ok: boolean; reason: string; message: string }>({
      method: "POST",
      path: "/api/settings/email/test",
      body: { to: "ops@kunde.de" },
    });
    expect(bad.status).toBe(200);
    expect(bad.body.ok).toBe(false);
    expect(bad.body.reason).toBe("auth");
    expect(bad.body.message).toContain("Authentifizierung");
    failMode = false;
  });
});

describe("backups", () => {
  it("creates a backup with manifest and file copies and lists it", async () => {
    const before = await env.api.request<{ status: { count: number } }>({
      method: "GET",
      path: "/api/backups",
    });

    const run = await env.api.request<{
      backup: { id: string; path: string; tables: Record<string, number>; fileCount: number; bytes: number };
      manifest: {
        version: string;
        createdAt: string;
        files: { count: number; bytes: number };
        checksums: Record<string, string>;
      };
    }>({ method: "POST", path: "/api/backups" });
    expect(run.status).toBe(201);
    expect(run.body.manifest.version).toBe("1");
    expect(run.body.manifest.createdAt).toBeTruthy();
    expect(typeof run.body.backup.tables.sites).toBe("number");
    expect(Object.keys(run.body.manifest.checksums).length).toBeGreaterThan(0);

    const dir = run.body.backup.path;
    expect(existsSync(join(dir, "manifest.json"))).toBe(true);
    expect(existsSync(join(dir, "tables", "sites.json"))).toBe(true);
    expect(existsSync(join(dir, "files"))).toBe(true);

    const list = await env.api.request<{
      status: { count: number; lastBackup: { id: string } | null };
      backups: { id: string }[];
    }>({ method: "GET", path: "/api/backups" });
    expect(list.body.backups.some((entry) => entry.id === run.body.backup.id)).toBe(true);
    expect(list.body.status.count).toBe(before.body.status.count + 1);
    expect(list.body.status.lastBackup?.id).toBe(run.body.backup.id);
  });
});

describe("defaults", () => {
  it("applies the default profile when a project is created without one", async () => {
    const saved = await env.api.request<SettingsBody>({
      method: "PUT",
      path: "/api/settings",
      body: { defaults: { defaultProfile: "showcase", defaultLayout: "Weit" } },
    });
    expect(saved.body.defaults.defaultProfile).toBe("showcase");
    expect(saved.body.defaults.defaultLayout).toBe("Weit");

    const created = await env.api.request<{ profile: string }>({
      method: "POST",
      path: "/api/sites",
      body: { name: "Standard-Profil" },
    });
    expect(created.status).toBe(201);
    expect(created.body.profile).toBe("showcase");

    const explicit = await env.api.request<{ profile: string }>({
      method: "POST",
      path: "/api/sites",
      body: { name: "Explizit", profile: "clean" },
    });
    expect(explicit.body.profile).toBe("clean");
  });
});
