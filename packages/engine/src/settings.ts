import type { SmtpConfig } from "./mailer.ts";
import { decryptSecret, encryptSecret, keyFromSecret } from "./secrets.ts";
import type { Store } from "./store.ts";
import type {
  ReferenceDna,
  ReferencePreferences,
  SmtpSettings,
  SmtpSettingsRecord,
} from "./types.ts";

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

// ------------------------------------------------- references (T14)

// The DNA lists are edited by hand: entries are trimmed, empty ones dropped and
// duplicates removed, so the brief block stays readable.
function dnaEntries(entries: string[]): string[] {
  const cleaned: string[] = [];
  for (const entry of entries) {
    const value = entry.trim();
    if (value !== "" && !cleaned.includes(value)) cleaned.push(value);
  }
  return cleaned;
}

function normalizeReferenceDna(dna: ReferenceDna): ReferenceDna {
  return {
    name: dna.name.trim(),
    description: dna.description.trim(),
    constants: dnaEntries(dna.constants),
    never: dnaEntries(dna.never),
  };
}

// A patch may carry the DNA, the preferences or both; the store merges it into
// the stored settings.
export function referenceSettingsPatch(body: {
  referenceDna?: ReferenceDna;
  referencePreferences?: { includeDna?: boolean; overrides?: string };
}): {
  dna?: ReferenceDna;
  preferences?: Partial<ReferencePreferences>;
} {
  const dna =
    body.referenceDna === undefined
      ? {}
      : { dna: normalizeReferenceDna(body.referenceDna) };
  const overrides = body.referencePreferences?.overrides;
  const includeDna = body.referencePreferences?.includeDna;
  const preferences =
    body.referencePreferences === undefined
      ? {}
      : {
          preferences: {
            ...(includeDna === undefined ? {} : { includeDna }),
            ...(overrides === undefined ? {} : { overrides: overrides.trim() }),
          },
        };
  return { ...dna, ...preferences };
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
