import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import { SitesRepository, type SitesHost } from "../src/store-sites.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: the sites live in `SitesRepository`; `Store` only delegates.
//
// The seam of this cut has three functions, and the interesting ones are the
// two that are NOT part of the site: the default profile lives in the engine
// settings, and every new site gets a theme row. Both are separate fields of
// the domain; the module asks for them instead of reaching for the Store.

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
  const host: SitesHost = {
    getEngineSettings: async () => {
      rufe.push({ art: "getEngineSettings", argumente: null });
      return store.getEngineSettings();
    },
    ensureSiteTheme: async (siteId) => {
      rufe.push({ art: "ensureSiteTheme", argumente: siteId });
      return store.ensureSiteTheme(siteId);
    },
    listPagePaths: async (siteId) => {
      rufe.push({ art: "listPagePaths", argumente: siteId });
      return store.listPagePaths(siteId);
    },
  };
  const repo = new SitesRepository(database.db, host);
  return { db: database.db, store, repo, rufe };
}

const rejected = (promise: Promise<unknown>) => promise.catch((caught: unknown) => caught);

describe("SitesRepository: anlegen und lesen", () => {
  it("legt eine Site an, vergibt den Slug und holt das Theme ueber die Naht", async () => {
    const { repo, rufe } = await fixture();

    const site = await repo.createSite({ name: "Meine Agentur" });
    expect(site.name).toBe("Meine Agentur");
    expect(site.slug).toBe("meine-agentur");
    expect(site.createdAt).toBeTruthy();

    // Beide Naehte wurden benutzt: das Profil kam aus den Einstellungen, das
    // Theme wurde angelegt. Ein Modul, das selbst zum Store griffe, wuerde
    // gegen diesen Host nicht kompilieren.
    expect(rufe.some((r) => r.art === "getEngineSettings")).toBe(true);
    expect(rufe.some((r) => r.art === "ensureSiteTheme" && r.argumente === site.id)).toBe(true);
  });

  it("nimmt ein gewuenschtes Profil und weist ein unbekanntes ab", async () => {
    const { repo } = await fixture();

    const site = await repo.createSite({ name: "Profilprobe", profile: "showcase" });
    expect(site.profile).toBe("showcase");

    const fehler = await rejected(
      repo.createSite({ name: "Kaputt", profile: "gibt-es-nicht" as never }),
    );
    expect((fehler as SenifyError).category).toBe("validation");
    expect((fehler as SenifyError).field).toBe("profile");
  });

  it("weist einen leeren Namen ab", async () => {
    const { repo } = await fixture();
    const fehler = await rejected(repo.createSite({ name: "   " }));
    expect((fehler as SenifyError).category).toBe("validation");
    expect((fehler as SenifyError).field).toBe("name");
  });

  it("macht den Slug eindeutig, statt zu scheitern", async () => {
    const { repo } = await fixture();
    const eine = await repo.createSite({ name: "Doppelt" });
    const andere = await repo.createSite({ name: "Doppelt" });

    expect(eine.slug).toBe("doppelt");
    // Der zweite Versuch bekommt einen Zaehler, kein Konflikt.
    expect(andere.slug).toBe("doppelt-2");
    expect(andere.id).not.toBe(eine.id);
  });

  it("meldet einen gewuenschten, aber belegten Slug als conflict", async () => {
    const { repo } = await fixture();
    await repo.createSite({ name: "Erste", slug: "mein-slug" });

    const fehler = await rejected(repo.createSite({ name: "Zweite", slug: "mein-slug" }));
    expect((fehler as SenifyError).category).toBe("conflict");
    expect((fehler as SenifyError).field).toBe("slug");
  });

  it("meldet eine unbekannte Site als not_found mit Feld siteId", async () => {
    const { repo } = await fixture();
    const fehler = await rejected(repo.getSite("gibt-es-nicht"));
    expect(fehler).toBeInstanceOf(SenifyError);
    expect((fehler as SenifyError).category).toBe("not_found");
    expect((fehler as SenifyError).field).toBe("siteId");
  });
});

