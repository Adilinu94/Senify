import { deepMergeUnknown } from "./resolve.ts";
import type { Theme } from "./schema.ts";

export function mergeThemePatch(base: Theme, patch: unknown): Theme {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("Theme patch must be a JSON object");
  }
  const merged = deepMergeUnknown(
    base as unknown as Record<string, unknown>,
    patch as Record<string, unknown>,
  );
  return merged as unknown as Theme;
}
