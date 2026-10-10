// Settings operations of the Store (ADR 0019): the four single-row settings tables (SMTP, engine, image, references). `Store` delegates here.
import { SenifyError } from "@senify/core";
import type { Db } from "./db.ts";
import {
  defaultEngineSettings,
  defaultImageSettings,
  defaultSmtpSettings,
  ENGINE_SETTINGS_COLUMNS,
  IMAGE_SETTINGS_COLUMNS,
  mapEngineSettings,
  mapImageSettings,
  mapSmtpSettings,
  SMTP_COLUMNS,
  type EngineSettingsRow,
  type ImageSettingsRow,
  type SmtpRow,
} from "./store-settings-mappers.ts";
import {
  defaultReferenceSettings,
  mapReferenceSettings,
  REFERENCE_SETTINGS_COLUMNS,
  type ReferenceSettingsRow,
} from "./store-reference-mappers.ts";
import { isUniqueViolation, toJsonParam } from "./store-row-utils.ts";
import {
  IMAGE_FALLBACK_PROVIDERS,
  IMAGE_PROVIDERS,
  type EngineSettings,
  type ImageCustomFormat,
  type ImageFallbackProvider,
  type ImageProviderName,
  type ImageSettings,
  type ReferenceDna,
  type ReferencePreferences,
  type ReferenceSettings,
  type Site,
  type SmtpSettingsRecord,
  type SmtpTlsMode,
} from "./types.ts";

export type SmtpSettingsPatch = {
  host?: string;
  port?: number;
  tls?: SmtpTlsMode;
  user?: string;
  from?: string;
  passwordEncrypted?: string | null;
};

export type EngineSettingsPatch = {
  defaultProfile?: Site["profile"];
  defaultLayout?: string;
  autostart?: boolean;
  backupDir?: string | null;
};

export type ImageSettingsPatch = {
  provider?: ImageProviderName;
  fallbackProvider?: ImageFallbackProvider;
  cooldownMinutes?: number;
  cliPath?: string;
  baseUrl?: string;
  diffusionModel?: string;
  textEncoder?: string;
  vae?: string;
  defaultSteps?: number;
  maxPixels?: number;
  timeoutMinutes?: number;
  customBaseUrl?: string;
  customModel?: string;
  customFormat?: ImageCustomFormat;
  customApiKeyEncrypted?: string | null;
};

export type ReferenceSettingsPatch = {
  dna?: ReferenceDna;
  preferences?: Partial<ReferencePreferences>;
};