describe("SitesRepository: der Papierkorb", () => {
  it("legt in den Papierkorb, listet dort und holt zurueck", async () => {
    const { repo } = await fixture();
    const site = await repo.createSite({ name: "Wegwerf" });

    // Vorher: in der normalen Liste, nicht im Papierkorb.
    expect((await repo.listSites()).map((s) => s.id)).toContain(site.id);
    expect(await repo.listTrashedSites()).toHaveLength(0);

    await repo.trashSite(site.id);
    expect((await repo.listSites()).map((s) => s.id)).not.toContain(site.id);
    const imPapierkorb = await repo.listTrashedSites();
    expect(imPapierkorb).toHaveLength(1);
    // Der Papierkorb traegt den Zeitpunkt - sonst waere nicht zu sehen, wann.
    expect(imPapierkorb[0]?.trashedAt).toBeTruthy();

    await repo.restoreSite(site.id);
    expect((await repo.listSites()).map((s) => s.id)).toContain(site.id);
    expect(await repo.listTrashedSites()).toHaveLength(0);
  });

  it("meldet doppeltes Loeschen als conflict mit Begruendung", async () => {
    const { repo } = await fixture();
    const site = await repo.createSite({ name: "Zweimal" });
    await repo.trashSite(site.id);

    // conflict, nicht not_found: die Site gibt es noch, sie liegt schon im
    // Papierkorb. Und die Meldung sagt, was zu tun ist.
    const fehler = await rejected(repo.trashSite(site.id));
    expect((fehler as SenifyError).category).toBe("conflict");
    expect((fehler as SenifyError).message).toContain("already in the trash");
  });
});

describe("SitesRepository: die Felder der Site", () => {
  it("benennt um, wechselt das Profil und meldet leer als validation", async () => {
    const { repo } = await fixture();
    const site = await repo.createSite({ name: "Alt" });

    const neu = await repo.renameSite(site.id, "  Neu  ");
    expect(neu.name).toBe("Neu");

    const leer = await rejected(repo.renameSite(site.id, "   "));
    expect((leer as SenifyError).category).toBe("validation");

    const profil = await repo.updateSiteProfile(site.id, "showcase");
    expect(profil.profile).toBe("showcase");

    const unbekannt = await rejected(repo.updateSiteProfile(site.id, "nix" as never));
    expect((unbekannt as SenifyError).category).toBe("validation");
  });

  it("setzt die Basis-URL und nimmt sie mit null wieder zurueck", async () => {
    const { repo } = await fixture();
    const site = await repo.createSite({ name: "URL" });

    const mit = await repo.updateSiteBaseUrl(site.id, "https://example.test");
    expect(mit.baseUrl).toBe("https://example.test");

    const ohne = await repo.updateSiteBaseUrl(site.id, null);
    expect(ohne.baseUrl).toBeUndefined();

    const kaputt = await rejected(repo.updateSiteBaseUrl(site.id, "keine-url"));
    expect((kaputt as SenifyError).category).toBe("validation");
  });

  it("setzt die Breakpoints und faellt ohne Angabe auf den Standard zurueck", async () => {
    const { repo } = await fixture();
    const site = await repo.createSite({ name: "Breakpoints" });

    const mit = await repo.updateSiteBreakpoints(site.id, { tablet: 900, mobile: 500 });
    expect(mit.breakpoints).toEqual({ tablet: 900, mobile: 500 });

    const ohne = await repo.updateSiteBreakpoints(site.id, null);
    expect(ohne.breakpoints).toBeUndefined();

    const kaputt = await rejected(
      repo.updateSiteBreakpoints(site.id, { tablet: 100, mobile: 900 }),
    );
    expect((kaputt as SenifyError).category).toBe("validation");
  });

  it("liefert die Slugs aller Sites und die Pfade einer Site ueber die Naht", async () => {
    const { repo, store, rufe } = await fixture();
    const eine = await repo.createSite({ name: "Eins" });
    await repo.createSite({ name: "Zwei" });
    await store.createPage(eine.id, { title: "Start", path: "/" });

    expect(await repo.listSiteSlugs()).toEqual(expect.arrayContaining(["eins", "zwei"]));

    // listPagePaths reicht das Modul an sein Host-Fachgebiet weiter.
    expect(await repo.listPagePaths(eine.id)).toEqual(["/"]);
    expect(rufe.some((r) => r.art === "listPagePaths")).toBe(true);
  });
});

