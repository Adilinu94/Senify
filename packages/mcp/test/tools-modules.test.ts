import { describe, expect, it, vi } from "vitest";
import { IMPORT_TOOLS } from "../src/tools-import.ts";
import { SECTION_TOOLS } from "../src/tools-katalog.ts";
import { PAGE_CREATE_TOOLS, PAGE_LIFECYCLE_TOOLS, PAGE_READ_TOOLS } from "../src/tools-seiten.ts";
import { MUTATION_TOOLS } from "../src/tools-mutationen.ts";
import { RELEASE_TOOLS } from "../src/tools-release.ts";
import { registry } from "../src/tools-support.ts";

vi.mock("../src/unframer.ts", () => ({
  snapshotUnframer: vi.fn(async (input: unknown) => ({ snapshot: input })),
}));
vi.mock("../src/framer-export.ts", () => ({
  exportFramerSite: vi.fn(async () => "/tmp/framer-mirror"),
}));
vi.mock("../src/framer-site-import.ts", () => ({
  importFramerSite: vi.fn(async () => ({ status: "analyzed", pages: [] })),
}));
vi.mock("@senify/framer-import", () => ({
  prepareMirrorSite: vi.fn(async () => ({
    outputDir: "/tmp/prepared",
    pages: 2,
    blockedPages: [],
    ignoredFlattenedPages: false,
    snapshot: null,
    assets: { downloads: [{ url: "a" }], fonts: [{ family: "x" }], failed: 0 },
  })),
}));

type Aufruf = { method: string; path: string; body: unknown };

function tool(list: { name: string; handler: Function; entity?: Function }[], name: string) {
  const found = list.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`Werkzeug fehlt: ${name}`);
  return found;
}

function lauf(list: { name: string; handler: Function; entity?: Function }[], name: string, args: Record<string, unknown> = {}) {
  const aufrufe: Aufruf[] = [];
  const context = {
    client: {
      tokenName: async () => "tester",
      request: async (method: string, path: string, body?: unknown) => {
        aufrufe.push({ method, path, body });
        return { ok: true };
      },
    },
  } as never;
  return { aufrufe, ergebnis: () => tool(list, name).handler(context, args) };
}

describe("Import-Werkzeuge: die Übersetzung", () => {
  it("baut den vollständigen Framer-Seitenimport", async () => {
    const { aufrufe, ergebnis } = lauf(IMPORT_TOOLS, "import_framer_page", {
      siteId: "s1",
      url: "https://site.test/",
      rootDir: "mirror",
      sourcePagePath: "/blog",
      html: "<div></div>",
      baseUrl: "https://site.test",
      pagePath: "/ziel",
      pageId: "p1",
      baseDraftVersion: 3,
      write: true,
      applyTheme: true,
      assets: "skip",
      fonts: "skip",
      capture: "browser",
      mode: "fidelity",
      idempotencyKey: "key",
    });
    await ergebnis();
    expect(aufrufe[0]).toMatchObject({
      method: "POST",
      path: "/api/sites/s1/imports/framer",
      body: {
        source: { url: "https://site.test/", rootDir: "mirror", page: "/blog", html: "<div></div>", baseUrl: "https://site.test" },
        pagePath: "/ziel",
        pageId: "p1",
        baseDraftVersion: 3,
        write: true,
        applyTheme: true,
        assets: "skip",
        fonts: "skip",
        capture: "browser",
        mode: "fidelity",
        idempotencyKey: "key",
      },
    });
  });

  it("nimmt HTML ohne weitere Quelle und lehnt eine leere Quelle ab", async () => {
    const { aufrufe, ergebnis } = lauf(IMPORT_TOOLS, "import_framer_page", { siteId: "s1", html: "<div></div>" });
    await ergebnis();
    expect(aufrufe[0]?.body).toEqual({ source: { html: "<div></div>" } });
    await expect(lauf(IMPORT_TOOLS, "import_framer_page", { siteId: "s1" }).ergebnis()).rejects.toMatchObject({ category: "validation" });
  });

  it("liest einen Import-Bericht", async () => {
    const { aufrufe, ergebnis } = lauf(IMPORT_TOOLS, "get_import_report", { jobId: "j1" });
    await ergebnis();
    expect(aufrufe[0]).toEqual({ method: "GET", path: "/api/imports/j1", body: undefined });
  });

  it("speichert einen Unframer-Snapshot", async () => {
    const { ergebnis } = lauf(IMPORT_TOOLS, "snapshot_unframer_project", { secretUrl: "https://u.test/p", sourceUrl: "https://s.test", outputDir: "out" });
    await expect(ergebnis()).resolves.toMatchObject({ snapshot: { secretUrl: "https://u.test/p" } });
  });

  it("bereitet einen Export vor und meldet die Zahlen", async () => {
    const ohneSnapshot = await lauf(IMPORT_TOOLS, "prepare_framer_export", { rootDir: "src", outputDir: "out" }).ergebnis();
    expect(ohneSnapshot).toMatchObject({ outputDir: "/tmp/prepared", pages: 2, downloadedAssets: 1, fonts: 1, runtimeFreeVerified: false });
    const mitSnapshot = await lauf(IMPORT_TOOLS, "prepare_framer_export", { rootDir: "src", outputDir: "out", unframerSnapshot: "snap.json" }).ergebnis();
    expect(mitSnapshot).toMatchObject({ pages: 2 });
  });

  it("exportiert eine Framer-Seite und importiert einen Mehrseiten-Export", async () => {
    const exp = await lauf(IMPORT_TOOLS, "export_framer_site", { url: "https://f.test", outputDir: "mirror" }).ergebnis();
    expect(exp).toEqual({ outputDir: "/tmp/framer-mirror", runtimeFreeVerified: false });
    const imp = await lauf(IMPORT_TOOLS, "import_framer_site", { siteId: "s1", rootDir: "mirror", write: true, sourceUrl: "https://f.test" }).ergebnis();
    expect(imp).toMatchObject({ status: "analyzed" });
  });

  it("trägt Entity-Namen für die neuen Werkzeuge", () => {
    expect(tool(IMPORT_TOOLS, "import_framer_page").entity?.({ siteId: "s1" })).toBe("site:s1");
    expect(tool(IMPORT_TOOLS, "get_import_report").entity?.({ jobId: "j1" })).toBe("import:j1");
    expect(tool(IMPORT_TOOLS, "snapshot_unframer_project").entity?.({})).toBe("unframer-snapshot");
    expect(tool(IMPORT_TOOLS, "prepare_framer_export").entity?.({})).toBe("framer-site-preparation");
    expect(tool(IMPORT_TOOLS, "export_framer_site").entity?.({})).toBe("framer-export");
    expect(tool(IMPORT_TOOLS, "import_framer_site").entity?.({ siteId: "s1" })).toBe("site:s1:framer-import");
  });
});

