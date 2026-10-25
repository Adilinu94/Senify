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
import { mergeLibraryDefinition } from "./store-library-definition.ts";
import { definitionFingerprint, definitionSimilarity } from "./store-library-similarity.ts";
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
  // Die Definition des Eintrags. Eine Aenderung hier erhoeht die Version -
  // die Version zaehlt Definitionen, nicht Metadaten (Plan §5.1, Schritt 4:
  // "Definition aendern = Version erhoehen. Instanzen bleiben auf ihrem Pin").
  definition?: NodeTree;
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

// Re-Attach: eine geloeste Installation wieder an die Bibliothek haengen.
// Das Detach merkt sich die Herkunft (`libraryDetachedFrom`), damit die
// Rueckrichtung moeglich ist - der Plan nennt das ausdruecklich ("ein Detach
// merkt sich seine Herkunft, Re-Attach ist moeglich"). Ohne diesen Schritt
// waere eine Detach-Installation eine Einbahnstrasse.
export type LibraryReattachInput = {
  id: string;
  siteId: string;
  componentId: string;
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

// ADR-0010 §4, enforced: a component that came out of a Framer import may only
// enter the global library when its licence is stated. The default of a create
// is `{ id: "unknown", status: "unknown" }` — without this rule every promoted
// import travelled into every project unchecked.
//
// The rule names the *imported* case on purpose: a hand-built component has no
// third-party licence to check, and a site-local payload may stay `unknown`
// (the page belongs to that site). The library is what spreads code.
export function assertLicensedForLibrary(
  license: LibraryLicense,
  provenance: LibraryProvenance,
): void {
  if (provenance.kind !== "framer-import") return;
  const unknown = license.status !== "verified" || license.id.trim().toLowerCase() === "unknown";
  if (!unknown) return;
  throw new SenifyError(
    "validation",
    `Baustein aus einem Framer-Import ohne geprüfte Lizenz ("${license.id}") darf nicht in die Bibliothek`,
    {
      field: "license",
      suggestion:
        "Lizenz des Bausteins prüfen und mit status: \"verified\" und einer id (z. B. \"MIT\") angeben; ohne Nachweis bleibt der Baustein auf seiner Seite.",
    },
  );
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

// Aehnliche Bausteine: zwei Eintraege, deren Definitionen sich strukturell
// naheliegen. Der Hinweis ersetzt kein Urteil - wer zusammenlegt, entscheidet
// das (Plan §5.3: "Aehnlichkeit statt Gleichheit").
export type LibrarySimilarity = {
  component: LibraryComponent;
  similarTo: LibraryComponent;
  similarity: number;
  // Der Grund, warum die beiden nicht gleich sind: gleiche Struktur mit
  // anderem Fingerabdruck (der Fingerabdruck ist ueber den Import berechnet
  // und kann abweichen) - oder ein echter Strukturunterschied.
  reason: "structure" | "fingerprint";
};

// Die Schwelle, ab der zwei Bausteine als aehnlich gelten. Sie ist aus dem
// Plan uebernommen (85 %): unterhalb davon ist es ein anderer Baustein.
export const LIBRARY_SIMILARITY_THRESHOLD = 85;

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
    // ADR-0010 §4: a payload with an unchecked licence must not be lifted into
    // the global library — that is how foreign code with no rights would travel
    // into every project. The library is the only place that spreads a
    // component across sites, so the rule sits here and not in the payload
    // store (a site may run a payload whose licence is still unknown: the page
    // is the site's own responsibility, the library is not).
    assertLicensedForLibrary(input.license, input.provenance);
    const existing = await this.#db.query<LibraryComponentRow>(
      `SELECT ${LIBRARY_COLUMNS} FROM library_components WHERE fingerprint = $1`,
      [input.fingerprint],
    );
    if (existing.rows[0]) return mapLibraryComponent(existing.rows[0]);
    // Der Slug ist eindeutig. Zwei gleichnamige Bausteine sind aber ein
    // moeglicher Fall - zwei Karten aus verschiedenen Quellen heissen oft
    // gleich. Der Slug bekommt deshalb ein Suffix, statt dass die Anlage an
    // der Datenbank scheitert (ohne diese Aufloesung war das ein 500er ohne
    // erklaerbare Ursache).
    const slug = await this.#freeSlug(input.name);
    const now = new Date().toISOString();
    const result = await this.#db.query<LibraryComponentRow>(
      `INSERT INTO library_components
        (id, name, slug, kind, definition, fingerprint, tags, provenance, license, notes, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11, $11)
       RETURNING ${LIBRARY_COLUMNS}`,
      [
        input.id,
        input.name,
        slug,
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

  // Ein freier Slug fuer einen Bausteinnamen. Der Slug ist eindeutig
  // (`library_components.slug`); ein zweiter Baustein mit demselben Namen
  // bekommt deshalb "-2", "-3" und so weiter. Ohne diese Aufloesung scheiterte
  // die Anlage mit einem 500er, ohne dass die Ursache erkennbar war.
  async #freeSlug(name: string): Promise<string> {
    const basis = slugify(name);
    for (let nummer = 1; ; nummer += 1) {
      const kandidat = nummer === 1 ? basis : `${basis}-${nummer}`;
      const belegt = await this.#db.query<{ id: string }>(
        `SELECT id FROM library_components WHERE slug = $1`,
        [kandidat],
      );
      if (belegt.rows.length === 0) return kandidat;
    }
  }

  async updateLibraryComponent(input: LibraryPatchInput): Promise<LibraryComponent> {
    const current = await this.getLibraryComponent(input.id);
    const now = new Date().toISOString();
    // Die Version zaehlt die Definitionen. Ein umbenannter Baustein ist nicht
    // eine neue Definition - sonst wuerde jede Metadaten-Aenderung an allen
    // installierten Seiten einen Drift erzeugen, den es inhaltlich nicht gibt
    // (Plan §5.1, Schritt 4: "Definition aendern = Version erhoehen. Instanzen
    // bleiben auf ihrem Pin").
    const definitionChanged = input.definition !== undefined;
    if (input.definition !== undefined) {
      assertDraftShape(input.definition);
      // Der Fingerabdruck gehoert zum Inhalt: mit der Definition aendert er
      // sich. Sonst wuerde der Dubletten-Schluessel zwei verschiedene
      // Definitionen als dieselbe ausgeben.
      const fingerprint = definitionFingerprint(input.definition);
      const doppelt = await this.#db.query<{ id: string }>(
        `SELECT id FROM library_components WHERE fingerprint = $1 AND id <> $2`,
        [fingerprint, input.id],
      );
      if (doppelt.rows.length > 0) {
        throw new SenifyError("conflict", "A library component with this definition already exists", { field: "definition" });
      }
    }
    const neueDefinition = input.definition;
    const neueFingerprint = neueDefinition === undefined ? current.fingerprint : definitionFingerprint(neueDefinition);
    const result = await this.#db.query<LibraryComponentRow>(
      `UPDATE library_components SET
        name = $2, tags = $3, notes = $4, license = $5,
        definition = $8, fingerprint = $9,
        version = version + $6, deprecated_at = $7, updated_at = $10
       WHERE id = $1 RETURNING ${LIBRARY_COLUMNS}`,
      [
        input.id,
        input.name ?? current.name,
        toJsonParam(input.tags ?? current.tags),
        input.notes ?? current.notes,
        toJsonParam(input.license ?? current.license),
        definitionChanged ? 1 : 0,
        input.deprecated === true ? now : input.deprecated === false ? null : current.deprecatedAt,
        definitionChanged ? toJsonParam(neueDefinition) : toJsonParam(current.definition),
        neueFingerprint,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new SenifyError("not_found", `Library component "${input.id}" does not exist`, { field: "componentId" });
    await this.#host.appendAudit([{
      siteId: "__library__", pageId: null, batchId: input.id, opIndex: 0,
      mutation: input.deprecated === true ? "library.component.deprecated" : definitionChanged ? "library.component.definition.updated" : "library.component.updated",
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

  // Das Update einer Installation: der Pin wandert auf die aktuelle Version der
  // Bibliothek, UND die Seite zieht den neuen Inhalt nach.
  //
  // Vorher stand hier nur der Pin: die Seite behielt ihre alte Definition, und
  // das Update war ein Schreibvorgang ohne Wirkung auf das, was die Seite zeigt.
  // Der Plan sagt (Schritt 4): "update_instances zieht sie in EINEM Schritt
  // nach (ein Undo)" - der Schritt ist ein Batch je Seite, mit einem Audit.
  async updateLibraryInstall(id: string, author: Author): Promise<LibraryInstall> {
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
      let dropped = 0;
      // Jede Definition im Draft, die zu dieser Bibliothek gehoert, wird auf
      // den neuen Inhalt gebracht. Eine Seite kann denselben Baustein in
      // mehreren Definitionen fuehren (z. B. zwei Instanzen in zwei
      // Teilbaeumen) - darum ueber alle Definitionen der Seite.
      for (const node of Object.values(tree.nodes)) {
        if (node.type !== "__component") continue;
        if (node.props["libraryComponentId"] !== component.id) continue;
        const merged = mergeLibraryDefinition(tree, node.id, component.definition, {
          version: component.version,
          name: component.name,
          libraryComponentId: component.id,
          origin: current.mode === "copied" ? "copied" : "linked",
          newId: newEntityId,
        });
        changed = changed || merged.changed;
        dropped += merged.droppedPartIds.length;
        // Die Instanzen dieser Definition ziehen ihren Pin nach.
        for (const instanz of Object.values(tree.nodes)) {
          if (instanz.type !== "__component_instance") continue;
          if (instanz.props["componentId"] !== node.id) continue;
          instanz.props = { ...instanz.props, componentVersion: component.version };
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
          mutation: "library.install.updated",
          params: { componentId: component.id, version: component.version },
          author,
          undoPatch: [],
          draftVersionAfter: page.draftVersion + 1,
        }],
      });
      void dropped;
    }
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
        // Die Instanz bleibt eine Instanz und die Definition bleibt die
        // Definition - nur die Bindung an die Bibliothek loest sich. Wuerde die
        // Instanz hier zur Definition umgewandelt, waere sie eine Definition
        // OHNE Instanz: der Inliner laesst sie fallen (er expandiert nur
        // Instanzen), und der Baustein verschwaende aus der gerenderten Seite.
        // Ein Detach ist ein Losloesen, kein Wegwerf.
        if (node.type === "__component_instance" && node.props["libraryComponentId"] === component.id) {
          node.props = {
            ...node.props,
            name: component.name,
            version: component.version,
            libraryOrigin: "detached",
            libraryDetachedFrom: component.id,
          };
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

  // Aehnliche Bausteine finden (Plan §5.3). Rein lesend: die Liste ist ein
  // Hinweis, das Zusammenlegen bleibt eine Entscheidung des Menschen.
  //
  // Der Vergleich laeuft ueber die Paare aller Eintraege - quadratisch, aber
  // die Bibliothek ist eine Handvoll Eintraege, und ein Index ueber die
  // Aehnlichkeit waere eine zweite Wahrheit, die der Fingerabdruck bereits
  // abdeckt.
  async findSimilarLibraryComponents(threshold = LIBRARY_SIMILARITY_THRESHOLD): Promise<LibrarySimilarity[]> {
    const all = await this.listLibraryComponents();
    const found: LibrarySimilarity[] = [];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const left = all[i] as LibraryComponent;
        const right = all[j] as LibraryComponent;
        const similarity = definitionSimilarity(left.definition, right.definition);
        if (similarity < threshold) continue;
        found.push({
          component: left,
          similarTo: right,
          similarity,
          // Gleicher Fingerabdruck bei aehnlicher Struktur heisst: der Import
          // hat ihn aus einer anderen Quelle berechnet. Sonst ist es ein
          // echter Strukturunterschied.
          reason: left.fingerprint === right.fingerprint ? "fingerprint" : "structure",
        });
      }
    }
    found.sort((a, b) => b.similarity - a.similarity || a.component.name.localeCompare(b.component.name));
    return found;
  }

  // Re-Attach: eine geloeste Installation wieder an die Bibliothek haengen.
  //
  // Das Gegenstueck zum Detach. Die geloesten Knoten tragen ihre Herkunft in
  // `libraryDetachedFrom` - ohne sie waere die Rueckrichtung nicht moeglich.
  // Der Baustein wird dabei nicht neu kopiert: die lokalen Knoten bleiben
  // stehen (ihre Ueberschreibungen bleiben erhalten), nur die Bindung an die
  // Bibliothek kommt zurueck. Die Definition im Draft bekommt die aktuelle
  // Version der Bibliothek - der Pin wandert mit.
  async reattachLibraryComponent(input: LibraryReattachInput): Promise<LibraryInstall> {
    const site = await this.#host.getSite(input.siteId);
    const component = await this.getLibraryComponent(input.componentId);
    const now = new Date().toISOString();
    const pages = await this.#host.listPages(input.siteId);
    let gebundeneInstanzen = 0;
    for (const summary of pages) {
      const page = await this.#host.getPage(summary.id);
      const tree = structuredClone(page.draft) as NodeTree;
      let changed = false;
      for (const node of Object.values(tree.nodes)) {
        if (node.props["libraryDetachedFrom"] !== component.id) continue;
        if (node.type !== "__component_instance" && node.type !== "__component") continue;
        node.props = {
          ...node.props,
          libraryComponentId: component.id,
          libraryOrigin: "linked",
          version: component.version,
          componentVersion: component.version,
        };
        delete node.props["libraryDetachedFrom"];
        changed = true;
        if (node.type === "__component_instance") gebundeneInstanzen += 1;
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
          batchId: input.id,
          opIndex: 0,
          mutation: "library.install.reattached",
          params: { componentId: component.id, version: component.version },
          author: input.author,
          undoPatch: [],
          draftVersionAfter: page.draftVersion + 1,
        }],
      });
    }
    // Die Installationszeile kommt zurueck: ohne sie waere der Baustein an der
    // Bibliothek vorbei (und dernaechste Update-Lauf wuerde sie nicht finden).
    await this.#db.query(
      `INSERT INTO site_library_installs (id, site_id, library_component_id, installed_version, mode, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'linked', $5, $5)
       ON CONFLICT (site_id, library_component_id) DO UPDATE SET
         installed_version = EXCLUDED.installed_version, updated_at = EXCLUDED.updated_at`,
      [input.id, input.siteId, component.id, component.version, now],
    );
    await this.#host.appendAudit([{
      siteId: input.siteId,
      pageId: null,
      batchId: input.id,
      opIndex: 0,
      mutation: "library.install.reattached",
      params: { componentId: component.id, version: component.version, instances: gebundeneInstanzen },
      author: input.author,
      undoPatch: [],
      draftVersionAfter: 0,
    }]);
    const row = (await this.#db.query<LibraryInstallRow>(
      `SELECT ${LIBRARY_INSTALL_COLUMNS} FROM site_library_installs WHERE site_id = $1 AND library_component_id = $2`,
      [input.siteId, component.id],
    )).rows[0];
    if (!row) throw new Error("Library reattach insert returned no row");
    void site;
    return mapLibraryInstall(row);
  }

  async listLibraryAudit(): Promise<LibraryAuditEntry[]> {
    const result = await this.#db.query<{ mutation: string; params: unknown; author: unknown; site_id: string; created_at: unknown }>(
      `SELECT mutation, params, author, site_id, created_at FROM audit_entries WHERE mutation LIKE 'library.%' ORDER BY created_at DESC`,
    );
    // Die Reihenfolge der Pruefungen ist bedeutsam: "reattached" endet auf
    // "attached", nicht auf "detached" - aber ein zukuenftiger Schritt mit
    // aehnlichem Ende braucht eine eigene Pruefung VOR den allgemeinen.
    return result.rows.map((row) => ({ componentId: String((toJson<Record<string, unknown>>(row.params) ?? {}).componentId ?? ""), siteId: row.site_id === "__library__" ? null : row.site_id, action: row.mutation.endsWith("created") ? "created" : row.mutation.endsWith("installed") ? "installed" : row.mutation.endsWith("reattached") ? "reattached" : row.mutation.endsWith("detached") ? "detached" : row.mutation.endsWith("deprecated") ? "deprecated" : "updated", author: toJson<Author>(row.author), createdAt: toIso(row.created_at) }));
  }
}
