import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import type { NodeTree } from "@senify/section-sdk";
import { PagesRepository, type PagesHost } from "../src/store-pages.ts";
import { createTestDatabase, TEST_AUTHOR } from "./helpers.ts";

// ADR 0019: the pages live in `PagesRepository`; `Store` only delegates.
//
// The seam of this cut is narrow but load-bearing: the module owns the page and
// its draft, the Store owns the site. These cases drive the module directly
// against a host that records every crossing - a module that reached for the
// Store itself would not compile against this host. That is the difference
// between "Store delegates" as a claim and as a check.

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
  const host: PagesHost = {
    getSite: async (siteId) => {
      rufe.push({ art: "getSite", argumente: siteId });
      return store.getSite(siteId);
    },
  };
  const repo = new PagesRepository(database.db, host);
  return { db: database.db, store, repo, rufe };
}

const rejected = (promise: Promise<unknown>) => promise.catch((caught: unknown) => caught);

// Eine Seite mit einem Knoten, damit ein Entwurf auch Inhalt hat.
function draft(): NodeTree {
  return {
    rootNodeId: "root-seite",
    nodes: {
      "root-seite": { id: "root-seite", type: "container", props: {}, children: ["knoten-1"] },
      "knoten-1": { id: "knoten-1", type: "block", props: { text: "Hallo" } },
    },
  };
}

const eintrag = (pageId: string, siteId: string) => ({
  siteId,
  pageId,
  batchId: "batch-1",
  opIndex: 0,
  mutation: "page.draft.saved",
  params: { nodes: 2 },
  author: TEST_AUTHOR,
  undoPatch: [],
  draftVersionAfter: 0,
});

describe("PagesRepository: die Seite selbst", () => {
  it("legt die erste Seite auf / an und danach fortlaufende Pfade", async () => {
    const { repo, store, rufe } = await fixture();
    const site = await store.createSite({ name: "Seitenprobe" });

    const start = await repo.createPage(site.id, { title: "Start" });
    expect(start.path).toBe("/");
    expect(start.title).toBe("Start");
    expect(start.draftVersion).toBe(1);
    // Der Entwurf hat eine Wurzel - keine Seite ohne Baum.
    expect(start.draft.rootNodeId).toBe(start.draft.nodes[start.draft.rootNodeId]?.id);

    const zweite = await repo.createPage(site.id, { title: "Über uns" });
    expect(zweite.path).toBe("/ueber-uns");

    // Beim dritten Aufruf ist der Pfad belegt: der naechste Zaehler greift.
    const dritte = await repo.createPage(site.id, { title: "Über uns" });
    expect(dritte.path).toBe("/ueber-uns-2");

    // Die Site wurde fuer jede Anlage geprueft - mehr ging nicht ueber die Naht.
    expect(rufe.every((r) => r.art === "getSite")).toBe(true);
    expect(rufe).toHaveLength(3);
  });

  it("nimmt einen gewuenschten Pfad und meldet einen belegten als conflict", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Pfadprobe" });

    const gesetzt = await repo.createPage(site.id, { title: "Kontakt", path: "/kontakt" });
    expect(gesetzt.path).toBe("/kontakt");

    const fehler = await rejected(repo.createPage(site.id, { title: "Nochmal", path: "/kontakt" }));
    expect(fehler).toBeInstanceOf(SenifyError);
    expect((fehler as SenifyError).category).toBe("conflict");
    expect((fehler as SenifyError).field).toBe("path");
  });

  it("weist einen ungeformten Pfad ab, bevor irgendetwas geschrieben wird", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Formprobe" });

    const fehler = await rejected(repo.createPage(site.id, { title: "Kaputt", path: "ohne-schraegstrich" }));
    expect((fehler as SenifyError).category).toBe("validation");
    // Nichts angelegt: die Liste ist leer.
    expect(await repo.listPages(site.id)).toEqual([]);
  });

  it("liest die Seite und ihre Zusammenfassung, ohne den Entwurf mitzuschleppen", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Leseprobe" });
    await repo.createPage(site.id, { title: "Start" });

    const kurz = await repo.listPages(site.id);
    expect(kurz).toHaveLength(1);
    expect(kurz[0]).not.toHaveProperty("draft");
    expect(kurz[0]?.title).toBe("Start");

    const lang = await repo.listPageDrafts(site.id);
    expect(lang).toHaveLength(1);
    expect(lang[0]).toHaveProperty("draft");

    const eine = await repo.getPage(kurz[0]!.id);
    expect(eine.id).toBe(kurz[0]!.id);
  });

  it("meldet eine nicht vorhandene Seite als not_found mit Feld pageId", async () => {
    const { repo } = await fixture();
    const fehler = await rejected(repo.getPage("gibt-es-nicht"));
    expect(fehler).toBeInstanceOf(SenifyError);
    expect((fehler as SenifyError).category).toBe("not_found");
    expect((fehler as SenifyError).field).toBe("pageId");

    const weg = await rejected(repo.deletePage("gibt-es-nicht"));
    expect((weg as SenifyError).category).toBe("not_found");
  });

  it("setzt die Vorlage als Upsert, ohne die Seite anzufassen", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Vorlagenprobe" });
    const page = await repo.createPage(site.id, { title: "Start" });

    const mitLayout = await repo.setPageTemplate({
      pageId: page.id,
      template: { kind: "layout", label: "Zweispaltig" },
      layoutId: "layout-1",
    });
    // Das Label einer Layout-Vorlage ist der Seitentitel, nicht das Label aus
    // der Eingabe: die Vorlage beschreibt, WELCHE Seite sie ist, und der Titel
    // ist die einzige Bezeichnung, die eine Seite hat (so liest es
    // `mapPageTemplate` seit jeher).
    expect(mitLayout.template).toEqual({ kind: "layout", label: "Start" });
    expect(mitLayout.layoutId).toBe("layout-1");
    // Die Seite selbst ist unveraendert - die Vorlage ist eine zweite Zeile.
    expect(mitLayout.draftVersion).toBe(page.draftVersion);

    const ohne = await repo.setPageTemplate({ pageId: page.id, template: null, layoutId: null });
    expect(ohne.template).toBeNull();
    expect(ohne.layoutId).toBeNull();
  });
});