describe("Katalog- und Seitenwerkzeuge: die Übersetzung", () => {
  it("listet Abschnitte und liefert jede Definition", async () => {
    const liste = await tool(SECTION_TOOLS, "list_sections").handler({} as never, {});
    expect(liste.sections.length).toBeGreaterThan(0);
    for (const definition of registry().list()) {
      const info = await tool(SECTION_TOOLS, "get_section").handler({} as never, { type: definition.type });
      expect(info.type).toBe(definition.type);
    }
  });

  it("liest Knoten und lehnt ungültige IDs ab", async () => {
    const aufrufe: Aufruf[] = [];
    const context = {
      client: {
        request: async (method: string, path: string, body?: unknown) => {
          aufrufe.push({ method, path, body });
          return { id: "p1", path: "/", title: "", draftVersion: 1, draft: { nodes: { n1: { id: "n1" } } } };
        },
      },
    } as never;
    const ergebnis = await tool(PAGE_READ_TOOLS, "get_nodes").handler(context, { pageId: "p1", nodeIds: ["n1"] });
    expect(aufrufe[0]).toMatchObject({ method: "GET", path: "/api/pages/p1" });
    expect(ergebnis.nodes).toHaveLength(1);
    await expect(lauf(PAGE_READ_TOOLS, "get_nodes", { pageId: "p1", nodeIds: [1] }).ergebnis()).rejects.toMatchObject({ category: "validation" });
  });

  it("setzt Seitenvorlagen und prüft die Pflichtfelder", async () => {
    const layout = lauf(PAGE_CREATE_TOOLS, "set_page_template", { pageId: "p1", kind: "layout" });
    await layout.ergebnis();
    expect(layout.aufrufe[0]?.body).toMatchObject({ template: { kind: "layout" } });
    const collection = lauf(PAGE_CREATE_TOOLS, "set_page_template", { pageId: "p1", kind: "collection", collectionIds: ["c1"], priority: 2 });
    await collection.ergebnis();
    expect(collection.aufrufe[0]?.body).toMatchObject({ template: { kind: "collection", collectionIds: ["c1"], priority: 2 } });
    const none = lauf(PAGE_CREATE_TOOLS, "set_page_template", { pageId: "p1", kind: "none", layoutId: "l1" });
    await none.ergebnis();
    expect(none.aufrufe[0]?.body).toMatchObject({ template: null, layoutId: "l1" });
    await expect(lauf(PAGE_CREATE_TOOLS, "set_page_template", { pageId: "p1" }).ergebnis()).rejects.toMatchObject({ category: "validation" });
    await expect(lauf(PAGE_CREATE_TOOLS, "set_page_template", { pageId: "p1", kind: "collection" }).ergebnis()).rejects.toMatchObject({ category: "validation" });
  });

  it("legt Seiten an und löscht sie", async () => {
    const neu = lauf(PAGE_CREATE_TOOLS, "create_page", { siteId: "s1", title: "T", path: "/t", idempotencyKey: "k" });
    await neu.ergebnis();
    expect(neu.aufrufe[0]?.body).toEqual({ title: "T", path: "/t", idempotencyKey: "k" });
    const weg = lauf(PAGE_LIFECYCLE_TOOLS, "delete_page", { pageId: "p1" });
    await expect(weg.ergebnis()).resolves.toEqual({ deleted: "p1" });
    expect(weg.aufrufe[0]).toEqual({ method: "DELETE", path: "/api/pages/p1", body: undefined });
  });
});

