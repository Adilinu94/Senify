import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import { LibraryRepository, type LibraryHost } from "../src/store-library.ts";
import { createTestDatabase, TEST_AUTHOR } from "./helpers.ts";

// ADR 0019: the library lives in `LibraryRepository`; `Store` only delegates.
//
// The interesting part of this cut is the seam: the module owns the two library
// tables, but the page, the site and the draft write belong to the Store. These
// cases drive the module directly, with a host that records what crosses the
// seam - a module that reached for the Store itself would not compile against
// this host.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

type Rufe = { art: string; argumente: unknown };

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  const store = new Store(database.db);

  const rufe: Rufe[] = [];
  const host: LibraryHost = {
    getSite: async (siteId) => {
      rufe.push({ art: "getSite", argumente: siteId });
      return store.getSite(siteId);
    },
    getPage: async (pageId) => {
      rufe.push({ art: "getPage", argumente: pageId });
      return store.getPage(pageId);
    },
    listPages: async (siteId) => {
      rufe.push({ art: "listPages", argumente: siteId });
      return store.listPages(siteId);
    },
    persistBatch: async (input) => {
      rufe.push({ art: "persistBatch", argumente: input.pageId });
      return store.persistBatch(input);
    },
    appendAudit: async (entries) => {
      rufe.push({ art: "appendAudit", argumente: entries.map((entry) => entry.mutation) });
      return store.appendAudit(entries);
    },
  };

  const repo = new LibraryRepository(database.db, host);
  return { db: database.db, store, repo, rufe };
}

const definition = {
  rootNodeId: "root00001",
  nodes: {
    root00001: {
      id: "root00001",
      type: "section",
      props: {},
      children: ["card00001"],
    },
    card00001: {
      id: "card00001",
      type: "card",
      props: { headline: "Aus der Bibliothek" },
    },
  },
};

async function componentFactory(repo: LibraryRepository, fingerprint = "struct-test-card") {
  return repo.createLibraryComponent({
    id: `lib-${fingerprint}`,
    name: "Testkarte",
    kind: "component",
    definition: definition as never,
    fingerprint,
    tags: ["test"],
    provenance: { kind: "manual", sourceUrl: null, pagePath: null, irHash: null } as never,
    license: { id: "MIT", status: "verified" } as never,
    notes: "",
    author: TEST_AUTHOR,
  });
}

const rejected = (promise: Promise<unknown>) => promise.catch((caught: unknown) => caught);

describe("LibraryRepository: die Bausteine selbst", () => {
  it("legt an, liest zurueck und dedupliziert ueber den Fingerabdruck", async () => {
    const { repo, rufe } = await fixture();

    const erst = await componentFactory(repo);
    expect(erst.name).toBe("Testkarte");
    expect(erst.slug).toBe("testkarte");
    expect(erst.version).toBe(1);
    // Der Slug kommt aus derselben Regel wie Seiten- und Site-Slugs (slugify).
    expect(erst.deprecatedAt).toBeNull();

    // Zweiter Aufruf mit demselben Fingerabdruck legt nichts an, sondern liest.
    const zweit = await repo.createLibraryComponent({
      id: "lib-andere-id",
      name: "Andere Karte",
      kind: "component",
      definition: definition as never,
      fingerprint: "struct-test-card",
      tags: [],
      provenance: { kind: "manual", sourceUrl: null, pagePath: null, irHash: null } as never,
      license: { id: "MIT", status: "verified" } as never,
      notes: "",
      author: TEST_AUTHOR,
    });
    expect(zweit.id).toBe(erst.id);
    expect(zweit.name).toBe("Testkarte");

    const alle = await repo.listLibraryComponents();
    expect(alle).toHaveLength(1);

    // Die Anlage schreibt ihren Audit-Eintrag ueber den Store, nicht selbst.
    expect(rufe.filter((r) => r.art === "appendAudit")).toHaveLength(1);
    expect(rufe.find((r) => r.art === "appendAudit")?.argumente).toEqual(["library.component.created"]);
  });

  it("erhoeht die Version beim Aendern und setzt die Deprecation", async () => {
    const { repo } = await fixture();
    const erst = await componentFactory(repo);

    const geaendert = await repo.updateLibraryComponent({
      id: erst.id,
      notes: "Neue Notiz",
      deprecated: true,
      author: TEST_AUTHOR,
    });
    expect(geaendert.version).toBe(2);
    expect(geaendert.notes).toBe("Neue Notiz");
    expect(geaendert.deprecatedAt).not.toBeNull();

    const zurueck = await repo.updateLibraryComponent({
      id: erst.id,
      deprecated: false,
      author: TEST_AUTHOR,
    });
    expect(zurueck.version).toBe(3);
    expect(zurueck.deprecatedAt).toBeNull();
    // Der Name bleibt, wenn das Patch ihn nicht nennt.
    expect(zurueck.name).toBe("Testkarte");
  });

  it("meldet nicht vorhandene Bausteine als not_found mit Feld componentId", async () => {
    const { repo } = await fixture();
    const fehler = await rejected(repo.getLibraryComponent("gibt-es-nicht"));
    expect(fehler).toBeInstanceOf(SenifyError);
    expect((fehler as SenifyError).category).toBe("not_found");
    expect((fehler as SenifyError).field).toBe("componentId");
  });

  it("loescht nur, wenn keine Installation mehr auf den Baustein zeigt", async () => {
    const { repo, store } = await fixture();
    const baustein = await componentFactory(repo);

    const site = await store.createSite({ name: "Bibliotheksprobe" });
    const page = await store.createPage(site.id, { title: "Start", path: "/" });
    await repo.installLibraryComponent({
      id: "install-1",
      siteId: site.id,
      componentId: baustein.id,
      mode: "linked",
      pageId: page.id,
      author: TEST_AUTHOR,
    });

    const fehler = await rejected(repo.deleteLibraryComponent(baustein.id));
    expect((fehler as SenifyError).category).toBe("conflict");
    expect((fehler as SenifyError).message).toContain("still installed");

    const installs = await repo.listLibraryInstalls(site.id);
    await repo.deleteLibraryInstall(installs[0]!.id, TEST_AUTHOR);

    const geloescht = await repo.deleteLibraryComponent(baustein.id);
    expect(geloescht.id).toBe(baustein.id);
    expect(await repo.listLibraryComponents()).toHaveLength(0);
  });
});

