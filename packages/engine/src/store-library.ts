// Library of the Store (ADR 0019): the shared component library and the
// installations that link a component into a site. `Store` delegates here.
//
// The module owns both tables (`library_components`, `site_library_installs`)
// and the audit entries that describe them. What it does NOT own is the page
// and site: installing into a page writes a draft through the Store's
// `persistBatch`, and that transaction belongs to the page. The Store hands the
// four operations in as constructor functions, so this module never knows the
// `Store` (ADR 0019, point 3).
//
// The audit trail is written through `appendAudit` rather than directly: the
// library rows carry no site of their own, and the audit insert is shared with
// the page mutations. Two of these methods (install, detach) write a page draft
// AND an audit entry in one `persistBatch`, which is why the page path goes
// through the Store and not through this module.
import { SenifyError } from "@senify/core";
import type { Author, NodeTree } from "@senify/section-sdk";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import type { NewAuditEntry } from "./store-audit.ts";
import { slugify } from "./store-row-utils.ts";
import { assertDraftShape, toFiniteNumber, toIso, toJson, toJsonParam } from "./store-row-utils.ts";
import type {
  LibraryAuditEntry,
  LibraryComponent,
  LibraryInstall,
  LibraryLicense,
  LibraryProvenance,
  Page,
  PageSummary,
  Site,
} from "./types.ts";

export type LibraryCreateInput = {
  id: string;
  name: string;
  kind: LibraryComponent["kind"];
  definition: NodeTree;
  fingerprint: string;
  tags: string[];
  provenance: LibraryProvenance;
  license: LibraryLicense;
  notes: string;
  author: Author;
};

export type LibraryPatchInput = {
  id: string;
  name?: string;
  tags?: string[];
  notes?: string;
  license?: LibraryLicense;
  deprecated?: boolean;
  author: Author;
};

export type LibraryInstallInput = {
  id: string;
  siteId: string;
  componentId: string;
  mode: LibraryInstall["mode"];
  pageId?: string;
  parentNodeId?: string;
  author: Author;
};

type LibraryComponentRow = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  definition: unknown;
  fingerprint: string;
  tags: unknown;
  provenance: unknown;
  license: unknown;
  notes: string;
  version: unknown;
  deprecated_at: unknown;
  created_at: unknown;
  updated_at: unknown;
};

type LibraryInstallRow = {
  id: string;
  site_id: string;
  library_component_id: string;
  installed_version: unknown;
  mode: string;
  created_at: unknown;
  updated_at: unknown;
};

const LIBRARY_COLUMNS = "id, name, slug, kind, definition, fingerprint, tags, provenance, license, notes, version, deprecated_at, created_at, updated_at";
const LIBRARY_INSTALL_COLUMNS = "id, site_id, library_component_id, installed_version, mode, created_at, updated_at";

