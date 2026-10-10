export function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function toFiniteNumber(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Stored value for "${field}" is not a number: ${String(value)}`);
  }
  return parsed;
}

export function toJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

export function toJsonParam(value: unknown): string {
  return JSON.stringify(value);
}

export function toNullableIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toIso(value);
}

export function toBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    return value === "true" || value === "t" || value === "1";
  }
  return false;
}
