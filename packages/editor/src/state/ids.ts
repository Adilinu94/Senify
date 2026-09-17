// Browser-safe node ids for the editor document store (Phase 0, fourth slice).
//
// The engine's `newNodeId` reads `node:crypto`, which would drag Node into the
// canvas bundle. The editor needs ids in the browser too, so this module
// generates them from the Web Crypto API (`globalThis.crypto.getRandomValues`)
// with a plain fallback for hosts that have no crypto. The alphabet and the
// length match the engine (`ids.ts`: 64 chars, 10 for a node), so editor ids are
// indistinguishable from engine ids and a document stays portable.

const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";
const ALPHABET_LENGTH = ALPHABET.length;

export function randomId(size: number): string {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError("randomId requires a positive integer size");
  }
  const bytes = new Uint8Array(size);
  const crypto = globalThis.crypto;
  if (crypto !== undefined && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < size; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let id = "";
  for (const byte of bytes) {
    // 64 divides 256, so no modulo bias for this alphabet.
    id += ALPHABET[byte % ALPHABET_LENGTH];
  }
  return id;
}

export function newNodeId(): string {
  return randomId(10);
}
