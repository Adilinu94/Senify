import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
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
