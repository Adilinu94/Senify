import { describe, expect, it } from "vitest";
import { REFERENZ_TOOLS } from "../src/tools-referenzen.ts";

// Die Referenz- und Design-Werkzeuge (R12, Schritt 71).
//
// Sie standen bis zum Schnitt in `tools.ts` und waren dort von den
// Workflow-Tests gedeckt; nach dem Schnitt mass der Waechter
// (`coverage-gate.test.ts`) die Datei einzeln. Die Workflow-Tests fahren den
// gluecklichen Weg mit echten Daten - die OPTIONALEN Felder und die
// Fehlerpfade bleiben dabei unberuehrt, weil ein Aufruf sie auch mal
// weglaesst. Genau diese Zweige prueft dieser Test: die Uebersetzung von
// Argumenten zu Methode, Pfad und Koerper.
//
// Der Client ist ein Doppel: er merkt sich den Aufruf und gibt eine
// vorgegebene Antwort zurueck. Kein Netz, keine Datenbank.

type Aufruf = { method: string; path: string; body: unknown };
type Elicit = (request: {
  message: string;
  fields: { name: string; description: string; required?: boolean }[];
}) => Promise<Record<string, unknown> | undefined>;

function werkzeug(name: string) {
  const tool = REFERENZ_TOOLS.find((entry) => entry.name === name);
  if (tool === undefined) throw new Error(`Werkzeug fehlt: ${name}`);
  return tool;
}

function lauf(
  name: string,
  args: Record<string, unknown> = {},
  optionen: { antwort?: unknown; elicit?: Elicit } = {},
) {
  const aufrufe: Aufruf[] = [];
  const context = {
    client: {
      tokenName: async () => "agent-token",
      request: async (method: string, path: string, body?: unknown) => {
        aufrufe.push({ method, path, body });
        return optionen.antwort ?? { ok: true };
      },
    },
    ...(optionen.elicit === undefined ? {} : { elicit: optionen.elicit }),
  } as never;
  return {
    aufrufe,
    ergebnis: () => werkzeug(name).handler(context, args as never),
  };
}

const koerper = (aufruf: Aufruf | undefined) => aufruf?.body as Record<string, unknown>;

