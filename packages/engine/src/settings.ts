import type { SmtpConfig } from "./mailer.ts";
import { decryptSecret, encryptSecret, keyFromSecret } from "./secrets.ts";
import type { Store } from "./store.ts";
import type { SmtpSettings, SmtpSettingsRecord } from "./types.ts";

// Settings helpers (T12): turn the stored SMTP record into a transport config
// and keep the encrypted password behind the persisted engine secret.

export function smtpView(record: SmtpSettingsRecord): SmtpSettings {
  return {
    host: record.host,
    port: record.port,
    tls: record.tls,
    user: record.user,
    from: record.from,
    hasPassword: record.passwordEncrypted !== null,
  };
}

export async function encryptSmtpPassword(
  store: Store,
  plaintext: string,
): Promise<string> {
  const key = keyFromSecret(await store.getOrCreateEngineSecret());
  return encryptSecret(plaintext, key);
}

// Returns undefined when the settings are not complete enough to send; the
// outbox then keeps using the dev transport.
export async function resolveSmtpConfig(
  store: Store,
): Promise<SmtpConfig | undefined> {
  const record = await store.getSmtpSettings();
  if (record.host.trim() === "" || record.from.trim() === "") return undefined;
  const password =
    record.passwordEncrypted === null
      ? ""
      : decryptSecret(
          record.passwordEncrypted,
          keyFromSecret(await store.getOrCreateEngineSecret()),
        );
  return {
    host: record.host,
    port: record.port,
    tls: record.tls,
    user: record.user,
    password,
    from: record.from,
  };
}