describe("Mutations- und Release-Werkzeuge: die Übersetzung", () => {
  it("baut Undo, Motion und Clear-Motion", async () => {
    const undo = lauf(MUTATION_TOOLS, "undo_batch", { pageId: "p1", baseDraftVersion: 2, steps: 1, batchIds: ["b1"] });
    await undo.ergebnis();
    expect(undo.aufrufe[0]?.body).toEqual({ baseDraftVersion: 2, steps: 1, batchIds: ["b1"] });
    const motion = lauf(MUTATION_TOOLS, "set_motion", { pageId: "p1", nodeId: "n1", baseDraftVersion: 2, preset: "fade-up", intensity: 5, trigger: "load", delay: 1, reducedMotion: "static", enabled: true, tokens: { durationScale: 1 } });
    await motion.ergebnis();
    expect(motion.aufrufe[0]?.body).toMatchObject({ mutations: [{ op: "setMotion", spec: { preset: "fade-up", intensity: 5, trigger: "load", delay: 1, reducedMotion: "static", enabled: true, tokens: { durationScale: 1 } } }] });
    const ohneBatches = lauf(MUTATION_TOOLS, "undo_batch", { pageId: "p1", baseDraftVersion: 2 });
    await ohneBatches.ergebnis();
    expect(ohneBatches.aufrufe[0]?.body).toEqual({ baseDraftVersion: 2 });
    const clear = lauf(MUTATION_TOOLS, "clear_motion", { pageId: "p1", nodeId: "n1", baseDraftVersion: 2 });
    await clear.ergebnis();
    expect(clear.aufrufe[0]?.body).toMatchObject({ mutations: [{ op: "clearMotion", id: "n1" }] });
    expect(tool(MUTATION_TOOLS, "apply_mutations").entity?.({})).toBe("page:");
    expect(tool(MUTATION_TOOLS, "undo_batch").entity?.({ pageId: "p1" })).toBe("page:p1");
    expect(tool(MUTATION_TOOLS, "set_motion").entity?.({})).toBe("page:");
    expect(tool(MUTATION_TOOLS, "clear_motion").entity?.({ pageId: "p1" })).toBe("page:p1");
  });

  it("deployt statisch und über einen Anbieter und pflegt Einstellungen", async () => {
    const statisch = lauf(RELEASE_TOOLS, "deploy_site", { siteId: "s1", targetDir: "/srv" });
    await statisch.ergebnis();
    expect(statisch.aufrufe[0]?.body).toEqual({ provider: "static", targetDir: "/srv" });
    const netlify = lauf(RELEASE_TOOLS, "deploy_site", { siteId: "s1", provider: "netlify" });
    await netlify.ergebnis();
    expect(netlify.aufrufe[0]?.body).toEqual({ provider: "netlify" });
    const gelesen = lauf(RELEASE_TOOLS, "get_deploy_settings", { siteId: "s1" });
    await gelesen.ergebnis();
    expect(gelesen.aufrufe[0]).toMatchObject({ method: "GET", path: "/api/sites/s1/deploy-settings" });
    const geschrieben = lauf(RELEASE_TOOLS, "set_deploy_settings", { siteId: "s1", provider: "vercel", vercelProjectId: null, vercelToken: null });
    await geschrieben.ergebnis();
    expect(geschrieben.aufrufe[0]?.body).toEqual({ provider: "vercel", vercelProjectId: null, vercelToken: null });
    expect(tool(RELEASE_TOOLS, "get_deploy_settings").entity?.({ siteId: "s1" })).toBe("site:s1");
    expect(tool(RELEASE_TOOLS, "set_deploy_settings").entity?.({ siteId: "s1" })).toBe("site:s1");
  });
});