describe("PagesRepository: der Schreibpfad", () => {
  it("schreibt den Entwurf, erhoeht die Version und stempelt das Audit", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Schreibprobe" });
    const page = await repo.createPage(site.id, { title: "Start" });

    const neueVersion = await repo.persistBatch({
      pageId: page.id,
      expectedVersion: page.draftVersion,
      draft: draft(),
      title: "Start neu",
      path: "/",
      entries: [eintrag(page.id, site.id)],
    });
    expect(neueVersion).toBe(page.draftVersion + 1);

    const nachher = await repo.getPage(page.id);
    expect(nachher.title).toBe("Start neu");
    expect(nachher.draft.rootNodeId).toBe("root-seite");

    // Der Audit-Eintrag traegt die NEUE Version, nicht die mitgegebene 0.
    const audit = await repo.listAudit(page.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.draftVersionAfter).toBe(neueVersion);
    expect(audit[0]?.mutation).toBe("page.draft.saved");
  });

  it("weist eine veraltete Version als conflict ab und schreibt nichts", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Konfliktprobe" });
    const page = await repo.createPage(site.id, { title: "Start" });

    // Jemand anderes hat inzwischen geschrieben.
    await repo.persistBatch({
      pageId: page.id,
      expectedVersion: page.draftVersion,
      draft: draft(),
      title: "Erster",
      path: "/",
      entries: [],
    });

    const fehler = await rejected(
      repo.persistBatch({
        pageId: page.id,
        expectedVersion: page.draftVersion,
        draft: draft(),
        title: "Zweiter",
        path: "/",
        entries: [eintrag(page.id, site.id)],
      }),
    );
    expect((fehler as SenifyError).category).toBe("conflict");

    // Nichts geschrieben: Titel und Audit sind unveraendert.
    expect((await repo.getPage(page.id)).title).toBe("Erster");
    expect(await repo.listAudit(page.id)).toHaveLength(0);
  });

  it("schreibt Entwurf und Audit in EINER Transaktion", async () => {
    // pg-mem ignoriert ROLLBACK, ein Atomizitaets-Test darauf waere wertlos
    // (so steht es auch in `transactions.test.ts`, das dafuer echtes Postgres
    // nimmt). Geprueft wird hier stattdessen das, was die Atomizitaet
    // herstellt: Entwurf und Audit laufen durch DENSELBEN `withTransaction`.
    const { repo, store, db } = await fixture();
    const site = await store.createSite({ name: "Transaktionsprobe" });
    const page = await repo.createPage(site.id, { title: "Start" });

    const gesehen: string[] = [];
    let transaktionen = 0;
    const beobachtet = {
      query: (text: string, params?: unknown[]) => db.query(text, params),
      withTransaction: <T>(task: (tx: unknown) => Promise<T>): Promise<T> => {
        transaktionen += 1;
        return db.withTransaction((tx) => {
          const klient = {
            query: (text: string, params?: unknown[]) => {
              gesehen.push(/audit_entries/.test(text) ? "audit" : /UPDATE pages/.test(text) ? "entwurf" : "sonst");
              return tx.query(text, params);
            },
          };
          return task(klient as never);
        });
      },
    };
    const beobachtetesRepo = new PagesRepository(beobachtet as never, {
      getSite: (siteId) => store.getSite(siteId),
    });

    const version = await beobachtetesRepo.persistBatch({
      pageId: page.id,
      expectedVersion: page.draftVersion,
      draft: draft(),
      title: "Neuer Titel",
      path: "/",
      entries: [eintrag(page.id, site.id)],
    });
    expect(version).toBe(page.draftVersion + 1);

    // Genau eine Transaktion, und in ihr beides: erst der Entwurf, dann der
    // Audit-Eintrag. Waeren es zwei Aufrufe, koennte der eine ohne den anderen
    // bestehen bleiben.
    expect(transaktionen).toBe(1);
    expect(gesehen.filter((g) => g !== "sonst")).toEqual(["entwurf", "audit"]);

    // Und ohne Audit-Eintraege bleibt es bei einer Transaktion, nur ohne Audit.
    gesehen.length = 0;
    await beobachtetesRepo.persistBatch({
      pageId: page.id,
      expectedVersion: version,
      draft: draft(),
      title: "Noch neuer",
      path: "/",
      entries: [],
    });
    expect(gesehen).not.toContain("audit");
  });

  it("aktualisiert die Seite mit Versionspruefung und meldet einen belegten Pfad", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Aktualisierprobe" });
    const eine = await repo.createPage(site.id, { title: "Eins", path: "/eins" });
    const andere = await repo.createPage(site.id, { title: "Zwei", path: "/zwei" });

    // Normalfall: Version stimmt, neuer Titel und Pfad.
    const version = await repo.updatePage(andere.id, andere.draftVersion, {
      draft: draft(),
      title: "Zwei neu",
      path: "/zwei-neu",
    });
    expect(version).toBe(andere.draftVersion + 1);
    const nachher = await repo.getPage(andere.id);
    expect(nachher.title).toBe("Zwei neu");
    expect(nachher.path).toBe("/zwei-neu");

    // Veraltete Version: conflict, nichts geschrieben.
    const veraltet = await rejected(
      repo.updatePage(andere.id, andere.draftVersion, {
        draft: draft(),
        title: "Zu spaet",
        path: "/zu-spaet",
      }),
    );
    expect((veraltet as SenifyError).category).toBe("conflict");
    expect((await repo.getPage(andere.id)).title).toBe("Zwei neu");

    // Belegter Pfad: der eindeutige Index entscheidet, der Aufrufer bekommt
    // einen conflict mit Feld pfad - nicht den rohen Datenbankfehler.
    const belegt = await rejected(
      repo.updatePage(andere.id, version, {
        draft: draft(),
        title: "Zwei neu",
        path: "/eins",
      }),
    );
    expect((belegt as SenifyError).category).toBe("conflict");
    expect((belegt as SenifyError).field).toBe("path");
    expect((await repo.getPage(eine.id)).path).toBe("/eins");

    // Eine Seite, die es nicht gibt: not_found, nicht conflict.
    const weg = await rejected(
      repo.updatePage("gibt-es-nicht", 1, { draft: draft(), title: "x", path: "/x" }),
    );
    expect((weg as SenifyError).category).toBe("not_found");
    expect((weg as SenifyError).field).toBe("pageId");
  });

  it("meldet eine Seite, die zwischen Lesen und Schreiben verschwindet, als not_found", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Verschwindeprobe" });
    const page = await repo.createPage(site.id, { title: "Start" });

    // Die Seite wird geloescht, dann kommt ein Schreibversuch mit der alten
    // Version. Die UPDATE-Zeile trifft nichts; die zweite Abfrage stellt fest,
    // dass es die Seite nicht mehr gibt.
    await repo.deletePage(page.id);

    const fehler = await rejected(
      repo.persistBatch({
        pageId: page.id,
        expectedVersion: page.draftVersion,
        draft: draft(),
        title: "Zu spaet",
        path: "/",
        entries: [],
      }),
    );
    expect((fehler as SenifyError).category).toBe("not_found");
    expect((fehler as SenifyError).field).toBe("pageId");
  });

  it("meldet einen belegten Pfad beim Schreiben als conflict", async () => {    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Pfadschreibprobe" });
    const eine = await repo.createPage(site.id, { title: "Eins", path: "/eins" });
    const andere = await repo.createPage(site.id, { title: "Zwei", path: "/zwei" });

    const fehler = await rejected(
      repo.persistBatch({
        pageId: andere.id,
        expectedVersion: andere.draftVersion,
        draft: draft(),
        title: "Zwei",
        path: "/eins",
        entries: [],
      }),
    );
    expect((fehler as SenifyError).category).toBe("conflict");
    expect((fehler as SenifyError).field).toBe("path");
    // Die andere Seite ist unberuehrt.
    expect((await repo.getPage(eine.id)).path).toBe("/eins");
  });

  it("laesst einen Pfad frei, der nur einer anderen Seite gehoert, und meldet den eigenen nicht", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Freiheitsprobe" });
    await repo.createPage(site.id, { title: "Eins", path: "/eins" });
    const andere = await repo.createPage(site.id, { title: "Zwei", path: "/zwei" });

    // Ein freier Pfad geht durch.
    await repo.assertPathFree(site.id, andere.id, "/drei");

    // Der EIGENE Pfad ist kein Konflikt: die Pruefung schliesst die eigene
    // Seite aus (`id <> $3`), sonst koennte man eine Seite nie speichern,
    // ohne ihren Pfad zu aendern.
    await repo.assertPathFree(site.id, andere.id, "/zwei");

    // Der Pfad der anderen Seite dagegen schon.
    const fehler = await rejected(repo.assertPathFree(site.id, andere.id, "/eins"));
    expect((fehler as SenifyError).category).toBe("conflict");
    expect((fehler as SenifyError).field).toBe("path");
  });
});

describe("PagesRepository: das Protokoll", () => {
  it("liest das Protokoll einer Seite und das einer ganzen Site", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Protokollprobe" });
    const eine = await repo.createPage(site.id, { title: "Eins" });

    await repo.appendAudit([
      eintrag(eine.id, site.id),
      { ...eintrag(eine.id, site.id), batchId: "batch-2", opIndex: 1, mutation: "page.published" },
    ]);

    const seite = await repo.listAudit(eine.id);
    expect(seite).toHaveLength(2);
    // Neueste zuerst bei gleichem Zeitstempel: die hoehere op_index.
    expect(seite[0]?.opIndex).toBe(1);

    const alle = await repo.listSiteAudit(site.id);
    expect(alle).toHaveLength(2);
    expect(alle.every((e) => e.siteId === site.id)).toBe(true);

    // Ein leerer Append ist ein No-op, kein Fehler.
    await repo.appendAudit([]);
    expect(await repo.listAudit(eine.id)).toHaveLength(2);
  });
});
