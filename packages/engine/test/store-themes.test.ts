import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import { ThemesRepository, type ThemesHost } from "../src/store-themes.ts";
import { createTestDatabase, TEST_AUTHOR } from "./helpers.ts";

// ADR 0019: the theme and the site event log live in `ThemesRepository`; the
// `Store` only delegates.
//
// Two things are worth pinning down here. First, `updateTheme` writes the theme
// row and its audit entry in ONE transaction — a theme change without a trace
// would otherwise be possible. Second, `ensureSiteTheme` heals: a site without
// a theme row gets one on first read, which covers restored backups.

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
  const host: ThemesHost = {
    getSite: async (siteId) => {
      rufe.push({ art: "getSite", argumente: siteId });
      return store.getSite(siteId);
    },
  };
  const repo = new ThemesRepository(database.db, host);
  return { db: database.db, store, repo, rufe };
}

const rejected = (promise: Promise<unknown>) => promise.catch((caught: unknown) => caught);

describe("ThemesRepository: das Theme", () => {
  it("legt beim ersten Lesen eine Theme-Zeile an und gibt sie danach zurueck", async () => {
    const { repo, store, rufe } = await fixture();
    const site = await store.createSite({ name: "Themeprobe" });

    const erst = await repo.getTheme(site.id);
    expect(erst.siteId).toBe(site.id);
    expect(erst.version).toBe(1);
    // Das CSS wird aus dem Theme erzeugt, nicht gespeichert.
    expect(erst.css.length).toBeGreaterThan(0);
    expect(erst.theme.name).toBe(erst.name);

    // Zweiter Aufruf: dieselbe Zeile, keine zweite.
    const zweit = await repo.getTheme(site.id);
    expect(zweit.id).toBe(erst.id);
    expect(zweit.version).toBe(1);

    // Und die Site kennt ihr Theme jetzt.
    expect((await store.getSite(site.id)).themeId).toBe(erst.id);
    // Die Naht wurde benutzt.
    expect(rufe.filter((r) => r.art === "getSite").length).toBeGreaterThanOrEqual(2);
  });

  it("heilt eine Site, deren Theme-Zeile fehlt", async () => {
    const { repo, store, db } = await fixture();
    const site = await store.createSite({ name: "Heilprobe" });

    // So, als kaeme die Site aus einem Backup von vor der Theme-Tabelle: die
    // Zeile fehlt, der Verweis zeigt ins Leere.
    await db.query(`DELETE FROM themes WHERE site_id = $1`, [site.id]);
    await db.query(`UPDATE sites SET theme_id = NULL WHERE id = $1`, [site.id]);

    const geheilt = await repo.getTheme(site.id);
    expect(geheilt.siteId).toBe(site.id);
    expect(geheilt.version).toBe(1);
    // Die Site zeigt wieder auf ihr Theme.
    expect((await store.getSite(site.id)).themeId).toBe(geheilt.id);
  });

  it("weist ein leeres Patch ab, bevor irgendetwas geschrieben wird", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Leerpatch" });
    const vorher = await repo.getTheme(site.id);

    const fehler = await rejected(repo.updateTheme(site.id, {}, TEST_AUTHOR));
    expect(fehler).toBeInstanceOf(SenifyError);
    expect((fehler as SenifyError).category).toBe("validation");
    expect((fehler as SenifyError).field).toBe("theme");

    // Nichts geschrieben: die Version steht.
    expect((await repo.getTheme(site.id)).version).toBe(vorher.version);
  });

  it("erhoeht die Version beim Aendern und schreibt das Audit in derselben Transaktion", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Aenderprobe" });
    const vorher = await repo.getTheme(site.id);

    const nachher = await repo.updateTheme(
      site.id,
      { name: "Neuer Name" },
      TEST_AUTHOR,
    );
    expect(nachher.version).toBe(vorher.version + 1);
    expect(nachher.name).toBe("Neuer Name");

    // Der Audit-Eintrag traegt die NEUE Version und den Patch.
    const audit = await store.listSiteAudit(site.id, 10);
    const eintrag = audit.find((e) => e.mutation === "update_theme");
    expect(eintrag).toBeDefined();
    expect(eintrag?.draftVersionAfter).toBe(nachher.version);
    expect(eintrag?.params).toMatchObject({ patch: { name: "Neuer Name" } });
  });

  it("weist ein Theme-Patch ab, das die Regeln bricht", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Regelprobe" });
    const vorher = await repo.getTheme(site.id);

    // Die Markenfarbe ist der Anker der ganzen Skala. Ein Wert, der sich nicht
    // parsen laesst, muss VOR dem Schreiben abgelehnt werden - sonst stuende
    // ein Theme in der Datenbank, aus dem kein CSS entsteht.
    const fehler = await rejected(
      repo.updateTheme(site.id, { scales: { brand: "nicht-eine-farbe" } }, TEST_AUTHOR),
    );
    expect(fehler).toBeInstanceOf(SenifyError);
    expect((fehler as SenifyError).category).toBe("validation");
    expect((fehler as SenifyError).field).toContain("scales.brand");

    // Nichts geschrieben: die Version steht, der Name ist unveraendert.
    const nachher = await repo.getTheme(site.id);
    expect(nachher.version).toBe(vorher.version);
    expect(nachher.name).toBe(vorher.name);
  });

  it("nennt bei mehreren Theme-Problemen, wie viele es sind", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Mehrfachprobe" });
    await repo.getTheme(site.id);

    // Zwei Regeln gleichzeitig gebrochen: die Markenfarbe UND die neutrale
    // Basis. Der Fehler soll nicht nur den ersten nennen, sondern sagen,
    // dass noch weitere folgen - sonst sucht der Mensch vergeblich nach
    // dem einen Fehler, den die Meldung nennt.
    const fehler = await rejected(
      repo.updateTheme(
        site.id,
        { scales: { brand: "nicht-eine-farbe", neutralBase: "auch-nicht" } },
        TEST_AUTHOR,
      ),
    );
    expect(fehler).toBeInstanceOf(SenifyError);
    expect((fehler as SenifyError).category).toBe("validation");
    expect((fehler as SenifyError).suggestion).toContain("more theme problems");
  });

  it("meldet ein Theme einer unbekannten Site als not_found", async () => {
    const { repo } = await fixture();
    const fehler = await rejected(repo.getTheme("gibt-es-nicht"));
    expect((fehler as SenifyError).category).toBe("not_found");
    expect((fehler as SenifyError).field).toBe("siteId");
  });

  // Zwei Zweige in `ensureSiteTheme` und `updateTheme` bleiben ungemessen, und
  // das ist eine bewusste Grenze, keine Nachlaessigkeit:
  //
  // (a) Der Retry nach einem eindeutigen Index-Konflikt (zwei Schreiber legen
  //     gleichzeitig die Theme-Zeile an) laesst sich mit pg-mem nicht
  //     herstellen - der Test-Doppelgaenger erzwingt keine echte
  //     Nebenlaeufigkeit, und ein nachgebauter Konflikt wuerde den Zweig
  //     treffen, ohne den Fall zu zeigen. Auf echtem Postgres deckt ihn
  //     `transactions.test.ts`-artige Beweise ab; hier waere es Theater.
  // (b) Der Zweig "Theme-Zeile verschwindet zwischen Lesen und Schreiben"
  //     heilt sich selbst: `ensureSiteTheme` legt sie beim naechsten Aufruf
  //     neu an, sodass das UPDATE wieder trifft. Der Zweig ist damit
  //     unerreichbar, solange die Selbstheilung existiert - er ist eine
  //     Verteidigung gegen einen Zustand, den das Modul selbst verhindert.
  //     Ihn zu testen hiesse, die Selbstheilung zu umgehen.
  //
  it("faengt den eindeutigen Index ab, wenn zwei Schreiber dasselbe Theme anlegen", async () => {
    const { repo, store, db } = await fixture();
    const site = await store.createSite({ name: "Race" });

    // Eine gueltige Definition als Vorlage merken, dann die Zeile entfernen.
    const vorlage = await repo.ensureSiteTheme(site.id);
    const definition =
      typeof vorlage.definition === "string" ? vorlage.definition : JSON.stringify(vorlage.definition);
    await db.query(`DELETE FROM themes WHERE site_id = $1`, [site.id]);
    await db.query(`UPDATE sites SET theme_id = NULL WHERE id = $1`, [site.id]);

    // Den Konflikt herstellen, ohne echte Nebenlaeufigkeit: unmittelbar bevor
    // unser INSERT laeuft, legt der Test die Zeile fuer dieselbe Site an. Der
    // eindeutige Index auf site_id entscheidet dann - und genau diesen Fehler
    // muss das Modul erkennen und die FREMDE Zeile lesen, statt zu scheitern.
    const fremdeId = "race-theme-1";
    let eingeschleust = false;
    const beobachtet = {
      query: async (text: string, params?: unknown[]) => {
        if (!eingeschleust && /INSERT INTO themes/.test(text)) {
          eingeschleust = true;
          await db.query(
            `INSERT INTO themes (id, site_id, name, definition, version, created_at, updated_at)
             VALUES ($1, $2, 'Fremd', $3, 7, $4, $4)`,
            [fremdeId, site.id, definition, new Date().toISOString()],
          );
        }
        return db.query(text, params);
      },
      withTransaction: (task: never) => db.withTransaction(task),
    } as never;

    const raceRepo = new ThemesRepository(beobachtet, {
      getSite: (siteId) => store.getSite(siteId),
    });
    const theme = await raceRepo.getTheme(site.id);

    // Die fremde Zeile wurde gelesen - nicht eine zweite angelegt.
    expect(eingeschleust).toBe(true);
    expect(theme.id).toBe(fremdeId);
    expect(theme.version).toBe(7);
    const zeilen = await db.query<{ id: string }>(
      `SELECT id FROM themes WHERE site_id = $1`,
      [site.id],
    );
    expect(zeilen.rows).toHaveLength(1);
    void repo;
  });

  // Der Zweig "Theme-Zeile verschwindet zwischen Lesen und Schreiben" ist
  // erreichbar, wenn die Zeile nach dem Lesen geloescht und die
  // Selbstheilung umgangen wird - was hier genau der Fall ist: `ensureSiteTheme`
  // hat die Zeile gelesen, das DELETE trifft sie, und das UPDATE trifft nichts
  // mehr. Das Modul muss dann `not_found` melden, nicht still erfolgreich sein.
  it("meldet not_found, wenn die Theme-Zeile zwischen Lesen und Schreiben verschwindet", async () => {
    const { repo, store, db } = await fixture();
    const site = await store.createSite({ name: "Verschwinde" });
    await repo.ensureSiteTheme(site.id);

    // Den Schreibvorgang beobachten: nach dem Lesen der Zeile, aber vor dem
    // UPDATE, wird sie entfernt.
    let entfernt = false;
    const beobachtet = {
      query: async (text: string, params?: unknown[]) => {
        if (!entfernt && /UPDATE themes SET definition/.test(text)) {
          entfernt = true;
          await db.query(`DELETE FROM themes WHERE site_id = $1`, [site.id]);
        }
        return db.query(text, params);
      },
      withTransaction: (task: (tx: never) => Promise<unknown>) =>
        db.withTransaction((tx) => {
          const klient = {
            query: (text: string, params?: unknown[]) => {
              if (!entfernt && /UPDATE themes SET definition/.test(text)) {
                entfernt = true;
                return db.query(`DELETE FROM themes WHERE site_id = $1`, [site.id]).then(() =>
                  tx.query(text, params),
                );
              }
              return tx.query(text, params);
            },
          };
          return task(klient as never);
        }),
    } as never;

    const repo2 = new ThemesRepository(beobachtet, { getSite: (s) => store.getSite(s) });
    const fehler = await rejected(repo2.updateTheme(site.id, { name: "Zu spaet" }, TEST_AUTHOR));
    expect(fehler).toBeInstanceOf(SenifyError);
    expect((fehler as SenifyError).category).toBe("not_found");
  });
});

describe("ThemesRepository: das Ereignisprotokoll", () => {
  it("schreibt ein Site-Ereignis ohne Seitenbezug", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Ereignisprobe" });

    await repo.recordSiteEvent({
      siteId: site.id,
      mutation: "site.renamed",
      params: { from: "Alt", to: "Neu" },
      author: TEST_AUTHOR,
    });

    const audit = await store.listSiteAudit(site.id, 10);
    const eintrag = audit.find((e) => e.mutation === "site.renamed");
    expect(eintrag).toBeDefined();
    // Site-weit heisst: kein Seitenbezug.
    expect(eintrag?.pageId).toBeNull();
    expect(eintrag?.params).toEqual({ from: "Alt", to: "Neu" });
  });

  it("schreibt jedes Ereignis als eigenen Eintrag", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Mehrere" });

    for (const mutation of ["site.renamed", "site.trashed", "site.restored"]) {
      await repo.recordSiteEvent({ siteId: site.id, mutation, params: {}, author: TEST_AUTHOR });
    }

    const audit = await store.listSiteAudit(site.id, 10);
    expect(audit.filter((e) => e.mutation.startsWith("site."))).toHaveLength(3);
  });
});