function mapLibraryComponent(row: LibraryComponentRow): LibraryComponent {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind as LibraryComponent["kind"],
    definition: toJson<NodeTree>(row.definition),
    fingerprint: row.fingerprint,
    tags: toJson<string[]>(row.tags),
    provenance: toJson<LibraryProvenance>(row.provenance),
    license: toJson<LibraryLicense>(row.license),
    notes: row.notes,
    version: toFiniteNumber(row.version, "version"),
    deprecatedAt: row.deprecated_at === null || row.deprecated_at === undefined ? null : toIso(row.deprecated_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapLibraryInstall(row: LibraryInstallRow): LibraryInstall {
  return {
    id: row.id,
    siteId: row.site_id,
    componentId: row.library_component_id,
    installedVersion: toFiniteNumber(row.installed_version, "installed_version"),
    mode: row.mode as LibraryInstall["mode"],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// What the module needs from the Store. Passed in, not imported: the page draft
// and the site belong to the Store, the library does not.
export type LibraryHost = {
  getSite(siteId: string): Promise<Site>;
  getPage(pageId: string): Promise<Page>;
  listPages(siteId: string): Promise<PageSummary[]>;
  persistBatch(input: {
    pageId: string;
    expectedVersion: number;
    draft: NodeTree;
    title: string;
    path: string;
    entries: NewAuditEntry[];
  }): Promise<number>;
  appendAudit(entries: NewAuditEntry[]): Promise<void>;
};

export class LibraryRepository {
  readonly #db: Db;
  readonly #host: LibraryHost;

  constructor(db: Db, host: LibraryHost) {
    this.#db = db;
    this.#host = host;
  }

  async listLibraryComponents(): Promise<LibraryComponent[]> {
    const result = await this.#db.query<LibraryComponentRow>(
      `SELECT ${LIBRARY_COLUMNS} FROM library_components ORDER BY updated_at DESC, id DESC`,
    );
    return result.rows.map(mapLibraryComponent);
  }

  async getLibraryComponent(id: string): Promise<LibraryComponent> {
    const result = await this.#db.query<LibraryComponentRow>(
      `SELECT ${LIBRARY_COLUMNS} FROM library_components WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Library component "${id}" does not exist`, {
        field: "componentId",
      });
    }
    return mapLibraryComponent(row);
  }

  async createLibraryComponent(input: LibraryCreateInput): Promise<LibraryComponent> {
    assertDraftShape(input.definition);
    const existing = await this.#db.query<LibraryComponentRow>(
      `SELECT ${LIBRARY_COLUMNS} FROM library_components WHERE fingerprint = $1`,
      [input.fingerprint],
    );
    if (existing.rows[0]) return mapLibraryComponent(existing.rows[0]);
    const now = new Date().toISOString();
    const result = await this.#db.query<LibraryComponentRow>(
      `INSERT INTO library_components
        (id, name, slug, kind, definition, fingerprint, tags, provenance, license, notes, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11, $11)
       RETURNING ${LIBRARY_COLUMNS}`,
      [
        input.id,
        input.name,
        slugify(input.name),
        input.kind,
        toJsonParam(input.definition),
        input.fingerprint,
        toJsonParam(input.tags),
        toJsonParam(input.provenance),
        toJsonParam(input.license),
        input.notes,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Library component insert returned no row");
    await this.#host.appendAudit([{
      siteId: "__library__",
      pageId: null,
      batchId: input.id,
      opIndex: 0,
      mutation: "library.component.created",
      params: { componentId: input.id, version: 1 },
      author: input.author,
      undoPatch: [],
      draftVersionAfter: 0,
    }]);
    return mapLibraryComponent(row);
  }

  async updateLibraryComponent(input: LibraryPatchInput): Promise<LibraryComponent> {
    const current = await this.getLibraryComponent(input.id);
    const now = new Date().toISOString();
    const result = await this.#db.query<LibraryComponentRow>(
      `UPDATE library_components SET
        name = $2, tags = $3, notes = $4, license = $5,
        version = version + 1, deprecated_at = $6, updated_at = $7
       WHERE id = $1 RETURNING ${LIBRARY_COLUMNS}`,
      [
        input.id,
        input.name ?? current.name,
        toJsonParam(input.tags ?? current.tags),
        input.notes ?? current.notes,
        toJsonParam(input.license ?? current.license),
        input.deprecated === true ? now : input.deprecated === false ? null : current.deprecatedAt,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new SenifyError("not_found", `Library component "${input.id}" does not exist`, { field: "componentId" });
    await this.#host.appendAudit([{
      siteId: "__library__", pageId: null, batchId: input.id, opIndex: 0,
      mutation: input.deprecated === true ? "library.component.deprecated" : "library.component.updated",
      params: { componentId: input.id, version: row.version },
      author: input.author, undoPatch: [], draftVersionAfter: 0,
    }]);
    return mapLibraryComponent(row);
  }

  async deleteLibraryComponent(id: string): Promise<LibraryComponent> {
    const component = await this.getLibraryComponent(id);
    const installs = await this.#db.query<{ id: string }>(
      `SELECT id FROM site_library_installs WHERE library_component_id = $1 LIMIT 1`,
      [id],
    );
    if (installs.rows.length > 0) {
      throw new SenifyError("conflict", "Library component is still installed", { field: "componentId" });
    }
    await this.#db.query(`DELETE FROM library_components WHERE id = $1`, [id]);
    return component;
  }

  async listLibraryInstalls(siteId: string): Promise<LibraryInstall[]> {
    await this.#host.getSite(siteId);
    const result = await this.#db.query<LibraryInstallRow>(
      `SELECT ${LIBRARY_INSTALL_COLUMNS} FROM site_library_installs WHERE site_id = $1 ORDER BY updated_at DESC, id DESC`,
      [siteId],
    );
    return result.rows.map(mapLibraryInstall);
  }

  async installLibraryComponent(input: LibraryInstallInput): Promise<LibraryInstall> {
    const site = await this.#host.getSite(input.siteId);
    const component = await this.getLibraryComponent(input.componentId);
    const now = new Date().toISOString();
    await this.#db.query(
      `INSERT INTO site_library_installs (id, site_id, library_component_id, installed_version, mode, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (site_id, library_component_id) DO UPDATE SET
         installed_version = EXCLUDED.installed_version, mode = EXCLUDED.mode, updated_at = EXCLUDED.updated_at`,
      [input.id, input.siteId, input.componentId, component.version, input.mode, now],
    );
    if (input.pageId !== undefined) {
      const page = await this.#host.getPage(input.pageId);
      if (page.siteId !== site.id) throw new SenifyError("validation", "Page belongs to another site", { field: "pageId" });
      const tree = structuredClone(page.draft) as NodeTree;
      const definitionRoot = component.definition.nodes[component.definition.rootNodeId];
      if (definitionRoot === undefined) throw new SenifyError("validation", "Library component has no root", { field: "definition" });
      const ids = new Map<string, string>();
      for (const id of Object.keys(component.definition.nodes)) ids.set(id, newEntityId());
      const definitionId = ids.get(component.definition.rootNodeId) as string;
      for (const [oldId, node] of Object.entries(component.definition.nodes)) {
        const nextId = ids.get(oldId) as string;
        const children = node.children?.map((id) => ids.get(id) as string);
        const slots = node.slots === undefined
          ? undefined
          : Object.fromEntries(Object.entries(node.slots).map(([slot, slotIds]) => [slot, slotIds.map((id) => ids.get(id) as string)]));
        tree.nodes[nextId] = { ...node, id: nextId, ...(children === undefined ? {} : { children }), ...(slots === undefined ? {} : { slots }), props: { ...node.props, name: component.name, version: component.version, libraryComponentId: component.id, libraryOrigin: "linked" } };
      }
      const instanceId = newEntityId();
      tree.nodes[instanceId] = { id: instanceId, type: "__component_instance", props: { componentId: definitionId, componentVersion: component.version, name: component.name, libraryComponentId: component.id, libraryOrigin: "linked" }, children: [] };
      const root = tree.nodes[tree.rootNodeId];
      if (root === undefined) throw new SenifyError("validation", "Page root is missing", { field: "pageId" });
      const parentId = input.parentNodeId ?? tree.rootNodeId;
      const parent = tree.nodes[parentId];
      if (parent === undefined) throw new SenifyError("not_found", `Target node "${parentId}" does not exist`, { field: "parentNodeId" });
      parent.children = [...(parent.children ?? []), definitionId, instanceId];
      const definitionNode = tree.nodes[definitionId];
      if (definitionNode !== undefined) {
        definitionNode.type = "__component";
        definitionNode.props = { ...definitionNode.props, name: component.name, version: component.version, libraryComponentId: component.id, libraryOrigin: "linked" };
      }
      const result = await this.#host.persistBatch({
        pageId: page.id, expectedVersion: page.draftVersion, draft: tree,
        title: page.title, path: page.path,
        entries: [{ siteId: site.id, pageId: page.id, batchId: input.id, opIndex: 0, mutation: "library.component.installed", params: { componentId: component.id, version: component.version }, author: input.author, undoPatch: [], draftVersionAfter: page.draftVersion + 1 }],
      });
      void result;
    }
    const row = (await this.#db.query<LibraryInstallRow>(`SELECT ${LIBRARY_INSTALL_COLUMNS} FROM site_library_installs WHERE site_id = $1 AND library_component_id = $2`, [input.siteId, input.componentId])).rows[0];
    if (!row) throw new Error("Library install insert returned no row");
    return mapLibraryInstall(row);
  }

  async updateLibraryInstall(id: string, author: Author): Promise<LibraryInstall> {
    const current = (await this.#db.query<LibraryInstallRow>(
      `SELECT ${LIBRARY_INSTALL_COLUMNS} FROM site_library_installs WHERE id = $1`,
      [id],
    )).rows[0];
    if (!current) throw new SenifyError("not_found", `Library install "${id}" does not exist`, { field: "installId" });
    const component = await this.getLibraryComponent(current.library_component_id);
    const result = await this.#db.query<LibraryInstallRow>(
      `UPDATE site_library_installs SET installed_version = $2, updated_at = $3 WHERE id = $1 RETURNING ${LIBRARY_INSTALL_COLUMNS}`,
      [id, component.version, new Date().toISOString()],
    );
    const row = result.rows[0];
    if (!row) throw new SenifyError("not_found", `Library install "${id}" does not exist`, { field: "installId" });
    await this.#host.appendAudit([{ siteId: row.site_id, pageId: null, batchId: id, opIndex: 0, mutation: "library.install.updated", params: { componentId: row.library_component_id, version: row.installed_version }, author, undoPatch: [], draftVersionAfter: 0 }]);
    return mapLibraryInstall(row);
  }

  async deleteLibraryInstall(id: string, author: Author): Promise<LibraryInstall> {
    const current = (await this.#db.query<LibraryInstallRow>(
      `SELECT ${LIBRARY_INSTALL_COLUMNS} FROM site_library_installs WHERE id = $1`,
      [id],
    )).rows[0];
    if (!current) throw new SenifyError("not_found", `Library install "${id}" does not exist`, { field: "installId" });
    const component = await this.getLibraryComponent(current.library_component_id);
    const pages = await this.#host.listPages(current.site_id);
    for (const summary of pages) {
      const page = await this.#host.getPage(summary.id);
      const tree = structuredClone(page.draft) as NodeTree;
      let changed = false;
      for (const node of Object.values(tree.nodes)) {
        if (node.type === "__component_instance" && node.props["libraryComponentId"] === component.id) {
          node.type = "__component";
          node.props = {
            ...node.props,
            name: component.name,
            version: component.version,
            libraryOrigin: "detached",
            libraryDetachedFrom: component.id,
          };
          delete node.props["componentId"];
          delete node.props["libraryComponentId"];
          changed = true;
        }
        if (node.type === "__component" && node.props["libraryComponentId"] === component.id) {
          node.props = {
            ...node.props,
            libraryOrigin: "detached",
            libraryDetachedFrom: component.id,
          };
          delete node.props["libraryComponentId"];
          changed = true;
        }
      }
      if (!changed) continue;
      await this.#host.persistBatch({
        pageId: page.id,
        expectedVersion: page.draftVersion,
        draft: tree,
        title: page.title,
        path: page.path,
        entries: [{
          siteId: page.siteId,
          pageId: page.id,
          batchId: id,
          opIndex: 0,
          mutation: "library.install.detached",
          params: { componentId: component.id, version: component.version },
          author,
          undoPatch: [],
          draftVersionAfter: page.draftVersion + 1,
        }],
      });
    }
    const result = await this.#db.query<LibraryInstallRow>(
      `DELETE FROM site_library_installs WHERE id = $1 RETURNING ${LIBRARY_INSTALL_COLUMNS}`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new SenifyError("not_found", `Library install "${id}" does not exist`, { field: "installId" });
    await this.#host.appendAudit([{ siteId: row.site_id, pageId: null, batchId: id, opIndex: 0, mutation: "library.install.detached", params: { componentId: row.library_component_id }, author, undoPatch: [], draftVersionAfter: 0 }]);
    return mapLibraryInstall(row);
  }

  async listLibraryAudit(): Promise<LibraryAuditEntry[]> {
    const result = await this.#db.query<{ mutation: string; params: unknown; author: unknown; site_id: string; created_at: unknown }>(
      `SELECT mutation, params, author, site_id, created_at FROM audit_entries WHERE mutation LIKE 'library.%' ORDER BY created_at DESC`,
    );
    return result.rows.map((row) => ({ componentId: String((toJson<Record<string, unknown>>(row.params) ?? {}).componentId ?? ""), siteId: row.site_id === "__library__" ? null : row.site_id, action: row.mutation.endsWith("created") ? "created" : row.mutation.endsWith("installed") ? "installed" : row.mutation.endsWith("detached") ? "detached" : row.mutation.endsWith("deprecated") ? "deprecated" : "updated", author: toJson<Author>(row.author), createdAt: toIso(row.created_at) }));
  }
}
