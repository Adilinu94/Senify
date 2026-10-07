import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { SenifyError } from "@senify/core";

// Secrets at rest (T12): values like the SMTP password are encrypted with
// AES-256-GCM under a key derived from the engine's persisted secret, so the
// database only ever holds opaque ciphertext.

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;

function unreadablePassword(): SenifyError {
  return new SenifyError("validation", "Gespeichertes Passwort ist nicht lesbar", {
    field: "password",
    suggestion: "Setze das SMTP-Passwort in den Einstellungen neu.",
  });
}

// Name of the key file inside the data directory. The backup leaves it out
// (see backup.ts): a key that travels with the ciphertext protects nothing.
export const ENGINE_SECRET_FILE = "engine-secret.key";

// A key of 32 random bytes as base64url is 43 characters; anything shorter is
// not a key this engine wrote.
const MIN_SECRET_LENGTH = 32;

// The stored key, or undefined when there is no file yet. A file that exists
// but does not hold a key is an error: silently issuing a new one would make
// every stored password unreadable.
export function readSecretFile(file: string): string | undefined {
  if (!existsSync(file)) return undefined;
  const secret = readFileSync(file, "utf8").trim();
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new SenifyError("conflict", `Die Schlüsseldatei ${file} ist beschädigt`, {
      suggestion:
        "Aus einem Backup der Datei wiederherstellen, oder löschen, damit ein neuer Schlüssel entsteht (gespeicherte Passwörter müssen dann neu gesetzt werden).",
    });
  }
  return secret;
}

// Publishes the key exclusively: the file appears whole or not at all, and a
// second process that races us keeps the winner's key (the caller re-reads).
export function publishSecretFile(file: string, secret: string): void {
  // A fresh install has no data directory yet.
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(temporary, `${secret}\n`, { mode: 0o600, flag: "wx" });
  try {
    linkSync(temporary, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    rmSync(temporary, { force: true });
  }
}

// The persisted secret is high-entropy already; a single SHA-256 yields a
// fixed 32-byte key without extra KDF state.
export function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [version, iv, tag, data] = payload.split(".");
  if (
    version !== VERSION ||
    iv === undefined ||
    tag === undefined ||
    data === undefined
  ) {
    throw unreadablePassword();
  }
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw unreadablePassword();
  }
}
