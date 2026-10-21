// Die Seiten des Stores (ADR-0019): anlegen, lesen, aendern, loeschen, ihre
// Vorlage setzen und ihren Entwurf schreiben. `Store` delegiert hier.
//
// Was das Modul besitzt: die Tabelle `pages` und `page_templates`, die
// Entwuerfe mit ihrer Versionspruefung, die Pfadpruefung und das Audit-Log der
// Seite (seiteweit und siteweit).
//
// Was es NICHT besitzt: die Site. Jede Operation, die eine Site voraussetzt,
// fragt sie deshalb beim Store ab - wie das Deploy-Modul die Existenzpruefung
// bekommt (ADR-0019, Punkt 3 und 6). Nur `createPage` und `assertSite` gehen
// ueber diese Naht; alles andere rechnet mit der Seite.
//
// Der Seiten-Entwurf ist der zentrale Schreibpfad der Anwendung: Editor,
// Import, Redesign, Undo und die Bibliothek schreiben alle durch
// `persistBatch`. Er bleibt deshalb genau eine Transaktion (ADR-0019, Punkt 4):
// Entwurf schreiben, Version pruefen, Audit-Eintraege mit der neuen Version
// stempeln - alles oder nichts.
import { SenifyError } from "@senify/core";
import { PAGE_ROOT_TYPE, type Author, type NodeTree } from "@senify/section-sdk";
import type { Db } from "./db.ts";
import { newEntityId, newNodeId } from "./ids.ts";
import { assertPagePathFormat, draftConflictError } from "./paths.ts";
import { buildAuditInsert, type NewAuditEntry } from "./store-audit.ts";
import {
  PAGE_COLUMNS,
  PAGE_SUMMARY_COLUMNS,
  type PageRow,
  type PageSummaryRow,
  mapPage,
  toSummary,
} from "./store-page-mappers.ts";
import { isUniqueViolation, slugify, toFiniteNumber, toIso, toJson, toJsonParam } from "./store-row-utils.ts";
import type {
  AuditEntry,
  Page,
  PageSummary,
  PageTemplate,
  Site,
} from "./types.ts";

export type CreatePageInput = {
  title?: string;
  path?: string;
};

type AuditRow = {
  id: string;
  site_id: string;
  page_id: unknown;
  batch_id: string;
  op_index: unknown;
  mutation: string;
  params: unknown;
  author: unknown;
  undo_patch: unknown;
  draft_version_after: unknown;
  created_at: unknown;
};

// Was das Modul vom Store braucht: die Site. Sonst nichts - die Seite gehoert
// ihm, und der Store reicht nur durch.
export type PagesHost = {
  getSite(siteId: string): Promise<Site>;
};

export class PagesRepository {
  readonly #db: Db;
  readonly #host: PagesHost;

  constructor(db: Db, host: PagesHost) {
    this.#db = db;
    this.#host = host;
  }

