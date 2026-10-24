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

  it("setzt die Deprecation, ohne die Version zu erhoehen", async () => {
    const { repo } = await fixture();
    const erst = await componentFactory(repo);

    // Die Version zaehlt die Definitionen, nicht die Metadaten (Plan §5.1,
    // Schritt 4). Eine Notiz oder eine Deprecation ist keine neue Definition -
    // sonst wuerde jede Beschriftung an allen installierten Seiten einen
    // Drift erzeugen, den es inhaltlich nicht gibt.
    const geaendert = await repo.updateLibraryComponent({
      id: erst.id,
      notes: "Neue Notiz",
      deprecated: true,
      author: TEST_AUTHOR,
    });
    expect(geaendert.version).toBe(1);
    expect(geaendert.notes).toBe("Neue Notiz");
    expect(geaendert.deprecatedAt).not.toBeNull();

    const zurueck = await repo.updateLibraryComponent({
      id: erst.id,
      deprecated: false,
      author: TEST_AUTHOR,
    });
    expect(zurueck.version).toBe(1);
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

  it("haengt einen abgehaengten Baustein wieder an die Bibliothek", async () => {
    const { repo, store } = await fixture();
    const baustein = await componentFactory(repo, "struct-reattach");

    const site = await store.createSite({ name: "Wiederhaengeprobe" });
    const page = await store.createPage(site.id, { title: "Start", path: "/" });
    await repo.installLibraryComponent({
      id: "install-reattach",
      siteId: site.id,
      componentId: baustein.id,
      mode: "linked",
      pageId: page.id,
      author: TEST_AUTHOR,
    });

    const installs = await repo.listLibraryInstalls(site.id);
    await repo.deleteLibraryInstall(installs[0]!.id, TEST_AUTHOR);
    // Nach dem Abhaengen gibt es keine Installationszeile mehr.
    expect(await repo.listLibraryInstalls(site.id)).toHaveLength(0);

    const wieder = await repo.reattachLibraryComponent({
      id: "install-wieder",
      siteId: site.id,
      componentId: baustein.id,
      author: TEST_AUTHOR,
    });
    expect(wieder.componentId).toBe(baustein.id);
    expect(wieder.installedVersion).toBe(baustein.version);

    // Die Knoten tragen die Bindung wieder - und sie sind NICHT kopiert worden:
    // die Ueberschreibungen der lokalen Instanz bleiben erhalten.
    const nachher = await store.getPage(page.id);
    const instanzen = Object.values(nachher.draft.nodes).filter(
      (node) => node.type === "__component_instance" && node.props["libraryComponentId"] === baustein.id,
    );
    expect(instanzen).toHaveLength(1);
    expect(instanzen[0]!.props["libraryDetachedFrom"]).toBeUndefined();
    expect(instanzen[0]!.props["libraryOrigin"]).toBe("linked");

    // Die Installationszeile ist wieder da.
    expect(await repo.listLibraryInstalls(site.id)).toHaveLength(1);
    // Und das Protokoll erzaehlt den Schritt.
    const eintraege = await repo.listLibraryAudit();
    expect(eintraege.map((entry) => entry.action)).toContain("reattached");
  });

  it("meldet aehnliche Bausteine, ohne sie zusammenzulegen", async () => {
    const { repo } = await fixture();
    // Zwei Bausteine mit derselben Struktur, aber unterschiedlichem Fingerabdruck
    // (der Fingerabdruck kommt vom Import und kann abweichen).
    await componentFactory(repo, "struct-aehnlich-a");
    await repo.createLibraryComponent({
      id: "lib-struct-aehnlich-b",
      name: "Aehnliche Karte",
      kind: "component",
      definition: definition as never,
      fingerprint: "struct-aehnlich-b",
      tags: [],
      provenance: { kind: "manual", sourceUrl: null, pagePath: null, irHash: null } as never,
      license: { id: "MIT", status: "verified" } as never,
      notes: "",
      author: TEST_AUTHOR,
    });

    const aehnliche = await repo.findSimilarLibraryComponents();
    expect(aehnliche).toHaveLength(1);
    expect(aehnliche[0]!.similarity).toBe(100);
    // Der Hinweis nennt beide Bausteine - er entscheidet nicht, welcher bleibt.
    expect(aehnliche[0]!.component.id).not.toBe(aehnliche[0]!.similarTo.id);
    // Und es ist nichts zusammengelegt worden.
    expect(await repo.listLibraryComponents()).toHaveLength(2);
  });

  it("meldet strukturell verschiedene Bausteine nicht als aehnlich", async () => {
    const { repo } = await fixture();
    await componentFactory(repo, "struct-verschieden");
    await repo.createLibraryComponent({
      id: "lib-struct-anders",
      name: "Ganz anderer Baustein",
      kind: "component",
      definition: {
        rootNodeId: "wurzel",
        nodes: {
          wurzel: { id: "wurzel", type: "section", props: {}, children: ["text"] },
          text: { id: "text", type: "heading", props: { text: "Anderes" } },
        },
      } as never,
      fingerprint: "struct-anders",
      tags: [],
      provenance: { kind: "manual", sourceUrl: null, pagePath: null, irHash: null } as never,
      license: { id: "MIT", status: "verified" } as never,
      notes: "",
      author: TEST_AUTHOR,
    });

    expect(await repo.findSimilarLibraryComponents()).toHaveLength(0);
  });
});