describe("LibraryRepository: die Naht zum Store", () => {
  it("schreibt beim Installieren einen Draft und nennt den Store als Schreiber", async () => {
    const { repo, store, rufe } = await fixture();
    const baustein = await componentFactory(repo, "struct-seam");

    const site = await store.createSite({ name: "Nahtprobe" });
    const page = await store.createPage(site.id, { title: "Start", path: "/" });
    const vorher = (await store.getPage(page.id)).draftVersion;

    const install = await repo.installLibraryComponent({
      id: "install-naht",
      siteId: site.id,
      componentId: baustein.id,
      mode: "linked",
      pageId: page.id,
      author: TEST_AUTHOR,
    });
    expect(install.componentId).toBe(baustein.id);

    // Der Draft ist ueber den Store geschrieben - die Version ist gestiegen.
    const nachher = await store.getPage(page.id);
    expect(nachher.draftVersion).toBe(vorher + 1);

    // Und die Knoten sind da: die Definition und die Instanz.
    const instanzen = Object.values(nachher.draft.nodes).filter(
      (node) => node.type === "__component_instance" && node.props["libraryComponentId"] === baustein.id,
    );
    expect(instanzen).toHaveLength(1);

    // Was ueber die Naht ging, ist benannt: Seite lesen, Site lesen, Draft schreiben.
    expect(rufe.some((r) => r.art === "getSite")).toBe(true);
    expect(rufe.some((r) => r.art === "getPage")).toBe(true);
    expect(rufe.some((r) => r.art === "persistBatch")).toBe(true);
  });

  it("weist eine Seite einer anderen Site ab, ohne den Draft anzufassen", async () => {
    const { repo, store } = await fixture();
    const baustein = await componentFactory(repo, "struct-fremd");

    const eine = await store.createSite({ name: "Site A" });
    const andere = await store.createSite({ name: "Site B" });
    const fremdeSeite = await store.createPage(andere.id, { title: "Start", path: "/" });
    const vorher = (await store.getPage(fremdeSeite.id)).draftVersion;

    const fehler = await rejected(
      repo.installLibraryComponent({
        id: "install-fremd",
        siteId: eine.id,
        componentId: baustein.id,
        mode: "linked",
        pageId: fremdeSeite.id,
        author: TEST_AUTHOR,
      }),
    );
    expect((fehler as SenifyError).category).toBe("validation");
    expect((fehler as SenifyError).message).toContain("another site");

    // Der Draft der fremden Seite ist unveraendert.
    expect((await store.getPage(fremdeSeite.id)).draftVersion).toBe(vorher);
  });

  it("loest beim Abhaengen die Verknuepfung, laesst die Definition aber stehen", async () => {
    const { repo, store } = await fixture();
    const baustein = await componentFactory(repo, "struct-detach");

    const site = await store.createSite({ name: "Abhaengeprobe" });
    const page = await store.createPage(site.id, { title: "Start", path: "/" });
    await repo.installLibraryComponent({
      id: "install-detach",
      siteId: site.id,
      componentId: baustein.id,
      mode: "linked",
      pageId: page.id,
      author: TEST_AUTHOR,
    });

    const installs = await repo.listLibraryInstalls(site.id);
    await repo.deleteLibraryInstall(installs[0]!.id, TEST_AUTHOR);

    const nachher = await store.getPage(page.id);
    const knoten = Object.values(nachher.draft.nodes);
    // Die INSTANZ traegt die Verknuepfung nicht mehr: sie ist jetzt der
    // abgehaengte Baustein selbst (wie im bestehenden Test library.test.ts).
    expect(
      knoten.some(
        (node) => node.type === "__component_instance" && node.props["libraryComponentId"] === baustein.id,
      ),
    ).toBe(false);
    // ... aber die Definition selbst ist noch da (nicht geloescht).
    expect(knoten.some((node) => node.props["libraryDetachedFrom"] === baustein.id)).toBe(true);
    expect(await repo.listLibraryComponents()).toHaveLength(1);
  });
});

describe("LibraryRepository: das Protokoll", () => {
  it("liest die Bibliotheks-Eintraege und ordnet sie ihren Aktionen zu", async () => {
    const { repo } = await fixture();
    const baustein = await componentFactory(repo, "struct-audit");
    await repo.updateLibraryComponent({ id: baustein.id, notes: "x", author: TEST_AUTHOR });

    const eintraege = await repo.listLibraryAudit();
    expect(eintraege.length).toBeGreaterThanOrEqual(2);
    expect(eintraege.map((entry) => entry.action)).toContain("created");
    expect(eintraege.map((entry) => entry.action)).toContain("updated");
    // Der Bibliothekseintrag hat keine Site.
    expect(eintraege.every((entry) => entry.siteId === null)).toBe(true);
    expect(eintraege.every((entry) => entry.componentId === baustein.id)).toBe(true);
  });
});
