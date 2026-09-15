import { randomBytes } from "node:crypto";

const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";
const ALPHABET_LENGTH = ALPHABET.length;

export function createId(size: number): string {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError("createId requires a positive integer size");
  }
  let id = "";
  while (id.length < size) {
    for (const byte of randomBytes(size)) {
      // 64 divides 256, so no modulo bias for this alphabet.
      id += ALPHABET[byte % ALPHABET_LENGTH];
      if (id.length === size) break;
    }
  }
  return id;
}

export function newNodeId(): string {
  return createId(10);
}

export function newEntityId(): string {
  return createId(14);
}