describe("LibraryRepository: der Weg ueber mehrere Sites", () => {
  it("zieht die neue Definition in beide Seiten, und die Ueberschreibung bleibt", async () => {
    const { repo, store } = await fixture();
    const baustein = await componentFactory(repo, "struct-mehrsite");

    const siteA = await store.createSite({ name: "Site A" });
    const siteB = await store.createSite({ name: "Site B" });
    const seiteA = await store.createPage(siteA.id, { title: "A", path: "/a" });
    const seiteB = await store.createPage(siteB.id, { title: "B", path: "/b" });

    for (const [site, seite] of [[siteA, seiteA], [siteB, seiteB]] as const) {
      await repo.installLibraryComponent({
        id: `install-${site.id}`,
        siteId: site.id,
        componentId: baustein.id,
        mode: "linked",
        pageId: seite.id,
        author: TEST_AUTHOR,
      });
    }

    // Die Instanz der Seite A traegt eine Ueberschreibung. Sie ist ueber die
    // Teil-ID adressiert - die Ueberschreibung muss ein Bibliotheks-Update
    // ueberleben (Plan §6, Abnahme E6).
    const vorUpdate = await store.getPage(seiteA.id);
    const instanzA = Object.values(vorUpdate.draft.nodes).find(
      (node) => node.type === "__component_instance" && node.props["libraryComponentId"] === baustein.id,
    );
    expect(instanzA).toBeDefined();
    const teilId = Object.keys(vorUpdate.draft.nodes).find(
      (id) => id !== instanzA!.id && vorUpdate.draft.nodes[id]!.type !== "page",
    );
    expect(teilId).toBeDefined();
    vorUpdate.draft.nodes[instanzA!.id]!.props["overrides"] = { [teilId as string]: { headline: "Meine Ueberschreibung" } };
    await store.persistBatch({
      pageId: seiteA.id,
      expectedVersion: vorUpdate.draftVersion,
      draft: vorUpdate.draft,
      title: vorUpdate.title,
      path: vorUpdate.path,
      entries: [{
        siteId: siteA.id, pageId: seiteA.id, batchId: "batch-override", opIndex: 0,
        mutation: "test.override", params: {}, author: TEST_AUTHOR, undoPatch: [], draftVersionAfter: vorUpdate.draftVersion + 1,
      }],
    });

    // Die Bibliothek bekommt eine neue Definition: der Text aendert sich.
    const neueDefinition = {
      rootNodeId: "root00001",
      nodes: {
        root00001: { id: "root00001", type: "section", props: {}, children: ["card00001"] },
        card00001: { id: "card00001", type: "card", props: { headline: "Neue Version aus der Bibliothek" } },
      },
    };
    const geaendert = await repo.updateLibraryComponent({
      id: baustein.id,
      definition: neueDefinition as never,
      author: TEST_AUTHOR,
    });
    expect(geaendert.version).toBe(2);

    // Das Update zieht beide Seiten nach.
    for (const site of [siteA, siteB]) {
      const installs = await repo.listLibraryInstalls(site.id);
      await repo.updateLibraryInstall(installs[0]!.id, TEST_AUTHOR);
    }

    for (const seite of [seiteA, seiteB]) {
      const nachher = await store.getPage(seite.id);
      const instanz = Object.values(nachher.draft.nodes).find(
        (node) => node.type === "__component_instance" && node.props["libraryComponentId"] === baustein.id,
      );
      expect(instanz).toBeDefined();
      // Der Pin ist auf der neuen Version.
      expect(instanz!.props["componentVersion"]).toBe(2);
      // Und der Inhalt der Seite ist der neue.
      expect(JSON.stringify(nachher.draft.nodes)).toContain("Neue Version aus der Bibliothek");
    }

    // Die Ueberschreibung der Seite A ist noch da - mit demselben Schluessel.
    const seiteANachher = await store.getPage(seiteA.id);
    const instanzANachher = Object.values(seiteANachher.draft.nodes).find(
      (node) => node.type === "__component_instance" && node.props["libraryComponentId"] === baustein.id,
    );
    const bag = instanzANachher!.props["overrides"] as Record<string, Record<string, unknown>>;
    expect(bag[teilId as string]?.["headline"]).toBe("Meine Ueberschreibung");
  });

  it("aendert eine Kopie nicht, wenn die Bibliothek wächst", async () => {
    const { repo, store } = await fixture();
    const baustein = await componentFactory(repo, "struct-kopie");

    const site = await store.createSite({ name: "Kopisten" });
    const seite = await store.createPage(site.id, { title: "Start", path: "/" });
    await repo.installLibraryComponent({
      id: "install-kopie",
      siteId: site.id,
      componentId: baustein.id,
      // `copied`: die Seite hat eine eigene Kopie. Ein Bibliotheks-Update darf
      // sie nicht ueberschreiben.
      mode: "copied",
      pageId: seite.id,
      author: TEST_AUTHOR,
    });

    await repo.updateLibraryComponent({
      id: baustein.id,
      definition: {
        rootNodeId: "root00001",
        nodes: {
          root00001: { id: "root00001", type: "section", props: {}, children: ["card00001"] },
          card00001: { id: "card00001", type: "card", props: { headline: "Neue Version aus der Bibliothek" } },
        },
      } as never,
      author: TEST_AUTHOR,
    });

    const installs = await repo.listLibraryInstalls(site.id);
    await repo.updateLibraryInstall(installs[0]!.id, TEST_AUTHOR);

    const nachher = await store.getPage(seite.id);
    // Der Inhalt ist unveraendert - die Kopie gehoert der Seite.
    expect(JSON.stringify(nachher.draft.nodes)).not.toContain("Neue Version aus der Bibliothek");
    expect(JSON.stringify(nachher.draft.nodes)).toContain("Aus der Bibliothek");
  });

  it("erhoeht die Version nur fuer die Definition, nicht fuer Metadaten", async () => {
    const { repo } = await fixture();
    const baustein = await componentFactory(repo, "struct-version");

    // Eine Umbenennung ist keine neue Definition: sie erzeugt keinen Drift
    // auf den installierten Seiten.
    const umbenannt = await repo.updateLibraryComponent({ id: baustein.id, name: "Umbenannt", author: TEST_AUTHOR });
    expect(umbenannt.version).toBe(1);

    // Eine neue Definition dagegen schon.
    const geaendert = await repo.updateLibraryComponent({
      id: baustein.id,
      definition: {
        rootNodeId: "root00001",
        nodes: {
          root00001: { id: "root00001", type: "section", props: {}, children: ["card00001"] },
          card00001: { id: "card00001", type: "card", props: { headline: "Anderer Text" } },
        },
      } as never,
      author: TEST_AUTHOR,
    });
    expect(geaendert.version).toBe(2);
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
