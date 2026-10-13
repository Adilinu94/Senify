// Page revisions of the Store (ADR 0019): immutable snapshots of a page's tree, title and path. `Store` delegates here.
import { SenifyError } from "@senify/core";
import type { Author, NodeTree } from "@senify/section-sdk";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import { assertDraftShape, toIso, toJson, toJsonParam } from "./store-row-utils.ts";
import type { PageRevision, RevisionSummary } from "./types.ts";

type RevisionRow = {
  id: string;
  page_id: string;
  site_id: string;
  tree: unknown;
  title: string;
  path: string;
  author: unknown;
  note: unknown;
  created_at: unknown;
};

function mapRevision(row: RevisionRow): PageRevision {
  const tree = toJson<unknown>(row.tree);
  assertDraftShape(tree);
  return {
    id: row.id,
    pageId: row.page_id,
    siteId: row.site_id,
    title: row.title,
    path: row.path,
    tree,
    author: toJson<Author>(row.author),
    note: typeof row.note === "string" ? row.note : null,
    createdAt: toIso(row.created_at),
  };
}

function toRevisionSummary(revision: PageRevision): RevisionSummary {
  const { tree, ...rest } = revision;
  return { ...rest, nodeCount: Object.keys(tree.nodes).length };
}

export type CreateRevisionInput = {
  pageId: string;
  siteId: string;
  title: string;
  path: string;
  tree: NodeTree;
  author: Author;
  note: string | null;
};

export class RevisionsRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async createRevision(input: CreateRevisionInput): Promise<PageRevision> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    await this.#db.query(
      `INSERT INTO page_revisions
        (id, page_id, site_id, tree, title, path, author, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.pageId,
        input.siteId,
        toJsonParam(input.tree),
        input.title,
        input.path,
        toJsonParam(input.author),
        input.note,
        createdAt,
      ],
    );
    return {
      id,
      pageId: input.pageId,
      siteId: input.siteId,
      title: input.title,
      path: input.path,
      tree: input.tree,
      author: input.author,
      note: input.note,
      createdAt,
    };
  }

  async getRevision(id: string): Promise<PageRevision> {
    const result = await this.#db.query<RevisionRow>(
      `SELECT id, page_id, site_id, tree, title, path, author, note, created_at
       FROM page_revisions WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Revision "${id}" does not exist`, {
        field: "revisionId",
      });
    }
    return mapRevision(row);
  }

  async listRevisions(pageId: string, limit = 50): Promise<RevisionSummary[]> {
    const result = await this.#db.query<RevisionRow>(
      `SELECT id, page_id, site_id, tree, title, path, author, note, created_at
       FROM page_revisions WHERE page_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [pageId, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapRevision).map(toRevisionSummary);
  }
}