describe("Referenz- und Design-Werkzeuge: die Uebersetzung", () => {
  it("fuehrt genau die einunddreissig Werkzeuge des Moduls", () => {
    // Eine stille Loeschung beim Schnitt waere sonst nur im Manifest
    // aufgefallen; diese Liste haelt die Gruppe zusaetzlich fest.
    expect(REFERENZ_TOOLS.map((tool) => tool.name)).toEqual([
      "analyze_reference",
      "list_references",
      "search_references",
      "find_duplicate_references",
      "get_reference",
      "apply_reference",
      "list_reference_collections",
      "create_reference_collection",
      "assign_reference_to_collection",
      "get_reference_brief",
      "plan_redesign",
      "create_redesign_proposal",
      "get_redesign_proposal",
      "apply_redesign",
      "import_design_system",
      "get_design_report",
      "diff_reference",
      "get_reference_docs",
      "update_reference_doc",
      "create_manual_reference",
      "update_reference",
      "delete_reference",
      "edit_reference_profile",
      "list_reference_revisions",
      "unassign_reference",
      "reference_tick",
      "update_reference_collection",
      "delete_reference_collection",
      "get_reference_settings",
      "set_reference_settings",
      "get_design_contract",
    ]);
  });

  it("startet eine Analyse mit der Autor-Kennung des Tokens", async () => {
    const { aufrufe, ergebnis } = lauf("analyze_reference", {
      url: "https://example.com",
    });
    await ergebnis();
    expect(aufrufe[0]).toEqual({
      method: "POST",
      path: "/api/references",
      body: {
        url: "https://example.com",
        author: { kind: "agent", id: "agent-token", label: "agent-token" },
      },
    });
  });

  it("nimmt Name, Warten und Snapshot nur mit, wenn sie kommen", async () => {
    // `snapshot` ist der Rueckfallweg ohne Netz (gespeicherter Seitenquelltext);
    // ein `undefined` im Koerper saehe wie ein ausdruecklich leerer Snapshot aus.
    const { aufrufe, ergebnis } = lauf("analyze_reference", {
      url: "https://example.com",
      name: "Beispiel",
      wait: true,
      snapshot: { html: "<main></main>" },
    });
    await ergebnis();
    const body = koerper(aufrufe[0]);
    expect(body.name).toBe("Beispiel");
    expect(body.wait).toBe(true);
    expect(body.snapshot).toEqual({ html: "<main></main>" });
  });

  it("listet die Bibliothek ohne und mit Filtern", async () => {
    const ohne = lauf("list_references");
    await ohne.ergebnis();
    expect(ohne.aufrufe[0]).toEqual({
      method: "GET",
      path: "/api/references",
      body: undefined,
    });

    const mit = lauf("list_references", {
      q: "karte",
      family: "editorial",
      status: "ready",
      collection: "c1",
      sort: "name",
    });
    await mit.ergebnis();
    // Die Reihenfolge der Parameter ist Teil der Anfrage: URLSearchParams
    // haengt sie in der Reihenfolge an, in der sie gesetzt wurden.
    expect(mit.aufrufe[0]?.path).toBe(
      "/api/references?q=karte&family=editorial&status=ready&collection=c1&sort=name",
    );
  });

  it("sucht mit kodierter Anfrage", async () => {
    const { aufrufe, ergebnis } = lauf("search_references", {
      q: "gruene flaeche",
    });
    await ergebnis();
    expect(aufrufe[0]?.path).toBe(
      "/api/references/search?q=gruene%20flaeche",
    );
  });

  it("liest Dubletten und eine Referenz", async () => {
    const dubletten = lauf("find_duplicate_references");
    await dubletten.ergebnis();
    expect(dubletten.aufrufe[0]?.path).toBe("/api/references/duplicates");

    const reference = lauf("get_reference", { referenceId: "r1" });
    await reference.ergebnis();
    expect(reference.aufrufe[0]?.path).toBe("/api/references/r1");
  });

  it("ordnet eine Referenz einer Site zu, mit optionalen Skalen", async () => {
    const ohne = lauf("apply_reference", { siteId: "s1", referenceId: "r1" });
    await ohne.ergebnis();
    expect(ohne.aufrufe[0]?.path).toBe("/api/sites/s1/references");
    const ohneBody = koerper(ohne.aufrufe[0]);
    expect(ohneBody.referenceId).toBe("r1");
    expect("scales" in ohneBody).toBe(false);

    const mit = lauf("apply_reference", {
      siteId: "s1",
      referenceId: "r1",
      scales: ["color", "type"],
    });
    await mit.ergebnis();
    expect(koerper(mit.aufrufe[0]).scales).toEqual(["color", "type"]);
  });

  it("liest Sammlungen und den Stil-Katalog ueber denselben Weg", async () => {
    const alle = lauf("list_reference_collections");
    await alle.ergebnis();
    expect(alle.aufrufe[0]?.path).toBe("/api/reference-collections");

    const stil = lauf("list_reference_collections", { kind: "style" });
    await stil.ergebnis();
    expect(stil.aufrufe[0]?.path).toBe("/api/reference-collections?kind=style");
  });

  it("legt eine Sammlung mit allen optionalen Feldern an", async () => {
    const { aufrufe, ergebnis } = lauf("create_reference_collection", {
      name: "Handbuecher",
      description: "Ruhige Dokumentation",
      deployFor: "docs",
      vocabulary: ["raster", "papier"],
      risk: "low",
      accent: "#2f6f4e",
      imageStyle: "editorial",
      recognize: ["Serifen"],
      examples: [{ name: "Beispiel", url: "https://example.com" }],
      warning: null,
      kind: "collection",
      position: 2,
      idempotencyKey: "key-1",
    });
    await ergebnis();
    expect(aufrufe[0]?.method).toBe("POST");
    expect(koerper(aufrufe[0])).toMatchObject({
      name: "Handbuecher",
      description: "Ruhige Dokumentation",
      deployFor: "docs",
      vocabulary: ["raster", "papier"],
      risk: "low",
      accent: "#2f6f4e",
      imageStyle: "editorial",
      recognize: ["Serifen"],
      examples: [{ name: "Beispiel", url: "https://example.com" }],
      warning: null,
      kind: "collection",
      position: 2,
      idempotencyKey: "key-1",
    });
  });

  it("laesst die optionalen Felder einer Sammlung weg", async () => {
    const { aufrufe, ergebnis } = lauf("create_reference_collection", {
      name: "Nur Name",
    });
    await ergebnis();
    const body = koerper(aufrufe[0]);
    for (const key of [
      "description",
      "deployFor",
      "vocabulary",
      "risk",
      "accent",
      "imageStyle",
      "recognize",
      "examples",
      "warning",
      "kind",
      "position",
      "idempotencyKey",
    ]) {
      expect(key in body).toBe(false);
    }
  });

  it("ordnet zu und loest die Zuordnung nur mit ausdruecklichem null", async () => {
    const zu = lauf("assign_reference_to_collection", {
      referenceId: "r1",
      collectionId: "c1",
    });
    await zu.ergebnis();
    expect(zu.aufrufe[0]).toEqual({
      method: "PATCH",
      path: "/api/references/r1",
      body: { collectionId: "c1" },
    });

    const weg = lauf("assign_reference_to_collection", {
      referenceId: "r1",
      collectionId: null,
    });
    await weg.ergebnis();
    expect(koerper(weg.aufrufe[0])).toEqual({ collectionId: null });

    // Fehlt der Schluessel ganz, ist das keine Loesung: der Server koennte
    // "nicht gesetzt" nicht von "ausdruecklich leer" unterscheiden.
    const fehlt = lauf("assign_reference_to_collection", { referenceId: "r1" });
    await expect(fehlt.ergebnis()).rejects.toThrow(/collectionId/);
  });

  it("baut den Brief aus genau einer Quelle", async () => {
    const einzeln = lauf("get_reference_brief", { referenceId: "r1" });
    await einzeln.ergebnis();
    expect(einzeln.aufrufe[0]?.path).toBe("/api/references/r1/brief");

    const sammlung = lauf("get_reference_brief", { collectionId: "c1" });
    await sammlung.ergebnis();
    expect(sammlung.aufrufe[0]?.path).toBe("/api/reference-collections/c1/brief");

    const sammel = lauf("get_reference_brief", { referenceIds: ["r1", "r2"] });
    await sammel.ergebnis();
    expect(sammel.aufrufe[0]).toEqual({
      method: "POST",
      path: "/api/references/brief",
      body: { referenceIds: ["r1", "r2"] },
    });
  });

  it("fragt nach der Quelle, wenn der Client nachfragen kann", async () => {
    // Die Elicitation (E4, Scheibe 2) ersetzt die Fehlermeldung, wenn der
    // Client sie unterstuetzt: nachfragen ist besser als raten.
    const ref = lauf("get_reference_brief", {}, {
      elicit: async () => ({ referenceId: "r1" }),
    });
    await ref.ergebnis();
    expect(ref.aufrufe[0]?.path).toBe("/api/references/r1/brief");

    const collection = lauf("get_reference_brief", {}, {
      elicit: async () => ({ collectionId: "c1" }),
    });
    await collection.ergebnis();
    expect(collection.aufrufe[0]?.path).toBe("/api/reference-collections/c1/brief");

    // Lehnt der Client ab (undefined) oder antwortet leer, bleibt es beim
    // Validierungsfehler - kein Aufruf ohne Quelle.
    const abgelehnt = lauf("get_reference_brief", {}, {
      elicit: async () => undefined,
    });
    await expect(abgelehnt.ergebnis()).rejects.toThrow(/exactly one/);
    expect(abgelehnt.aufrufe).toEqual([]);

    const leer = lauf("get_reference_brief", {}, {
      elicit: async () => ({}),
    });
    await expect(leer.ergebnis()).rejects.toThrow(/exactly one/);
  });

  it("verlangt genau eine Quelle, nicht zwei", async () => {
    const zwei = lauf("get_reference_brief", {
      referenceId: "r1",
      collectionId: "c1",
    });
    await expect(zwei.ergebnis()).rejects.toThrow(/exactly one/);

    const keine = lauf("get_reference_brief");
    await expect(keine.ergebnis()).rejects.toThrow(/exactly one/);
  });

  it("plant ein Redesign mit geprueften Referenz-ids", async () => {
    const { aufrufe, ergebnis } = lauf("plan_redesign", {
      pageId: "p1",
      referenceIds: ["r1", "r2"],
    });
    await ergebnis();
    expect(aufrufe[0]?.path).toBe(
      "/api/pages/p1/redesign-package?referenceIds=r1%2Cr2",
    );

    for (const kaputt of ["", 42]) {
      const fall = lauf("plan_redesign", {
        pageId: "p1",
        referenceIds: [kaputt],
      });
      await expect(fall.ergebnis()).rejects.toThrow(/referenceIds/);
    }
  });

  it("legt ein Redesign-Angebot an, mit und ohne Idempotenzschluessel", async () => {
    const ohne = lauf("create_redesign_proposal", {
      pageId: "p1",
      referenceIds: ["r1"],
    });
    await ohne.ergebnis();
    expect(ohne.aufrufe[0]?.path).toBe("/api/pages/p1/redesign-proposals");
    expect("idempotencyKey" in koerper(ohne.aufrufe[0])).toBe(false);

    const mit = lauf("create_redesign_proposal", {
      pageId: "p1",
      referenceIds: ["r1"],
      idempotencyKey: "key-1",
    });
    await mit.ergebnis();
    expect(koerper(mit.aufrufe[0]).idempotencyKey).toBe("key-1");

    const kaputt = lauf("create_redesign_proposal", {
      pageId: "p1",
      referenceIds: [42],
    });
    await expect(kaputt.ergebnis()).rejects.toThrow(/referenceIds/);
  });

  it("liest ein Redesign-Angebot", async () => {
    const { aufrufe, ergebnis } = lauf("get_redesign_proposal", {
      proposalId: "prop1",
    });
    await ergebnis();
    expect(aufrufe[0]?.path).toBe("/api/redesign-proposals/prop1");
  });

  it("wendet ein Redesign ueber Referenzen oder eine Sammlung an", async () => {
    const refs = lauf("apply_redesign", {
      siteId: "s1",
      referenceIds: ["r1", "r2"],
      pageId: "p1",
      withContent: true,
      idempotencyKey: "key-1",
    });
    await refs.ergebnis();
    expect(refs.aufrufe[0]?.path).toBe("/api/sites/s1/redesign");
    expect(koerper(refs.aufrufe[0])).toEqual({
      referenceIds: ["r1", "r2"],
      pageId: "p1",
      withContent: true,
      idempotencyKey: "key-1",
    });

    // Mit Sammlung entfaellt referenceIds: die Sammlung bringt ihre eigenen
    // Referenzen mit (Set-Semantik).
    const set = lauf("apply_redesign", { siteId: "s1", collectionId: "c1" });
    await set.ergebnis();
    const setBody = koerper(set.aufrufe[0]);
    expect(setBody.collectionId).toBe("c1");
    expect("referenceIds" in setBody).toBe(false);
    expect("pageId" in setBody).toBe(false);
    expect("withContent" in setBody).toBe(false);
    expect("idempotencyKey" in setBody).toBe(false);

    const kaputt = lauf("apply_redesign", {
      siteId: "s1",
      referenceIds: [null],
    });
    await expect(kaputt.ergebnis()).rejects.toThrow(/referenceIds/);
  });

  it("liest Design-System, Report, Vertrag und Diff", async () => {
    const system = lauf("import_design_system", {
      referenceId: "r1",
      siteId: "s 1",
    });
    await system.ergebnis();
    expect(system.aufrufe[0]?.path).toBe(
      "/api/references/r1/design-system?siteId=s%201",
    );

    const report = lauf("get_design_report", { siteId: "s1" });
    await report.ergebnis();
    expect(report.aufrufe[0]?.path).toBe("/api/sites/s1/design-report");

    const vertrag = lauf("get_design_contract", { siteId: "s1" });
    await vertrag.ergebnis();
    expect(vertrag.aufrufe[0]?.path).toBe("/api/sites/s1/design-contract");

    const diff = lauf("diff_reference", { referenceId: "r1", siteId: "s1" });
    await diff.ergebnis();
    expect(diff.aufrufe[0]?.method).toBe("POST");
    expect(diff.aufrufe[0]?.path).toBe("/api/references/r1/visual-diff");
    expect("pageId" in koerper(diff.aufrufe[0])).toBe(false);

    const seite = lauf("diff_reference", {
      referenceId: "r1",
      siteId: "s1",
      pageId: "p1",
    });
    await seite.ergebnis();
    expect(koerper(seite.aufrufe[0]).pageId).toBe("p1");
  });

  it("liest Dokumente mit und ohne Filter und fuellt fehlende Felder", async () => {
    const leer = lauf("get_reference_docs", { referenceId: "r1" }, {
      antwort: {},
    });
    const leerErgebnis = (await leer.ergebnis()) as {
      name: unknown;
      sourceUrl: unknown;
      documents: unknown;
    };
    // Kein Dokument heisst null, nicht undefined: der Client soll die drei
    // Plaetze sehen, die es gibt.
    expect(leerErgebnis).toEqual({
      referenceId: "r1",
      name: null,
      sourceUrl: null,
      documents: { design: null, guidelines: null, components: null },
    });

    const voll = lauf("get_reference_docs", { referenceId: "r1" }, {
      antwort: {
        name: "Studio",
        sourceUrl: "https://example.com",
        documents: { design: "#", guidelines: null, components: "##" },
      },
    });
    const vollErgebnis = (await voll.ergebnis()) as { documents: unknown };
    expect(vollErgebnis.documents).toEqual({
      design: "#",
      guidelines: null,
      components: "##",
    });

    const gefiltert = lauf("get_reference_docs", {
      referenceId: "r1",
      kind: "design",
    }, {
      antwort: { documents: { design: "#", components: "##" } },
    });
    const gefiltertErgebnis = (await gefiltert.ergebnis()) as {
      documents: unknown;
    };
    expect(gefiltertErgebnis.documents).toEqual({ design: "#" });

    // Ein Filter auf ein fehlendes Dokument liefert null statt zu fehlen.
    const fehlt = lauf("get_reference_docs", {
      referenceId: "r1",
      kind: "guidelines",
    }, {
      antwort: { documents: { design: "#" } },
    });
    const fehltErgebnis = (await fehlt.ergebnis()) as { documents: unknown };
    expect(fehltErgebnis.documents).toEqual({ guidelines: null });
  });

  it("schreibt genau ein Dokument und prueft Art und Inhalt", async () => {
    const text = lauf("update_reference_doc", {
      referenceId: "r1",
      kind: "guidelines",
      content: "# Regeln",
    });
    await text.ergebnis();
    expect(text.aufrufe[0]).toEqual({
      method: "PATCH",
      path: "/api/references/r1",
      body: { documents: { guidelines: "# Regeln" } },
    });

    // null loescht das Dokument - der Schluessel muss ankommen.
    const loeschen = lauf("update_reference_doc", {
      referenceId: "r1",
      kind: "design",
      content: null,
    });
    await loeschen.ergebnis();
    expect(koerper(loeschen.aufrufe[0])).toEqual({
      documents: { design: null },
    });

    const unbekannt = lauf("update_reference_doc", {
      referenceId: "r1",
      kind: "brand",
      content: "x",
    });
    await expect(unbekannt.ergebnis()).rejects.toThrow(/Unknown document kind/);

    const ohneInhalt = lauf("update_reference_doc", {
      referenceId: "r1",
      kind: "design",
    });
    await expect(ohneInhalt.ergebnis()).rejects.toThrow(/content/);
  });

  it("legt eine manuelle Referenz mit allen optionalen Feldern an", async () => {
    const minimal = lauf("create_manual_reference", {
      name: "Handbuch",
      image: "iVBORw0KGgo=",
    });
    await minimal.ergebnis();
    expect(minimal.aufrufe[0]?.path).toBe("/api/references/manual");
    expect(koerper(minimal.aufrufe[0])).toEqual({
      name: "Handbuch",
      image: "iVBORw0KGgo=",
    });

    const voll = lauf("create_manual_reference", {
      name: "Handbuch",
      image: "iVBORw0KGgo=",
      imageMobile: "iVBORw0KGgo=",
      sourceUrl: "https://example.com",
      collectionId: "c1",
      note: "Notiz",
      vocabulary: ["raster"],
      imageRecipe: "Stillleben",
      heroUsage: "volle Breite",
      family: "editorial",
      capturedAt: "2026-10-31",
      documents: { design: "#" },
    });
    await voll.ergebnis();
    expect(koerper(voll.aufrufe[0])).toMatchObject({
      imageMobile: "iVBORw0KGgo=",
      sourceUrl: "https://example.com",
      collectionId: "c1",
      note: "Notiz",
      vocabulary: ["raster"],
      imageRecipe: "Stillleben",
      heroUsage: "volle Breite",
      family: "editorial",
      capturedAt: "2026-10-31",
      documents: { design: "#" },
    });
  });

  it("aendert nur die gesendeten Bibliotheksfelder", async () => {
    const teil = lauf("update_reference", {
      referenceId: "r1",
      name: "Neu",
      collectionId: null,
    });
    await teil.ergebnis();
    expect(teil.aufrufe[0]).toEqual({
      method: "PATCH",
      path: "/api/references/r1",
      body: { name: "Neu", collectionId: null },
    });

    const voll = lauf("update_reference", {
      referenceId: "r1",
      sourceUrl: "https://example.com",
      note: null,
      vocabulary: ["raster"],
      imageRecipe: null,
      heroUsage: null,
      family: null,
      documents: { design: "#" },
    });
    await voll.ergebnis();
    expect(koerper(voll.aufrufe[0])).toEqual({
      sourceUrl: "https://example.com",
      note: null,
      vocabulary: ["raster"],
      imageRecipe: null,
      heroUsage: null,
      family: null,
      documents: { design: "#" },
    });

    const leer = lauf("update_reference", { referenceId: "r1" });
    await expect(leer.ergebnis()).rejects.toThrow(/Nothing to update/);
    expect(leer.aufrufe).toEqual([]);
  });

  it("loescht eine Referenz nur mit force an den Projekt-Zuordnungen vorbei", async () => {
    const sanft = lauf("delete_reference", { referenceId: "r1" });
    await sanft.ergebnis();
    expect(sanft.aufrufe[0]?.path).toBe("/api/references/r1");

    const hart = lauf("delete_reference", { referenceId: "r1", force: true });
    await hart.ergebnis();
    expect(hart.aufrufe[0]?.path).toBe("/api/references/r1?force=1");
  });

  it("bearbeitet ein Profil nur mit mindestens einem Feld", async () => {
    const voll = lauf("edit_reference_profile", {
      referenceId: "r1",
      note: "Notiz",
      vocabulary: ["raster"],
      families: ["editorial"],
      rules: { constants: ["8px"] },
    });
    await voll.ergebnis();
    expect(voll.aufrufe[0]).toEqual({
      method: "POST",
      path: "/api/references/r1/revisions",
      body: {
        note: "Notiz",
        vocabulary: ["raster"],
        families: ["editorial"],
        rules: { constants: ["8px"] },
      },
    });

    // Einzelne Felder: alles, was nicht gesendet wird, faellt aus dem Koerper,
    // statt als `undefined` die Revision zu verwischen.
    const ohneNote = lauf("edit_reference_profile", {
      referenceId: "r1",
      rules: { constants: ["8px"] },
    });
    await ohneNote.ergebnis();
    expect(koerper(ohneNote.aufrufe[0])).toEqual({ rules: { constants: ["8px"] } });

    const ohneRegeln = lauf("edit_reference_profile", {
      referenceId: "r1",
      note: "Nur Notiz",
    });
    await ohneRegeln.ergebnis();
    expect(koerper(ohneRegeln.aufrufe[0])).toEqual({ note: "Nur Notiz" });

    const leer = lauf("edit_reference_profile", { referenceId: "r1" });
    await expect(leer.ergebnis()).rejects.toThrow(/Nothing to edit/);
    expect(leer.aufrufe).toEqual([]);
  });

  it("liest Revisionen und loest eine Projekt-Zuordnung", async () => {
    const revisionen = lauf("list_reference_revisions", { referenceId: "r1" });
    await revisionen.ergebnis();
    expect(revisionen.aufrufe[0]?.path).toBe("/api/references/r1/revisions");

    const loesen = lauf("unassign_reference", {
      siteId: "s1",
      referenceId: "r1",
    });
    await loesen.ergebnis();
    expect(loesen.aufrufe[0]).toEqual({
      method: "DELETE",
      path: "/api/sites/s1/references/r1",
      body: undefined,
    });
  });

  it("laesst den Tick ohne Limit laufen", async () => {
    const ohne = lauf("reference_tick");
    await ohne.ergebnis();
    expect(ohne.aufrufe[0]).toEqual({
      method: "POST",
      path: "/api/references/tick",
      body: {},
    });

    const mit = lauf("reference_tick", { limit: 5 });
    await mit.ergebnis();
    expect(koerper(mit.aufrufe[0])).toEqual({ limit: 5 });
  });

  it("aendert eine Sammlung nur mit mindestens einem Feld", async () => {
    const voll = lauf("update_reference_collection", {
      collectionId: "c1",
      name: "Neu",
      description: "Text",
      deployFor: "docs",
      vocabulary: ["raster"],
      risk: "low",
      accent: "#000000",
      imageStyle: "editorial",
      recognize: ["Serifen"],
      examples: [{ name: "Beispiel" }],
      warning: null,
      position: 3,
    });
    await voll.ergebnis();
    expect(voll.aufrufe[0]?.method).toBe("PATCH");
    expect(voll.aufrufe[0]?.path).toBe("/api/reference-collections/c1");
    expect(koerper(voll.aufrufe[0])).toEqual({
      name: "Neu",
      description: "Text",
      deployFor: "docs",
      vocabulary: ["raster"],
      risk: "low",
      accent: "#000000",
      imageStyle: "editorial",
      recognize: ["Serifen"],
      examples: [{ name: "Beispiel" }],
      warning: null,
      position: 3,
    });

    const leer = lauf("update_reference_collection", { collectionId: "c1" });
    await expect(leer.ergebnis()).rejects.toThrow(/Nothing to update/);
    expect(leer.aufrufe).toEqual([]);
  });

  it("loescht eine Sammlung, ohne ihre Referenzen mitzunehmen", async () => {
    const { aufrufe, ergebnis } = lauf("delete_reference_collection", {
      collectionId: "c1",
    });
    await ergebnis();
    expect(aufrufe[0]).toEqual({
      method: "DELETE",
      path: "/api/reference-collections/c1",
      body: undefined,
    });
  });

  it("liest und schreibt die Haus-DNA", async () => {
    const leer = lauf("get_reference_settings", {}, { antwort: {} });
    expect(await leer.ergebnis()).toEqual({ dna: null, preferences: null });

    const voll = lauf("get_reference_settings", {}, {
      antwort: {
        referenceDna: { name: "Haus" },
        referencePreferences: { includeDna: true },
      },
    });
    expect(await voll.ergebnis()).toEqual({
      dna: { name: "Haus" },
      preferences: { includeDna: true },
    });

    const dna = lauf("set_reference_settings", { dna: { name: "Haus" } });
    await dna.ergebnis();
    expect(dna.aufrufe[0]).toEqual({
      method: "PUT",
      path: "/api/settings",
      body: { referenceDna: { name: "Haus" } },
    });

    const prefs = lauf("set_reference_settings", {
      preferences: { includeDna: false },
    });
    await prefs.ergebnis();
    expect(koerper(prefs.aufrufe[0])).toEqual({
      referencePreferences: { includeDna: false },
    });

    const beide = lauf("set_reference_settings", {
      dna: { name: "Haus" },
      preferences: { includeDna: true },
    });
    await beide.ergebnis();
    expect(koerper(beide.aufrufe[0])).toEqual({
      referenceDna: { name: "Haus" },
      referencePreferences: { includeDna: true },
    });

    const nichts = lauf("set_reference_settings");
    await expect(nichts.ergebnis()).rejects.toThrow(/Nothing to write/);
    expect(nichts.aufrufe).toEqual([]);
  });

  it("nennt zu jedem Werkzeug seine Entitaet fuer das Audit", () => {
    // `entity` landet im MCP-Audit und ist die Spur bei einem Vorfall:
    // welche Referenz, welche Site, welche Sammlung. Auch ein leeres Argument
    // darf keinen `undefined`-Text erzeugen.
    const faelle: [string, Record<string, unknown>, string][] = [
      ["analyze_reference", { url: "https://example.com" }, "reference:https://example.com"],
      ["get_reference", { referenceId: "r1" }, "reference:r1"],
      ["apply_reference", { siteId: "s1" }, "site:s1"],
      ["create_reference_collection", { name: "Handbuecher" }, "collection:Handbuecher"],
      ["assign_reference_to_collection", { referenceId: "r1" }, "reference:r1"],
      ["get_reference_brief", { referenceId: "r1" }, "reference:r1"],
      ["get_reference_brief", { collectionId: "c1" }, "collection:c1"],
      ["plan_redesign", { pageId: "p1" }, "page:p1"],
      ["create_redesign_proposal", { pageId: "p1" }, "page:p1"],
      ["get_redesign_proposal", { proposalId: "prop1" }, "redesign-proposal:prop1"],
      ["apply_redesign", { siteId: "s1" }, "site:s1"],
      ["import_design_system", { referenceId: "r1" }, "reference:r1"],
      ["get_design_report", { siteId: "s1" }, "site:s1"],
      ["diff_reference", { referenceId: "r1" }, "reference:r1"],
      ["get_reference_docs", { referenceId: "r1" }, "reference:r1"],
      ["update_reference_doc", { referenceId: "r1" }, "reference:r1"],
      ["create_manual_reference", { name: "Handbuch" }, "reference:Handbuch"],
      ["update_reference", { referenceId: "r1" }, "reference:r1"],
      ["delete_reference", { referenceId: "r1" }, "reference:r1"],
      ["edit_reference_profile", { referenceId: "r1" }, "reference:r1"],
      ["list_reference_revisions", { referenceId: "r1" }, "reference:r1"],
      ["unassign_reference", { siteId: "s1" }, "site:s1"],
      ["update_reference_collection", { collectionId: "c1" }, "collection:c1"],
      ["delete_reference_collection", { collectionId: "c1" }, "collection:c1"],
      ["get_design_contract", { siteId: "s1" }, "site:s1"],
    ];
    for (const [name, args, erwartet] of faelle) {
      expect(werkzeug(name).entity?.(args as never, {})).toBe(erwartet);
    }

    // Ohne Argument bleibt die Spur ein leerer Schluessel, kein "undefined".
    const entitaeten = [
      "analyze_reference",
      "get_reference",
      "apply_reference",
      "create_reference_collection",
      "assign_reference_to_collection",
      "get_reference_brief",
      "plan_redesign",
      "create_redesign_proposal",
      "get_redesign_proposal",
      "apply_redesign",
      "import_design_system",
      "get_design_report",
      "diff_reference",
      "get_reference_docs",
      "update_reference_doc",
      "create_manual_reference",
      "update_reference",
      "delete_reference",
      "edit_reference_profile",
      "list_reference_revisions",
      "unassign_reference",
      "update_reference_collection",
      "delete_reference_collection",
      "get_design_contract",
    ];
    for (const name of entitaeten) {
      const wert = werkzeug(name).entity?.({} as never, {});
      expect(wert).not.toContain("undefined");
      expect(wert?.endsWith(":")).toBe(true);
    }
  });
});