export class SettingsRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async getSmtpSettings(): Promise<SmtpSettingsRecord> {
    const existing = await this.#db.query<SmtpRow>(
      `SELECT ${SMTP_COLUMNS} FROM smtp_settings WHERE id = 'smtp'`,
    );
    const row = existing.rows[0];
    if (row) return mapSmtpSettings(row);
    try {
      await this.#db.query(
        `INSERT INTO smtp_settings (id, host, port, tls, username, password_encrypted, from_address, updated_at)
         VALUES ('smtp', '', 587, 'starttls', '', NULL, '', $1)`,
        [new Date().toISOString()],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const created = await this.#db.query<SmtpRow>(
      `SELECT ${SMTP_COLUMNS} FROM smtp_settings WHERE id = 'smtp'`,
    );
    const stored = created.rows[0];
    return stored === undefined ? defaultSmtpSettings() : mapSmtpSettings(stored);
  }

  async updateSmtpSettings(patch: SmtpSettingsPatch): Promise<SmtpSettingsRecord> {
    const current = await this.getSmtpSettings();
    const next: SmtpSettingsRecord = {
      host: patch.host === undefined ? current.host : patch.host,
      port: patch.port === undefined ? current.port : patch.port,
      tls: patch.tls === undefined ? current.tls : patch.tls,
      user: patch.user === undefined ? current.user : patch.user,
      from: patch.from === undefined ? current.from : patch.from,
      passwordEncrypted:
        patch.passwordEncrypted === undefined
          ? current.passwordEncrypted
          : patch.passwordEncrypted,
    };
    await this.#db.query(
      `UPDATE smtp_settings SET host = $2, port = $3, tls = $4, username = $5,
         password_encrypted = $6, from_address = $7, updated_at = $8 WHERE id = $1`,
      [
        "smtp",
        next.host,
        next.port,
        next.tls,
        next.user,
        next.passwordEncrypted,
        next.from,
        new Date().toISOString(),
      ],
    );
    return next;
  }

  // Defaults for new projects and the program start (artifacts/27 §5).
  async getEngineSettings(): Promise<EngineSettings> {
    const existing = await this.#db.query<EngineSettingsRow>(
      `SELECT ${ENGINE_SETTINGS_COLUMNS} FROM engine_settings WHERE id = 'engine'`,
    );
    const row = existing.rows[0];
    if (row) return mapEngineSettings(row);
    try {
      await this.#db.query(
        `INSERT INTO engine_settings (id, default_profile, default_layout, autostart, backup_dir, updated_at)
         VALUES ('engine', 'standard', 'Standard', false, NULL, $1)`,
        [new Date().toISOString()],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const created = await this.#db.query<EngineSettingsRow>(
      `SELECT ${ENGINE_SETTINGS_COLUMNS} FROM engine_settings WHERE id = 'engine'`,
    );
    const stored = created.rows[0];
    return stored === undefined ? defaultEngineSettings() : mapEngineSettings(stored);
  }

  async updateEngineSettings(patch: EngineSettingsPatch): Promise<EngineSettings> {
    const current = await this.getEngineSettings();
    const next: EngineSettings = {
      defaultProfile:
        patch.defaultProfile === undefined
          ? current.defaultProfile
          : patch.defaultProfile,
      defaultLayout:
        patch.defaultLayout === undefined
          ? current.defaultLayout
          : patch.defaultLayout,
      autostart:
        patch.autostart === undefined ? current.autostart : patch.autostart,
      backupDir:
        patch.backupDir === undefined ? current.backupDir : patch.backupDir,
    };
    await this.#db.query(
      `UPDATE engine_settings SET default_profile = $2, default_layout = $3,
         autostart = $4, backup_dir = $5, updated_at = $6 WHERE id = $1`,
      [
        "engine",
        next.defaultProfile,
        next.defaultLayout,
        next.autostart,
        next.backupDir,
        new Date().toISOString(),
      ],
    );
    return next;
  }

  // Image generation (S1, ADR-0008): one row with the provider chain, the
  // ComfyUI connection and the model file names. The defaults resolve the
  // image-use CLI from the skill installation of the operator.
  async getImageSettings(): Promise<ImageSettings> {
    const existing = await this.#db.query<ImageSettingsRow>(
      `SELECT ${IMAGE_SETTINGS_COLUMNS} FROM image_settings WHERE id = 'image'`,
    );
    const row = existing.rows[0];
    if (row) return mapImageSettings(row);
    const defaults = defaultImageSettings();
    try {
      await this.#db.query(
        `INSERT INTO image_settings (id, provider, fallback_provider, cooldown_minutes,
           cli_path, base_url, diffusion_model, text_encoder, vae, default_steps,
           max_pixels, timeout_minutes, custom_base_url, custom_model, custom_format,
           custom_api_key_encrypted, updated_at)
         VALUES ('image', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          defaults.provider,
          defaults.fallbackProvider,
          defaults.cooldownMinutes,
          defaults.cliPath,
          defaults.baseUrl,
          defaults.diffusionModel,
          defaults.textEncoder,
          defaults.vae,
          defaults.defaultSteps,
          defaults.maxPixels,
          defaults.timeoutMinutes,
          defaults.customBaseUrl,
          defaults.customModel,
          defaults.customFormat,
          defaults.customApiKeyEncrypted,
          new Date().toISOString(),
        ],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const created = await this.#db.query<ImageSettingsRow>(
      `SELECT ${IMAGE_SETTINGS_COLUMNS} FROM image_settings WHERE id = 'image'`,
    );
    const stored = created.rows[0];
    return stored === undefined ? defaults : mapImageSettings(stored);
  }

  async updateImageSettings(patch: ImageSettingsPatch): Promise<ImageSettings> {
    const current = await this.getImageSettings();
    const next: ImageSettings = {
      provider: patch.provider ?? current.provider,
      fallbackProvider: patch.fallbackProvider ?? current.fallbackProvider,
      cooldownMinutes: patch.cooldownMinutes ?? current.cooldownMinutes,
      cliPath: patch.cliPath ?? current.cliPath,
      baseUrl: patch.baseUrl ?? current.baseUrl,
      diffusionModel: patch.diffusionModel ?? current.diffusionModel,
      textEncoder: patch.textEncoder ?? current.textEncoder,
      vae: patch.vae ?? current.vae,
      defaultSteps: patch.defaultSteps ?? current.defaultSteps,
      maxPixels: patch.maxPixels ?? current.maxPixels,
      timeoutMinutes: patch.timeoutMinutes ?? current.timeoutMinutes,
      customBaseUrl: patch.customBaseUrl ?? current.customBaseUrl,
      customModel: patch.customModel ?? current.customModel,
      customFormat: patch.customFormat ?? current.customFormat,
      customApiKeyEncrypted:
        patch.customApiKeyEncrypted === undefined
          ? current.customApiKeyEncrypted
          : patch.customApiKeyEncrypted,
    };
    if (!IMAGE_PROVIDERS.includes(next.provider)) {
      throw new SenifyError("validation", `Unknown image provider "${next.provider}"`, {
        field: "image.provider",
        suggestion: `Choose one of: ${IMAGE_PROVIDERS.join(", ")}.`,
      });
    }
    if (!IMAGE_FALLBACK_PROVIDERS.includes(next.fallbackProvider)) {
      throw new SenifyError(
        "validation",
        `Unknown image fallback provider "${next.fallbackProvider}"`,
        {
          field: "image.fallbackProvider",
          suggestion: `Choose one of: ${IMAGE_FALLBACK_PROVIDERS.join(", ")}.`,
        },
      );
    }
    await this.#db.query(
      `UPDATE image_settings SET provider = $2, fallback_provider = $3,
         cooldown_minutes = $4, cli_path = $5, base_url = $6, diffusion_model = $7,
         text_encoder = $8, vae = $9, default_steps = $10, max_pixels = $11,
         timeout_minutes = $12, custom_base_url = $13, custom_model = $14,
         custom_format = $15, custom_api_key_encrypted = $16, updated_at = $17
         WHERE id = $1`,
      [
        "image",
        next.provider,
        next.fallbackProvider,
        next.cooldownMinutes,
        next.cliPath,
        next.baseUrl,
        next.diffusionModel,
        next.textEncoder,
        next.vae,
        next.defaultSteps,
        next.maxPixels,
        next.timeoutMinutes,
        next.customBaseUrl,
        next.customModel,
        next.customFormat,
        next.customApiKeyEncrypted,
        new Date().toISOString(),
      ],
    );
    return next;
  }

  // House DNA and the preferences of the reference briefs (T14). They live in
  // the engine so the surface and the MCP tools build the same brief.
  async getReferenceSettings(): Promise<ReferenceSettings> {
    const existing = await this.#db.query<ReferenceSettingsRow>(
      `SELECT ${REFERENCE_SETTINGS_COLUMNS} FROM reference_settings WHERE id = 'references'`,
    );
    const row = existing.rows[0];
    if (row) return mapReferenceSettings(row);
    try {
      await this.#db.query(
        `INSERT INTO reference_settings (id, dna, include_dna, overrides, updated_at)
         VALUES ('references', $1, false, '', $2)`,
        [
          toJsonParam({ name: "", description: "", constants: [], never: [] }),
          new Date().toISOString(),
        ],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const created = await this.#db.query<ReferenceSettingsRow>(
      `SELECT ${REFERENCE_SETTINGS_COLUMNS} FROM reference_settings WHERE id = 'references'`,
    );
    const stored = created.rows[0];
    return stored === undefined ? defaultReferenceSettings() : mapReferenceSettings(stored);
  }

  async updateReferenceSettings(patch: ReferenceSettingsPatch): Promise<ReferenceSettings> {
    const current = await this.getReferenceSettings();
    const next: ReferenceSettings = {
      dna: patch.dna ?? current.dna,
      preferences: {
        includeDna:
          patch.preferences?.includeDna ?? current.preferences.includeDna,
        overrides:
          patch.preferences?.overrides ?? current.preferences.overrides,
      },
      updatedAt: new Date().toISOString(),
    };
    await this.#db.query(
      `UPDATE reference_settings SET dna = $2, include_dna = $3, overrides = $4,
         updated_at = $5 WHERE id = $1`,
      [
        "references",
        toJsonParam(next.dna),
        next.preferences.includeDna,
        next.preferences.overrides,
        next.updatedAt,
      ],
    );
    return next;
  }
}