describe("SitesRepository: der Design-Contract", () => {
  it("setzt einen manuellen Contract, beschneidet und entdoppelt ihn", async () => {
    const { repo } = await fixture();
    const site = await repo.createSite({ name: "DNA" });

    // Vorher gibt es keinen.
    expect(await repo.getDesignContract(site.id)).toBeNull();

    const gesetzt = await repo.updateDesignContract(site.id, {
      constants: ["  Klare Kanten  ", "Klare Kanten", "  "],
      never: ["Verlaeufe"],
      vocabulary: ["ruhig"],
    });
    expect(gesetzt?.source).toBe("manual");
    // Leere und doppelte Eintraege sind weg, der Rand ist beschnitten.
    expect(gesetzt?.constants).toEqual(["Klare Kanten"]);
    expect(gesetzt?.never).toEqual(["Verlaeufe"]);

    // Und er ist gespeichert, nicht nur zurueckgegeben.
    expect((await repo.getDesignContract(site.id))?.constants).toEqual(["Klare Kanten"]);
  });

  it("loescht den Contract mit null", async () => {
    const { repo } = await fixture();
    const site = await repo.createSite({ name: "Loeschprobe" });
    await repo.updateDesignContract(site.id, { constants: ["a"], never: [], vocabulary: [] });

    expect(await repo.updateDesignContract(site.id, null)).toBeNull();
    expect(await repo.getDesignContract(site.id)).toBeNull();
  });

  it("ueberschreibt einen manuellen Contract NICHT aus den Referenzen", async () => {
    const { repo } = await fixture();
    const site = await repo.createSite({ name: "Manuell" });
    await repo.updateDesignContract(site.id, { constants: ["hand"], never: [], vocabulary: [] });

    // Ein Durchlauf mit Referenz-Profilen darf den manuellen Contract nicht
    // ersetzen - das ist die Regel, die den manuellen Vorrang schuetzt.
    const nachher = await repo.refreshDesignContractFromReferences(site.id, [
      { constants: ["aus-referenz"], never: [], vocabulary: [] },
    ]);
    expect(nachher?.source).toBe("manual");
    expect(nachher?.constants).toEqual(["hand"]);
  });

  it("leitet den Contract aus Referenzen ab und leert ihn ohne Profile", async () => {
    const { repo } = await fixture();
    const site = await repo.createSite({ name: "Abgeleitet" });

    const abgeleitet = await repo.refreshDesignContractFromReferences(site.id, [
      { constants: ["Kante"], never: ["Verlauf"], vocabulary: ["ruhig"] },
    ]);
    expect(abgeleitet?.source).toBe("references");
    expect(abgeleitet?.constants).toContain("Kante");

    // Ohne Profile wird er geleert - aber nur, weil er nicht manuell ist.
    expect(await repo.refreshDesignContractFromReferences(site.id, [])).toBeNull();
  });
});

describe("SitesRepository: loeschen", () => {
  it("loescht eine Site samt Seiten und meldet die Dateiverweise", async () => {
    const { repo, store } = await fixture();
    const site = await repo.createSite({ name: "Wegdamit" });
    await store.createPage(site.id, { title: "Start", path: "/" });

    const { fileRefs } = await repo.deleteSite(site.id);
    // Ohne Releases, Previews, Reviews und Proposals bleibt die Liste leer -
    // aber sie kommt zurueck, statt undefined.
    expect(Array.isArray(fileRefs)).toBe(true);

    // Die Site ist weg, ihre Seiten auch (Fremdschluessel folgen).
    const fehler = await rejected(repo.getSite(site.id));
    expect((fehler as SenifyError).category).toBe("not_found");
  });

  it("meldet eine unbekannte Site beim Loeschen als not_found", async () => {
    const { repo } = await fixture();
    const fehler = await rejected(repo.deleteSite("gibt-es-nicht"));
    expect((fehler as SenifyError).category).toBe("not_found");
    expect((fehler as SenifyError).field).toBe("siteId");
  });
});
