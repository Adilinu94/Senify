// Die Sites des Stores (ADR-0019): anlegen, lesen, umbenennen, das Profil, der
// Papierkorb, die Basis-URL, die Breakpoints und der Design-Contract. `Store`
// delegiert hier.
//
// Das Modul besitzt die Tabellen `sites`, `site_trash` und `site_events`.
//
// Zwei Naehte, beide schmal und beide begruendet:
// - `getEngineSettings`: das Standard-Profil eines neuen Projekts steht in den
//   Engine-Einstellungen. Die gehoeren zu `SettingsRepository` und nicht
//   hierher; das Modul fragt sie ueber eine Funktion.
// - `ensureSiteTheme`: jede neue Site bekommt ihre Theme-Zeile. Das Theme ist
//   ein eigenes Fachgebiet; solange es am Store liegt, reicht das Modul den
//   Aufruf durch.
//
// `deleteSite` ist eine Einzeltransaktion (ADR-0019, Punkt 4): sie beginnt und
// endet in dieser einen Methode und raeumt nur Tabellen, die der Site folgen.
// Kein anderes Modul wird darin aufgerufen.

import { SenifyError } from "@senify/core";
import { deriveDesignContract } from "./design-contract.ts";
import { SITE_SCOPED_TABLES, type Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import { normalizeSiteBreakpoints, readStoredBreakpoints } from "./site-breakpoints.ts";
import { normalizeSiteBaseUrl } from "./site-url.ts";
import type { SiteFileRef } from "./storage.ts";
import { SITE_PROFILES, type DesignContract, type Site } from "./types.ts";
import { isUniqueViolation, slugify, toIso, toJson, toJsonParam } from "./store-row-utils.ts";

export type SiteRow = {
  id: string;
  name: string;
  slug: string;
  profile: string;
  theme_id: unknown;
  // Only `getSite` selects it; list/rename/profile rows leave it out.
  base_url?: unknown;
  breakpoints_json?: unknown;
  created_at: unknown;
  updated_at: unknown;
};

// Der Design-Contract wird eigens gelesen (getSite holt ihn ueber eine zweite
// Abfrage), die SiteRow bleibt schlank wie die Zeilentypen der anderen
// ausgelagerten Store-Module.

export function mapSite(row: SiteRow): Site {
  const profile = row.profile;
  if (profile !== "clean" && profile !== "standard" && profile !== "showcase") {
    throw new Error(`Stored site profile is invalid: ${String(profile)}`);
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    profile,
    themeId: typeof row.theme_id === "string" ? row.theme_id : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export type CreateSiteInput = {
  name: string;
  slug?: string;
  profile?: Site["profile"];
};

// Was das Modul vom Store braucht: zwei Fachgebiete, die (noch) nicht hier
// liegen. Der Store reicht sie als Funktion herein, damit dieses Modul ihn
// nicht kennt (ADR-0019, Punkt 3).
export type SitesHost = {
  getEngineSettings(): Promise<{ defaultProfile: Site["profile"] }>;
  ensureSiteTheme(siteId: string): Promise<unknown>;
  listPagePaths(siteId: string): Promise<string[]>;
};

export class SitesRepository {
  readonly #db: Db;
  readonly #host: SitesHost;

  constructor(db: Db, host: SitesHost) {
    this.#db = db;
    this.#host = host;
  }

async createSite(input: CreateSiteInput): Promise<Site> {
  const name = input.name?.trim();
  if (!name) {
    throw new SenifyError("validation", "Site name is required", {
      field: "name",
      suggestion: "Provide a non-empty site name.",
    });
  }
  const profile: Site["profile"] =
    input.profile ?? (await this.#host.getEngineSettings()).defaultProfile;
  if (!SITE_PROFILES.includes(profile)) {
    throw new SenifyError(
      "validation",
      `Unknown site profile "${profile}"`,
      {
        field: "profile",
        suggestion: `Choose one of: ${SITE_PROFILES.join(", ")}.`,
      },
    );
  }
  const now = new Date().toISOString();
  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    const site = await this.#insertSite(newEntityId(), name, slug, profile, now);
    await this.#host.ensureSiteTheme(site.id);
    return this.getSite(site.id);
  }
  const base = slugify(name);
  let site: Site | undefined;
  let lastConflict: SenifyError | undefined;
  for (let attempt = 0; attempt < 50 && !site; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      site = await this.#insertSite(newEntityId(), name, slug, profile, now);
    } catch (error) {
      if (error instanceof SenifyError && error.category === "conflict") {
        lastConflict = error;
        continue;
      }
      throw error;
    }
  }
  if (!site) {
    throw (
      lastConflict ??
      new SenifyError("conflict", `Site slug "${base}" is already in use`, {
        field: "slug",
        suggestion: "Choose a different site slug.",
      })
    );
  }
  await this.#host.ensureSiteTheme(site.id);
  return this.getSite(site.id);
}

async #insertSite(
  id: string,
  name: string,
  slug: string,
  profile: Site["profile"],
  now: string,
): Promise<Site> {
  try {
    const result = await this.#db.query<SiteRow>(
      `INSERT INTO sites (id, name, slug, profile, theme_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NULL, $5, $5)
       RETURNING id, name, slug, profile, theme_id, created_at, updated_at`,
      [id, name, slug, profile, now],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Site insert returned no row");
    return mapSite(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new SenifyError(
        "conflict",
        `Site slug "${slug}" is already in use`,
        {
          field: "slug",
          suggestion: "Choose a different site slug.",
        },
      );
    }
    throw error;
  }
}

async listSites(): Promise<Site[]> {
  const result = await this.#db.query<SiteRow>(
    `SELECT s.id, s.name, s.slug, s.profile, s.theme_id, s.created_at, s.updated_at
     FROM sites s
     LEFT JOIN site_trash t ON t.site_id = s.id
     WHERE t.site_id IS NULL
     ORDER BY s.created_at ASC, s.id ASC`,
  );
  return result.rows.map(mapSite);
}

async getSite(id: string): Promise<Site> {
  const result = await this.#db.query<SiteRow>(
    `SELECT id, name, slug, profile, theme_id, base_url, breakpoints_json, created_at, updated_at
     FROM sites WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new SenifyError("not_found", `Site "${id}" does not exist`, {
      field: "siteId",
      suggestion: "Create the site first or check the id.",
    });
  }
  const site = mapSite(row);
  site.designContract = await this.readDesignContract(id);
  if (typeof row.base_url === "string") site.baseUrl = row.base_url;
  const breakpoints = readStoredBreakpoints(row.breakpoints_json);
  if (breakpoints !== undefined) site.breakpoints = breakpoints;
  return site;
}

// The breakpoint pair (ADR-0020): validated against the guard rails; `null`
// clears it back to the platform default. Returns the full site.
async updateSiteBreakpoints(id: string, raw: unknown): Promise<Site> {
  const breakpoints = normalizeSiteBreakpoints(raw);
  const result = await this.#db.query<{ id: string }>(
    `UPDATE sites SET breakpoints_json = $2, updated_at = $3 WHERE id = $1 RETURNING id`,
    [id, breakpoints === null ? null : toJsonParam(breakpoints), new Date().toISOString()],
  );
  if (result.rows.length === 0) {
    throw new SenifyError("not_found", `Site "${id}" does not exist`, {
      field: "siteId",
    });
  }
  return this.getSite(id);
}

// The public address: validated and reduced to its origin; blank or `null`
// clears it. Returns the full site so the caller sees the stored value.
async updateSiteBaseUrl(id: string, raw: string | null): Promise<Site> {
  const baseUrl = raw === null ? null : normalizeSiteBaseUrl(raw);
  const result = await this.#db.query<{ id: string }>(
    `UPDATE sites SET base_url = $2, updated_at = $3 WHERE id = $1 RETURNING id`,
    [id, baseUrl, new Date().toISOString()],
  );
  if (result.rows.length === 0) {
    throw new SenifyError("not_found", `Site "${id}" does not exist`, {
      field: "siteId",
    });
  }
  return this.getSite(id);
}

// The design contract lives in its own column; absent means "no DNA yet".
private async readDesignContract(siteId: string): Promise<DesignContract | undefined> {
  const result = await this.#db.query<{ design_contract: unknown }>(
    `SELECT design_contract FROM sites WHERE id = $1`,
    [siteId],
  );
  const raw = result.rows[0]?.design_contract;
  if (raw === null || raw === undefined) return undefined;
  const parsed = toJson<DesignContract>(raw);
  if (
    parsed === null ||
    !Array.isArray(parsed.constants) ||
    !Array.isArray(parsed.never) ||
    !Array.isArray(parsed.vocabulary) ||
    (parsed.source !== "references" && parsed.source !== "manual")
  ) {
    return undefined;
  }
  return parsed;
}

async getDesignContract(siteId: string): Promise<DesignContract | null> {
  return (await this.readDesignContract(siteId)) ?? null;
}

// Manual override: the caller supplies the full contract; the store trims
// and dedupes the entries. `null` clears the contract.
async updateDesignContract(
  siteId: string,
  contract: {
    constants: string[];
    never: string[];
    vocabulary: string[];
  } | null,
): Promise<DesignContract | null> {
  await this.getSite(siteId);
  if (contract === null) {
    await this.#db.query(
      `UPDATE sites SET design_contract = NULL, updated_at = $2 WHERE id = $1`,
      [siteId, new Date().toISOString()],
    );
    return null;
  }
  const value: DesignContract = {
    constants: [...new Set(contract.constants.map((c) => c.trim()).filter((c) => c !== ""))].slice(0, 12),
    never: [...new Set(contract.never.map((c) => c.trim()).filter((c) => c !== ""))].slice(0, 12),
    vocabulary: [...new Set(contract.vocabulary.map((c) => c.trim()).filter((c) => c !== ""))].slice(0, 12),
    source: "manual",
    updatedAt: new Date().toISOString(),
  };
  await this.#db.query(
    `UPDATE sites SET design_contract = $2, updated_at = $3 WHERE id = $1`,
    [siteId, toJsonParam(value), new Date().toISOString()],
  );
  return value;
}

// Re-derive the contract from the assigned references (called after
// applyReference/unassign): manual contracts are never overwritten.
async refreshDesignContractFromReferences(
  siteId: string,
  profiles: readonly {
    constants: readonly string[];
    never: readonly string[];
    vocabulary: readonly string[];
  }[],
): Promise<DesignContract | null> {
  const existing = await this.readDesignContract(siteId);
  if (existing?.source === "manual") return existing;
  if (profiles.length === 0) {
    await this.#db.query(
      `UPDATE sites SET design_contract = NULL, updated_at = $2 WHERE id = $1`,
      [siteId, new Date().toISOString()],
    );
    return null;
  }
  const derived = deriveDesignContract(profiles);
  const value: DesignContract = {
    constants: [...derived.constants],
    never: [...derived.never],
    vocabulary: [...derived.vocabulary],
    source: "references",
    updatedAt: new Date().toISOString(),
  };
  await this.#db.query(
    `UPDATE sites SET design_contract = $2, updated_at = $3 WHERE id = $1`,
    [siteId, toJsonParam(value), new Date().toISOString()],
  );
  return value;
}

// Deletes a site and everything that belongs to it, in one transaction. The
// foreign-key tables follow `sites` by cascade; the tables with a bare
// `site_id` (SITE_SCOPED_TABLES) are cleared here. Indirect ownership is
// resolved before the parents disappear; disk cleanup runs after commit.
//
// The returned file references name the rows whose directories the caller has
// to remove. They carry the row ID, not a stored path: a build path that
// disagrees with its own row is not followed, so a corrupted row cannot make
// a delete reach another site's files.
async deleteSite(id: string): Promise<{ fileRefs: SiteFileRef[] }> {
  return this.#db.withTransaction(async (tx) => {
    const site = await tx.query<{ id: string }>(
      `SELECT id FROM sites WHERE id = $1 FOR UPDATE`, [id],
    );
    if (site.rows.length === 0) {
      throw new SenifyError("not_found", `Site "${id}" does not exist`, { field: "siteId" });
    }
    const releases = await tx.query<{ id: string; build_ref: string | null }>(
      `SELECT id, build_ref FROM releases WHERE site_id = $1`,
      [id],
    );
    const previews = await tx.query<{ id: string; build_ref: string | null }>(
      `SELECT id, build_ref FROM previews WHERE site_id = $1`,
      [id],
    );
    const reviews = await tx.query<{ id: string }>(`SELECT id FROM review_items WHERE site_id = $1`, [id]);
    // basis.source retains Site ownership even after the source Page was
    // deleted. The scalar lookup also covers older proposals without it.
    const proposals = await tx.query<{ id: string }>(
      `DELETE FROM redesign_proposals
       WHERE basis->'source'->>'siteId' = $1
          OR source_page_id IN (SELECT id FROM pages WHERE site_id = $1)
       RETURNING id`, [id],
    );
    for (const table of ["asset_history", "asset_variants", "asset_blurhash"]) {
      await tx.query(`DELETE FROM ${table} WHERE asset_id IN (SELECT id FROM assets WHERE site_id = $1)`, [id]);
    }
    await tx.query(`DELETE FROM sites WHERE id = $1`, [id]);
    for (const table of SITE_SCOPED_TABLES) {
      await tx.query(`DELETE FROM ${table} WHERE site_id = $1`, [id]);
    }
    const fileRefs: SiteFileRef[] = [];
    for (const [kind, rows] of [["releases", releases.rows], ["previews", previews.rows]] as const) {
      for (const row of rows) {
        fileRefs.push({
          kind,
          id: row.id,
          ...(row.build_ref ? { storedPath: row.build_ref } : {}),
        });
      }
    }
    fileRefs.push(...reviews.rows.map((row) => ({ kind: "reviews" as const, id: row.id })));
    fileRefs.push(...proposals.rows.map((row) => ({ kind: "redesign-proposals" as const, id: row.id })));
    return { fileRefs };
  });
}

async renameSite(id: string, name: string): Promise<Site> {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new SenifyError("validation", "Site name is required", {
      field: "name",
      suggestion: "Provide a non-empty site name.",
    });
  }
  const now = new Date().toISOString();
  const result = await this.#db.query<SiteRow>(
    `UPDATE sites SET name = $2, updated_at = $3 WHERE id = $1
     RETURNING id, name, slug, profile, theme_id, created_at, updated_at`,
    [id, trimmed, now],
  );
  const row = result.rows[0];
  if (!row) {
    throw new SenifyError("not_found", `Site "${id}" does not exist`, {
      field: "siteId",
    });
  }
  return mapSite(row);
}

// The site profile (ticket 21/20): same validation as `createSite`. The
// editor validates the document against the new profile before it asks for
// the change; the engine stays the authoritative gate.
async updateSiteProfile(id: string, profile: Site["profile"]): Promise<Site> {
  if (!SITE_PROFILES.includes(profile)) {
    throw new SenifyError("validation", `Unknown site profile "${profile}"`, {
      field: "profile",
      suggestion: `Choose one of: ${SITE_PROFILES.join(", ")}.`,
    });
  }
  const now = new Date().toISOString();
  const result = await this.#db.query<SiteRow>(
    `UPDATE sites SET profile = $2, updated_at = $3 WHERE id = $1
     RETURNING id, name, slug, profile, theme_id, created_at, updated_at`,
    [id, profile, now],
  );
  const row = result.rows[0];
  if (!row) {
    throw new SenifyError("not_found", `Site "${id}" does not exist`, {
      field: "siteId",
    });
  }
  return mapSite(row);
}

// The trash lives in its own table: the schema stays additive (no ALTERs)
// and listSites simply excludes trashed sites.
async trashSite(id: string): Promise<Site> {
  const site = await this.getSite(id);
  const existing = await this.#db.query<{ site_id: string }>(
    `SELECT site_id FROM site_trash WHERE site_id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    throw new SenifyError("conflict", `Site "${id}" is already in the trash`, {
      field: "siteId",
      suggestion: "Restore the site first.",
    });
  }
  await this.#db.query(
    `INSERT INTO site_trash (site_id, trashed_at) VALUES ($1, $2)`,
    [id, new Date().toISOString()],
  );
  return site;
}

