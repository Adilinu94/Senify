// Schutz- und Belegtypen fuer Klassen- und Variablen-Operationen. Das Modul
// stammt aus dem Editor-Zweig (C) und wurde beim Merge am 06.11.2026 als
// eigene Datei angelegt, weil zwei Besitzer es brauchen: `StyleRuleStore`
// (Registry-Schreibweg) und `Store` (die fachuebergreifenden Transaktionen
// ueber Seiten, Theme und Registry, ADR-0019 Punkt 4).

import { SenifyError } from "@senify/core";
import { canonicalHash } from "./redesign-proposal-contract.ts";
import type { DbClient } from "./db.ts";
import { toFiniteNumber, toJson } from "./store-row-utils.ts";

export function assertStyleRegistryVersion(expected: number | undefined, current: number): void {
  if (expected !== undefined && expected !== current) {
    throw new SenifyError("conflict", "Die Style-Registry wurde zwischenzeitlich geändert", {
      field: "baseVersion",
      suggestion: "Lade die Style-Registry neu und sende den Write erneut.",
      currentVersion: current,
    });
  }
}

export async function assertThemeVersionUnderLock(
  client: DbClient,
  siteId: string,
  expected: number | undefined,
): Promise<void> {
  if (expected === undefined) return;
  const themes = await client.query<{ version: unknown }>(
    `SELECT version FROM themes WHERE site_id = $1 FOR UPDATE`,
    [siteId],
  );
  const theme = themes.rows[0];
  if (theme === undefined || toFiniteNumber(theme.version, "version") !== expected) {
    throw new SenifyError("conflict", "Die Variablen wurden zwischenzeitlich geändert", {
      field: "baseThemeVersion",
      suggestion: "Lade die Seite und ihre Variablen neu.",
    });
  }
}

// Conservative: selectors may use class names as class or attribute tokens.
// Decode CSS escapes first so escaped references are not silently broken.
export function selectorMentionsClass(selector: string, name: string): boolean {
  const normalized = selector
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(
      /\\([0-9a-fA-F]{1,6})\s?|\\([^\r\n\f])/g,
      (_match, hex: string | undefined, char: string | undefined) => {
        if (hex !== undefined) {
          const code = Number.parseInt(hex, 16);
          return code === 0 || code > 0x10ffff ? "�" : String.fromCodePoint(code);
        }
        return char ?? "";
      },
    );
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, "i").test(normalized);
}

export type ClassDeletionPage = {
  pageId: string;
  version: number;
  fingerprint?: string;
  classes: Record<string, string[]>;
};

export type ClassDeletionRow = {
  site_id: string;
  rule_id: string;
  rule: unknown;
  pages: unknown;
  registry_version: unknown;
  restored_at: unknown;
  resource_hashes: unknown;
  request_basis: unknown;
  restore_result: unknown;
};
export type ClassRequestBasis = { pageId: string; baseVersion: number; baseDraftVersion: number };
export type ClassRestoreResult = ClassRequestBasis & {
  baseThemeVersion?: number;
  version: number;
  pageDraftVersion: number;
};

export type VariableDeletionPage = { pageId: string; version: number };
export type VariableRenamePage = VariableDeletionPage & { fingerprint?: string };
// New rename receipts state which registry hash contract they carry: the raw
// registry including identity and all extra fields, with only the per-rule
// `updatedAt` timestamp left out. Receipts without this marker keep the older
// full-hash comparison, so stored evidence is never loosened retroactively.
export const RENAME_REGISTRY_HASH_CONTRACT = "raw-registry-updatedAt-excluded";
export type VariablePageRow = {
  id: string;
  site_id: string;
  path: string;
  title: string;
  meta: unknown;
  draft: unknown;
  draft_version: unknown;
};
export function variablePageHash(
  page: VariablePageRow,
  draft: unknown = toJson<unknown>(page.draft),
): string {
  return canonicalHash({
    id: page.id,
    siteId: page.site_id,
    path: page.path,
    title: page.title,
    meta: toJson<unknown>(page.meta),
    draft,
  });
}
export function variableRegistryContentHash(rules: unknown): string {
  if (!Array.isArray(rules)) return canonicalHash(rules);
  return canonicalHash(
    rules.map((rule: unknown) => {
      if (rule === null || typeof rule !== "object" || Array.isArray(rule)) return rule;
      const content = { ...rule } as Record<string, unknown>;
      delete content.updatedAt;
      return content;
    }),
  );
}
export type VariableDeletionRow = {
  site_id: string;
  family: string;
  name: string;
  value: string;
  pages: unknown;
  registry_version: unknown;
  theme_version: unknown;
  restored_at: unknown;
  resource_hashes: unknown;
  request_basis: unknown;
  restore_result: unknown;
};
export type VariableRequestBasis = { pageId: string; baseThemeVersion: number; baseDraftVersion: number };
export type VariableRestoreResult = VariableRequestBasis & { version: number; pageDraftVersion: number };

export type VariableRenameRow = {
  site_id: string;
  family: string;
  old_name: string;
  new_name: string;
  undo_of: string | null;
  pages: unknown;
  registry_version: unknown;
  theme_version: unknown;
  resource_hashes: unknown;
};
