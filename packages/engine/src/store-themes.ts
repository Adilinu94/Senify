// Das Theme und das Ereignisprotokoll der Sites (ADR-0019). `Store` delegiert
// hier.
//
// Zwei Dinge liegen zusammen, weil sie denselben Schreibvorgang teilen:
// `updateTheme` schreibt die Theme-Zeile UND den Audit-Eintrag in EINER
// Transaktion (ADR-0019, Punkt 4) - eine Theme-Aenderung ohne Spur waere sonst
// moeglich. `recordSiteEvent` schreibt in dasselbe Protokoll, nur ohne
// Theme-Zeile.
//
// Das Modul besitzt die Tabelle `themes` und schreibt in `audit_entries`
// (site-weit, `page_id = NULL`). Es besitzt NICHT die Site: `getTheme` und
// `updateTheme` pruefen ihre Existenz ueber eine hereingereichte Funktion, wie
// das Deploy-Modul es haelt.
//
// `ensureSiteTheme` ist bewusst selbstheilend: eine Site ohne Theme-Zeile
// bekommt beim ersten Lesen eine. Das deckt wiederhergestellte Backups ab, die
// vor der Tabelle entstanden sind.

import { SenifyError } from "@senify/core";
import type { Author } from "@senify/section-sdk";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import { buildAuditInsert } from "./store-audit.ts";
import { isUniqueViolation, toFiniteNumber, toIso, toJson, toJsonParam } from "./store-row-utils.ts";
import {
  defaultTheme,
  emitCss,
  mergeThemePatch,
  resolveTheme,
  ThemeSchema,
  validateTheme,
  type Theme,
} from "@senify/tokens";
import { validateShape } from "./mutations/contract.ts";
import type { SiteTheme } from "./types.ts";

export type SiteThemeRow = {
  id: string;
  site_id: string;
  name: string;
  definition: unknown;
  version: unknown;
  created_at: unknown;
  updated_at: unknown;
};

export function mapSiteThemeRow(row: SiteThemeRow): SiteTheme {
  const theme = toJson<Theme>(row.definition);
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    version: toFiniteNumber(row.version, "version"),
    theme,
    css: emitCss(resolveTheme(theme)),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// Was das Modul vom Store braucht: die Existenz der Site. Sonst nichts.
export type ThemesHost = {
  getSite(siteId: string): Promise<unknown>;
};

export class ThemesRepository {
  readonly #db: Db;
  readonly #host: ThemesHost;

  constructor(db: Db, host: ThemesHost) {
    this.#db = db;
    this.#host = host;
  }

// Site-level activity (rename, trash, duplicate, theme) lands in the same
// append-only audit log the page mutations use.
async recordSiteEvent(input: {
  siteId: string;
  mutation: string;
  params: Record<string, unknown>;
  author: Author;
}): Promise<void> {
  const { text, params } = buildAuditInsert([
    {
      siteId: input.siteId,
      pageId: null,
      batchId: newEntityId(),
      opIndex: 0,
      mutation: input.mutation,
      params: input.params,
      author: input.author,
      undoPatch: [],
      draftVersionAfter: 0,
    },
  ]);
  await this.#db.query(text, params);
}

async ensureSiteTheme(siteId: string): Promise<SiteThemeRow> {
  const existing = await this.#db.query<SiteThemeRow>(
    `SELECT id, site_id, name, definition, version, created_at, updated_at
     FROM themes WHERE site_id = $1`,
    [siteId],
  );
  const found = existing.rows[0];
  if (found) return found;
  const id = newEntityId();
  const definition: Theme = { ...defaultTheme(), id };
  const issues = validateTheme(definition);
  if (issues.length > 0) {
    throw new Error(
      `Default theme is invalid: ${issues[0]?.message ?? "unknown error"}`,
    );
  }
  const now = new Date().toISOString();
  try {
    const inserted = await this.#db.query<SiteThemeRow>(
      `INSERT INTO themes (id, site_id, name, definition, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 1, $5, $5)
       RETURNING id, site_id, name, definition, version, created_at, updated_at`,
      [id, siteId, definition.name, toJsonParam(definition), now],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("Theme insert returned no row");
    await this.#db.query(
      `UPDATE sites SET theme_id = $2, updated_at = $3 WHERE id = $1`,
      [siteId, id, now],
    );
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Lost the race: another writer created the theme first.
      const retry = await this.#db.query<SiteThemeRow>(
        `SELECT id, site_id, name, definition, version, created_at, updated_at
         FROM themes WHERE site_id = $1`,
        [siteId],
      );
      const row = retry.rows[0];
      if (!row) throw error;
      return row;
    }
    throw error;
  }
}

async getTheme(siteId: string): Promise<SiteTheme> {
  await this.#host.getSite(siteId);
  // Lazy ensure is intentional: themes created before T04 (none in
  // practice — greenfield) or restored backups still resolve.
  return mapSiteThemeRow(await this.ensureSiteTheme(siteId));
}

async updateTheme(
  siteId: string,
  patch: Record<string, unknown>,
  author: Author,
): Promise<SiteTheme> {
  if (Object.keys(patch).length === 0) {
    throw new SenifyError("validation", "Theme patch is empty", {
      field: "theme",
      suggestion: "Provide at least one change.",
    });
  }
  await this.#host.getSite(siteId);
  const current = await this.ensureSiteTheme(siteId);
  const currentDefinition = toJson<Theme>(current.definition);
  const merged = mergeThemePatch(currentDefinition, patch);
  merged.id = current.id;
  validateShape(ThemeSchema, merged, "theme");
  const issues = validateTheme(merged);
  if (issues.length > 0) {
    const first = issues[0];
    const extra =
      issues.length > 1 ? ` Plus ${issues.length - 1} more theme problems.` : "";
    throw new SenifyError(
      "validation",
      `Invalid theme: ${first?.message ?? "value does not resolve"}`,
      {
        field: first?.path ?? "theme",
        suggestion: `${first?.suggestion ?? "Fix the flagged value."}${extra}`,
      },
    );
  }
  const now = new Date().toISOString();
  await this.#db.withTransaction(async (tx) => {
    const updated = await tx.query<{ version: unknown }>(
      `UPDATE themes SET definition = $2, name = $3, version = version + 1, updated_at = $4
       WHERE id = $1 RETURNING version`,
      [current.id, toJsonParam(merged), merged.name, now],
    );
    const versionRow = updated.rows[0];
    if (!versionRow) {
      throw new SenifyError("not_found", `Theme for site "${siteId}" does not exist`, {
        field: "siteId",
      });
    }
    const newVersion = toFiniteNumber(versionRow.version, "version");
    const { text, params } = buildAuditInsert([
      {
        siteId,
        pageId: null,
        batchId: newEntityId(),
        opIndex: 0,
        mutation: "update_theme",
        params: { patch, previous: currentDefinition },
        author,
        undoPatch: [],
        draftVersionAfter: newVersion,
      },
    ]);
    await tx.query(text, params);
    return newVersion;
  });
  return this.getTheme(siteId);
}
}