  async listPages(siteId: string): Promise<PageSummary[]> {
    await this.#host.getSite(siteId);
    const result = await this.#db.query<PageSummaryRow>(
      `SELECT ${PAGE_SUMMARY_COLUMNS}
       FROM pages p LEFT JOIN page_templates pt ON pt.page_id = p.id
       WHERE p.site_id = $1 ORDER BY p.created_at ASC, p.id ASC`,
      [siteId],
    );
    return result.rows.map((row) => toSummary(row));
  }

  async listPageDrafts(siteId: string): Promise<Page[]> {
    await this.#host.getSite(siteId);
    const result = await this.#db.query<PageRow>(
      `SELECT ${PAGE_COLUMNS}
       FROM pages p LEFT JOIN page_templates pt ON pt.page_id = p.id
       WHERE p.site_id = $1 ORDER BY p.created_at ASC, p.id ASC`,
      [siteId],
    );
    return result.rows.map((row) => mapPage(row));
  }

  async getPage(id: string): Promise<Page> {
    const result = await this.#db.query<PageRow>(
      `SELECT ${PAGE_COLUMNS}
       FROM pages p LEFT JOIN page_templates pt ON pt.page_id = p.id
       WHERE p.id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Page "${id}" does not exist`, {
        field: "pageId",
        suggestion: "Create the page first or check the id.",
      });
    }
    return mapPage(row);
  }

  async createPage(siteId: string, input: CreatePageInput): Promise<Page> {
    await this.#host.getSite(siteId);
    const title = input.title?.trim() ? input.title.trim() : "Neue Seite";
    const now = new Date().toISOString();
    const id = newEntityId();
    const rootId = newNodeId();
    const draft: NodeTree = {
      rootNodeId: rootId,
      nodes: { [rootId]: { id: rootId, type: PAGE_ROOT_TYPE, props: {} } },
    };

    if (input.path !== undefined) {
      const path = input.path.trim();
      assertPagePathFormat(path);
      try {
        return await this.#insertPage(id, siteId, path, title, draft, now);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new SenifyError(
            "conflict",
            `Page path "${path}" is already in use on this site`,
            {
              field: "path",
              suggestion: "Choose a different page path.",
            },
          );
        }
        throw error;
      }
    }
    const existing = await this.#pageCount(siteId);
    // TOCTOU note: two concurrent first-page creates can both read 0 and
    // race for "/". The UNIQUE(site_id, path) constraint decides; the loser
    // retries through the suffix loop below instead of failing.
    if (existing === 0) {
      try {
        return await this.#insertPage(id, siteId, "/", title, draft, now);
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Lost the race for "/" — fall through to suffix generation below.
        } else {
          throw error;
        }
      }
    }
    const base = slugify(title);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const path = attempt === 0 ? `/${base}` : `/${base}-${attempt + 1}`;
      try {
        return await this.#insertPage(id, siteId, path, title, draft, now);
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }
    throw new SenifyError("conflict", `Page path "/${base}" is already in use`, {
      field: "path",
      suggestion: "Choose a different page path.",
    });
  }

  async #pageCount(siteId: string): Promise<number> {
    const result = await this.#db.query<{ count: unknown }>(
      `SELECT COUNT(*) AS count FROM pages WHERE site_id = $1`,
      [siteId],
    );
    return toFiniteNumber(result.rows[0]?.count ?? 0, "count");
  }

  async #insertPage(
    id: string,
    siteId: string,
    path: string,
    title: string,
    draft: NodeTree,
    now: string,
  ): Promise<Page> {
    const result = await this.#db.query<PageRow>(
      `INSERT INTO pages (id, site_id, path, title, meta, draft, draft_version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $7)
       RETURNING id, site_id, path, title, meta, draft, draft_version, created_at, updated_at`,
      [id, siteId, path, title, toJsonParam({}), toJsonParam(draft), now],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Page insert returned no row");
    return mapPage(row);
  }

  // Upsert of the template/layout row (the page itself is never touched).
  async setPageTemplate(input: {
    pageId: string;
    template: PageTemplate | null;
    layoutId: string | null;
  }): Promise<Page> {
    const now = new Date().toISOString();
    const kind = input.template?.kind ?? null;
    const collectionIds =
      input.template?.kind === "collection" ? input.template.collectionIds : [];
    const priority = input.template?.kind === "collection" ? input.template.priority : 0;
    await this.#db.query(
      `INSERT INTO page_templates
        (page_id, kind, collection_ids, priority, layout_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (page_id) DO UPDATE SET
         kind = EXCLUDED.kind,
         collection_ids = EXCLUDED.collection_ids,
         priority = EXCLUDED.priority,
         layout_id = EXCLUDED.layout_id,
         updated_at = EXCLUDED.updated_at`,
      [
        input.pageId,
        kind,
        toJsonParam(collectionIds),
        priority,
        input.layoutId,
        now,
      ],
    );
    return this.getPage(input.pageId);
  }

  async deletePage(id: string): Promise<void> {
    const result = await this.#db.query<{ id: string }>(
      `DELETE FROM pages WHERE id = $1 RETURNING id`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("not_found", `Page "${id}" does not exist`, {
        field: "pageId",
      });
    }
  }

  async updatePage(
    id: string,
    expectedVersion: number,
    changes: { draft: NodeTree; title: string; path: string },
  ): Promise<number> {
    assertPagePathFormat(changes.path);
    try {
      const result = await this.#db.query<{ draft_version: unknown }>(
        `UPDATE pages
         SET draft = $2, title = $3, path = $4, draft_version = draft_version + 1, updated_at = $5
         WHERE id = $1 AND draft_version = $6
         RETURNING draft_version`,
        [id, toJsonParam(changes.draft), changes.title, changes.path, new Date().toISOString(), expectedVersion],
      );
      const row = result.rows[0];
      if (!row) {
        const current = await this.#db.query<{ draft_version: unknown }>(
          `SELECT draft_version FROM pages WHERE id = $1`,
          [id],
        );
        const currentRow = current.rows[0];
        if (!currentRow) {
          throw new SenifyError("not_found", `Page "${id}" does not exist`, {
            field: "pageId",
          });
        }
        throw draftConflictError(
          expectedVersion,
          toFiniteNumber(currentRow.draft_version, "draft_version"),
        );
      }
      return Number(row.draft_version);
    } catch (error) {
      if (error instanceof SenifyError) throw error;
      if (isUniqueViolation(error)) {
        throw new SenifyError(
          "conflict",
          `Page path "${changes.path}" is already in use on this site`,
          {
            field: "path",
            suggestion: "Choose a different page path.",
          },
        );
      }
      throw error;
    }
  }

  async assertPathFree(
    siteId: string,
    pageId: string,
    path: string,
  ): Promise<void> {
    assertPagePathFormat(path);
    const result = await this.#db.query<{ id: string }>(
      `SELECT id FROM pages WHERE site_id = $1 AND path = $2 AND id <> $3`,
      [siteId, path, pageId],
    );
    if (result.rows.length > 0) {
      throw new SenifyError(
        "conflict",
        `Page path "${path}" is already in use on this site`,
        {
          field: "path",
          suggestion: "Choose a different page path.",
        },
      );
    }
  }

  async persistBatch(input: {
    pageId: string;
    expectedVersion: number;
    draft: NodeTree;
    title: string;
    path: string;
    entries: NewAuditEntry[];
  }): Promise<number> {
    assertPagePathFormat(input.path);
    try {
      return await this.#db.withTransaction(async (tx) => {
        const updated = await tx.query<{ draft_version: unknown }>(
          `UPDATE pages
           SET draft = $2, title = $3, path = $4, draft_version = draft_version + 1, updated_at = $5
           WHERE id = $1 AND draft_version = $6
           RETURNING draft_version`,
          [
            input.pageId,
            toJsonParam(input.draft),
            input.title,
            input.path,
            new Date().toISOString(),
            input.expectedVersion,
          ],
        );
        const row = updated.rows[0];
        if (!row) {
          const current = await tx.query<{ draft_version: unknown }>(
            `SELECT draft_version FROM pages WHERE id = $1`,
            [input.pageId],
          );
          const currentRow = current.rows[0];
          if (!currentRow) {
            throw new SenifyError("not_found", `Page "${input.pageId}" does not exist`, {
              field: "pageId",
            });
          }
          throw draftConflictError(
            input.expectedVersion,
            toFiniteNumber(currentRow.draft_version, "draft_version"),
          );
        }
        if (input.entries.length > 0) {
          const stamped = input.entries.map((entry) => ({
            ...entry,
            draftVersionAfter: toFiniteNumber(row.draft_version, "draft_version"),
          }));
          const { text, params } = buildAuditInsert(stamped);
          await tx.query(text, params);
        }
        return toFiniteNumber(row.draft_version, "draft_version");
      });
    } catch (error) {
      if (error instanceof SenifyError) throw error;
      if (isUniqueViolation(error)) {
        throw new SenifyError(
          "conflict",
          `Page path "${input.path}" is already in use on this site`,
          {
            field: "path",
            suggestion: "Choose a different page path.",
          },
        );
      }
      throw error;
    }
  }

  async appendAudit(entries: NewAuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const { text, params } = buildAuditInsert(entries);
    await this.#db.query(text, params);
  }

  async listAudit(pageId: string, limit = 50): Promise<AuditEntry[]> {
    const result = await this.#db.query<AuditRow>(
      `SELECT id, site_id, page_id, batch_id, op_index, mutation, params, author, undo_patch, draft_version_after, created_at
       FROM audit_entries WHERE page_id = $1
       ORDER BY created_at DESC, op_index DESC, id DESC LIMIT $2`,
      [pageId, Math.max(1, Math.min(500, limit))],
    );
    return result.rows.map(mapAudit);
  }

  async listSiteAudit(siteId: string, limit = 50): Promise<AuditEntry[]> {
    const result = await this.#db.query<AuditRow>(
      `SELECT id, site_id, page_id, batch_id, op_index, mutation, params, author, undo_patch, draft_version_after, created_at
       FROM audit_entries WHERE site_id = $1
       ORDER BY created_at DESC, op_index DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(500, limit))],
    );
    return result.rows.map(mapAudit);
  }
}

// The audit row is read by the page module only; it maps the same way the
// Store's own copy did.
function mapAudit(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    siteId: row.site_id,
    pageId: typeof row.page_id === "string" ? row.page_id : null,
    batchId: row.batch_id,
    opIndex: toFiniteNumber(row.op_index, "op_index"),
    mutation: row.mutation,
    params: toJson<Record<string, unknown>>(row.params),
    author: toJson<Author>(row.author),
    undoPatch: toJson<AuditEntry["undoPatch"]>(row.undo_patch),
    draftVersionAfter: toFiniteNumber(row.draft_version_after, "draft_version_after"),
    createdAt: toIso(row.created_at),
  };
}
