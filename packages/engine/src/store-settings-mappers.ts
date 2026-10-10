// Row types, defaults and mappers for the engine settings: SMTP, engine and image provider settings (P3-2, moved out of store.ts).
import {
  type EngineSettings,
  IMAGE_CUSTOM_FORMATS,
  IMAGE_FALLBACK_PROVIDERS,
  IMAGE_PROVIDERS,
  type ImageCustomFormat,
  type ImageFallbackProvider,
  type ImageProviderName,
  type ImageSettings,
  SITE_PROFILES,
  SMTP_TLS_MODES,
  type Site,
  type SmtpSettingsRecord,
  type SmtpTlsMode,
} from "./types.ts";
import { homedir } from "node:os";
import { join } from "node:path";
import { toBoolean, toFiniteNumber } from "./store-row-utils.ts";

// ------------------------------------------------------------ settings (T12)

export const SMTP_COLUMNS = "host, port, tls, username, password_encrypted, from_address";

export const ENGINE_SETTINGS_COLUMNS =
  "default_profile, default_layout, autostart, backup_dir";

export type SmtpRow = {
  host: string;
  port: unknown;
  tls: string;
  username: string;
  password_encrypted: unknown;
  from_address: string;
};

export function defaultSmtpSettings(): SmtpSettingsRecord {
  return {
    host: "",
    port: 587,
    tls: "starttls",
    user: "",
    from: "",
    passwordEncrypted: null,
  };
}

export function mapSmtpSettings(row: SmtpRow): SmtpSettingsRecord {
  const tls = SMTP_TLS_MODES.includes(row.tls as SmtpTlsMode)
    ? (row.tls as SmtpTlsMode)
    : "starttls";
  return {
    host: row.host,
    port: toFiniteNumber(row.port, "port"),
    tls,
    user: row.username,
    from: row.from_address,
    passwordEncrypted:
      typeof row.password_encrypted === "string" ? row.password_encrypted : null,
  };
}

export type EngineSettingsRow = {
  default_profile: string;
  default_layout: string;
  autostart: unknown;
  backup_dir: unknown;
};

export function defaultEngineSettings(): EngineSettings {
  return {
    defaultProfile: "standard",
    defaultLayout: "Standard",
    autostart: false,
    backupDir: null,
  };
}

export function mapEngineSettings(row: EngineSettingsRow): EngineSettings {
  const profile = SITE_PROFILES.includes(row.default_profile as Site["profile"])
    ? (row.default_profile as Site["profile"])
    : "standard";
  return {
    defaultProfile: profile,
    defaultLayout: row.default_layout,
    autostart: toBoolean(row.autostart),
    backupDir: typeof row.backup_dir === "string" ? row.backup_dir : null,
  };
}

// ------------------------------------------------------------ images (S1)

export const IMAGE_SETTINGS_COLUMNS =
  "provider, fallback_provider, cooldown_minutes, cli_path, base_url, diffusion_model, text_encoder, vae, default_steps, max_pixels, timeout_minutes, custom_base_url, custom_model, custom_format, custom_api_key_encrypted";

export type ImageSettingsRow = {
  provider: string;
  fallback_provider: string;
  cooldown_minutes: unknown;
  cli_path: string;
  base_url: string;
  diffusion_model: string;
  text_encoder: string;
  vae: string;
  default_steps: unknown;
  max_pixels: unknown;
  timeout_minutes: unknown;
  custom_base_url: string;
  custom_model: string;
  custom_format: string;
  custom_api_key_encrypted: string | null;
};

export function defaultImageSettings(): ImageSettings {
  return {
    provider: "image-use",
    fallbackProvider: "comfyui",
    cooldownMinutes: 60,
    // The CLI of the image-use skill installation; an empty stored value keeps
    // this default, so a fresh installation works without setup.
    cliPath: join(homedir(), ".agents", "skills", "image-use", "image-use"),
    baseUrl: "http://127.0.0.1:8188",
    diffusionModel: "qwen-image-2.1-Q4_K_M.gguf",
    textEncoder: "qwen3vl_8b_int8_convrot.safetensors",
    vae: "qwen_image_2.1_vae_bf16.safetensors",
    defaultSteps: 40,
    maxPixels: 1_048_576,
    timeoutMinutes: 60,
    // The custom endpoint (third path) defaults to MiniMax; the API key has to
    // be stored before the provider can run.
    customBaseUrl: "https://api.minimax.io/v1",
    customModel: "image-01",
    customFormat: "minimax",
    customApiKeyEncrypted: null,
  };
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = toFiniteNumber(value, "image");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function mapImageSettings(row: ImageSettingsRow): ImageSettings {
  const defaults = defaultImageSettings();
  const provider = IMAGE_PROVIDERS.includes(row.provider as ImageProviderName)
    ? (row.provider as ImageProviderName)
    : defaults.provider;
  const fallbackProvider = IMAGE_FALLBACK_PROVIDERS.includes(
    row.fallback_provider as ImageFallbackProvider,
  )
    ? (row.fallback_provider as ImageFallbackProvider)
    : defaults.fallbackProvider;
  const customFormat = IMAGE_CUSTOM_FORMATS.includes(
    row.custom_format as ImageCustomFormat,
  )
    ? (row.custom_format as ImageCustomFormat)
    : defaults.customFormat;
  return {
    provider,
    fallbackProvider,
    cooldownMinutes: positiveInteger(row.cooldown_minutes, defaults.cooldownMinutes),
    cliPath: row.cli_path === "" ? defaults.cliPath : row.cli_path,
    baseUrl: row.base_url === "" ? defaults.baseUrl : row.base_url,
    diffusionModel: row.diffusion_model === "" ? defaults.diffusionModel : row.diffusion_model,
    textEncoder: row.text_encoder === "" ? defaults.textEncoder : row.text_encoder,
    vae: row.vae === "" ? defaults.vae : row.vae,
    defaultSteps: positiveInteger(row.default_steps, defaults.defaultSteps),
    maxPixels: positiveInteger(row.max_pixels, defaults.maxPixels),
    timeoutMinutes: positiveInteger(row.timeout_minutes, defaults.timeoutMinutes),
    customBaseUrl:
      row.custom_base_url === "" ? defaults.customBaseUrl : row.custom_base_url,
    customModel: row.custom_model === "" ? defaults.customModel : row.custom_model,
    customFormat,
    customApiKeyEncrypted:
      typeof row.custom_api_key_encrypted === "string"
        ? row.custom_api_key_encrypted
        : null,
  };
}
