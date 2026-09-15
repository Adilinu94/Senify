import { SenifyError } from "@senify/core";

export const PAGE_PATH_PATTERN = /^\/[^\s?#]*$/;

export function assertPagePathFormat(path: string, field = "path"): void {
  if (!PAGE_PATH_PATTERN.test(path)) {
    throw new SenifyError("validation", `Invalid page path "${path}"`, {
      field,
      suggestion:
        'Paths start with "/" and must not contain spaces, "?" or "#".',
    });
  }
}

export function draftConflictError(
  expected: number,
  current: number,
): SenifyError {
  return new SenifyError(
    "conflict",
    `Draft has changed (expected v${expected}, current v${current})`,
    {
      field: "baseDraftVersion",
      suggestion:
        "Reload the page, re-apply mutations against the current draft version, then retry.",
    },
  );
}