async restoreSite(id: string): Promise<Site> {
  const result = await this.#db.query<{ site_id: string }>(
    `DELETE FROM site_trash WHERE site_id = $1 RETURNING site_id`,
    [id],
  );
  if (result.rows.length === 0) {
    throw new SenifyError("not_found", `Site "${id}" is not in the trash`, {
      field: "siteId",
    });
  }
  return this.getSite(id);
}

async listTrashedSites(): Promise<(Site & { trashedAt: string })[]> {
  const result = await this.#db.query<SiteRow & { trashed_at: unknown }>(
    `SELECT s.id, s.name, s.slug, s.profile, s.theme_id, s.created_at, s.updated_at, t.trashed_at
     FROM site_trash t JOIN sites s ON s.id = t.site_id
     ORDER BY t.trashed_at DESC, s.id ASC`,
  );
  return result.rows.map((row) => ({
    ...mapSite(row),
    trashedAt: toIso(row.trashed_at),
  }));
}

// Used by the atomic redesign compile (ADR-0014): the slug and the page path
// of a prepared copy have to be free before the transaction opens, because a
// unique violation inside a transaction cannot be retried.
async listSiteSlugs(): Promise<string[]> {
  const result = await this.#db.query<{ slug: string }>(`SELECT slug FROM sites`);
  return result.rows.map((row) => row.slug);
}

// Writes a prepared redesign plan in ONE transaction (ADR-0014): the
// duplicate, the theme, the seeded drafts, the audit trail and the proposal's
// final state. Nothing is read back and no branch is taken inside, because
// everything was decided by the compile. A crash therefore leaves neither a
// half-written site nor a proposal stuck in `applying`.

  // Die Pfade aller Seiten einer Site - gebraucht von der Redesign-Berechnung
  // (apply-redesign.ts), um neue Pfade kollisionsfrei zu waehlen. Die Abfrage
  // liegt beim Seiten-Modul; hier reicht das Modul sie durch, damit der Store
  // seine oeffentliche Flaeche behaelt.
  listPagePaths(siteId: string): Promise<string[]> {
    return this.#host.listPagePaths(siteId);
  }
}
