import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import { SettingsRepository } from "../src/store-settings.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: the four single-row settings (SMTP, engine, image, references) live in
// `SettingsRepository`; `Store` only delegates.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  return { db: database.db, repo: new SettingsRepository(database.db) };
}

const rows = async (db: Awaited<ReturnType<typeof fixture>>["db"], table: string) =>
  (await db.query(`SELECT 1 FROM ${table}`)).rows.length;

describe("SettingsRepository: SMTP", () => {
  it("creates the default row once and keeps unpatched fields", async () => {
    const { db, repo } = await fixture();
    const defaults = await repo.getSmtpSettings();
    expect(defaults).toEqual({
      host: "",
      port: 587,
      tls: "starttls",
      user: "",
      from: "",
      passwordEncrypted: null,
    });
    await repo.getSmtpSettings();
    expect(await rows(db, "smtp_settings")).toBe(1);

    const updated = await repo.updateSmtpSettings({ host: "mail.example.org", port: 465 });
    expect(updated).toMatchObject({ host: "mail.example.org", port: 465, tls: "starttls" });
    expect(await repo.getSmtpSettings()).toEqual(updated);
  });

  it("keeps the encrypted password when omitted and clears it with null", async () => {
    const { repo } = await fixture();
    await repo.updateSmtpSettings({ passwordEncrypted: "v1:cipher" });
    await repo.updateSmtpSettings({ user: "mailer" });
    expect((await repo.getSmtpSettings()).passwordEncrypted).toBe("v1:cipher");
    await repo.updateSmtpSettings({ passwordEncrypted: null });
    expect((await repo.getSmtpSettings()).passwordEncrypted).toBeNull();
  });
});

describe("SettingsRepository: engine", () => {
  it("returns the defaults, merges a partial patch and clears the backup dir with null", async () => {
    const { repo } = await fixture();
    expect(await repo.getEngineSettings()).toEqual({
      defaultProfile: "standard",
      defaultLayout: "Standard",
      autostart: false,
      backupDir: null,
    });
    const patched = await repo.updateEngineSettings({ autostart: true, backupDir: "/srv/backup" });
    expect(patched).toEqual({
      defaultProfile: "standard",
      defaultLayout: "Standard",
      autostart: true,
      backupDir: "/srv/backup",
    });
    expect((await repo.updateEngineSettings({ backupDir: null })).backupDir).toBeNull();
    expect((await repo.getEngineSettings()).autostart).toBe(true);
  });
});

describe("SettingsRepository: image", () => {
  it("returns the defaults, merges a partial patch and persists it", async () => {
    const { db, repo } = await fixture();
    const defaults = await repo.getImageSettings();
    expect(defaults).toMatchObject({ provider: "image-use", fallbackProvider: "comfyui", defaultSteps: 40 });
    expect(await rows(db, "image_settings")).toBe(1);

    const next = await repo.updateImageSettings({ provider: "comfyui", defaultSteps: 20 });
    expect(next).toMatchObject({ provider: "comfyui", fallbackProvider: "comfyui", defaultSteps: 20 });
    expect(await repo.getImageSettings()).toEqual(next);
  });

  it("rejects an unknown provider or fallback and stores nothing", async () => {
    const { repo } = await fixture();
    const before = await repo.getImageSettings();

    const provider = await repo
      .updateImageSettings({ provider: "nope" as never })
      .catch((caught: unknown) => caught);
    expect(provider).toBeInstanceOf(SenifyError);
    expect(provider).toMatchObject({ category: "validation" });
    expect((provider as Error).message).toContain('Unknown image provider "nope"');

    const fallback = await repo
      .updateImageSettings({ fallbackProvider: "nope" as never })
      .catch((caught: unknown) => caught);
    expect(fallback).toMatchObject({ category: "validation" });
    expect((fallback as Error).message).toContain('Unknown image fallback provider "nope"');

    expect(await repo.getImageSettings()).toEqual(before);
  });
});

describe("SettingsRepository: references", () => {
  it("returns the empty house DNA and merges dna and preferences separately", async () => {
    const { db, repo } = await fixture();
    const defaults = await repo.getReferenceSettings();
    expect(defaults.dna).toEqual({ name: "", description: "", constants: [], never: [] });
    expect(defaults.preferences).toEqual({ includeDna: false, overrides: "" });
    expect(await rows(db, "reference_settings")).toBe(1);

    const withPrefs = await repo.updateReferenceSettings({ preferences: { includeDna: true } });
    expect(withPrefs.preferences).toEqual({ includeDna: true, overrides: "" });
    expect(withPrefs.dna).toEqual(defaults.dna);

    const dna = { name: "Haus", description: "ruhig", constants: ["serif"], never: ["neon"] };
    const withDna = await repo.updateReferenceSettings({ dna });
    expect(withDna.dna).toEqual(dna);
    expect(withDna.preferences.includeDna).toBe(true);
    expect((await repo.getReferenceSettings()).dna).toEqual(dna);
  });
});

describe("SettingsRepository behind the Store facade", () => {
  it("is what Store delegates to: the same rows come back through the facade", async () => {
    const { db, repo } = await fixture();
    const store = new Store(db);
    await repo.updateSmtpSettings({ host: "mail.example.org" });
    await repo.updateEngineSettings({ autostart: true });
    await repo.updateImageSettings({ defaultSteps: 12 });
    await repo.updateReferenceSettings({ preferences: { overrides: "ruhig" } });

    expect(await store.getSmtpSettings()).toEqual(await repo.getSmtpSettings());
    expect(await store.getEngineSettings()).toEqual(await repo.getEngineSettings());
    expect(await store.getImageSettings()).toEqual(await repo.getImageSettings());
    expect(await store.getReferenceSettings()).toEqual(await repo.getReferenceSettings());

    const viaStore = await store.updateEngineSettings({ defaultLayout: "Wide" });
    expect(viaStore.defaultLayout).toBe("Wide");
    expect((await repo.getEngineSettings()).defaultLayout).toBe("Wide");
  });
});
